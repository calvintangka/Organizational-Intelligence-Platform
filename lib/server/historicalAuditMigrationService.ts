import "server-only";

import { createHash } from "node:crypto";

import type { HistoricalAuditCompleteness } from "@/types";
import { createOpaqueProvenanceId } from "@/lib/canonicalProblemEngine";
import { stableStringify } from "@/lib/persistence/migrationExportDigest";
import { getPrismaClient } from "@/lib/server/prisma";

export const HISTORICAL_AUDIT_SCHEMA_VERSION = 1;
export const HISTORICAL_AUDIT_METADATA_KEY = "_todo065HistoricalAudit";

export type HistoricalAuditClassification =
  | "SAFE_TO_MIGRATE"
  | "SAFE_TO_REDACT"
  | "INCOMPLETE_BUT_PRESERVABLE"
  | "CONFLICTED"
  | "DO_NOT_TOUCH";

export type HistoricalAuditFindingKind =
  | "lesson_evidence"
  | "supporting_example"
  | "provenance"
  | "validation_link"
  | "memory_change_link"
  | "trust_evidence_link"
  | "version_lineage"
  | "promotion_metadata"
  | "privacy_review";

export interface HistoricalAuditFinding {
  id: string;
  kind: HistoricalAuditFindingKind;
  classification: HistoricalAuditClassification;
  resourceType: "knowledge" | "lesson" | "supporting_example" | "candidate" | "validation" | "memory_change" | "trust_evidence" | "version";
  resourceId: string;
  field: string;
  detail: string;
  exactReference: boolean;
  willChange: boolean;
}

export interface HistoricalAuditInventory {
  organizationId: string;
  generatedAt: string;
  recordsInspected: {
    knowledgeItems: number;
    lessons: number;
    supportingExamples: number;
    candidates: number;
    validations: number;
    memoryChanges: number;
    trustEvidence: number;
    versions: number;
  };
  eligibleRecords: number;
  classificationCounts: Record<HistoricalAuditClassification, number>;
  issueCounts: Record<string, number>;
  findings: HistoricalAuditFinding[];
  auditStates: Record<HistoricalAuditCompleteness, number>;
  expectedRowCountChanges: Record<string, number>;
  expectedUpdatedRows: Record<string, number>;
  beforeDigest: string;
  protectedOrganizations: string[];
  protectedBaselineDigest: string;
}

export interface HistoricalAuditMigrationResult {
  mode: "dry-run" | "confirm";
  organizationId: string;
  writesPerformed: boolean;
  rowsChanged: number;
  inventory: HistoricalAuditInventory;
  afterDigest: string;
  idempotentNoOp: boolean;
}

type JsonRecord = Record<string, any>;
type PrismaLike = ReturnType<typeof getPrismaClient>;
type TxClient = Parameters<Parameters<PrismaLike["$transaction"]>[0]>[0];

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function opaque(value: string): boolean {
  return /^evidence-[0-9a-f]{8}$/i.test(value);
}

function sha(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function shortDigest(value: unknown): string {
  return sha(value).slice(0, 16);
}

function emptyClassificationCounts(): Record<HistoricalAuditClassification, number> {
  return {
    SAFE_TO_MIGRATE: 0,
    SAFE_TO_REDACT: 0,
    INCOMPLETE_BUT_PRESERVABLE: 0,
    CONFLICTED: 0,
    DO_NOT_TOUCH: 0
  };
}

function emptyAuditStates(): Record<HistoricalAuditCompleteness, number> {
  return {
    complete: 0,
    migrated_complete: 0,
    historical_incomplete: 0,
    conflicted: 0,
    legacy_unverified: 0
  };
}

function privacyPattern(value: string): string | null {
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) return "email-like content";
  if (/(?:\+?\d[\d ()-]{7,}\d)/.test(value)) return "phone-like content";
  if (/\b(?:password|secret|api[_ -]?key|token)\s*[:=]/i.test(value)) return "secret-like content";
  if (/\b(?:hello|hi|dear)\s+[A-Z][a-z]+\b/.test(value)) return "named copied message";
  return null;
}

function findingId(kind: string, resourceType: string, resourceId: string, field: string): string {
  return `todo065-${shortDigest({ kind, resourceType, resourceId, field })}`;
}

