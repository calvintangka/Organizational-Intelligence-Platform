import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { parseTicketId } from "@/lib/ticketIdFormat";
import { sha256, stableStringify } from "@/lib/persistence/migrationExportDigest";
import {
  getMigrationImportBatch,
  MigrationImportServiceError,
  revalidateStoredMigrationExportPackage
} from "@/lib/server/migrationImportService";
import { getPrismaClient } from "@/lib/server/prisma";
import {
  MIGRATION_IMPORT_RESOURCE_TYPES,
  type MigrationImportBatchSummary,
  type MigrationImportResourceType,
  type MigrationImportVerificationReport,
  type MigrationImportVerificationResourceResult
} from "@/types/migrationImport";
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
import type { MigrationExportPackage } from "@/types/migrationExport";

type TransactionClient = Prisma.TransactionClient;
type JsonRecord = Record<string, unknown>;

export interface MigrationVerificationResult {
  batchId: string;
  organizationId: string;
  status: "passed" | "failed";
  noOp: boolean;
  report: MigrationImportVerificationReport;
  summary: MigrationImportBatchSummary;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
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

function sourceProfileProjection(profile: OrganizationProfile): JsonRecord {
  return {
    id: profile.id,
    name: profile.name,
    industry: typeof profile.industry === "string" ? profile.industry : "",
    description: typeof profile.description === "string" ? profile.description : "",
    settings: profileSettings(profile)
  };
}

function targetProfileProjection(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    settings: asRecord(row.settings)
  };
}

function knowledgeContent(item: KnowledgeItem): JsonRecord {
  return {
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
  };
}

function sourceKnowledge(item: KnowledgeItem, organizationId: string): JsonRecord {
  return {
    id: item.id,
    organizationId,
    revision: item.revision,
    title: item.title,
    category: item.category ?? "",
    canonicalProblemId: nullable(item.canonicalProblemId),
    canonicalProblemTitle: nullable(item.canonicalProblemTitle),
    lifecycleState: item.lifecycleState ?? "active",
    sourceTicketId: item.sourceTicketId ?? "",
    timesReused: item.timesReused ?? 0,
    timesSeen: nullable(item.timesSeen),
    successfulResolutions: nullable(item.successfulResolutions),
    failedResolutions: nullable(item.failedResolutions),
    successRate: nullable(item.successRate),
    trustScore: nullable(item.trustScore),
    autoResponseEligible: nullable(item.autoResponseEligible),
    humanReviewCount: nullable(item.humanReviewCount),
    automaticResolutionCount: nullable(item.automaticResolutionCount),
    createdAt: iso(item.createdAt),
    approvedAt: iso(item.approvedAt ?? item.createdAt),
    lastUsedAt: item.lastUsedAt ? iso(item.lastUsedAt) : null,
    lastValidatedAt: item.lastValidatedAt ? iso(item.lastValidatedAt) : null,
    lastUpdatedAt: item.lastUpdated ? iso(item.lastUpdated) : null,
    lastValidated: item.lastValidated ? iso(item.lastValidated) : null,
    content: knowledgeContent(item)
  };
}

function targetKnowledge(row: JsonRecord, source: KnowledgeItem, organizationId: string): JsonRecord {
  const content = asRecord(row.content);
  return {
    id: row.id,
    organizationId: row.organizationId,
    revision: source.revision === undefined ? undefined : row.revision,
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
    createdAt: iso(row.createdAt),
    approvedAt: iso(row.approvedAt),
    lastUsedAt: row.lastUsedAt ? iso(row.lastUsedAt) : null,
    lastValidatedAt: row.lastValidatedAt ? iso(row.lastValidatedAt) : null,
    lastUpdatedAt: row.lastUpdatedAt ? iso(row.lastUpdatedAt) : null,
    lastValidated: row.lastValidated ? iso(row.lastValidated) : null,
    content
  };
}

function sourceCandidate(candidate: KnowledgeCandidate, organizationId: string): JsonRecord {
  return {
    id: candidate.id,
    organizationId,
    relatedKnowledgeId: nullable(candidate.relatedKnowledgeId),
    sourceTicketIds: candidate.sourceTicketIds ?? [],
    proposedAction: candidate.proposedAction,
    proposedContent: candidate.proposedContent ?? {},
    rationale: candidate.rationale ?? "",
    status: candidate.status,
    createdAt: iso(candidate.createdAt)
  };
}

