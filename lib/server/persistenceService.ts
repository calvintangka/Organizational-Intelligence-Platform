import "server-only";

import { requireOrganizationId } from "@/lib/organizationId";
import { prisma } from "@/lib/server/prisma";
import { normalizeConceptVocabulary } from "@/lib/conceptVocabulary";
import { resolveLanguagePolicy } from "@/lib/languagePolicy";
import type {
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeHistory,
  KnowledgeItem,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  TicketPage,
  TicketPageRequest,
  BulkTicketSeed,
  TicketRecord,
  TicketRecordFilter,
  ValidationRecord
} from "@/types";
import { Prisma } from "@/generated/prisma/client";
import type {
  EmergingPattern as PrismaEmergingPattern,
  IntelligenceLog as PrismaIntelligenceLog,
  KnowledgeCandidate as PrismaKnowledgeCandidate,
  KnowledgeItem as PrismaKnowledgeItem,
  MemoryChangeRecord as PrismaMemoryChangeRecord,
  OrgMetrics as PrismaOrgMetrics,
  Organization as PrismaOrganization,
  TicketRecord as PrismaTicketRecord,
  TicketSequence as PrismaTicketSequence,
  ValidationRecord as PrismaValidationRecord
} from "@/generated/prisma/client";
import { formatTicketIdRange, organizationTicketPrefix, ticketDateStamp } from "@/lib/ticketIdFormat";
import { AuthorizationError } from "@/lib/server/authorization";
import { dedupeLessonCollection, dedupeNewLessonProposals } from "@/lib/canonicalProblemEngine";
import { withStableValidationProvenance } from "@/lib/knowledgeProvenance";
import { startTelemetrySpan } from "@/lib/telemetry";
import type { ValidationCommitResult as AtomicValidationCommitResult } from "@/lib/persistence/adapter";

export type PersistenceServiceErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_ORGANIZATION_ID"
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_SCHEMA_MISSING"
  | "DATABASE_ERROR";

export class PersistenceServiceError extends Error {
  constructor(
    public readonly code: PersistenceServiceErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "PersistenceServiceError";
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? stringArray(value) : undefined;
}

function iso(value: Date): string {
  return value.toISOString();
}

function optionalIso(value: Date | null | undefined): string | null | undefined {
  return value ? iso(value) : value === null ? null : undefined;
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function nullableJsonRecord<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : null;
}

function optionalJsonRecord<T>(value: unknown): T | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : undefined;
}

function validTone(value: unknown): OrganizationProfile["customerTone"] {
  return value === "friendly" || value === "formal" || value === "empathetic" ? value : "professional";
}

function mapOrganization(row: PrismaOrganization): OrganizationProfile {
  const settings = asRecord(row.settings);
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    products: stringArray(settings.products),
    services: stringArray(settings.services),
    supportedDomains: stringArray(settings.supportedDomains),
    businessVocabulary: stringArray(settings.businessVocabulary),
    supportedIssueTypes: stringArray(settings.supportedIssueTypes),
    outOfScopeTopics: stringArray(settings.outOfScopeTopics),
    customerTone: validTone(settings.customerTone),
    supportBoundaries: stringArray(settings.supportBoundaries),
    autoResolutionThreshold: typeof settings.autoResolutionThreshold === "number"
      ? settings.autoResolutionThreshold
      : 80,
    escalationRules: stringArray(settings.escalationRules),
    accentColor: optionalString(settings.accentColor),
    logoInitials: optionalString(settings.logoInitials),
    // TODO-058: optional language settings. Absent stays absent so an
    // organization that never configured them is byte-identical to before.
    ...(Array.isArray(settings.conceptVocabulary)
      ? { conceptVocabulary: normalizeConceptVocabulary(settings.conceptVocabulary) }
      : {}),
    ...(settings.languagePolicy && typeof settings.languagePolicy === "object" && !Array.isArray(settings.languagePolicy)
      ? { languagePolicy: resolveLanguagePolicy({ languagePolicy: settings.languagePolicy as OrganizationProfile["languagePolicy"] }) }
      : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    profileRevision: typeof settings._profileRevision === "number" ? settings._profileRevision : 0
  };
}

function mapKnowledge(row: PrismaKnowledgeItem): KnowledgeItem {
  const content = asRecord(row.content);
  const historicalAudit = optionalJsonRecord(content._todo065HistoricalAudit) as { auditCompleteness?: KnowledgeItem["auditCompleteness"] } | undefined;
  return {
    id: row.id,
    organizationId: row.organizationId,
    revision: row.revision,
    title: row.title,
    problem: stringValue(content.problem, row.canonicalProblemTitle ?? row.title),
    approvedAnswer: stringValue(content.approvedAnswer, stringValue(content.solution)),
    category: row.category,
    tags: stringArray(content.tags),
    sourceTicketId: row.sourceTicketId,
    timesReused: row.timesReused,
    createdAt: iso(row.createdAt),
    approvedAt: iso(row.approvedAt),
    lifecycleState: row.lifecycleState,
    provenance: optionalJsonRecord(content.provenance),
    validation: optionalJsonRecord(content.validation),
    ...(historicalAudit?.auditCompleteness ? { auditCompleteness: historicalAudit.auditCompleteness } : {}),
    timesSeen: row.timesSeen ?? undefined,
    successfulResolutions: row.successfulResolutions ?? undefined,
    failedResolutions: row.failedResolutions ?? undefined,
    successRate: row.successRate ?? undefined,
    trustScore: row.trustScore ?? undefined,
    lastUsedAt: optionalIso(row.lastUsedAt),
    lastValidatedAt: optionalIso(row.lastValidatedAt),
    autoResponseEligible: row.autoResponseEligible ?? undefined,
    humanReviewCount: row.humanReviewCount ?? undefined,
    automaticResolutionCount: row.automaticResolutionCount ?? undefined,
    canonicalProblemId: row.canonicalProblemId ?? undefined,
    canonicalProblemTitle: row.canonicalProblemTitle ?? undefined,
    problemSummary: optionalString(content.problemSummary),
    internalGuidance: optionalString(content.internalGuidance),
    customerResponseTemplate: optionalString(content.customerResponseTemplate),
    resolutionWorkflow: optionalStringArray(content.resolutionWorkflow),
    exampleTickets: jsonArray(content.exampleTickets),
    knowledgeVersions: jsonArray(content.knowledgeVersions),
    learningHistory: jsonArray(content.learningHistory),
    lessons: jsonArray(content.lessons),
    lastUpdated: row.lastUpdatedAt ? iso(row.lastUpdatedAt) : undefined,
    lastValidated: row.lastValidated ? iso(row.lastValidated) : undefined
  };
}

function mapCandidate(row: PrismaKnowledgeCandidate): KnowledgeCandidate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceTicketIds: stringArray(row.sourceTicketIds),
    proposedAction: row.proposedAction as KnowledgeCandidate["proposedAction"],
    proposedContent: asRecord(row.proposedContent) as unknown as KnowledgeCandidate["proposedContent"],
    relatedKnowledgeId: row.relatedKnowledgeId ?? undefined,
    rationale: row.rationale,
    status: row.status,
    createdAt: iso(row.createdAt)
  };
}

function mapValidation(row: PrismaValidationRecord): ValidationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    candidateId: row.candidateId,
    knowledgeId: row.knowledgeItemId ?? undefined,
    knowledgeVersionId: row.knowledgeVersionId ?? undefined,
    decision: row.decision,
    actor: row.actor,
    roleExercised: "knowledge_validator",
    rationale: row.rationale ?? undefined,
    timestamp: iso(row.timestamp)
  };
}

function mapMemoryChange(row: PrismaMemoryChangeRecord): MemoryChangeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    knowledgeId: row.knowledgeItemId,
    candidateId: row.candidateId,
    validationRecordId: row.validationRecordId,
    changeType: row.changeType as MemoryChangeRecord["changeType"],
    beforeState: nullableJsonRecord(row.beforeState),
    afterState: asRecord(row.afterState) as unknown as KnowledgeItem,
    timestamp: iso(row.timestamp)
  };
}