function addFinding(
  findings: HistoricalAuditFinding[],
  classificationCounts: Record<HistoricalAuditClassification, number>,
  issueCounts: Record<string, number>,
  input: Omit<HistoricalAuditFinding, "id">
): void {
  const finding = { ...input, id: findingId(input.kind, input.resourceType, input.resourceId, input.field) };
  findings.push(finding);
  classificationCounts[finding.classification] += 1;
  issueCounts[`${finding.kind}:${finding.classification}`] = (issueCounts[`${finding.kind}:${finding.classification}`] ?? 0) + 1;
}

function getLessonIds(content: JsonRecord): JsonRecord[] {
  return Array.isArray(content.lessons) ? content.lessons.filter((entry): entry is JsonRecord => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function getVersions(content: JsonRecord): JsonRecord[] {
  return Array.isArray(content.knowledgeVersions) ? content.knowledgeVersions.filter((entry): entry is JsonRecord => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function isAuditMetadata(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as JsonRecord).schemaVersion === HISTORICAL_AUDIT_SCHEMA_VERSION;
}

function withoutAuditMetadata(content: JsonRecord): JsonRecord {
  const clone = { ...content };
  delete clone[HISTORICAL_AUDIT_METADATA_KEY];
  return clone;
}

function makeOpaqueLinks(values: string[], ticketIds: Set<string>, usedOpaqueToRaw: Map<string, string>, onConflict: (raw: string, opaqueId: string) => void) {
  const protectedOrigins: string[] = [];
  const redacted: string[] = [];
  let unresolved = false;
  for (const value of values) {
    if (opaque(value)) {
      redacted.push(value);
      continue;
    }
    if (!ticketIds.has(value)) {
      unresolved = true;
      protectedOrigins.push(value);
      redacted.push(value);
      continue;
    }
    const opaqueId = createOpaqueProvenanceId(value);
    const prior = usedOpaqueToRaw.get(opaqueId);
    if (prior && prior !== value) onConflict(value, opaqueId);
    usedOpaqueToRaw.set(opaqueId, value);
    protectedOrigins.push(value);
    redacted.push(opaqueId);
  }
  return { protectedOrigins: [...new Set(protectedOrigins)].sort(), redacted, unresolved };
}

function completenessFor(findings: HistoricalAuditFinding[], alreadyMigrated: boolean): HistoricalAuditCompleteness {
  if (findings.some((finding) => finding.classification === "CONFLICTED")) return "conflicted";
  if (findings.some((finding) => finding.classification === "INCOMPLETE_BUT_PRESERVABLE")) return "historical_incomplete";
  if (findings.some((finding) => finding.classification === "DO_NOT_TOUCH")) return "legacy_unverified";
  return alreadyMigrated || findings.some((finding) => finding.willChange) ? "migrated_complete" : "complete";
}

function digestableKnowledge(rows: Array<{ id: string; content: unknown; revision: number }>): unknown {
  return rows.map((row) => ({ id: row.id, revision: row.revision, content: row.content }));
}

async function loadOrganizationData(prisma: PrismaLike, organizationId: string) {
  const [organization, knowledge, tickets, candidates, validations, memoryChanges, trustEvidence] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
    prisma.knowledgeItem.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, content: true, revision: true } }),
    prisma.ticketRecord.findMany({ where: { organizationId }, select: { ticketId: true } }),
    prisma.knowledgeCandidate.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, relatedKnowledgeId: true, sourceTicketIds: true, rationale: true, status: true } }),
    prisma.validationRecord.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, candidateId: true, knowledgeItemId: true, knowledgeVersionId: true, actor: true, actorId: true, roleExercised: true, rationale: true, decision: true, timestamp: true } }),
    prisma.memoryChangeRecord.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, knowledgeItemId: true, candidateId: true, validationRecordId: true, actorId: true, changeType: true, timestamp: true } }),
    prisma.trustEvidence.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, knowledgeItemId: true, sourceTicketId: true, validationRecordId: true, trustEventType: true } })
  ]);
  if (!organization) throw new Error(`Organization not found: ${organizationId}`);
  return { knowledge, tickets, candidates, validations, memoryChanges, trustEvidence };
}