function targetCandidate(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    relatedKnowledgeId: row.relatedKnowledgeId,
    sourceTicketIds: row.sourceTicketIds,
    proposedAction: row.proposedAction,
    proposedContent: row.proposedContent,
    rationale: row.rationale,
    status: row.status,
    createdAt: iso(row.createdAt)
  };
}

function sourceValidation(validation: ValidationRecord, organizationId: string): JsonRecord {
  return {
    id: validation.id,
    organizationId,
    candidateId: validation.candidateId,
    knowledgeItemId: nullable(validation.knowledgeId),
    knowledgeVersionId: nullable(validation.knowledgeVersionId),
    decision: validation.decision,
    actor: validation.actor,
    actorId: null,
    roleExercised: validation.roleExercised,
    rationale: nullable(validation.rationale),
    timestamp: iso(validation.timestamp)
  };
}

function targetValidation(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    candidateId: row.candidateId,
    knowledgeItemId: row.knowledgeItemId,
    knowledgeVersionId: row.knowledgeVersionId,
    decision: row.decision,
    actor: row.actor,
    actorId: row.actorId,
    roleExercised: row.roleExercised,
    rationale: row.rationale,
    timestamp: iso(row.timestamp)
  };
}

function sourceMemory(record: MemoryChangeRecord, organizationId: string): JsonRecord {
  return {
    id: record.id,
    organizationId,
    knowledgeItemId: record.knowledgeId,
    candidateId: record.candidateId,
    validationRecordId: record.validationRecordId,
    actorId: null,
    changeType: record.changeType,
    beforeState: record.beforeState,
    afterState: record.afterState,
    timestamp: iso(record.timestamp)
  };
}

function targetMemory(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    knowledgeItemId: row.knowledgeItemId,
    candidateId: row.candidateId,
    validationRecordId: row.validationRecordId,
    actorId: row.actorId,
    changeType: row.changeType,
    beforeState: row.beforeState ?? null,
    afterState: row.afterState,
    timestamp: iso(row.timestamp)
  };
}

function sourceTicket(ticket: TicketRecord, organizationId: string): JsonRecord {
  return {
    orgId: organizationId,
    ticketId: ticket.ticketId,
    rawMessage: ticket.rawMessage ?? "",
    subject: ticket.subject ?? null,
    status: ticket.status,
    draftSource: ticket.draftSource ?? null,
    classification: ticket.classification ?? null,
    memoryMatch: ticket.memoryMatch ?? null,
    resolution: ticket.resolution ?? {},
    reflection: ticket.reflection ?? {},
    validationRecordIds: ticket.validationRecordIds ?? [],
    actorId: null,
    createdAt: iso(ticket.createdAt)
  };
}

function targetTicket(row: JsonRecord): JsonRecord {
  return {
    orgId: row.organizationId,
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
    createdAt: iso(row.createdAt)
  };
}

function sourcePattern(pattern: EmergingPattern, organizationId: string): JsonRecord {
  return {
    id: pattern.id,
    organizationId,
    title: pattern.title,
    summary: pattern.summary ?? "",
    category: pattern.category ?? "",
    status: pattern.status,
    tags: pattern.tags ?? [],
    keywords: pattern.keywords ?? [],
    exampleTickets: pattern.exampleTickets ?? [],
    timesSeen: pattern.timesSeen,
    confidenceScore: pattern.confidenceScore,
    suggestedCanonicalProblem: pattern.suggestedCanonicalProblem === true,
    firstSeenAt: iso(pattern.firstSeenAt),
    lastSeenAt: iso(pattern.lastSeenAt)
  };
}

function targetPattern(row: JsonRecord): JsonRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    summary: row.summary,
    category: row.category,
    status: row.status,
    tags: row.tags,
    keywords: row.keywords,
    exampleTickets: row.exampleTickets,
    timesSeen: row.timesSeen,
    confidenceScore: row.confidenceScore,
    suggestedCanonicalProblem: row.suggestedCanonicalProblem,
    firstSeenAt: iso(row.firstSeenAt),
    lastSeenAt: iso(row.lastSeenAt)
  };
}

function sourceLog(entry: IntelligenceLogEntry, organizationId: string): JsonRecord {
  return { id: entry.id, organizationId, timestamp: iso(entry.timestamp), event: entry.event, detail: nullable(entry.detail) };
}