function mapMetrics(row: PrismaOrgMetrics): OrgMetrics {
  return {
    organizationId: row.organizationId,
    lifetimeTickets: row.lifetimeTickets,
    knowledgeReused: row.knowledgeReused,
    autoResolutions: row.autoResolutions,
    humanResolutions: row.humanResolutions,
    totalResolutionTimeSec: row.totalResolutionTimeSec,
    resolutionsCount: row.resolutionsCount,
    memoryGrowthToday: row.memoryGrowthToday,
    memoryGrowthDate: row.memoryGrowthDate,
    lastUpdatedAt: iso(row.lastUpdatedAt),
    mergedTickets: row.mergedTickets ?? undefined,
    duplicatePreventions: row.duplicatePreventions ?? undefined,
    knowledgeVersions: row.knowledgeVersions ?? undefined,
    emergingPatternsDetected: row.emergingPatternsDetected ?? undefined,
    promotedPatterns: row.promotedPatterns ?? undefined,
    aiCalls: row.aiCalls ?? undefined,
    aiSuccesses: row.aiSuccesses ?? undefined,
    aiFailures: row.aiFailures ?? undefined,
    aiFallbacks: row.aiFallbacks ?? undefined,
    aiAgreementSamples: row.aiAgreementSamples ?? undefined,
    aiAgreementTotal: row.aiAgreementTotal ?? undefined,
    humanAcceptedAISuggestions: row.humanAcceptedAISuggestions ?? undefined
  };
}

function mapLog(row: PrismaIntelligenceLog): IntelligenceLogEntry {
  return {
    id: row.id,
    timestamp: iso(row.timestamp),
    event: row.event,
    detail: row.detail ?? undefined
  };
}

function mapPattern(row: PrismaEmergingPattern): EmergingPattern {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: stringArray(row.tags),
    keywords: stringArray(row.keywords),
    exampleTickets: jsonArray(row.exampleTickets),
    timesSeen: row.timesSeen,
    confidenceScore: row.confidenceScore,
    suggestedCanonicalProblem: row.suggestedCanonicalProblem,
    status: row.status,
    firstSeenAt: iso(row.firstSeenAt),
    lastSeenAt: iso(row.lastSeenAt)
  };
}

function mapTicket(row: PrismaTicketRecord): TicketRecord {
  const rawClassification = nullableJsonRecord(row.classification) as (Record<string, unknown> & { _processing?: Record<string, unknown> }) | null;
  const processing = rawClassification?._processing;
  const { _processing: _ignoredProcessing, ...classification } = rawClassification ?? {};
  return {
    ticketId: row.ticketId,
    orgId: row.organizationId,
    actorId: row.actorId ?? undefined,
    createdAt: iso(row.createdAt),
    bulkUploadKey: row.bulkUploadKey,
    bulkEntryId: row.bulkEntryId,
    bulkClusterId: row.bulkClusterId,
    intakeMode: row.intakeMode === "bulk" ? "bulk" : row.intakeMode === "single" ? "single" : undefined,
    rawMessage: row.rawMessage,
    subject: row.subject,
    classification: Object.keys(classification).length > 0 ? classification as unknown as TicketRecord["classification"] : null,
    processingIdempotencyKey: typeof processing?.idempotencyKey === "string" ? processing.idempotencyKey : undefined,
    processingPayloadHash: typeof processing?.payloadHash === "string" ? processing.payloadHash : undefined,
    processingRequestId: typeof processing?.requestId === "string" ? processing.requestId : undefined,
    processingResult: processing?.result,
    memoryMatch: nullableJsonRecord(row.memoryMatch),
    draftSource: row.draftSource as TicketRecord["draftSource"],
    resolution: asRecord(row.resolution) as unknown as TicketRecord["resolution"],
    reflection: asRecord(row.reflection) as unknown as TicketRecord["reflection"],
    validationRecordIds: stringArray(row.validationRecordIds),
    status: row.status,
    resolutionMode: row.resolutionMode ?? null,
  };
}

function classifyDatabaseError(error: unknown, operation: string): PersistenceServiceError {
  if (error instanceof PersistenceServiceError) return error;
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message?.toLowerCase() ?? "";
  if (message.includes("database_url") || message.includes("connection") || ["P1001", "P1002", "P1017", "P2024"].includes(candidate?.code ?? "")) {
    return new PersistenceServiceError("DATABASE_UNAVAILABLE", `Database is unavailable while reading ${operation}.`, 503);
  }
  if (message.includes("does not exist") || message.includes("missing") || candidate?.code === "P2021") {
    return new PersistenceServiceError("DATABASE_SCHEMA_MISSING", `Database schema is unavailable while reading ${operation}.`, 503);
  }
  return new PersistenceServiceError("DATABASE_ERROR", `Server persistence could not read ${operation}.`, 500);
}

async function readDatabase<T>(operation: string, read: () => Promise<T>): Promise<T> {
  const span = startTelemetrySpan("read", "database", { unit: "operations", tags: { operation } });
  try {
    const result = await read();
    span.end(true);
    return result;
  } catch (error) {
    span.end(false, { error: error instanceof Error ? error.name : "unknown" });
    throw classifyDatabaseError(error, operation);
  }
}

/**
 * Test-only fault injection for the disposable TODO-067 probe. The hook is
 * never called unless a test explicitly installs it in the server module; it
 * is not exposed through an HTTP or environment-controlled production path.
 */
export interface ValidationCommitTestHooks {
  afterCandidateUpdate?: () => void | Promise<void>;
  afterValidationCreate?: () => void | Promise<void>;
  afterMemoryChangeCreate?: () => void | Promise<void>;
  afterTrustEvidenceCreate?: () => void | Promise<void>;
  afterKnowledgeUpdate?: () => void | Promise<void>;
}

let validationCommitTestHooks: ValidationCommitTestHooks | null = null;

export function configureValidationCommitTestHooks(hooks: ValidationCommitTestHooks | null): void {
  validationCommitTestHooks = hooks;
}

async function runValidationCommitTestHook(name: keyof ValidationCommitTestHooks): Promise<void> {
  await validationCommitTestHooks?.[name]?.();
}

export function validateOrganizationId(value: unknown): string {
  try {
    return requireOrganizationId(value as string, "Server persistence request");
  } catch {
    throw new PersistenceServiceError("INVALID_ORGANIZATION_ID", "organizationId must be a non-empty string.", 400);
  }
}

async function requireOrganization(organizationId: string): Promise<PrismaOrganization> {
  const id = validateOrganizationId(organizationId);
  const organization = await readDatabase("organization", () => prisma.organization.findUnique({ where: { id } }));
  if (!organization) {
    throw new PersistenceServiceError("ORGANIZATION_NOT_FOUND", `Organization ${id} was not found.`, 404);
  }
  return organization;
}

export async function listOrganizationProfiles(): Promise<OrganizationProfile[]> {
  const rows = await readDatabase("organization list", () => prisma.organization.findMany({ orderBy: { name: "asc" } }));
  return rows.map(mapOrganization);
}

export async function listOrganizationProfilesForUser(userId: string): Promise<OrganizationProfile[]> {
  const rows = await readDatabase("authorized organization list", () => prisma.organization.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { name: "asc" }
  }));
  return rows.map(mapOrganization);
}

export async function getOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
  return mapOrganization(await requireOrganization(organizationId));
}

export async function loadKnowledge(organizationId: string): Promise<KnowledgeItem[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("knowledge", () => prisma.knowledgeItem.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } }));
  return rows.map(mapKnowledge);
}

export async function loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("knowledge candidates", () => prisma.knowledgeCandidate.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } }));
  return rows.map(mapCandidate);
}

export async function loadValidationRecords(organizationId: string): Promise<ValidationRecord[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("validation records", () => prisma.validationRecord.findMany({ where: { organizationId: organization.id }, orderBy: { timestamp: "asc" } }));
  return rows.map(mapValidation);
}

export async function loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("memory-change records", () => prisma.memoryChangeRecord.findMany({ where: { organizationId: organization.id }, orderBy: { timestamp: "asc" } }));
  return rows.map(mapMemoryChange);
}

