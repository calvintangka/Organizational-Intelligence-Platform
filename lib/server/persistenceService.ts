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

export type PersistenceServiceErrorCode =
  | "INVALID_ORGANIZATION_ID"
  | "ORGANIZATION_NOT_FOUND"
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