function targetLog(row: JsonRecord): JsonRecord {
  return { id: row.id, organizationId: row.organizationId, timestamp: iso(row.timestamp), event: row.event, detail: row.detail };
}

function sourceMetrics(metrics: OrgMetrics, organizationId: string): JsonRecord {
  return {
    organizationId,
    lifetimeTickets: metrics.lifetimeTickets,
    knowledgeReused: metrics.knowledgeReused,
    autoResolutions: metrics.autoResolutions,
    humanResolutions: metrics.humanResolutions,
    totalResolutionTimeSec: metrics.totalResolutionTimeSec,
    resolutionsCount: metrics.resolutionsCount,
    memoryGrowthToday: metrics.memoryGrowthToday,
    memoryGrowthDate: metrics.memoryGrowthDate,
    mergedTickets: nullable(metrics.mergedTickets),
    duplicatePreventions: nullable(metrics.duplicatePreventions),
    knowledgeVersions: nullable(metrics.knowledgeVersions),
    emergingPatternsDetected: nullable(metrics.emergingPatternsDetected),
    promotedPatterns: nullable(metrics.promotedPatterns),
    aiCalls: nullable(metrics.aiCalls),
    aiSuccesses: nullable(metrics.aiSuccesses),
    aiFailures: nullable(metrics.aiFailures),
    aiFallbacks: nullable(metrics.aiFallbacks),
    aiAgreementSamples: nullable(metrics.aiAgreementSamples),
    aiAgreementTotal: nullable(metrics.aiAgreementTotal),
    humanAcceptedAISuggestions: nullable(metrics.humanAcceptedAISuggestions),
    lastUpdatedAt: iso(metrics.lastUpdatedAt)
  };
}

function targetMetrics(row: JsonRecord): JsonRecord {
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
    mergedTickets: row.mergedTickets,
    duplicatePreventions: row.duplicatePreventions,
    knowledgeVersions: row.knowledgeVersions,
    emergingPatternsDetected: row.emergingPatternsDetected,
    promotedPatterns: row.promotedPatterns,
    aiCalls: row.aiCalls,
    aiSuccesses: row.aiSuccesses,
    aiFailures: row.aiFailures,
    aiFallbacks: row.aiFallbacks,
    aiAgreementSamples: row.aiAgreementSamples,
    aiAgreementTotal: row.aiAgreementTotal,
    humanAcceptedAISuggestions: row.humanAcceptedAISuggestions,
    lastUpdatedAt: iso(row.lastUpdatedAt)
  };
}

async function digest(value: unknown): Promise<string> {
  return sha256(stableStringify(value));
}

function resourceIds(resourceType: MigrationImportResourceType, source: unknown[]): string[] {
  return source.map((value) => {
    const row = asRecord(value);
    return String(resourceType === "ticketRecords" ? row.ticketId : row.id);
  });
}

async function collectionResult(
  checkpoint: { expectedCount: number; sourceDigest: string },
  resourceType: MigrationImportResourceType,
  source: unknown[],
  targets: JsonRecord[],
  organizationId: string,
  sourceNormalize: (value: unknown, organizationId: string) => JsonRecord,
  targetNormalize: (value: JsonRecord, source: unknown) => JsonRecord
): Promise<MigrationImportVerificationResourceResult> {
  const ids = resourceIds(resourceType, source);
  const sourceById = new Map(source.map((value, index) => [ids[index], value]));
  const targetById = new Map(targets.map((row) => [String(resourceType === "ticketRecords" ? row.ticketId : row.id), row]));
  const missing = ids.filter((id) => !targetById.has(id));
  const conflicting = ids.filter((id) => {
    const target = targetById.get(id);
    return target && stableStringify(sourceNormalize(sourceById.get(id), organizationId)) !== stableStringify(targetNormalize(target, sourceById.get(id)));
  });
  const sourceCanonical = source
    .map((value) => sourceNormalize(value, organizationId))
    .sort((left, right) => String(left.id ?? left.ticketId).localeCompare(String(right.id ?? right.ticketId)));
  const targetCanonical = ids
    .filter((id) => targetById.has(id))
    .map((id) => targetNormalize(targetById.get(id)!, sourceById.get(id)))
    .sort((left, right) => String(left.id ?? left.ticketId).localeCompare(String(right.id ?? right.ticketId)));
  const normalizedSourceDigest = await digest(sourceCanonical);
  const targetDigest = await digest(targetCanonical);
  const extras = targets.filter((row) => !ids.includes(String(resourceType === "ticketRecords" ? row.ticketId : row.id))).length;
  const notes: string[] = [];
  if (extras > 0) notes.push(`${extras} pre-existing target row(s) are outside the migrated source ID set and are allowed.`);
  if (missing.length > 0) notes.push(`Missing source IDs: ${missing.join(", ")}.`);
  if (conflicting.length > 0) notes.push(`Mismatched source IDs: ${conflicting.join(", ")}.`);
  return {
    resourceType,
    expectedCount: checkpoint.expectedCount,
    foundCount: targetCanonical.length,
    missingCount: missing.length,
    conflictingCount: conflicting.length,
    extraCount: extras,
    sourceDigest: checkpoint.sourceDigest,
    normalizedSourceDigest,
    targetDigest,
    digestMatch: missing.length === 0 && conflicting.length === 0 && normalizedSourceDigest === targetDigest,
    sourceCoverageMatch: missing.length === 0 && conflicting.length === 0,
    notes
  };
}