export async function loadKnowledgeHistory(organizationId: string, knowledgeId: string): Promise<KnowledgeHistory> {
  const organization = await requireOrganization(organizationId);
  const normalizedKnowledgeId = typeof knowledgeId === "string" ? knowledgeId.trim() : "";
  if (!normalizedKnowledgeId) {
    throw new PersistenceServiceError("INVALID_REQUEST", "knowledgeId must be a non-empty string.", 400);
  }
  const knowledge = await readDatabase("knowledge history ownership", () => prisma.knowledgeItem.findFirst({
    where: { id: normalizedKnowledgeId, organizationId: organization.id },
    select: { id: true }
  }));
  if (!knowledge) {
    throw new PersistenceServiceError("RESOURCE_NOT_FOUND", "The requested knowledge history was not found.", 404);
  }
  const [validations, memoryChanges] = await Promise.all([
    readDatabase("knowledge validation history", () => prisma.validationRecord.findMany({
      where: { organizationId: organization.id, knowledgeItemId: knowledge.id },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }]
    })),
    readDatabase("knowledge memory-change history", () => prisma.memoryChangeRecord.findMany({
      where: { organizationId: organization.id, knowledgeItemId: knowledge.id },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }]
    }))
  ]);
  return {
    validationRecords: validations.map(mapValidation),
    memoryChangeRecords: memoryChanges.map(mapMemoryChange)
  };
}

export async function loadOrgMetrics(organizationId: string): Promise<OrgMetrics | null> {
  const organization = await requireOrganization(organizationId);
  const row = await readDatabase("organization metrics", () => prisma.orgMetrics.findUnique({ where: { organizationId: organization.id } }));
  return row ? mapMetrics(row) : null;
}

export async function loadIntelligenceLog(organizationId: string): Promise<IntelligenceLogEntry[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("intelligence log", () => prisma.intelligenceLog.findMany({ where: { organizationId: organization.id }, orderBy: { timestamp: "asc" } }));
  return rows.map(mapLog);
}

export async function loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("emerging patterns", () => prisma.emergingPattern.findMany({ where: { organizationId: organization.id }, orderBy: { lastSeenAt: "desc" } }));
  return rows.map(mapPattern);
}

export async function loadTicketRecords(organizationId: string): Promise<TicketRecord[]> {
  const organization = await requireOrganization(organizationId);
  const rows = await readDatabase("ticket records", () => prisma.ticketRecord.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } }));
  return rows.map(mapTicket);
}

const TICKET_PAGE_SIZE_MAX = 100;
const TICKET_SEARCH_LENGTH_MAX = 200;

