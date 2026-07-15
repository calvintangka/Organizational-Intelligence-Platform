import "server-only";

import { requireOrganizationId } from "@/lib/organizationId";
import { prisma } from "@/lib/server/prisma";
import type {
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeItem,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  TicketRecord,
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

export type PersistenceServiceErrorCode =
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
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function mapKnowledge(row: PrismaKnowledgeItem): KnowledgeItem {
  const content = asRecord(row.content);
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
  return {
    ticketId: row.ticketId,
    orgId: row.organizationId,
    createdAt: iso(row.createdAt),
    rawMessage: row.rawMessage,
    subject: row.subject,
    classification: nullableJsonRecord(row.classification),
    memoryMatch: nullableJsonRecord(row.memoryMatch),
    draftSource: row.draftSource as TicketRecord["draftSource"],
    resolution: asRecord(row.resolution) as unknown as TicketRecord["resolution"],
    reflection: asRecord(row.reflection) as unknown as TicketRecord["reflection"],
    validationRecordIds: stringArray(row.validationRecordIds),
    status: row.status,
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
  try {
    return await read();
  } catch (error) {
    throw classifyDatabaseError(error, operation);
  }
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
  try {
    return await write();
  } catch (error) {
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
      logoInitials: profile.logoInitials
    }),
    createdAt: optionalDate(profile.createdAt) ?? new Date()
  };
}

const KNOWLEDGE_LIFECYCLES = ["active", "candidate", "deprecated"] as const;
const CANDIDATE_LIFECYCLES = ["proposed", "validated", "rejected"] as const;
const TICKET_LIFECYCLES = ["open", "in_review", "resolved", "rejected", "discarded"] as const;
const PATTERN_LIFECYCLES = ["monitoring", "suggested", "promoted", "dismissed"] as const;

function narrowEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
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
  candidate: KnowledgeCandidate
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
  const existing = await tx.knowledgeCandidate.findUnique({ where: { id }, select: { organizationId: true } });
  if (existing && existing.organizationId !== organizationId) {
    throw conflict(`Knowledge candidate ${id} belongs to a different organization.`);
  }
  if (existing) {
    await tx.knowledgeCandidate.update({ where: { id }, data });
  } else {
    await tx.knowledgeCandidate.create({ data: { id, organizationId, ...data } });
  }
}

function toTicketColumns(record: TicketRecord): Omit<Prisma.TicketRecordUncheckedCreateInput, "id" | "organizationId" | "ticketId"> {
  return {
    rawMessage: typeof record.rawMessage === "string" ? record.rawMessage : "",
    subject: record.subject ?? null,
    status: narrowEnum(record.status, TICKET_LIFECYCLES, "open"),
    draftSource: record.draftSource ?? null,
    classification: nullableJson(record.classification),
    memoryMatch: nullableJson(record.memoryMatch),
    resolution: json(record.resolution ?? {}),
    reflection: json(record.reflection ?? {}),
    validationRecordIds: json(record.validationRecordIds ?? []),
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
  const saved = await writeDatabase("organization profile", () =>
    prisma.organization.upsert({
      where: { id: row.id },
      create: row,
      update: { name: row.name, industry: row.industry, description: row.description, settings: row.settings }
    })
  );
  return mapOrganization(saved);
}

/** Upsert every profile in the list. Deletion is only available via DELETE. */
export async function upsertOrganizationProfiles(list: OrganizationProfile[]): Promise<OrganizationProfile[]> {
  if (!Array.isArray(list)) throw invalidRequest("The organization list payload must be an array.");
  const rows = list.map(toOrganizationRow);
  const saved = await writeDatabase("organization list", () =>
    prisma.$transaction(async (tx) => {
      const results = [];
      for (const row of rows) {
        results.push(await tx.organization.upsert({
          where: { id: row.id },
          create: row,
          update: { name: row.name, industry: row.industry, description: row.description, settings: row.settings }
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
      await tx.knowledgeCandidate.deleteMany({
        where: { organizationId: organization.id, id: { notIn: candidates.map((candidate) => candidate.id) } }
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
}

export interface ValidationCommitResult {
  replayed: boolean;
  knowledgeRevision: number;
}

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
  return {
    candidate: candidate as KnowledgeCandidate,
    validation: validation as ValidationRecord,
    memoryChange: memoryChange as MemoryChangeRecord,
    knowledgeItem: knowledgeItem as KnowledgeItem,
    expectedKnowledgeRevision: expected ?? null
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
export async function commitValidation(organizationId: string, rawPayload: unknown): Promise<ValidationCommitResult> {
  const organization = await requireOrganization(organizationId);
  const payload = validateCommitPayload(organization.id, rawPayload);

  return writeDatabase("validation commit", () =>
    prisma.$transaction(async (tx) => {
      const existingValidation = await tx.validationRecord.findUnique({ where: { id: payload.validation.id } });
      if (existingValidation) {
        if (existingValidation.organizationId !== organization.id
          || existingValidation.candidateId !== payload.candidate.id) {
          throw conflict(`Validation record ${payload.validation.id} already exists with different ownership.`);
        }
        const knowledge = await tx.knowledgeItem.findUnique({
          where: { id: payload.knowledgeItem.id },
          select: { revision: true, organizationId: true }
        });
        return {
          replayed: true,
          knowledgeRevision: knowledge && knowledge.organizationId === organization.id ? knowledge.revision : 0
        };
      }

      await upsertCandidateTx(tx, organization.id, { ...payload.candidate, status: "validated" });

      try {
        await tx.validationRecord.create({
          data: {
            id: payload.validation.id,
            organizationId: organization.id,
            candidateId: payload.candidate.id,
            knowledgeItemId: payload.validation.knowledgeId ?? payload.knowledgeItem.id,
            knowledgeVersionId: payload.validation.knowledgeVersionId ?? null,
            decision: payload.validation.decision,
            actor: requireString(payload.validation.actor, "validation actor"),
            actorId: null,
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

      try {
        await tx.memoryChangeRecord.create({
          data: {
            id: payload.memoryChange.id,
            organizationId: organization.id,
            knowledgeItemId: payload.knowledgeItem.id,
            candidateId: payload.candidate.id,
            validationRecordId: payload.validation.id,
            actorId: null,
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

      const knowledgeRevision = await upsertKnowledgeItemTx(
        tx,
        organization.id,
        payload.knowledgeItem,
        payload.expectedKnowledgeRevision
      );
      return { replayed: false, knowledgeRevision };
    })
  );
}