export async function inventoryHistoricalAudit(organizationId: string): Promise<HistoricalAuditInventory> {
  if (!organizationId.trim()) throw new Error("organizationId is required");
  const prisma = getPrismaClient();
  const data = await loadOrganizationData(prisma, organizationId);
  const ticketIds = new Set(data.tickets.map((ticket) => ticket.ticketId));
  const candidateById = new Map(data.candidates.map((candidate) => [candidate.id, candidate]));
  const validationById = new Map(data.validations.map((validation) => [validation.id, validation]));
  const memoryByValidation = new Map<string, typeof data.memoryChanges>();
  for (const row of data.memoryChanges) memoryByValidation.set(row.validationRecordId, [...(memoryByValidation.get(row.validationRecordId) ?? []), row]);
  const evidenceByKnowledge = new Map<string, typeof data.trustEvidence>();
  for (const row of data.trustEvidence) evidenceByKnowledge.set(row.knowledgeItemId, [...(evidenceByKnowledge.get(row.knowledgeItemId) ?? []), row]);
  const usedOpaqueToRaw = new Map<string, string>();
  const findings: HistoricalAuditFinding[] = [];
  const classificationCounts = emptyClassificationCounts();
  const issueCounts: Record<string, number> = {};
  const auditStates = emptyAuditStates();
  const plannedRows: Array<{ id: string; content: JsonRecord; revision: number; nextContent: JsonRecord; state: HistoricalAuditCompleteness; findingDigest: string; alreadyMigrated: boolean }> = [];
  let lessons = 0;
  let supportingExamples = 0;
  let versions = 0;
  let eligibleRecords = 0;

  for (const row of data.knowledge) {
    const content = record(row.content);
    const itemFindings: HistoricalAuditFinding[] = [];
    const protectedOrigins: Array<{ resourceType: string; resourceId: string; field: string; ticketIds: string[] }> = [];
    let nextContent: JsonRecord = JSON.parse(JSON.stringify(content));
    let changed = false;

    const nextLessons = getLessonIds(content).map((lesson) => {
      lessons += 1;
      const sourceValues = [...new Set([lesson.sourceTicketId, ...strings(lesson.sourceTicketIds)])];
      const result = makeOpaqueLinks(sourceValues, ticketIds, usedOpaqueToRaw, (raw, opaqueId) => {
        addFinding(itemFindings, classificationCounts, issueCounts, {
          kind: "lesson_evidence", classification: "CONFLICTED", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", detail: `Opaque evidence collision for ${opaqueId}; raw source ${raw} was preserved.`, exactReference: false, willChange: false
        });
      });
      protectedOrigins.push({ resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", ticketIds: result.protectedOrigins });
      if (result.unresolved) {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "lesson_evidence", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", detail: "At least one historical lesson source reference has no exact TicketRecord in this organization; the original value is preserved.", exactReference: false, willChange: false });
      } else if (sourceValues.length > 0 && sourceValues.some((value) => !opaque(value))) {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "lesson_evidence", classification: "SAFE_TO_REDACT", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", detail: "Exact TicketRecord links support deterministic opaque evidence replacement; protected origin links are retained.", exactReference: true, willChange: true });
      } else if (sourceValues.length > 0) {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "lesson_evidence", classification: "SAFE_TO_MIGRATE", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", detail: "Lesson already uses opaque evidence identifiers; no new identifier is created.", exactReference: true, willChange: false });
      } else {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "lesson_evidence", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "sourceTicketId/sourceTicketIds", detail: "Lesson has no source evidence reference.", exactReference: false, willChange: false });
      }
      const lessonText = [lesson.rootCause, lesson.solution, lesson.customerResponse].filter((value): value is string => typeof value === "string").join(" ");
      const privacy = privacyPattern(lessonText);
      if (privacy) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "privacy_review", classification: "DO_NOT_TOUCH", resourceType: "lesson", resourceId: String(lesson.id ?? "unknown"), field: "rootCause/solution/customerResponse", detail: `Potential ${privacy} was detected; lesson meaning and text are not rewritten automatically.`, exactReference: false, willChange: false });
      if (result.unresolved) return lesson;
      const rewritten = { ...lesson, sourceTicketId: result.redacted[0] ?? lesson.sourceTicketId } as JsonRecord;
      if (result.redacted.length > 1) rewritten.sourceTicketIds = result.redacted;
      else delete rewritten.sourceTicketIds;
      if (stableStringify(rewritten) !== stableStringify(lesson)) changed = true;
      return rewritten;
    });

    const nextExamples = (Array.isArray(content.exampleTickets) ? content.exampleTickets : []).filter((entry) => !!entry && typeof entry === "object" && !Array.isArray(entry)).map((example) => {
      supportingExamples += 1;
      const exampleRecord = example as JsonRecord;
      const value = typeof exampleRecord.ticketId === "string" ? exampleRecord.ticketId : "";
      const result = makeOpaqueLinks(value ? [value] : [], ticketIds, usedOpaqueToRaw, (raw, opaqueId) => {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "supporting_example", classification: "CONFLICTED", resourceType: "supporting_example", resourceId: value || "unknown", field: "ticketId", detail: `Opaque evidence collision for ${opaqueId}; raw source ${raw} was preserved.`, exactReference: false, willChange: false });
      });
      protectedOrigins.push({ resourceType: "supporting_example", resourceId: value || "unknown", field: "ticketId", ticketIds: result.protectedOrigins });
      if (result.unresolved || !value) {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "supporting_example", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "supporting_example", resourceId: value || "unknown", field: "ticketId", detail: "Supporting example has no exact TicketRecord link; original evidence is preserved.", exactReference: false, willChange: false });
      } else if (!opaque(value)) {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "supporting_example", classification: "SAFE_TO_REDACT", resourceType: "supporting_example", resourceId: value, field: "ticketId", detail: "Exact TicketRecord link supports deterministic opaque evidence replacement; copied example text remains unchanged.", exactReference: true, willChange: true });
      } else {
        addFinding(itemFindings, classificationCounts, issueCounts, { kind: "supporting_example", classification: "SAFE_TO_MIGRATE", resourceType: "supporting_example", resourceId: value, field: "ticketId", detail: "Supporting example already uses opaque evidence.", exactReference: true, willChange: false });
      }
      const copiedText = [exampleRecord.customerName, exampleRecord.originalIssue].filter((entry): entry is string => typeof entry === "string").join(" ");
      const privacy = privacyPattern(copiedText);
      if (privacy) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "privacy_review", classification: "DO_NOT_TOUCH", resourceType: "supporting_example", resourceId: value || "unknown", field: "customerName/originalIssue", detail: `Potential ${privacy} exists in historical copied text; text is preserved for explicit review.`, exactReference: false, willChange: false });
      if (result.unresolved || !value || opaque(value)) return exampleRecord;
      changed = true;
      return { ...exampleRecord, ticketId: result.redacted[0] };
    });

    const nextVersions = getVersions(content);
    for (const version of nextVersions) {
      versions += 1;
      const versionId = String(version.versionId ?? "unknown");
      const source = typeof version.sourceTicketId === "string" ? version.sourceTicketId : "";
      const exact = !!source && ticketIds.has(source);
      if (exact) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "version_lineage", classification: "SAFE_TO_MIGRATE", resourceType: "version", resourceId: versionId, field: "sourceTicketId", detail: "Version source resolves to an exact TicketRecord; version order and source origin are preserved.", exactReference: true, willChange: false });
      else addFinding(itemFindings, classificationCounts, issueCounts, { kind: "version_lineage", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "version", resourceId: versionId, field: "sourceTicketId", detail: "Version source does not resolve to an exact TicketRecord; chronology and original source are preserved.", exactReference: false, willChange: false });
      protectedOrigins.push({ resourceType: "version", resourceId: versionId, field: "sourceTicketId", ticketIds: source ? [source] : [] });
    }

    const itemValidations = data.validations.filter((validation) => validation.knowledgeItemId === row.id);
    const itemCandidateIds = new Set(itemValidations.map((validation) => validation.candidateId));
    for (const validation of itemValidations) {
      const candidate = candidateById.get(validation.candidateId);
      const candidateExact = !!candidate && strings(candidate.sourceTicketIds).every((id) => ticketIds.has(id));
      const versionExact = !validation.knowledgeVersionId || getVersions(content).some((version) => version.versionId === validation.knowledgeVersionId);
      if (candidate && candidateExact && versionExact && validation.actor && validation.roleExercised && validation.timestamp) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "validation_link", classification: "SAFE_TO_MIGRATE", resourceType: "validation", resourceId: validation.id, field: "candidateId/knowledgeItemId/knowledgeVersionId", detail: "Validation is linked by exact candidate, knowledge, and optional version IDs; actor and timestamp are preserved.", exactReference: true, willChange: false });
      else addFinding(itemFindings, classificationCounts, issueCounts, { kind: "validation_link", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "validation", resourceId: validation.id, field: "candidateId/knowledgeItemId/knowledgeVersionId/actor/timestamp", detail: "Validation has a missing or unresolved historical link or incomplete actor metadata; no link is inferred.", exactReference: false, willChange: false });
      if (candidate && candidate.rationale && candidate.status) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "promotion_metadata", classification: "SAFE_TO_MIGRATE", resourceType: "candidate", resourceId: candidate.id, field: "status/rationale/proposedAction", detail: "Promotion metadata is present and retained without changing the historical decision.", exactReference: true, willChange: false });
      else addFinding(itemFindings, classificationCounts, issueCounts, { kind: "promotion_metadata", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "candidate", resourceId: validation.candidateId, field: "status/rationale/proposedAction", detail: "Promotion metadata is incomplete; no action or rationale is fabricated.", exactReference: false, willChange: false });
      const changes = memoryByValidation.get(validation.id) ?? [];
      if (changes.some((change) => change.knowledgeItemId === row.id && change.candidateId === validation.candidateId && change.actorId && change.changeType)) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "memory_change_link", classification: "SAFE_TO_MIGRATE", resourceType: "memory_change", resourceId: changes[0].id, field: "validationRecordId/candidateId/knowledgeItemId/actorId/changeType", detail: "Memory change is linked by exact validation, candidate, knowledge, actor, and change type.", exactReference: true, willChange: false });
      else addFinding(itemFindings, classificationCounts, issueCounts, { kind: "memory_change_link", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "memory_change", resourceId: validation.id, field: "validationRecordId/candidateId/knowledgeItemId/actorId/changeType", detail: "No fully linked memory change record was found; no event is fabricated.", exactReference: false, willChange: false });
    }
    for (const evidence of evidenceByKnowledge.get(row.id) ?? []) {
      const exact = ticketIds.has(evidence.sourceTicketId) && validationById.has(evidence.validationRecordId) && validationById.get(evidence.validationRecordId)?.knowledgeItemId === row.id;
      if (exact) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "trust_evidence_link", classification: "SAFE_TO_MIGRATE", resourceType: "trust_evidence", resourceId: evidence.id, field: "knowledgeItemId/sourceTicketId/validationRecordId", detail: "Trust evidence has exact organization-local ticket, knowledge, and validation links; trust decision is preserved.", exactReference: true, willChange: false });
      else addFinding(itemFindings, classificationCounts, issueCounts, { kind: "trust_evidence_link", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "trust_evidence", resourceId: evidence.id, field: "knowledgeItemId/sourceTicketId/validationRecordId", detail: "Trust evidence is missing an exact organization-local link; trust values are preserved and no replacement event is created.", exactReference: false, willChange: false });
    }
    if (itemCandidateIds.size === 0) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "provenance", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "knowledge", resourceId: row.id, field: "provenance/validation", detail: "No validation chain was found for this knowledge item; historical content is preserved.", exactReference: false, willChange: false });
    if (!content.provenance || !content.validation) addFinding(itemFindings, classificationCounts, issueCounts, { kind: "provenance", classification: "INCOMPLETE_BUT_PRESERVABLE", resourceType: "knowledge", resourceId: row.id, field: "provenance/validation", detail: "Legacy provenance or validation metadata is absent; no actor, timestamp, or safeguard is invented.", exactReference: false, willChange: false });

    const alreadyMigrated = isAuditMetadata(content[HISTORICAL_AUDIT_METADATA_KEY]);
    const state = completenessFor(itemFindings, alreadyMigrated);
    auditStates[state] += 1;
    const auditMetadata = {
      schemaVersion: HISTORICAL_AUDIT_SCHEMA_VERSION,
      migration: "TODO-065",
      auditCompleteness: state,
      sourceAuditDigest: shortDigest({ organizationId, knowledgeId: row.id, findings: itemFindings.map((finding) => ({ kind: finding.kind, resourceType: finding.resourceType, resourceId: finding.resourceId, field: finding.field, classification: finding.classification })) }),
      protectedOriginLinks: protectedOrigins.filter((entry) => entry.ticketIds.length > 0),
      exactLinkCounts: {
        validations: itemValidations.length,
        memoryChanges: itemValidations.reduce((count, validation) => count + (memoryByValidation.get(validation.id)?.length ?? 0), 0),
        trustEvidence: (evidenceByKnowledge.get(row.id) ?? []).length
      },
      unresolvedFindingIds: itemFindings.filter((finding) => finding.classification === "INCOMPLETE_BUT_PRESERVABLE" || finding.classification === "CONFLICTED").map((finding) => finding.id).sort(),
      doNotTouchFindingIds: itemFindings.filter((finding) => finding.classification === "DO_NOT_TOUCH").map((finding) => finding.id).sort(),
      originalContentHash: shortDigest(withoutAuditMetadata(content)),
      protectedForInternalAuditOnly: true
    };
    nextContent.lessons = nextLessons;
    nextContent.exampleTickets = nextExamples;
    nextContent[HISTORICAL_AUDIT_METADATA_KEY] = auditMetadata;
    if (stableStringify(nextContent) !== stableStringify(content)) changed = true;
    if (changed || !alreadyMigrated) eligibleRecords += 1;
    plannedRows.push({ id: row.id, content, revision: row.revision, nextContent, state, findingDigest: auditMetadata.sourceAuditDigest, alreadyMigrated });
    findings.push(...itemFindings);
  }

  const beforeDigest = sha(digestableKnowledge(data.knowledge));
  const protectedBaselineDigest = sha({ organizationId, knowledge: data.knowledge.map((row) => ({ id: row.id, content: row.content, revision: row.revision })) });
  const inventory: HistoricalAuditInventory = {
    organizationId,
    generatedAt: new Date().toISOString(),
    recordsInspected: { knowledgeItems: data.knowledge.length, lessons, supportingExamples, candidates: data.candidates.length, validations: data.validations.length, memoryChanges: data.memoryChanges.length, trustEvidence: data.trustEvidence.length, versions },
    eligibleRecords,
    classificationCounts,
    issueCounts,
    findings,
    auditStates,
    expectedRowCountChanges: { knowledgeItems: 0, lessons: 0, supportingExamples: 0, candidates: 0, validations: 0, memoryChanges: 0, trustEvidence: 0, tickets: 0 },
    expectedUpdatedRows: { knowledgeItems: eligibleRecords, lessons: 0, supportingExamples: 0, candidates: 0, validations: 0, memoryChanges: 0, trustEvidence: 0, tickets: 0 },
    beforeDigest,
    protectedOrganizations: [organizationId],
    protectedBaselineDigest
  };
  Object.defineProperty(inventory, "__plannedRows", { value: plannedRows, enumerable: false });
  return inventory;
}