export async function loadTicketPage(
  organizationId: string,
  request: TicketPageRequest
): Promise<TicketPage> {
  const organization = await requireOrganization(organizationId);
  const page = request.page;
  const pageSize = request.pageSize;
  const search = request.search?.trim() ?? "";
  const filter: TicketRecordFilter = request.filter ?? "all";
  if (!Number.isInteger(page) || page < 1) throw invalidRequest("Ticket page must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > TICKET_PAGE_SIZE_MAX) {
    throw invalidRequest(`Ticket page size must be an integer between 1 and ${TICKET_PAGE_SIZE_MAX}.`);
  }
  if (search.length > TICKET_SEARCH_LENGTH_MAX) {
    throw invalidRequest(`Ticket search must not exceed ${TICKET_SEARCH_LENGTH_MAX} characters.`);
  }

  const filters: Prisma.TicketRecordWhereInput[] = [];
  if (search) {
    filters.push({
      OR: [
        { ticketId: { contains: search, mode: "insensitive" } },
        { rawMessage: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { classification: { path: ["category"], string_contains: search, mode: "insensitive" } },
        { classification: { path: ["canonicalProblem"], string_contains: search, mode: "insensitive" } }
      ]
    });
  }
  switch (filter) {
    case "heavily_edited":
      filters.push({ resolution: { path: ["humanEdited"], equals: true } });
      break;
    case "cold_start":
      filters.push({ OR: [
        { memoryMatch: { path: ["matchType"], equals: "none" } },
        { draftSource: "no_template" }
      ] });
      break;
    case "uncategorized":
      filters.push({ OR: [
        { classification: { path: ["classifiedBy"], equals: "llm_fallback" } },
        { classification: { path: ["category"], equals: "Uncategorized" } },
        { classification: { path: ["category"], equals: "General" } }
      ] });
      break;
    case "rejected":
      filters.push({ status: "rejected" });
      break;
    case "discarded":
      filters.push({ status: "discarded" });
      break;
  }
  const where: Prisma.TicketRecordWhereInput = {
    organizationId: organization.id,
    ...(filters.length > 0 ? { AND: filters } : {})
  };
  const [total, rows] = await readDatabase("ticket page", () => prisma.$transaction([
    prisma.ticketRecord.count({ where }),
    prisma.ticketRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { ticketId: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]));
  return {
    tickets: rows.map(mapTicket),
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
  };
}

export async function loadTicketSequence(organizationId: string): Promise<{ organizationId: string; counter: number; updatedAt: string | null } | null> {
  const organization = await requireOrganization(organizationId);
  const row = await readDatabase("ticket sequence", () => prisma.ticketSequence.findUnique({ where: { organizationId: organization.id } }));
  return row ? mapTicketSequence(row) : null;
}

function mapTicketSequence(row: PrismaTicketSequence): { organizationId: string; counter: number; updatedAt: string | null } {
  return {
    organizationId: row.organizationId,
    counter: row.counter,
    updatedAt: iso(row.updatedAt)
  };
}

export function toSafePersistenceError(error: unknown): { code: PersistenceServiceErrorCode; message: string; status: number } {
  if (error instanceof AuthorizationError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  const safe = error instanceof PersistenceServiceError
    ? error
    : classifyDatabaseError(error, "the requested resource");
  return { code: safe.code, message: safe.message, status: safe.status };
}

/* ------------------------------------------------------------------ */
/* Batch 4 — transactional server write path                           */
/* ------------------------------------------------------------------ */

type TransactionClient = Prisma.TransactionClient;

function invalidRequest(message: string): PersistenceServiceError {
  return new PersistenceServiceError("INVALID_REQUEST", message, 400);
}

function conflict(message: string): PersistenceServiceError {
  return new PersistenceServiceError("CONFLICT", message, 409);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidRequest(`${field} must be a non-empty string.`);
  }
  return value;
}

function parseDate(value: unknown, field: string): Date {
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw invalidRequest(`${field} must be a valid ISO timestamp.`);
  }
  return parsed;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function json(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as unknown as Prisma.InputJsonValue;
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : json(value);
}

async function writeDatabase<T>(operation: string, write: () => Promise<T>): Promise<T> {
  const span = startTelemetrySpan("transaction", "database", { unit: "operations", tags: { operation } });
  try {
    const result = await write();
    span.end(true);
    return result;
  } catch (error) {
    span.end(false, { error: error instanceof Error ? error.name : "unknown" });
    throw classifyDatabaseError(error, operation);
  }
}

/** Reject a payload record that claims a different owner than the route. */
function assertPayloadOrganization(organizationId: string, claimed: string | undefined, resource: string): void {
  if (claimed !== undefined && claimed !== organizationId) {
    throw conflict(`A ${resource} in the request claims a different organization than the request scope.`);
  }
}

function toOrganizationRow(profile: OrganizationProfile): {
  id: string;
  name: string;
  industry: string;
  description: string;
  settings: Prisma.InputJsonValue;
  createdAt: Date;
} {
  const id = requireString(profile.id, "organization profile id");
  return {
    id,
    name: requireString(profile.name, "organization profile name"),
    industry: typeof profile.industry === "string" ? profile.industry : "",
    description: typeof profile.description === "string" ? profile.description : "",
    settings: json({
      products: profile.products ?? [],
      services: profile.services ?? [],
      supportedDomains: profile.supportedDomains ?? [],
      businessVocabulary: profile.businessVocabulary ?? [],
      supportedIssueTypes: profile.supportedIssueTypes ?? [],
      outOfScopeTopics: profile.outOfScopeTopics ?? [],
      customerTone: profile.customerTone ?? "professional",
      supportBoundaries: profile.supportBoundaries ?? [],
      autoResolutionThreshold: profile.autoResolutionThreshold ?? 80,
      escalationRules: profile.escalationRules ?? [],
      accentColor: profile.accentColor,
      logoInitials: profile.logoInitials,
      // TODO-058: language settings are optional. Persist them only when the
      // caller actually carries them, so a client that predates TODO-058 cannot
      // erase a configured policy or concept vocabulary by omission — the
      // failure mode TODO-056 repaired for the other settings arrays.
      ...(profile.conceptVocabulary !== undefined ? { conceptVocabulary: profile.conceptVocabulary } : {}),
      ...(profile.languagePolicy !== undefined ? { languagePolicy: profile.languagePolicy } : {}),
      _profileRevision: profile.profileRevision ?? 0
    }),
    createdAt: optionalDate(profile.createdAt) ?? new Date()
  };
}

/**
 * TODO-058: optional settings keys that a client predating this feature does not
 * send. Preserve the stored value instead of dropping it, so an older client
 * cannot silently erase a configured policy or concept vocabulary — the exact
 * failure mode TODO-056 had to repair for the other settings fields.
 */
const PRESERVE_ON_OMISSION = ["conceptVocabulary", "languagePolicy"] as const;

function carryForwardOptionalSettings(
  nextSettings: Record<string, unknown>,
  currentSettings: Record<string, unknown>
): void {
  for (const key of PRESERVE_ON_OMISSION) {
    if (nextSettings[key] === undefined && currentSettings[key] !== undefined) {
      nextSettings[key] = currentSettings[key];
    }
  }
}

const KNOWLEDGE_LIFECYCLES = ["active", "candidate", "deprecated"] as const;
const CANDIDATE_LIFECYCLES = ["proposed", "validated", "rejected"] as const;
const TICKET_LIFECYCLES = ["open", "in_review", "resolved", "rejected", "discarded"] as const;
const PATTERN_LIFECYCLES = ["monitoring", "suggested", "promoted", "dismissed"] as const;

function normalizeValidationKnowledgeItem(item: KnowledgeItem, stored: KnowledgeItem | null): KnowledgeItem {
  if (!stored) {
    const lessons = item.lessons ?? [];
    return {
      ...item,
      lessons: dedupeLessonCollection(lessons, {
        dedupeLessonContent: true,
        durableLessonIds: new Set<string>(),
        preferredCanonicalIds: new Set(lessons.length > 0 ? [lessons[0].id] : [])
      })
    };
  }

  return {
    ...item,
    lessons: dedupeNewLessonProposals(stored.lessons ?? [], item.lessons ?? [])
  };
}

function narrowEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

// TODO-026: only the two real modes persist; anything else (unresolved,
// unknown, legacy) resolves to null and is never coerced to a human resolution.
function narrowResolutionMode(value: unknown): "human" | "automatic" | null {
  return value === "human" || value === "automatic" ? value : null;
}

function knowledgeContent(item: KnowledgeItem): Prisma.InputJsonValue {
  return json({
    problem: item.problem,
    approvedAnswer: item.approvedAnswer,
    tags: item.tags ?? [],
    provenance: item.provenance,
    validation: item.validation,
    problemSummary: item.problemSummary,
    internalGuidance: item.internalGuidance,
    customerResponseTemplate: item.customerResponseTemplate,
    resolutionWorkflow: item.resolutionWorkflow,
    exampleTickets: item.exampleTickets ?? [],
    knowledgeVersions: item.knowledgeVersions ?? [],
    learningHistory: item.learningHistory ?? [],
    lessons: item.lessons ?? []
  });
}

function knowledgeColumns(item: KnowledgeItem): Omit<Prisma.KnowledgeItemUncheckedCreateInput, "id" | "organizationId" | "revision"> {
  return {
    title: requireString(item.title, "knowledge item title"),
    category: typeof item.category === "string" ? item.category : "",
    canonicalProblemId: item.canonicalProblemId ?? null,
    canonicalProblemTitle: item.canonicalProblemTitle ?? null,
    lifecycleState: narrowEnum(item.lifecycleState, KNOWLEDGE_LIFECYCLES, "active"),
    sourceTicketId: typeof item.sourceTicketId === "string" ? item.sourceTicketId : "",
    timesReused: typeof item.timesReused === "number" ? item.timesReused : 0,
    timesSeen: item.timesSeen ?? null,
    successfulResolutions: item.successfulResolutions ?? null,
    failedResolutions: item.failedResolutions ?? null,
    successRate: item.successRate ?? null,
    trustScore: item.trustScore ?? null,
    autoResponseEligible: item.autoResponseEligible ?? null,
    humanReviewCount: item.humanReviewCount ?? null,
    automaticResolutionCount: item.automaticResolutionCount ?? null,
    createdAt: parseDate(item.createdAt, "knowledge item createdAt"),
    approvedAt: optionalDate(item.approvedAt) ?? parseDate(item.createdAt, "knowledge item createdAt"),
    lastUsedAt: optionalDate(item.lastUsedAt),
    lastValidatedAt: optionalDate(item.lastValidatedAt),
    lastUpdatedAt: optionalDate(item.lastUpdated),
    lastValidated: optionalDate(item.lastValidated),
    content: knowledgeContent(item)
  };
}

/**
 * Upsert one knowledge item inside a transaction with optimistic concurrency.
 * `expectedRevision === null` means the caller asserts the item does not exist
 * yet. Updates must match the stored revision and bump it by one.
 */
async function upsertKnowledgeItemTx(
  tx: TransactionClient,
  organizationId: string,
  item: KnowledgeItem,
  expectedRevision: number | null
): Promise<number> {
  const id = requireString(item.id, "knowledge item id");
  assertPayloadOrganization(organizationId, item.organizationId, "knowledge item");
  const columns = knowledgeColumns(item);

  if (expectedRevision === null) {
    try {
      await tx.knowledgeItem.create({ data: { id, organizationId, revision: 1, ...columns } });
      return 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict(`Knowledge item ${id} already exists; reload organizational memory before committing.`);
      }
      throw error;
    }
  }

  const updated = await tx.knowledgeItem.updateMany({
    where: { id, organizationId, revision: expectedRevision },
    data: { ...columns, revision: expectedRevision + 1 }
  });
  if (updated.count === 1) return expectedRevision + 1;

  const existing = await tx.knowledgeItem.findUnique({ where: { id }, select: { organizationId: true, revision: true } });
  if (!existing || existing.organizationId !== organizationId) {
    throw new PersistenceServiceError("RESOURCE_NOT_FOUND", `Knowledge item ${id} was not found in this organization.`, 404);
  }
  throw conflict(`Knowledge item ${id} was changed by another update (stored revision ${existing.revision}, expected ${expectedRevision}). Reload and retry.`);
}

async function upsertCandidateTx(
  tx: TransactionClient,
  organizationId: string,
  candidate: KnowledgeCandidate,
  options?: { authoritativeLifecycle?: boolean }
): Promise<void> {
  const id = requireString(candidate.id, "knowledge candidate id");
  assertPayloadOrganization(organizationId, candidate.organizationId, "knowledge candidate");
  const data = {
    relatedKnowledgeId: candidate.relatedKnowledgeId ?? null,
    sourceTicketIds: json(candidate.sourceTicketIds ?? []),
    proposedAction: requireString(candidate.proposedAction, "knowledge candidate proposedAction"),
    proposedContent: json(candidate.proposedContent ?? {}),
    rationale: typeof candidate.rationale === "string" ? candidate.rationale : "",
    status: narrowEnum(candidate.status, CANDIDATE_LIFECYCLES, "proposed"),
    createdAt: parseDate(candidate.createdAt, "knowledge candidate createdAt")
  };
  const existing = await tx.knowledgeCandidate.findUnique({ where: { id }, select: { organizationId: true, status: true } });
  if (existing && existing.organizationId !== organizationId) {
    throw conflict(`Knowledge candidate ${id} belongs to a different organization.`);
  }
  if (!options?.authoritativeLifecycle && candidate.status === "validated" && existing?.status !== "validated") {
    throw conflict(`Knowledge candidate ${id} can only enter validated state through the validation commit operation.`);
  }
  if (!options?.authoritativeLifecycle && existing?.status === "validated") {
    data.status = existing.status;
  }
  if (existing) {
    await tx.knowledgeCandidate.update({ where: { id }, data });
  } else {
    await tx.knowledgeCandidate.create({ data: { id, organizationId, ...data } });
  }
}

function toTicketColumns(record: TicketRecord): Omit<Prisma.TicketRecordUncheckedCreateInput, "id" | "organizationId" | "ticketId"> {
  const processing = record.processingIdempotencyKey || record.processingPayloadHash || record.processingRequestId
    ? {
        idempotencyKey: record.processingIdempotencyKey,
        payloadHash: record.processingPayloadHash,
        requestId: record.processingRequestId,
        result: record.processingResult
      }
    : undefined;
  const classification = record.classification
    ? processing ? { ...record.classification, _processing: processing } : record.classification
    : processing ? { _processing: processing } : null;
  return {
    actorId: record.actorId ?? null,
    bulkUploadKey: record.bulkUploadKey ?? null,
    bulkEntryId: record.bulkEntryId ?? null,
    bulkClusterId: record.bulkClusterId ?? null,
    intakeMode: record.intakeMode ?? null,
    rawMessage: typeof record.rawMessage === "string" ? record.rawMessage : "",
    subject: record.subject ?? null,
    status: narrowEnum(record.status, TICKET_LIFECYCLES, "open"),
    draftSource: record.draftSource ?? null,
    classification: nullableJson(classification),
    memoryMatch: nullableJson(record.memoryMatch),
    resolution: json(record.resolution ?? {}),
    reflection: json(record.reflection ?? {}),
    validationRecordIds: json(record.validationRecordIds ?? []),
    resolutionMode: narrowResolutionMode(record.resolutionMode),
    createdAt: parseDate(record.createdAt, "ticket record createdAt")
  };
}

async function upsertTicketRecordTx(
  tx: TransactionClient,
  organizationId: string,
  record: TicketRecord
): Promise<void> {
  const ticketId = requireString(record.ticketId, "ticket record ticketId");
  assertPayloadOrganization(organizationId, record.orgId, "ticket record");
  const columns = toTicketColumns(record);
  await tx.ticketRecord.upsert({
    where: { organizationId_ticketId: { organizationId, ticketId } },
    create: { organizationId, ticketId, ...columns },
    update: columns
  });
}

/* ----------------------------- Organization writes ----------------------------- */

export async function upsertOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile> {
  const row = toOrganizationRow(profile);
  const saved = await writeDatabase("organization profile", async () => {
    const existing = await prisma.organization.findUnique({ where: { id: row.id }, select: { updatedAt: true, settings: true } });
    const incomingUpdatedAt = optionalDate(profile.updatedAt);
    if (existing && incomingUpdatedAt && incomingUpdatedAt.getTime() < existing.updatedAt.getTime()) {
      throw conflict("This organization profile is stale and was not saved. Reload the latest profile before editing it.");
    }
    const currentSettings = asRecord(existing?.settings);
    const currentRevision = typeof currentSettings._profileRevision === "number" ? currentSettings._profileRevision : 0;
    const incomingRevision = profile.profileRevision ?? 0;
    if (existing && incomingRevision < currentRevision) {
      throw conflict("This organization profile is stale and was not saved. Reload the latest profile before editing it.");
    }
    const nextSettings = asRecord(row.settings);
    carryForwardOptionalSettings(nextSettings, currentSettings);
    nextSettings._profileRevision = existing ? currentRevision + 1 : Math.max(0, incomingRevision);
    return prisma.organization.upsert({
      where: { id: row.id },
      create: { ...row, settings: json(nextSettings) },
      update: { name: row.name, industry: row.industry, description: row.description, settings: json(nextSettings) }
    });
  });
  return mapOrganization(saved);
}

/** Upsert every profile in the list. Deletion is only available via DELETE. */
export async function upsertOrganizationProfiles(list: OrganizationProfile[]): Promise<OrganizationProfile[]> {
  if (!Array.isArray(list)) throw invalidRequest("The organization list payload must be an array.");
  const rows = list.map(toOrganizationRow);
  const saved = await writeDatabase("organization list", () =>
    prisma.$transaction(async (tx) => {
      const results = [];
      for (const [index, row] of rows.entries()) {
        const existing = await tx.organization.findUnique({ where: { id: row.id }, select: { settings: true } });
        const currentSettings = asRecord(existing?.settings);
        const currentRevision = typeof currentSettings._profileRevision === "number" ? currentSettings._profileRevision : 0;
        const incomingRevision = list[index].profileRevision ?? 0;
        if (existing && incomingRevision < currentRevision) {
          throw conflict("This organization list contains a stale profile and was not saved. Reload the latest organizations before editing them.");
        }
        const nextSettings = asRecord(row.settings);
        carryForwardOptionalSettings(nextSettings, currentSettings);
        nextSettings._profileRevision = existing ? currentRevision + 1 : Math.max(0, incomingRevision);
        results.push(await tx.organization.upsert({
          where: { id: row.id },
          create: { ...row, settings: json(nextSettings) },
          update: { name: row.name, industry: row.industry, description: row.description, settings: json(nextSettings) }
        }));
      }
      return results;
    })
  );
  return saved.map(mapOrganization);
}

export async function deleteOrganization(organizationId: string): Promise<void> {
  const organization = await requireOrganization(organizationId);
  await writeDatabase("organization deletion", async () => {
    // Owned rows are removed by ON DELETE CASCADE (verified in the schema:
    // every child relation declares onDelete: Cascade). A failure anywhere
    // aborts the single DELETE statement, so no partial cleanup can commit.
    await prisma.organization.delete({ where: { id: organization.id } });
  });
}

/**
 * Reset one organization's owned data without deleting the organization row,
 * mirroring local reset semantics (scoped wipe + counter reset). Legacy
 * localStorage suppression markers are intentionally not modeled here.
 */
export async function resetOrganizationData(organizationId: string): Promise<void> {
  const organization = await requireOrganization(organizationId);
  const id = organization.id;
  await writeDatabase("organization reset", () =>
    prisma.$transaction(async (tx) => {
      await tx.trustEvidence.deleteMany({ where: { organizationId: id } });
      await tx.memoryChangeRecord.deleteMany({ where: { organizationId: id } });
      await tx.validationRecord.deleteMany({ where: { organizationId: id } });
      await tx.knowledgeCandidate.deleteMany({ where: { organizationId: id } });
      await tx.knowledgeItem.deleteMany({ where: { organizationId: id } });
      await tx.emergingPattern.deleteMany({ where: { organizationId: id } });
      await tx.intelligenceLog.deleteMany({ where: { organizationId: id } });
      await tx.ticketRecord.deleteMany({ where: { organizationId: id } });
      await tx.orgMetrics.deleteMany({ where: { organizationId: id } });
      await tx.ticketSequence.deleteMany({ where: { organizationId: id } });
    })
  );
}

/* ----------------------------- Resource writes ----------------------------- */

/**
 * Reconcile the organization's knowledge set with the provided snapshot:
 * per-item upserts guarded by optimistic revisions, plus scoped deletion of
 * rows absent from the snapshot (canonical dedup can legitimately shrink the
 * set). This is not deleteMany+createMany; concurrent writers conflict with
 * 409 instead of silently losing validated lessons.
 */
export async function saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(items)) throw invalidRequest("The knowledge payload must be an array.");
  await writeDatabase("knowledge", () =>
    prisma.$transaction(async (tx) => {
      const keptIds: string[] = [];
      for (const item of items) {
        const expectedRevision = typeof item.revision === "number" && item.revision > 0 ? item.revision : null;
        if (expectedRevision === null) {
          const existing = await tx.knowledgeItem.findUnique({ where: { id: item.id }, select: { organizationId: true, revision: true } });
          if (existing && existing.organizationId !== organization.id) {
            throw conflict(`Knowledge item ${item.id} belongs to a different organization.`);
          }
          await upsertKnowledgeItemTx(tx, organization.id, item, existing ? existing.revision : null);
        } else {
          await upsertKnowledgeItemTx(tx, organization.id, item, expectedRevision);
        }
        keptIds.push(item.id);
      }
      await tx.knowledgeItem.deleteMany({ where: { organizationId: organization.id, id: { notIn: keptIds } } });
    })
  );
}

