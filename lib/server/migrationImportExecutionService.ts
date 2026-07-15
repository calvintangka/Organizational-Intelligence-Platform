import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  getPrismaClient
} from "@/lib/server/prisma";
import {
  getMigrationImportBatch,
  MigrationImportServiceError,
  revalidateStoredMigrationExportPackage
} from "@/lib/server/migrationImportService";
import {
  MIGRATION_IMPORT_RESOURCE_TYPES,
  type MigrationImportBatchStatus,
  type MigrationImportResourceType
} from "@/types/migrationImport";
import type {
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeItem,
  OrgMetrics,
  OrganizationProfile,
  TicketRecord,
  ValidationRecord
} from "@/types";
import type {
  MigrationExportPackage,
  MigrationExportResources
} from "@/types/migrationExport";
import {
  sha256,
  stableStringify
} from "@/lib/persistence/migrationExportDigest";

const IMPLEMENTED_RESOURCE_TYPES = [
  "knowledge",
  "knowledgeCandidates",
  "validationRecords",
  "ticketRecords",
  "emergingPatterns",
  "intelligenceLog",
  "orgMetrics"
] as const satisfies readonly MigrationImportResourceType[];

type ImplementedResourceType = typeof IMPLEMENTED_RESOURCE_TYPES[number];
type TransactionClient = Prisma.TransactionClient;
type JsonRecord = Record<string, unknown>;

export interface MigrationImportExecutionResult {
  batchId: string;
  organizationId: string;
  status: MigrationImportBatchStatus;
  importedCounts: Record<string, number>;
  skippedIdenticalCounts: Record<string, number>;
  conflictCounts: Record<string, number>;
  noOp: boolean;
  failedResource: MigrationImportResourceType | null;
  resourceCheckpoints: Awaited<ReturnType<typeof getMigrationImportBatch>>["resourceCheckpoints"];
  unresolvedConflictCount: number;
  nextAction: "resolve_conflicts_or_retry" | "retry_failed_resource" | "begin_batch_5_5_finalization";
}

interface ImportCounts {
  importedCount: number;
  skippedIdenticalCount: number;
  conflictCount: number;
}

function invalidExecution(message: string): never {
  throw new MigrationImportServiceError("INVALID_RESOURCE", message);
}

function blockedExecution(message: string): never {
  throw new MigrationImportServiceError("CONFLICT", message);
}

function asRecord(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidExecution(`${field} must be an object.`);
  return value as JsonRecord;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalidExecution(`${field} must be a non-empty string.`);
  return value;
}