function emptyDigestValue(): JsonRecord[] {
  return [];
}

async function buildVerificationReport(
  tx: TransactionClient,
  batchId: string,
  organizationId: string,
  exportPackage: MigrationExportPackage,
  checkpoints: Array<{ resourceType: MigrationImportResourceType; expectedCount: number; sourceDigest: string }>
): Promise<MigrationImportVerificationReport> {
  const [organization, knowledge, candidates, validations, memory, tickets, patterns, logs, metrics, sequence, conflicts] = await Promise.all([
    tx.organization.findUnique({ where: { id: organizationId } }),
    tx.knowledgeItem.findMany({ where: { organizationId } }),
    tx.knowledgeCandidate.findMany({ where: { organizationId } }),
    tx.validationRecord.findMany({ where: { organizationId } }),
    tx.memoryChangeRecord.findMany({ where: { organizationId } }),
    tx.ticketRecord.findMany({ where: { organizationId } }),
    tx.emergingPattern.findMany({ where: { organizationId } }),
    tx.intelligenceLog.findMany({ where: { organizationId } }),
    tx.orgMetrics.findUnique({ where: { organizationId } }),
    tx.ticketSequence.findUnique({ where: { organizationId } }),
    tx.migrationImportConflict.findMany({ where: { batchId }, orderBy: { detectedAt: "asc" } })
  ]);
  const checkpoint = (resourceType: MigrationImportResourceType) => checkpoints.find((row) => row.resourceType === resourceType)!;
  const source = exportPackage.resources;
  const results: MigrationImportVerificationResourceResult[] = [];
  results.push(await collectionResult(checkpoint("knowledge"), "knowledge", source.knowledge, knowledge as unknown as JsonRecord[], organizationId, (value, id) => sourceKnowledge(value as KnowledgeItem, id), (row, item) => targetKnowledge(row, item as KnowledgeItem, organizationId)));
  results.push(await collectionResult(checkpoint("knowledgeCandidates"), "knowledgeCandidates", source.knowledgeCandidates, candidates as unknown as JsonRecord[], organizationId, (value, id) => sourceCandidate(value as KnowledgeCandidate, id), (row) => targetCandidate(row)));
  results.push(await collectionResult(checkpoint("validationRecords"), "validationRecords", source.validationRecords, validations as unknown as JsonRecord[], organizationId, (value, id) => sourceValidation(value as ValidationRecord, id), (row) => targetValidation(row)));
  results.push(await collectionResult(checkpoint("memoryChangeRecords"), "memoryChangeRecords", source.memoryChangeRecords, memory as unknown as JsonRecord[], organizationId, (value, id) => sourceMemory(value as MemoryChangeRecord, id), (row) => targetMemory(row)));
  results.push(await collectionResult(checkpoint("ticketRecords"), "ticketRecords", source.ticketRecords, tickets as unknown as JsonRecord[], organizationId, (value, id) => sourceTicket(value as TicketRecord, id), (row) => targetTicket(row)));
  results.push(await collectionResult(checkpoint("emergingPatterns"), "emergingPatterns", source.emergingPatterns, patterns as unknown as JsonRecord[], organizationId, (value, id) => sourcePattern(value as EmergingPattern, id), (row) => targetPattern(row)));
  results.push(await collectionResult(checkpoint("intelligenceLog"), "intelligenceLog", source.intelligenceLog, logs as unknown as JsonRecord[], organizationId, (value, id) => sourceLog(value as IntelligenceLogEntry, id), (row) => targetLog(row)));
  const metricsSource = source.orgMetrics ? [source.orgMetrics] : [];
  results.push(await collectionResult(checkpoint("orgMetrics"), "orgMetrics", metricsSource, metrics ? [metrics as unknown as JsonRecord] : [], organizationId, (value, id) => sourceMetrics(value as OrgMetrics, id), (row) => targetMetrics(row)));

  const sequenceCheckpoint = checkpoint("ticketSequence");
  const parsedTickets = source.ticketRecords.map((ticket) => parseTicketId(ticket.ticketId)).filter((value) => value !== null);
  const exportedCounter = source.ticketSequence?.counter ?? 0;
  const highestParsed = parsedTickets.reduce((highest, parsed) => Math.max(highest, parsed!.sequenceNumber), 0);
  const sequenceMinimum = Math.max(exportedCounter, highestParsed);
  const actualCounter = sequence?.counter ?? null;
  const sequenceTarget = actualCounter === null ? [] : [{ organizationId, counter: actualCounter }];
  const sequenceTargetDigest = await digest(sequenceTarget);
  results.push({
    resourceType: "ticketSequence",
    expectedCount: sequenceCheckpoint.expectedCount,
    foundCount: actualCounter === null ? 0 : 1,
    missingCount: actualCounter === null ? 1 : 0,
    conflictingCount: 0,
    extraCount: 0,
    sourceDigest: sequenceCheckpoint.sourceDigest,
    normalizedSourceDigest: await digest([{ organizationId, counter: sequenceMinimum }]),
    targetDigest: sequenceTargetDigest,
    digestMatch: actualCounter !== null && actualCounter >= sequenceMinimum,
    sourceCoverageMatch: actualCounter !== null && actualCounter >= sequenceMinimum,
    notes: actualCounter !== null && actualCounter > sequenceMinimum
      ? [`Server counter ${actualCounter} is safely above the required minimum ${sequenceMinimum}.`]
      : actualCounter === null ? ["TicketSequence row is missing."] : []
  });

  const sourceKnowledgeById = new Map(source.knowledge.map((item) => [item.id, item]));
  const targetKnowledgeById = new Map(knowledge.map((row) => [row.id, row as unknown as JsonRecord]));
  const expectedLessons = source.knowledge.reduce((count, item) => count + (item.lessons?.length ?? 0), 0);
  const expectedVersions = source.knowledge.reduce((count, item) => count + (item.knowledgeVersions?.length ?? 0), 0);
  const foundLessons = sourceKnowledgeById.size === 0 ? 0 : source.knowledge.reduce((count, item) => count + arrayValue(asRecord(targetKnowledgeById.get(item.id)?.content).lessons).length, 0);
  const foundVersions = sourceKnowledgeById.size === 0 ? 0 : source.knowledge.reduce((count, item) => count + arrayValue(asRecord(targetKnowledgeById.get(item.id)?.content).knowledgeVersions).length, 0);
  const auditRelationshipStatus: "pass" | "fail" = source.validationRecords.every((validation) => {
    const target = validations.find((row) => row.id === validation.id);
    return !!target && target.candidateId === validation.candidateId && (target.knowledgeItemId ?? null) === (validation.knowledgeId ?? null);
  }) && source.memoryChangeRecords.every((record) => {
    const target = memory.find((row) => row.id === record.id);
    return !!target && target.validationRecordId === record.validationRecordId && target.candidateId === record.candidateId && target.knowledgeItemId === record.knowledgeId;
  }) ? "pass" : "fail";
  const organizationProfileMatch = !!organization && stableStringify(sourceProfileProjection(exportPackage.organizationProfile)) === stableStringify(targetProfileProjection(organization as unknown as JsonRecord));
  const safeConflicts = conflicts.map((conflict) => ({
    id: conflict.id,
    resourceType: conflict.resourceType as MigrationImportResourceType,
    sourceRecordId: conflict.sourceRecordId,
    conflictType: conflict.conflictType,
    reason: conflict.reason,
    status: conflict.status
  }));
  const unresolved = safeConflicts.filter((conflict) => conflict.status === "open");
  const reportBase = {
    batchId,
    organizationId,
    verifiedAt: new Date().toISOString(),
    organizationProfileMatch,
    resourceResults: results,
    unresolvedConflictCount: unresolved.length,
    conflicts: safeConflicts,
    ticketSequenceExpectedMinimum: sequenceMinimum,
    ticketSequenceActual: actualCounter,
    ticketSequenceSafe: actualCounter !== null && actualCounter >= sequenceMinimum,
    lessonCount: { expected: expectedLessons, found: foundLessons, match: expectedLessons === foundLessons },
    versionCount: { expected: expectedVersions, found: foundVersions, match: expectedVersions === foundVersions },
    auditRelationshipStatus,
    extraTargetRowsAllowed: true as const,
    notes: ["Verification compares normalized domain projections over migrated source IDs; unrelated pre-existing target rows are reported as extras and do not fail verification."]
  };
  const passed = organizationProfileMatch
    && unresolved.length === 0
    && results.every((result) => result.digestMatch && result.sourceCoverageMatch)
    && reportBase.lessonCount.match
    && reportBase.versionCount.match
    && auditRelationshipStatus === "pass";
  return { ...reportBase, overallStatus: passed ? "passed" : "failed" };
}