export async function saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(candidates)) throw invalidRequest("The knowledge candidate payload must be an array.");
  await writeDatabase("knowledge candidates", () =>
    prisma.$transaction(async (tx) => {
      for (const candidate of candidates) {
        await upsertCandidateTx(tx, organization.id, candidate);
      }
      // A client snapshot must never be able to delete an already committed
      // candidate and leave its validation/memory audit chain orphaned.
      const submittedIds = candidates.map((candidate) => candidate.id);
      const committed = await tx.validationRecord.findMany({
        where: { organizationId: organization.id, candidateId: { notIn: submittedIds } },
        select: { candidateId: true }
      });
      await tx.knowledgeCandidate.deleteMany({
        where: { organizationId: organization.id, id: { notIn: [...submittedIds, ...committed.map((record) => record.candidateId)] } }
      });
    })
  );
}

export async function saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void> {
  const organization = await requireOrganization(organizationId);
  assertPayloadOrganization(organization.id, metrics.organizationId, "metrics snapshot");
  const data = {
    lifetimeTickets: metrics.lifetimeTickets ?? 0,
    knowledgeReused: metrics.knowledgeReused ?? 0,
    autoResolutions: metrics.autoResolutions ?? 0,
    humanResolutions: metrics.humanResolutions ?? 0,
    totalResolutionTimeSec: metrics.totalResolutionTimeSec ?? 0,
    resolutionsCount: metrics.resolutionsCount ?? 0,
    memoryGrowthToday: metrics.memoryGrowthToday ?? 0,
    memoryGrowthDate: typeof metrics.memoryGrowthDate === "string" ? metrics.memoryGrowthDate : new Date().toISOString().slice(0, 10),
    mergedTickets: metrics.mergedTickets ?? null,
    duplicatePreventions: metrics.duplicatePreventions ?? null,
    knowledgeVersions: metrics.knowledgeVersions ?? null,
    emergingPatternsDetected: metrics.emergingPatternsDetected ?? null,
    promotedPatterns: metrics.promotedPatterns ?? null,
    aiCalls: metrics.aiCalls ?? null,
    aiSuccesses: metrics.aiSuccesses ?? null,
    aiFailures: metrics.aiFailures ?? null,
    aiFallbacks: metrics.aiFallbacks ?? null,
    aiAgreementSamples: metrics.aiAgreementSamples ?? null,
    aiAgreementTotal: metrics.aiAgreementTotal ?? null,
    humanAcceptedAISuggestions: metrics.humanAcceptedAISuggestions ?? null,
    lastUpdatedAt: optionalDate(metrics.lastUpdatedAt) ?? new Date()
  };
  await writeDatabase("organization metrics", () =>
    prisma.orgMetrics.upsert({
      where: { organizationId: organization.id },
      create: { organizationId: organization.id, ...data },
      update: data
    })
  );
}