function dateValue(value: unknown, field: string): Date {
  if (typeof value !== "string") invalidExecution(`${field} must be a valid timestamp.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalidExecution(`${field} must be a valid timestamp.`);
  return date;
}

function optionalDateValue(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  return dateValue(value, field);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) invalidExecution(`${field} must be a non-negative integer.`);
  return value as number;
}

function numberOrNull(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) invalidExecution(`${field} must be a finite number or null.`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) invalidExecution(`${field} has an unsupported historical value.`);
  return value as T;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as unknown as Prisma.InputJsonValue;
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : jsonValue(value);
}

function normalizedDate(value: unknown, field: string): string {
  return dateValue(value, field).toISOString();
}

function resourceDigest(exportPackage: MigrationExportPackage, resourceType: MigrationImportResourceType): string {
  return exportPackage.digests.resourceDigests[resourceType];
}

function profileSettings(profile: OrganizationProfile): JsonRecord {
  return {
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
  };
}

function profileProjection(profile: OrganizationProfile): JsonRecord {
  return {
    id: requiredString(profile.id, "organizationProfile.id"),
    name: requiredString(profile.name, "organizationProfile.name"),
    industry: typeof profile.industry === "string" ? profile.industry : "",
    description: typeof profile.description === "string" ? profile.description : "",
    settings: profileSettings(profile)
  };
}

function targetProfileProjection(row: { id: string; name: string; industry: string; description: string; settings: unknown }): JsonRecord {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    settings: asRecord(row.settings, "target organization settings")
  };
}

function knowledgeContent(item: KnowledgeItem): Prisma.InputJsonValue {
  return jsonValue({
    problem: requiredString(item.problem, "knowledge problem"),
    approvedAnswer: requiredString(item.approvedAnswer, "knowledge approvedAnswer"),
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

function knowledgeLifecycle(value: unknown): "active" | "candidate" | "deprecated" {
  return enumValue(value ?? "active", ["active", "candidate", "deprecated"], "knowledge.lifecycleState");
}

function knowledgeData(item: KnowledgeItem, organizationId: string) {
  const createdAt = dateValue(item.createdAt, "knowledge.createdAt");
  return {
    id: requiredString(item.id, "knowledge.id"),
    organizationId,
    title: requiredString(item.title, "knowledge.title"),
    category: typeof item.category === "string" ? item.category : "",
    canonicalProblemId: item.canonicalProblemId ?? null,
    canonicalProblemTitle: item.canonicalProblemTitle ?? null,
    lifecycleState: knowledgeLifecycle(item.lifecycleState),
    sourceTicketId: typeof item.sourceTicketId === "string" ? item.sourceTicketId : "",
    timesReused: numberOrNull(item.timesReused, "knowledge.timesReused") ?? 0,
    timesSeen: numberOrNull(item.timesSeen, "knowledge.timesSeen"),
    successfulResolutions: numberOrNull(item.successfulResolutions, "knowledge.successfulResolutions"),
    failedResolutions: numberOrNull(item.failedResolutions, "knowledge.failedResolutions"),
    successRate: numberOrNull(item.successRate, "knowledge.successRate"),
    trustScore: numberOrNull(item.trustScore, "knowledge.trustScore"),
    autoResponseEligible: item.autoResponseEligible ?? null,
    humanReviewCount: numberOrNull(item.humanReviewCount, "knowledge.humanReviewCount"),
    automaticResolutionCount: numberOrNull(item.automaticResolutionCount, "knowledge.automaticResolutionCount"),
    createdAt,
    approvedAt: optionalDateValue(item.approvedAt, "knowledge.approvedAt") ?? createdAt,
    lastUsedAt: optionalDateValue(item.lastUsedAt, "knowledge.lastUsedAt"),
    lastValidatedAt: optionalDateValue(item.lastValidatedAt, "knowledge.lastValidatedAt"),
    lastUpdatedAt: optionalDateValue(item.lastUpdated, "knowledge.lastUpdated"),
    lastValidated: optionalDateValue(item.lastValidated, "knowledge.lastValidated"),
    revision: item.revision === undefined ? 1 : nonNegativeInteger(item.revision, "knowledge.revision"),
    content: knowledgeContent(item)
  };
}

function knowledgeProjection(item: KnowledgeItem, organizationId: string): JsonRecord {
  const data = knowledgeData(item, organizationId);
  return {
    id: data.id,
    organizationId: data.organizationId,
    title: data.title,
    category: data.category,
    canonicalProblemId: data.canonicalProblemId,
    canonicalProblemTitle: data.canonicalProblemTitle,
    lifecycleState: data.lifecycleState,
    sourceTicketId: data.sourceTicketId,
    timesReused: data.timesReused,
    timesSeen: data.timesSeen,
    successfulResolutions: data.successfulResolutions,
    failedResolutions: data.failedResolutions,
    successRate: data.successRate,
    trustScore: data.trustScore,
    autoResponseEligible: data.autoResponseEligible,
    humanReviewCount: data.humanReviewCount,
    automaticResolutionCount: data.automaticResolutionCount,
    createdAt: data.createdAt.toISOString(),
    approvedAt: data.approvedAt.toISOString(),
    lastUsedAt: data.lastUsedAt?.toISOString() ?? null,
    lastValidatedAt: data.lastValidatedAt?.toISOString() ?? null,
    lastUpdatedAt: data.lastUpdatedAt?.toISOString() ?? null,
    lastValidated: data.lastValidated?.toISOString() ?? null,
    content: data.content
  };
}

function targetKnowledgeProjection(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    category: row.category,
    canonicalProblemId: row.canonicalProblemId,
    canonicalProblemTitle: row.canonicalProblemTitle,
    lifecycleState: row.lifecycleState,
    sourceTicketId: row.sourceTicketId,
    timesReused: row.timesReused,
    timesSeen: row.timesSeen,
    successfulResolutions: row.successfulResolutions,
    failedResolutions: row.failedResolutions,
    successRate: row.successRate,
    trustScore: row.trustScore,
    autoResponseEligible: row.autoResponseEligible,
    humanReviewCount: row.humanReviewCount,
    automaticResolutionCount: row.automaticResolutionCount,
    createdAt: (row.createdAt as Date).toISOString(),
    approvedAt: (row.approvedAt as Date).toISOString(),
    lastUsedAt: row.lastUsedAt ? (row.lastUsedAt as Date).toISOString() : null,
    lastValidatedAt: row.lastValidatedAt ? (row.lastValidatedAt as Date).toISOString() : null,
    lastUpdatedAt: row.lastUpdatedAt ? (row.lastUpdatedAt as Date).toISOString() : null,
    lastValidated: row.lastValidated ? (row.lastValidated as Date).toISOString() : null,
    content: row.content
  };
}

function candidateLifecycle(value: unknown): "proposed" | "validated" | "rejected" {
  return enumValue(value, ["proposed", "validated", "rejected"], "knowledgeCandidate.status");
}

function candidateData(candidate: KnowledgeCandidate, organizationId: string) {
  return {
    id: requiredString(candidate.id, "knowledgeCandidate.id"),
    organizationId,
    relatedKnowledgeId: candidate.relatedKnowledgeId ?? null,
    sourceTicketIds: jsonValue(candidate.sourceTicketIds ?? []),
    proposedAction: requiredString(candidate.proposedAction, "knowledgeCandidate.proposedAction"),
    proposedContent: jsonValue(candidate.proposedContent ?? {}),
    rationale: typeof candidate.rationale === "string" ? candidate.rationale : "",
    status: candidateLifecycle(candidate.status),
    createdAt: dateValue(candidate.createdAt, "knowledgeCandidate.createdAt")
  };
}

function candidateProjection(candidate: KnowledgeCandidate, organizationId: string): JsonRecord {
  const data = candidateData(candidate, organizationId);
  return { ...data, createdAt: data.createdAt.toISOString() };
}

function targetCandidateProjection(row: JsonRecord): JsonRecord {
  return { ...row, createdAt: (row.createdAt as Date).toISOString() };
}

function validationData(validation: ValidationRecord, organizationId: string) {
  return {
    id: requiredString(validation.id, "validationRecord.id"),
    organizationId,
    candidateId: requiredString(validation.candidateId, "validationRecord.candidateId"),
    knowledgeItemId: validation.knowledgeId ?? null,
    knowledgeVersionId: validation.knowledgeVersionId ?? null,
    decision: enumValue(validation.decision, ["approved", "rejected"], "validationRecord.decision"),
    actor: requiredString(validation.actor, "validationRecord.actor"),
    actorId: null,
    roleExercised: requiredString(validation.roleExercised, "validationRecord.roleExercised"),
    rationale: validation.rationale ?? null,
    timestamp: dateValue(validation.timestamp, "validationRecord.timestamp")
  };
}

function validationProjection(validation: ValidationRecord, organizationId: string): JsonRecord {
  const data = validationData(validation, organizationId);
  return { ...data, timestamp: data.timestamp.toISOString() };
}

function targetValidationProjection(row: JsonRecord): JsonRecord {
  return { ...row, timestamp: (row.timestamp as Date).toISOString() };
}

function ticketLifecycle(value: unknown): "open" | "in_review" | "resolved" | "rejected" | "discarded" {
  return enumValue(value, ["open", "in_review", "resolved", "rejected", "discarded"], "ticketRecord.status");
}

function ticketData(record: TicketRecord, organizationId: string) {
  return {
    organizationId,
    ticketId: requiredString(record.ticketId, "ticketRecord.ticketId"),
    rawMessage: typeof record.rawMessage === "string" ? record.rawMessage : "",
    subject: record.subject ?? null,
    status: ticketLifecycle(record.status),
    draftSource: record.draftSource ?? null,
    classification: nullableJson(record.classification),
    memoryMatch: nullableJson(record.memoryMatch),
    resolution: jsonValue(record.resolution ?? {}),
    reflection: jsonValue(record.reflection ?? {}),
    validationRecordIds: jsonValue(record.validationRecordIds ?? []),
    actorId: null,
    createdAt: dateValue(record.createdAt, "ticketRecord.createdAt")
  };
}

function ticketProjection(record: TicketRecord, organizationId: string): JsonRecord {
  const data = ticketData(record, organizationId);
  return { ...data, createdAt: data.createdAt.toISOString() };
}

function targetTicketProjection(row: JsonRecord): JsonRecord {
  return {
    organizationId: row.organizationId,
    ticketId: row.ticketId,
    rawMessage: row.rawMessage,
    subject: row.subject,
    status: row.status,
    draftSource: row.draftSource,
    classification: row.classification,
    memoryMatch: row.memoryMatch,
    resolution: row.resolution,
    reflection: row.reflection,
    validationRecordIds: row.validationRecordIds,
    actorId: row.actorId,
    createdAt: (row.createdAt as Date).toISOString()
  };
}

function patternLifecycle(value: unknown): "monitoring" | "suggested" | "promoted" | "dismissed" {
  return enumValue(value, ["monitoring", "suggested", "promoted", "dismissed"], "emergingPattern.status");
}

function patternData(pattern: EmergingPattern, organizationId: string) {
  return {
    id: requiredString(pattern.id, "emergingPattern.id"),
    organizationId,
    title: requiredString(pattern.title, "emergingPattern.title"),
    summary: typeof pattern.summary === "string" ? pattern.summary : "",
    category: typeof pattern.category === "string" ? pattern.category : "",
    status: patternLifecycle(pattern.status),
    tags: jsonValue(pattern.tags ?? []),
    keywords: jsonValue(pattern.keywords ?? []),
    exampleTickets: jsonValue(pattern.exampleTickets ?? []),
    timesSeen: nonNegativeInteger(pattern.timesSeen, "emergingPattern.timesSeen"),
    confidenceScore: typeof pattern.confidenceScore === "number" && Number.isFinite(pattern.confidenceScore)
      ? pattern.confidenceScore
      : invalidExecution("emergingPattern.confidenceScore must be finite."),
    suggestedCanonicalProblem: pattern.suggestedCanonicalProblem === true,
    firstSeenAt: dateValue(pattern.firstSeenAt, "emergingPattern.firstSeenAt"),
    lastSeenAt: dateValue(pattern.lastSeenAt, "emergingPattern.lastSeenAt")
  };
}

function patternProjection(pattern: EmergingPattern, organizationId: string): JsonRecord {
  const data = patternData(pattern, organizationId);
  return { ...data, firstSeenAt: data.firstSeenAt.toISOString(), lastSeenAt: data.lastSeenAt.toISOString() };
}

function targetPatternProjection(row: JsonRecord): JsonRecord {
  return { ...row, firstSeenAt: (row.firstSeenAt as Date).toISOString(), lastSeenAt: (row.lastSeenAt as Date).toISOString() };
}

function logData(entry: IntelligenceLogEntry, organizationId: string) {
  return {
    id: requiredString(entry.id, "intelligenceLog.id"),
    organizationId,
    timestamp: dateValue(entry.timestamp, "intelligenceLog.timestamp"),
    event: requiredString(entry.event, "intelligenceLog.event"),
    detail: entry.detail ?? null
  };
}

function logProjection(entry: IntelligenceLogEntry, organizationId: string): JsonRecord {
  const data = logData(entry, organizationId);
  return { ...data, timestamp: data.timestamp.toISOString() };
}

function targetLogProjection(row: JsonRecord): JsonRecord {
  return { ...row, timestamp: (row.timestamp as Date).toISOString() };
}

function metricsData(metrics: OrgMetrics, organizationId: string) {
  return {
    organizationId,
    lifetimeTickets: nonNegativeInteger(metrics.lifetimeTickets, "orgMetrics.lifetimeTickets"),
    knowledgeReused: nonNegativeInteger(metrics.knowledgeReused, "orgMetrics.knowledgeReused"),
    autoResolutions: nonNegativeInteger(metrics.autoResolutions, "orgMetrics.autoResolutions"),
    humanResolutions: nonNegativeInteger(metrics.humanResolutions, "orgMetrics.humanResolutions"),
    totalResolutionTimeSec: nonNegativeInteger(metrics.totalResolutionTimeSec, "orgMetrics.totalResolutionTimeSec"),
    resolutionsCount: nonNegativeInteger(metrics.resolutionsCount, "orgMetrics.resolutionsCount"),
    memoryGrowthToday: nonNegativeInteger(metrics.memoryGrowthToday, "orgMetrics.memoryGrowthToday"),
    memoryGrowthDate: requiredString(metrics.memoryGrowthDate, "orgMetrics.memoryGrowthDate"),
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
    lastUpdatedAt: dateValue(metrics.lastUpdatedAt, "orgMetrics.lastUpdatedAt")
  };
}

function metricsProjection(metrics: OrgMetrics, organizationId: string): JsonRecord {
  const data = metricsData(metrics, organizationId);
  return { ...data, lastUpdatedAt: data.lastUpdatedAt.toISOString() };
}

function targetMetricsProjection(row: JsonRecord): JsonRecord {
  return { ...row, lastUpdatedAt: (row.lastUpdatedAt as Date).toISOString() };
}

function projectionDigest(projection: JsonRecord): Promise<string> {
  return sha256(stableStringify(projection));
}

async function createConflictTx(
  tx: TransactionClient,
  batchId: string,
  organizationId: string,
  resourceType: MigrationImportResourceType,
  sourceRecordId: string,
  conflictType: "same_id_different_content" | "cross_organization_ownership_mismatch" | "duplicate_candidate_validation" | "ticket_id_collision",
  sourceDigest: string,
  targetDigest: string | undefined,
  reason: string
): Promise<boolean> {
  const fingerprint = `${resourceType}:${sourceRecordId}:${conflictType}:${sourceDigest}:${targetDigest ?? "none"}`;
  const existing = await tx.migrationImportConflict.findUnique({ where: { batchId_fingerprint: { batchId, fingerprint } } });
  if (existing) return false;
  await tx.migrationImportConflict.create({
    data: {
      batchId,
      organizationId,
      resourceType,
      fingerprint,
      sourceRecordId,
      conflictType,
      sourceDigest,
      targetDigest,
      sourceSnapshot: jsonValue({ sourceRecordId, organizationId, sourceDigest }),
      targetSnapshot: targetDigest ? jsonValue({ targetDigest }) : undefined,
      reason,
      status: "open"
    }
  });
  return true;
}

async function importKnowledge(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.knowledge;
  const targets = await tx.knowledgeItem.findMany({ where: { id: { in: source.map((item) => requiredString(item.id, "knowledge.id")) } } });
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const conflicts: Array<{ item: KnowledgeItem; type: "same_id_different_content" | "cross_organization_ownership_mismatch"; targetDigest?: string; reason: string }> = [];
  const skips: KnowledgeItem[] = [];
  for (const item of source) {
    const target = targetById.get(requiredString(item.id, "knowledge.id"));
    if (!target) continue;
    const targetProjection = targetKnowledgeProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (target.organizationId !== organizationId) {
      conflicts.push({ item, type: "cross_organization_ownership_mismatch", targetDigest, reason: `Knowledge item ${item.id} belongs to another organization.` });
    } else if (stableStringify(knowledgeProjection(item, organizationId)) !== stableStringify(targetProjection)) {
      conflicts.push({ item, type: "same_id_different_content", targetDigest, reason: `Knowledge item ${item.id} has different historical content.` });
    } else if (item.revision !== undefined && target.revision < nonNegativeInteger(item.revision, "knowledge.revision")) {
      conflicts.push({ item, type: "same_id_different_content", targetDigest, reason: `Knowledge item ${item.id} has a lower target revision than the source history.` });
    } else {
      skips.push(item);
    }
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "knowledge", requiredString(conflict.item.id, "knowledge.id"), conflict.type, resourceDigest(exportPackage, "knowledge"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const item of source) {
    if (skips.includes(item)) continue;
    const data = knowledgeData(item, organizationId);
    await tx.knowledgeItem.create({ data });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importCandidates(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.knowledgeCandidates;
  const targets = await tx.knowledgeCandidate.findMany({ where: { id: { in: source.map((candidate) => requiredString(candidate.id, "knowledgeCandidate.id")) } } });
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const conflicts: Array<{ item: KnowledgeCandidate; type: "same_id_different_content" | "cross_organization_ownership_mismatch"; targetDigest?: string; reason: string }> = [];
  const skips: KnowledgeCandidate[] = [];
  for (const candidate of source) {
    const target = targetById.get(requiredString(candidate.id, "knowledgeCandidate.id"));
    if (!target) continue;
    const targetProjection = targetCandidateProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (target.organizationId !== organizationId) {
      conflicts.push({ item: candidate, type: "cross_organization_ownership_mismatch", targetDigest, reason: `Knowledge candidate ${candidate.id} belongs to another organization.` });
    } else if (stableStringify(candidateProjection(candidate, organizationId)) !== stableStringify(targetProjection)) {
      conflicts.push({ item: candidate, type: "same_id_different_content", targetDigest, reason: `Knowledge candidate ${candidate.id} has different historical content.` });
    } else {
      skips.push(candidate);
    }
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "knowledgeCandidates", requiredString(conflict.item.id, "knowledgeCandidate.id"), conflict.type, resourceDigest(exportPackage, "knowledgeCandidates"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const candidate of source) {
    if (skips.includes(candidate)) continue;
    await tx.knowledgeCandidate.create({ data: candidateData(candidate, organizationId) });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importValidations(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.validationRecords;
  const ids = source.map((validation) => requiredString(validation.id, "validationRecord.id"));
  const targets = await tx.validationRecord.findMany({ where: { id: { in: ids } } });
  const candidateIds = source.map((validation) => requiredString(validation.candidateId, "validationRecord.candidateId"));
  const candidateValidationRows = await tx.validationRecord.findMany({ where: { organizationId, candidateId: { in: candidateIds } } });
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const byCandidate = new Map(candidateValidationRows.map((row) => [row.candidateId, row]));
  const conflicts: Array<{ validation: ValidationRecord; type: "same_id_different_content" | "cross_organization_ownership_mismatch" | "duplicate_candidate_validation"; targetDigest?: string; reason: string }> = [];
  const skips: ValidationRecord[] = [];
  for (const validation of source) {
    const target = targetById.get(requiredString(validation.id, "validationRecord.id"));
    if (target) {
      const targetProjection = targetValidationProjection(target as unknown as JsonRecord);
      const targetDigest = await projectionDigest(targetProjection);
      if (target.organizationId !== organizationId) conflicts.push({ validation, type: "cross_organization_ownership_mismatch", targetDigest, reason: `Validation record ${validation.id} belongs to another organization.` });
      else if (stableStringify(validationProjection(validation, organizationId)) !== stableStringify(targetProjection)) conflicts.push({ validation, type: "same_id_different_content", targetDigest, reason: `Validation record ${validation.id} has different historical content.` });
      else skips.push(validation);
      continue;
    }
    const candidateTarget = byCandidate.get(requiredString(validation.candidateId, "validationRecord.candidateId"));
    if (candidateTarget && candidateTarget.id !== validation.id) {
      const targetDigest = await projectionDigest(targetValidationProjection(candidateTarget as unknown as JsonRecord));
      conflicts.push({ validation, type: "duplicate_candidate_validation", targetDigest, reason: `Candidate ${validation.candidateId} already has a different validation record.` });
    }
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "validationRecords", requiredString(conflict.validation.id, "validationRecord.id"), conflict.type, resourceDigest(exportPackage, "validationRecords"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const validation of source) {
    if (skips.includes(validation)) continue;
    await tx.validationRecord.create({ data: validationData(validation, organizationId) });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importTickets(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.ticketRecords;
  const ticketIds = source.map((record) => requiredString(record.ticketId, "ticketRecord.ticketId"));
  const sameOrgTargets = await tx.ticketRecord.findMany({ where: { organizationId, ticketId: { in: ticketIds } } });
  const crossOrgTargets = await tx.ticketRecord.findMany({ where: { ticketId: { in: ticketIds }, organizationId: { not: organizationId } } });
  const targetById = new Map(sameOrgTargets.map((row) => [row.ticketId, row]));
  const crossOrgIds = new Set(crossOrgTargets.map((row) => row.ticketId));
  const conflicts: Array<{ record: TicketRecord; type: "ticket_id_collision" | "cross_organization_ownership_mismatch"; targetDigest?: string; reason: string }> = [];
  const skips: TicketRecord[] = [];
  for (const record of source) {
    const ticketId = requiredString(record.ticketId, "ticketRecord.ticketId");
    if (crossOrgIds.has(ticketId)) {
      const target = crossOrgTargets.find((row) => row.ticketId === ticketId);
      conflicts.push({ record, type: "cross_organization_ownership_mismatch", targetDigest: target ? await projectionDigest(targetTicketProjection(target as unknown as JsonRecord)) : undefined, reason: `Ticket ${ticketId} exists under another organization.` });
      continue;
    }
    const target = targetById.get(ticketId);
    if (!target) continue;
    const targetProjection = targetTicketProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (stableStringify(ticketProjection(record, organizationId)) !== stableStringify(targetProjection)) conflicts.push({ record, type: "ticket_id_collision", targetDigest, reason: `Ticket ${ticketId} has different historical content.` });
    else skips.push(record);
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "ticketRecords", requiredString(conflict.record.ticketId, "ticketRecord.ticketId"), conflict.type, resourceDigest(exportPackage, "ticketRecords"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const record of source) {
    if (skips.includes(record)) continue;
    await tx.ticketRecord.create({ data: ticketData(record, organizationId) });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importPatterns(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.emergingPatterns;
  const targets = await tx.emergingPattern.findMany({ where: { id: { in: source.map((pattern) => requiredString(pattern.id, "emergingPattern.id")) } } });
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const conflicts: Array<{ pattern: EmergingPattern; type: "same_id_different_content" | "cross_organization_ownership_mismatch"; targetDigest?: string; reason: string }> = [];
  const skips: EmergingPattern[] = [];
  for (const pattern of source) {
    const target = targetById.get(requiredString(pattern.id, "emergingPattern.id"));
    if (!target) continue;
    const targetProjection = targetPatternProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (target.organizationId !== organizationId) conflicts.push({ pattern, type: "cross_organization_ownership_mismatch", targetDigest, reason: `Emerging pattern ${pattern.id} belongs to another organization.` });
    else if (stableStringify(patternProjection(pattern, organizationId)) !== stableStringify(targetProjection)) conflicts.push({ pattern, type: "same_id_different_content", targetDigest, reason: `Emerging pattern ${pattern.id} has different historical content.` });
    else skips.push(pattern);
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "emergingPatterns", requiredString(conflict.pattern.id, "emergingPattern.id"), conflict.type, resourceDigest(exportPackage, "emergingPatterns"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const pattern of source) {
    if (skips.includes(pattern)) continue;
    await tx.emergingPattern.create({ data: patternData(pattern, organizationId) });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importLogs(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.intelligenceLog;
  const targets = await tx.intelligenceLog.findMany({ where: { id: { in: source.map((entry) => requiredString(entry.id, "intelligenceLog.id")) } } });
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const conflicts: Array<{ entry: IntelligenceLogEntry; type: "same_id_different_content" | "cross_organization_ownership_mismatch"; targetDigest?: string; reason: string }> = [];
  const skips: IntelligenceLogEntry[] = [];
  for (const entry of source) {
    const target = targetById.get(requiredString(entry.id, "intelligenceLog.id"));
    if (!target) continue;
    const targetProjection = targetLogProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (target.organizationId !== organizationId) conflicts.push({ entry, type: "cross_organization_ownership_mismatch", targetDigest, reason: `Intelligence log entry ${entry.id} belongs to another organization.` });
    else if (stableStringify(logProjection(entry, organizationId)) !== stableStringify(targetProjection)) conflicts.push({ entry, type: "same_id_different_content", targetDigest, reason: `Intelligence log entry ${entry.id} has different historical content.` });
    else skips.push(entry);
  }
  if (conflicts.length > 0) {
    let created = 0;
    for (const conflict of conflicts) {
      if (await createConflictTx(tx, batchId, organizationId, "intelligenceLog", requiredString(conflict.entry.id, "intelligenceLog.id"), conflict.type, resourceDigest(exportPackage, "intelligenceLog"), conflict.targetDigest, conflict.reason)) created += 1;
    }
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created || conflicts.length };
  }
  for (const entry of source) {
    if (skips.includes(entry)) continue;
    await tx.intelligenceLog.create({ data: logData(entry, organizationId) });
  }
  return { importedCount: source.length - skips.length, skippedIdenticalCount: skips.length, conflictCount: 0 };
}

async function importMetrics(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  const source = exportPackage.resources.orgMetrics;
  if (!source) return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: 0 };
  const target = await tx.orgMetrics.findUnique({ where: { organizationId } });
  if (target) {
    const targetProjection = targetMetricsProjection(target as unknown as JsonRecord);
    const targetDigest = await projectionDigest(targetProjection);
    if (stableStringify(metricsProjection(source, organizationId)) === stableStringify(targetProjection)) {
      return { importedCount: 0, skippedIdenticalCount: 1, conflictCount: 0 };
    }
    const created = await createConflictTx(tx, batchId, organizationId, "orgMetrics", organizationId, "same_id_different_content", resourceDigest(exportPackage, "orgMetrics"), targetDigest, "Organization metrics already exist with different historical content.");
    return { importedCount: 0, skippedIdenticalCount: 0, conflictCount: created ? 1 : 1 };
  }
  await tx.orgMetrics.create({ data: metricsData(source, organizationId) });
  return { importedCount: 1, skippedIdenticalCount: 0, conflictCount: 0 };
}

async function importResourceInTransaction(
  tx: TransactionClient,
  organizationId: string,
  batchId: string,
  resourceType: ImplementedResourceType,
  exportPackage: MigrationExportPackage
): Promise<ImportCounts> {
  switch (resourceType) {
    case "knowledge": return importKnowledge(tx, organizationId, batchId, exportPackage);
    case "knowledgeCandidates": return importCandidates(tx, organizationId, batchId, exportPackage);
    case "validationRecords": return importValidations(tx, organizationId, batchId, exportPackage);
    case "ticketRecords": return importTickets(tx, organizationId, batchId, exportPackage);
    case "emergingPatterns": return importPatterns(tx, organizationId, batchId, exportPackage);
    case "intelligenceLog": return importLogs(tx, organizationId, batchId, exportPackage);
    case "orgMetrics": return importMetrics(tx, organizationId, batchId, exportPackage);
  }
}

async function startResource(
  organizationId: string,
  batchId: string,
  resourceType: ImplementedResourceType
): Promise<boolean> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.organizationId !== organizationId) throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
    const checkpoint = await tx.migrationImportResource.findUnique({ where: { batchId_resourceType: { batchId, resourceType } } });
    if (!checkpoint) throw new MigrationImportServiceError("INVALID_RESOURCE", `Checkpoint ${resourceType} was not initialized.`);
    if (["imported", "verified", "conflict"].includes(checkpoint.status)) return false;
    await tx.migrationImportResource.update({ where: { id: checkpoint.id }, data: { status: "importing", attemptCount: { increment: 1 }, startedAt: checkpoint.startedAt ?? new Date() } });
    await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "importing", attemptCount: { increment: 1 }, startedAt: batch.startedAt ?? new Date() } });
    return true;
  });
}

async function markResourceFailed(organizationId: string, batchId: string, resourceType: ImplementedResourceType, error: unknown): Promise<void> {
  const prisma = getPrismaClient();
  const message = error instanceof MigrationImportServiceError ? error.message : "The historical resource transaction failed.";
  await prisma.$transaction(async (tx) => {
    const checkpoint = await tx.migrationImportResource.findUnique({ where: { batchId_resourceType: { batchId, resourceType } } });
    if (!checkpoint) return;
    await tx.migrationImportResource.update({ where: { id: checkpoint.id }, data: { status: "failed", errorSummary: message.slice(0, 500) } });
    await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "failed", errorSummary: message.slice(0, 500) } });
  });
}

async function runResource(
  organizationId: string,
  batchId: string,
  resourceType: ImplementedResourceType,
  exportPackage: MigrationExportPackage
): Promise<void> {
  if (!await startResource(organizationId, batchId, resourceType)) return;
  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const result = await importResourceInTransaction(tx, organizationId, batchId, resourceType, exportPackage);
      const checkpoint = await tx.migrationImportResource.findUnique({ where: { batchId_resourceType: { batchId, resourceType } } });
      if (!checkpoint) throw new MigrationImportServiceError("INVALID_RESOURCE", `Checkpoint ${resourceType} was not initialized.`);
      const status = result.conflictCount > 0 ? "conflict" : "imported";
      await tx.migrationImportResource.update({ where: { id: checkpoint.id }, data: { status, importedCount: result.importedCount, skippedIdenticalCount: result.skippedIdenticalCount, conflictCount: result.conflictCount, completedAt: new Date(), errorSummary: null } });
    });
  } catch (error) {
    await markResourceFailed(organizationId, batchId, resourceType, error);
    throw error;
  }
}

async function reconcileOrganizationProfile(
  organizationId: string,
  batchId: string,
  exportPackage: MigrationExportPackage
): Promise<boolean> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const target = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!target) throw new MigrationImportServiceError("ORGANIZATION_NOT_FOUND", `Organization ${organizationId} was not found.`);
    const sourceProjection = profileProjection(exportPackage.organizationProfile);
    const targetProjection = targetProfileProjection(target);
    if (stableStringify(sourceProjection) === stableStringify(targetProjection)) return false;
    const sourceDigest = await projectionDigest(sourceProjection);
    const targetDigest = await projectionDigest(targetProjection);
    const created = await createConflictTx(tx, batchId, organizationId, "knowledge", "__organization_profile__", "same_id_different_content", sourceDigest, targetDigest, "The existing organization profile conflicts with the historical export profile; no profile fields were overwritten.");
    const checkpoint = await tx.migrationImportResource.findUnique({ where: { batchId_resourceType: { batchId, resourceType: "knowledge" } } });
    if (checkpoint) await tx.migrationImportResource.update({ where: { id: checkpoint.id }, data: { status: "conflict", conflictCount: { increment: created ? 1 : 0 }, errorSummary: "Organization profile conflict blocked historical import." } });
    await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "conflict" } });
    return true;
  });
}

async function finalizeBatch(organizationId: string, batchId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.organizationId !== organizationId) throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
    const resources = await tx.migrationImportResource.findMany({ where: { batchId } });
    const hasConflict = resources.some((resource) => resource.status === "conflict");
    const hasFailure = resources.some((resource) => resource.status === "failed");
    await tx.migrationImportBatch.update({
      where: { id: batchId },
      data: { status: hasConflict ? "conflict" : hasFailure ? "failed" : "partial", errorSummary: hasFailure ? batch.errorSummary : null }
    });
  });
}

function dependencyBlocked(sourceCount: number, statuses: Map<MigrationImportResourceType, string>, dependencies: MigrationImportResourceType[]): boolean {
  return sourceCount > 0 && dependencies.some((dependency) => statuses.get(dependency) === "conflict");
}

function executionResultFromSummary(
  summary: Awaited<ReturnType<typeof getMigrationImportBatch>>,
  failedResource: MigrationImportResourceType | null,
  noOp = false
): MigrationImportExecutionResult {
  const hasConflict = summary.status === "conflict" || summary.resourceCheckpoints.some((checkpoint) => checkpoint.status === "conflict");
  const hasFailure = summary.status === "failed" || summary.resourceCheckpoints.some((checkpoint) => checkpoint.status === "failed");
  return {
    batchId: summary.id,
    organizationId: summary.organizationId,
    status: summary.status,
    importedCounts: Object.fromEntries(summary.resourceCheckpoints.map((checkpoint) => [checkpoint.resourceType, checkpoint.importedCount])),
    skippedIdenticalCounts: Object.fromEntries(summary.resourceCheckpoints.map((checkpoint) => [checkpoint.resourceType, checkpoint.skippedIdenticalCount])),
    conflictCounts: Object.fromEntries(summary.resourceCheckpoints.map((checkpoint) => [checkpoint.resourceType, checkpoint.conflictCount])),
    noOp,
    failedResource: failedResource ?? summary.resourceCheckpoints.find((checkpoint) => checkpoint.status === "failed")?.resourceType ?? null,
    resourceCheckpoints: summary.resourceCheckpoints,
    unresolvedConflictCount: summary.unresolvedConflictCount,
    nextAction: hasConflict ? "resolve_conflicts_or_retry" : hasFailure ? "retry_failed_resource" : "begin_batch_5_5_finalization"
  };
}

export async function executeMigrationImport(
  organizationId: string,
  batchId: string
): Promise<MigrationImportExecutionResult> {
  if (typeof organizationId !== "string" || organizationId.trim().length === 0) throw new MigrationImportServiceError("INVALID_MANIFEST", "organizationId must be a non-empty string.");
  if (typeof batchId !== "string" || batchId.trim().length === 0) throw new MigrationImportServiceError("INVALID_MANIFEST", "batchId must be a non-empty string.");
  const prisma = getPrismaClient();
  const batch = await prisma.migrationImportBatch.findUnique({ where: { id: batchId }, include: { resources: true } });
  if (!batch || batch.organizationId !== organizationId) throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
  if (!["ready", "partial", "conflict", "failed", "importing"].includes(batch.status)) {
    throw new MigrationImportServiceError("CONFLICT", `Migration batch status ${batch.status} cannot be executed.`);
  }
  if (!batch.packagePayload) throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", "The migration batch has no immutable package payload.");
  const exportPackage = await revalidateStoredMigrationExportPackage(batch.packagePayload, organizationId);
  if (exportPackage.digests.resourcePayloadDigest !== batch.resourcePayloadDigest) {
    throw new MigrationImportServiceError("EXPORT_DIGEST_MISMATCH", "The stored package no longer matches the migration batch identity.");
  }
  if (batch.metadataDigest !== exportPackage.digests.metadataDigest) {
    throw new MigrationImportServiceError("CONFLICT", "The stored package metadata no longer matches the migration batch manifest.");
  }
  const noOp = IMPLEMENTED_RESOURCE_TYPES.every((resourceType) => {
    const checkpoint = batch.resources.find((resource) => resource.resourceType === resourceType);
    return checkpoint?.status === "imported" || checkpoint?.status === "conflict";
  });
  const profileConflict = await reconcileOrganizationProfile(organizationId, batchId, exportPackage);
  if (profileConflict) {
    await finalizeBatch(organizationId, batchId);
    return executionResultFromSummary(await getMigrationImportBatch(organizationId, batchId), null, false);
  }
  await prisma.migrationImportBatch.update({ where: { id: batchId }, data: { status: "importing", attemptCount: { increment: 1 }, startedAt: batch.startedAt ?? new Date() } });

  const statuses = new Map<MigrationImportResourceType, string>(batch.resources.map((resource) => [resource.resourceType, resource.status]));
  const resources = exportPackage.resources;
  const sequence: Array<{ type: ImplementedResourceType; count: number; dependencies: MigrationImportResourceType[] }> = [
    { type: "knowledge", count: resources.knowledge.length, dependencies: [] },
    { type: "knowledgeCandidates", count: resources.knowledgeCandidates.length, dependencies: ["knowledge"] },
    { type: "validationRecords", count: resources.validationRecords.length, dependencies: ["knowledge", "knowledgeCandidates"] },
    { type: "ticketRecords", count: resources.ticketRecords.length, dependencies: ["validationRecords"] },
    { type: "emergingPatterns", count: resources.emergingPatterns.length, dependencies: [] },
    { type: "intelligenceLog", count: resources.intelligenceLog.length, dependencies: [] },
    { type: "orgMetrics", count: resources.orgMetrics ? 1 : 0, dependencies: [] }
  ];
  let failedResource: MigrationImportResourceType | null = null;
  for (const item of sequence) {
    if (dependencyBlocked(item.count, statuses, item.dependencies)) continue;
    try {
      await runResource(organizationId, batchId, item.type, exportPackage);
      const checkpoint = await prisma.migrationImportResource.findUnique({ where: { batchId_resourceType: { batchId, resourceType: item.type } } });
      if (checkpoint) statuses.set(item.type, checkpoint.status);
    } catch (error) {
      failedResource = item.type;
      break;
    }
  }
  await finalizeBatch(organizationId, batchId);
  return executionResultFromSummary(await getMigrationImportBatch(organizationId, batchId), failedResource, noOp);
}

export { IMPLEMENTED_RESOURCE_TYPES, MIGRATION_IMPORT_RESOURCE_TYPES };