function reportJson(report: MigrationImportVerificationReport): Prisma.InputJsonValue {
  return report as unknown as Prisma.InputJsonValue;
}

export async function verifyMigrationImport(
  organizationId: string,
  batchId: string
): Promise<MigrationVerificationResult> {
  const prisma = getPrismaClient();
  const existing = await prisma.migrationImportBatch.findUnique({ where: { id: batchId } });
  if (!existing || existing.organizationId !== organizationId) {
    throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
  }
  if (!existing.packagePayload) {
    throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", "The migration batch has no immutable package payload.");
  }
  const exportPackage = await revalidateStoredMigrationExportPackage(existing.packagePayload, organizationId);
  if (exportPackage.digests.resourcePayloadDigest !== existing.resourcePayloadDigest || existing.metadataDigest !== exportPackage.digests.metadataDigest) {
    throw new MigrationImportServiceError("EXPORT_DIGEST_MISMATCH", "The stored package no longer matches the migration batch identity.");
  }
  if (existing.status === "verified" && existing.verificationReport) {
    const report = existing.verificationReport as unknown as MigrationImportVerificationReport;
    return { batchId, organizationId, status: report.overallStatus, noOp: true, report, summary: await getMigrationImportBatch(organizationId, batchId) };
  }
  if (!["imported", "conflict"].includes(existing.status)) {
    throw new MigrationImportServiceError("CONFLICT", `Migration batch status ${existing.status} cannot be verified.`);
  }
  const report = await prisma.$transaction(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId }, include: { resources: true } });
    if (!batch || batch.organizationId !== organizationId) throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
    if (batch.status === "imported") {
      await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "verifying" } });
    }
    const result = await buildVerificationReport(tx, batchId, organizationId, exportPackage, batch.resources.map((resource) => ({ resourceType: resource.resourceType as MigrationImportResourceType, expectedCount: resource.expectedCount, sourceDigest: resource.sourceDigest })));
    for (const resource of result.resourceResults) {
      await tx.migrationImportResource.update({ where: { batchId_resourceType: { batchId, resourceType: resource.resourceType } }, data: { targetDigest: resource.targetDigest } });
    }
    if (result.overallStatus === "passed") {
      await tx.migrationImportResource.updateMany({ where: { batchId }, data: { status: "verified", completedAt: new Date() } });
      await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "verified", verificationReport: reportJson(result), verificationError: null, verificationCompletedAt: new Date() } });
    } else {
      await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: batch.status === "conflict" ? "conflict" : "imported", verificationReport: reportJson(result), verificationError: "Post-import verification failed; see verificationReport." } });
    }
    return result;
  });
  const summary = await getMigrationImportBatch(organizationId, batchId);
  return { batchId, organizationId, status: report.overallStatus, noOp: false, report, summary };
}

export async function getMigrationVerification(
  organizationId: string,
  batchId: string
): Promise<MigrationVerificationResult | null> {
  const summary = await getMigrationImportBatch(organizationId, batchId);
  if (!summary.verificationReport) return null;
  return {
    batchId,
    organizationId,
    status: summary.verificationReport.overallStatus,
    noOp: true,
    report: summary.verificationReport,
    summary
  };
}

export { MIGRATION_IMPORT_RESOURCE_TYPES };