export async function saveIntelligenceLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(entries)) throw invalidRequest("The intelligence log payload must be an array.");
  await writeDatabase("intelligence log", () =>
    prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const id = requireString(entry.id, "intelligence log entry id");
        const data = {
          timestamp: parseDate(entry.timestamp, "intelligence log timestamp"),
          event: requireString(entry.event, "intelligence log event"),
          detail: entry.detail ?? null
        };
        await tx.intelligenceLog.upsert({
          where: { id },
          create: { id, organizationId: organization.id, ...data },
          update: data
        });
      }
      // The client keeps a bounded log; remove scoped entries it trimmed away.
      await tx.intelligenceLog.deleteMany({
        where: { organizationId: organization.id, id: { notIn: entries.map((entry) => entry.id) } }
      });
    })
  );
}

export async function saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(patterns)) throw invalidRequest("The emerging pattern payload must be an array.");
  await writeDatabase("emerging patterns", () =>
    prisma.$transaction(async (tx) => {
      for (const pattern of patterns) {
        const id = requireString(pattern.id, "emerging pattern id");
        assertPayloadOrganization(organization.id, pattern.organizationId, "emerging pattern");
        const data = {
          title: requireString(pattern.title, "emerging pattern title"),
          summary: typeof pattern.summary === "string" ? pattern.summary : "",
          category: typeof pattern.category === "string" ? pattern.category : "",
          status: narrowEnum(pattern.status, PATTERN_LIFECYCLES, "monitoring"),
          tags: json(pattern.tags ?? []),
          keywords: json(pattern.keywords ?? []),
          exampleTickets: json(pattern.exampleTickets ?? []),
          timesSeen: typeof pattern.timesSeen === "number" ? pattern.timesSeen : 0,
          confidenceScore: typeof pattern.confidenceScore === "number" ? pattern.confidenceScore : 0,
          suggestedCanonicalProblem: pattern.suggestedCanonicalProblem === true,
          firstSeenAt: parseDate(pattern.firstSeenAt, "emerging pattern firstSeenAt"),
          lastSeenAt: parseDate(pattern.lastSeenAt, "emerging pattern lastSeenAt")
        };
        const existing = await tx.emergingPattern.findUnique({ where: { id }, select: { organizationId: true } });
        if (existing && existing.organizationId !== organization.id) {
          throw conflict(`Emerging pattern ${id} belongs to a different organization.`);
        }
        if (existing) {
          await tx.emergingPattern.update({ where: { id }, data });
        } else {
          await tx.emergingPattern.create({ data: { id, organizationId: organization.id, ...data } });
        }
      }
      await tx.emergingPattern.deleteMany({
        where: { organizationId: organization.id, id: { notIn: patterns.map((pattern) => pattern.id) } }
      });
    })
  );
}

/**
 * Upsert ticket records keyed by (organizationId, ticketId). Deliberately
 * upsert-only: ticket history is never trimmed client-side, so a snapshot that
 * omits a ticket must not delete it (mirrors the local D-1 guard's intent).
 */
export async function saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(records)) throw invalidRequest("The ticket record payload must be an array.");
  await writeDatabase("ticket records", () =>
    prisma.$transaction(async (tx) => {
      for (const record of records) {
        await upsertTicketRecordTx(tx, organization.id, record);
      }
    })
  );
}

/**
 * Durable bulk-intake boundary. Rows are keyed by (organization, upload key,
 * entry id), so selecting the same file again returns the original records
 * instead of allocating a second set of tickets. Allocation and creation are
 * one transaction; analysis and memory validation happen later.
 */
export async function prepareBulkTicketRecords(
  organizationId: string,
  seeds: BulkTicketSeed[]
): Promise<TicketRecord[]> {
  const organization = await requireOrganization(organizationId);
  if (!Array.isArray(seeds) || seeds.length > 1000) {
    throw invalidRequest("Bulk ticket preparation accepts between 1 and 1000 rows.");
  }
  if (seeds.length === 0) return [];
  const uploadKey = seeds[0].uploadKey;
  if (!uploadKey || seeds.some((seed) => seed.uploadKey !== uploadKey)) {
    throw invalidRequest("All bulk ticket rows must belong to one upload key.");
  }
  const entryIds = seeds.map((seed) => seed.entryId);
  if (entryIds.some((entryId) => !entryId) || new Set(entryIds).size !== entryIds.length) {
    throw invalidRequest("Bulk ticket entry IDs must be non-empty and unique.");
  }

  return writeDatabase("bulk ticket preparation", () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.ticketRecord.findMany({
        where: {
          organizationId: organization.id,
          bulkUploadKey: uploadKey,
          bulkEntryId: { in: entryIds }
        }
      });
      const existingByEntry = new Map(existing.map((row) => [row.bulkEntryId!, row]));
      const missing = seeds.filter((seed) => !existingByEntry.has(seed.entryId));
      const created: PrismaTicketRecord[] = [];

      if (missing.length > 0) {
        const profile = mapOrganization(organization);
        const prefix = organizationTicketPrefix(profile);
        await tx.ticketSequence.createMany({
          data: [{ organizationId: organization.id, counter: 0 }],
          skipDuplicates: true
        });
        const sequence = await tx.ticketSequence.update({
          where: { organizationId: organization.id },
          data: { counter: { increment: missing.length } }
        });
        const first = sequence.counter - missing.length + 1;
        const createdAt = new Date();
        for (const [index, seed] of missing.entries()) {
          created.push(await tx.ticketRecord.create({
            data: {
              organizationId: organization.id,
              ticketId: formatTicketIdRange(prefix, ticketDateStamp(), first + index, 1)[0],
              bulkUploadKey: seed.uploadKey,
              bulkEntryId: seed.entryId,
              bulkClusterId: null,
              intakeMode: "bulk",
              rawMessage: seed.rawMessage,
              subject: seed.subject ?? null,
              status: "in_review",
              draftSource: null,
              classification: nullableJson(null),
              memoryMatch: nullableJson(null),
              resolution: json({ finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: null }),
              reflection: json({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }),
              validationRecordIds: json([]),
              resolutionMode: null,
              createdAt
            }
          }));
        }
      }

      const byEntry = new Map(
        [...existing, ...created].map((row) => [row.bulkEntryId!, row])
      );
      return seeds.map((seed) => mapTicket(byEntry.get(seed.entryId)!));
    })
  );
}