export async function runHistoricalAuditMigration(organizationId: string, options: { confirm: boolean; injectFailureAfter?: number } = { confirm: false }): Promise<HistoricalAuditMigrationResult> {
  const inventory = await inventoryHistoricalAudit(organizationId);
  if (!options.confirm) return { mode: "dry-run", organizationId, writesPerformed: false, rowsChanged: 0, inventory, afterDigest: inventory.beforeDigest, idempotentNoOp: false };
  const prisma = getPrismaClient();
  const rows = await prisma.knowledgeItem.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, content: true, revision: true } });
  const plannedRows = ((inventory as HistoricalAuditInventory & { __plannedRows?: Array<{ id: string; nextContent: JsonRecord; alreadyMigrated: boolean }> }).__plannedRows ?? []);
  let changed = 0;
  await prisma.$transaction(async (tx: TxClient) => {
    let updateNumber = 0;
    for (const row of rows) {
      const content = record(row.content);
      if (isAuditMetadata(content[HISTORICAL_AUDIT_METADATA_KEY])) continue;
      const planned = plannedRows.find((entry) => entry.id === row.id);
      if (!planned || planned.alreadyMigrated) continue;
      const next = JSON.parse(JSON.stringify(planned.nextContent)) as JsonRecord;
      if (stableStringify(next) === stableStringify(content)) continue;
      await tx.knowledgeItem.update({ where: { id: row.id }, data: { content: next, revision: { increment: 1 } } });
      changed += 1;
      updateNumber += 1;
      if (options.injectFailureAfter && updateNumber >= options.injectFailureAfter) throw new Error("TODO-065 injected transaction failure");
    }
  }, { timeout: 120_000, maxWait: 30_000 });
  const afterRows = await prisma.knowledgeItem.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, content: true, revision: true } });
  const afterDigest = sha(digestableKnowledge(afterRows));
  return { mode: "confirm", organizationId, writesPerformed: changed > 0, rowsChanged: changed, inventory, afterDigest, idempotentNoOp: changed === 0 };
}

export const __TESTING__ = { opaque, privacyPattern, withoutAuditMetadata, sha };