/* ----------------------------- Ticket allocation ----------------------------- */

const MAX_TICKET_ALLOCATION = 500;

/**
 * Concurrency-safe organization-scoped ticket ID allocation. The counter
 * increment is a single row-locked UPDATE inside the transaction, so two
 * concurrent requests can never observe the same counter value. Sequence gaps
 * are possible only when a client discards IDs after a committed allocation
 * (correctness and uniqueness are preferred over gap avoidance).
 */
export async function allocateTicketIds(organizationId: string, count: number): Promise<string[]> {
  const organization = await requireOrganization(organizationId);
  if (!Number.isInteger(count) || count < 1 || count > MAX_TICKET_ALLOCATION) {
    throw invalidRequest(`Ticket allocation count must be an integer between 1 and ${MAX_TICKET_ALLOCATION}.`);
  }
  const profile = mapOrganization(organization);
  const prefix = organizationTicketPrefix(profile);

  return writeDatabase("ticket allocation", () =>
    prisma.$transaction(async (tx) => {
      await tx.ticketSequence.createMany({
        data: [{ organizationId: organization.id, counter: 0 }],
        skipDuplicates: true
      });
      // Atomic increment with RETURNING: the row lock serializes concurrent
      // allocations for one organization without touching any other org.
      const sequence = await tx.ticketSequence.update({
        where: { organizationId: organization.id },
        data: { counter: { increment: count } }
      });
      return formatTicketIdRange(prefix, ticketDateStamp(), sequence.counter, count);
    })
  );
}

/* ----------------------------- Validation commit ----------------------------- */

export interface ValidationCommitPayload {
  candidate: KnowledgeCandidate;
  validation: ValidationRecord;
  memoryChange: MemoryChangeRecord;
  knowledgeItem: KnowledgeItem;
  /** Revision of the knowledge item before this commit; null asserts creation. */
  expectedKnowledgeRevision: number | null;
  idempotencyKey: string;
}

export type ValidationCommitResult = AtomicValidationCommitResult;

// TODO-015: the only trust-adding reuse event today is `trust_update_only`
// (lib/reflection.ts -> lib/trustEngine.ts recordResolution, TRUST_HUMAN_REUSE).
// create_new establishes initial trust and is intentionally NOT idempotency-guarded.
const TRUST_ADDING_REUSE_ACTIONS = new Set(["trust_update_only"]);
const HUMAN_REUSE_TRUST_EVENT = "HUMAN_REUSE";
const INITIAL_MEMORY_PROMOTION_EVENT = "MEMORY_PROMOTION";

function validateCommitPayload(organizationId: string, payload: unknown): ValidationCommitPayload {
  const body = payload as Partial<ValidationCommitPayload> | null;
  if (!body || typeof body !== "object") throw invalidRequest("The validation commit payload must be an object.");
  const { candidate, validation, memoryChange, knowledgeItem } = body;
  if (!candidate || !validation || !memoryChange || !knowledgeItem) {
    throw invalidRequest("The validation commit payload requires candidate, validation, memoryChange, and knowledgeItem.");
  }
  requireString(candidate.id, "candidate id");
  requireString(validation.id, "validation record id");
  requireString(memoryChange.id, "memory change record id");
  requireString(knowledgeItem.id, "knowledge item id");
  if (validation.decision !== "approved" && validation.decision !== "rejected") {
    throw invalidRequest("validation.decision must be approved or rejected.");
  }
  if (validation.candidateId !== candidate.id) {
    throw invalidRequest("validation.candidateId must reference the submitted candidate.");
  }
  if (memoryChange.validationRecordId !== validation.id || memoryChange.candidateId !== candidate.id) {
    throw invalidRequest("memoryChange must reference the submitted validation record and candidate.");
  }
  assertPayloadOrganization(organizationId, candidate.organizationId, "candidate");
  assertPayloadOrganization(organizationId, validation.organizationId, "validation record");
  assertPayloadOrganization(organizationId, memoryChange.organizationId, "memory change record");
  assertPayloadOrganization(organizationId, knowledgeItem.organizationId, "knowledge item");
  const expected = body.expectedKnowledgeRevision;
  if (expected !== null && expected !== undefined && (!Number.isInteger(expected) || expected < 0)) {
    throw invalidRequest("expectedKnowledgeRevision must be null or a non-negative integer.");
  }
  const idempotencyKey = body.idempotencyKey ?? validation.id;
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
    throw invalidRequest("idempotencyKey must be a non-empty string.");
  }
  return {
    candidate: candidate as KnowledgeCandidate,
    validation: validation as ValidationRecord,
    memoryChange: memoryChange as MemoryChangeRecord,
    knowledgeItem: knowledgeItem as KnowledgeItem,
    expectedKnowledgeRevision: expected ?? null,
    idempotencyKey
  };
}

async function loadCommittedValidationAggregate(
  tx: TransactionClient,
  organizationId: string,
  candidateId: string,
  validationId: string,
  memoryChangeId: string,
  knowledgeItemId: string,
  actor: { id: string; name: string },
  sourceTicketIds: string[],
  decision: ValidationRecord["decision"],
  changeType: MemoryChangeRecord["changeType"],
  replayed: boolean,
  knowledgeRevision: number,
  trustApplied: boolean
): Promise<ValidationCommitResult> {
  const [candidateRow, validationRow, memoryChangeRow, knowledgeRow] = await Promise.all([
    tx.knowledgeCandidate.findUnique({ where: { id: candidateId } }),
    tx.validationRecord.findUnique({ where: { id: validationId } }),
    tx.memoryChangeRecord.findUnique({ where: { id: memoryChangeId } }),
    tx.knowledgeItem.findUnique({ where: { id: knowledgeItemId } })
  ]);
  if (!candidateRow || !validationRow || !memoryChangeRow || !knowledgeRow) {
    throw new PersistenceServiceError(
      "DATABASE_ERROR",
      "The validation commit completed without a complete auditable aggregate.",
      500
    );
  }
  if ([candidateRow, validationRow, memoryChangeRow, knowledgeRow].some((row) => row.organizationId !== organizationId)) {
    throw conflict("The committed validation aggregate crossed organization ownership boundaries.");
  }
  return {
    replayed,
    knowledgeRevision,
    trustApplied,
    candidate: mapCandidate(candidateRow),
    validation: mapValidation(validationRow),
    memoryChange: mapMemoryChange(memoryChangeRow),
    knowledgeItem: mapKnowledge(knowledgeRow),
    auditSummary: {
      organizationId,
      actorId: actor.id,
      actor: actor.name,
      sourceTicketIds: [...sourceTicketIds],
      decision,
      changeType
    }
  };
}

/**
 * The Human Validation / Reflection commit as ONE transaction:
 * candidate lifecycle -> ValidationRecord -> MemoryChangeRecord -> knowledge
 * upsert (trust and version data live inside the item). Any failure rolls the
 * whole logical operation back; the audit chain can never be partial.
 *
 * Idempotency: a replay carrying the same validation record id returns success
 * without writing; a different submission for an already-validated candidate
 * is rejected by the (organizationId, candidateId) unique constraint with 409.
 */
export async function commitValidation(
  organizationId: string,
  rawPayload: unknown,
  // Trusted actor identity resolved server-side from the auth session (TODO-007).
  // Attribution never comes from the request payload.
  actor: { id: string; name: string }
): Promise<ValidationCommitResult> {
  const organization = await requireOrganization(organizationId);
  if (!actor || typeof actor.id !== "string" || actor.id.length === 0) {
    throw invalidRequest("A trusted authenticated actor is required for validation commits.");
  }
  const payload = validateCommitPayload(organization.id, rawPayload);

  return writeDatabase("validation commit", () =>
    prisma.$transaction(async (tx) => {
      const existingValidation = await tx.validationRecord.findUnique({ where: { id: payload.validation.id } });
      if (existingValidation) {
        if (existingValidation.organizationId !== organization.id
          || existingValidation.candidateId !== payload.candidate.id) {
          throw conflict(`Validation record ${payload.validation.id} already exists with different ownership.`);
        }
        const existingMemoryChange = await tx.memoryChangeRecord.findFirst({
          where: { organizationId: organization.id, validationRecordId: payload.validation.id }
        });
        const expectedKnowledgeId = payload.validation.knowledgeId ?? payload.knowledgeItem.id;
        if (
          !existingMemoryChange
          || existingMemoryChange.id !== payload.memoryChange.id
          || existingValidation.decision !== payload.validation.decision
          || existingValidation.knowledgeItemId !== expectedKnowledgeId
        ) {
          throw conflict(`Idempotency key ${payload.idempotencyKey} was already used with a different validation command.`);
        }
        const knowledge = await tx.knowledgeItem.findUnique({ where: { id: expectedKnowledgeId } });
        if (!knowledge || knowledge.organizationId !== organization.id) {
          throw conflict(`Validation replay ${payload.validation.id} has no knowledge item in this organization.`);
        }
        return loadCommittedValidationAggregate(
          tx,
          organization.id,
          payload.candidate.id,
          payload.validation.id,
          existingMemoryChange.id,
          knowledge.id,
          actor,
          payload.candidate.sourceTicketIds ?? [],
          existingValidation.decision,
          payload.memoryChange.changeType,
          true,
          knowledge.revision,
          true
        );
      }

      const existingKnowledgeRow = await tx.knowledgeItem.findUnique({ where: { id: payload.knowledgeItem.id } });
      if (existingKnowledgeRow && existingKnowledgeRow.organizationId !== organization.id) {
        throw conflict(`Knowledge item ${payload.knowledgeItem.id} belongs to a different organization.`);
      }
      const storedKnowledge = existingKnowledgeRow && existingKnowledgeRow.organizationId === organization.id
        ? mapKnowledge(existingKnowledgeRow)
        : null;
      const normalizedKnowledgeItem = normalizeValidationKnowledgeItem(payload.knowledgeItem, storedKnowledge);
      const stableKnowledgeItem = withStableValidationProvenance(
        normalizedKnowledgeItem,
        payload.candidate.sourceTicketIds ?? [],
        {
          actor: payload.validation.actor ?? actor.name,
          timestamp: payload.validation.timestamp,
          rationale: payload.validation.rationale ?? payload.candidate.rationale,
          scope: `Prototype ${payload.candidate.proposedAction} validation`
        },
        storedKnowledge
      );

      const sourceTicketIds = [
        ...new Set(
          (payload.candidate.sourceTicketIds ?? []).filter(
            (ticketId): ticketId is string => typeof ticketId === "string" && ticketId.length > 0
          )
        )
      ];
      const sourceTickets = sourceTicketIds.length > 0
        ? await tx.ticketRecord.findMany({ where: { ticketId: { in: sourceTicketIds } }, select: { organizationId: true } })
        : [];
      if (sourceTickets.some((ticket) => ticket.organizationId !== organization.id)) {
        throw conflict("A validation candidate references a source ticket from another organization.");
      }

      await upsertCandidateTx(tx, organization.id, { ...payload.candidate, status: "validated" }, { authoritativeLifecycle: true });
      await runValidationCommitTestHook("afterCandidateUpdate");

      try {
        await tx.validationRecord.create({
          data: {
            id: payload.validation.id,
            organizationId: organization.id,
            candidateId: payload.candidate.id,
            knowledgeItemId: payload.validation.knowledgeId ?? payload.knowledgeItem.id,
            knowledgeVersionId: payload.validation.knowledgeVersionId ?? null,
            decision: payload.validation.decision,
            actor: actor.name,
            actorId: actor.id,
            roleExercised: payload.validation.roleExercised ?? "knowledge_validator",
            rationale: payload.validation.rationale ?? null,
            timestamp: parseDate(payload.validation.timestamp, "validation timestamp")
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`Candidate ${payload.candidate.id} already has a validation record; duplicate submission rejected.`);
        }
        throw error;
      }
      await runValidationCommitTestHook("afterValidationCreate");

      try {
        await tx.memoryChangeRecord.create({
          data: {
            id: payload.memoryChange.id,
            organizationId: organization.id,
            knowledgeItemId: payload.knowledgeItem.id,
            candidateId: payload.candidate.id,
            validationRecordId: payload.validation.id,
            actorId: actor.id,
            changeType: requireString(payload.memoryChange.changeType, "memory change changeType"),
            beforeState: nullableJson(payload.memoryChange.beforeState),
            afterState: json(payload.memoryChange.afterState),
            timestamp: parseDate(payload.memoryChange.timestamp, "memory change timestamp")
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`Validation record ${payload.validation.id} already has a memory change record; duplicate submission rejected.`);
        }
        throw error;
      }
      await runValidationCommitTestHook("afterMemoryChangeCreate");

      // TODO-015: claim source-ticket trust evidence inside this same transaction.
      // A trust-adding reuse event applies its delta only if at least one of its
      // source tickets has not already contributed that event to this KnowledgeItem.
      // createMany({ skipDuplicates }) is conflict-safe (it never raises a unique
      // violation), so it cannot abort the surrounding transaction; and because the
      // claim shares this transaction, a later rollback also removes the evidence.
      let knowledgeToPersist = stableKnowledgeItem;
      let trustApplied = true;
      // A first validated promotion is itself trust evidence. Keep the
      // source-ticket claim in the same transaction so retries remain
      // idempotent and the audit chain can prove why the initial trust exists.
      if (payload.candidate.proposedAction === "create_new" && !storedKnowledge && sourceTicketIds.length > 0) {
        await tx.trustEvidence.createMany({
          data: sourceTicketIds.map((sourceTicketId) => ({
            organizationId: organization.id,
            knowledgeItemId: normalizedKnowledgeItem.id,
            sourceTicketId,
            trustEventType: INITIAL_MEMORY_PROMOTION_EVENT,
            validationRecordId: payload.validation.id,
            delta: normalizedKnowledgeItem.trustScore ?? 0
          })),
          skipDuplicates: true
        });
      }
      if (TRUST_ADDING_REUSE_ACTIONS.has(payload.candidate.proposedAction) && sourceTicketIds.length > 0) {
        // The stored trust is the authoritative pre-event base (avoids relying on
        // client-side delta arithmetic or clamping).
        const stored = await tx.knowledgeItem.findUnique({
          where: { id: payload.knowledgeItem.id },
          select: { trustScore: true, organizationId: true }
        });
        const storedTrust =
          stored && stored.organizationId === organization.id
            ? stored.trustScore ?? 0
            : normalizedKnowledgeItem.trustScore ?? 0;
        const eventDelta = (normalizedKnowledgeItem.trustScore ?? storedTrust) - storedTrust;
        const claim = await tx.trustEvidence.createMany({
          data: sourceTicketIds.map((sourceTicketId) => ({
            organizationId: organization.id,
            knowledgeItemId: normalizedKnowledgeItem.id,
            sourceTicketId,
            trustEventType: HUMAN_REUSE_TRUST_EVENT,
            validationRecordId: payload.validation.id,
            delta: eventDelta
          })),
          skipDuplicates: true
        });
        // Apply the event delta once when any source ticket was newly eligible;
        // otherwise every source ticket already counted -> keep the stored trust.
        if (claim.count === 0) {
          trustApplied = false;
          knowledgeToPersist = { ...normalizedKnowledgeItem, trustScore: storedTrust };
        }
      }
      await runValidationCommitTestHook("afterTrustEvidenceCreate");

      const knowledgeRevision = await upsertKnowledgeItemTx(
        tx,
        organization.id,
        knowledgeToPersist,
        payload.expectedKnowledgeRevision
      );
      await runValidationCommitTestHook("afterKnowledgeUpdate");
      return loadCommittedValidationAggregate(
        tx,
        organization.id,
        payload.candidate.id,
        payload.validation.id,
        payload.memoryChange.id,
        payload.knowledgeItem.id,
        actor,
        sourceTicketIds,
        payload.validation.decision,
        payload.memoryChange.changeType,
        false,
        knowledgeRevision,
        trustApplied
      );
    })
  );
}
