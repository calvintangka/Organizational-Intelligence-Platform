import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  assertOrganizationId,
  assertUniqueViolation,
  ensureEvidenceTx,
  ensureSourceTx,
  ensureSourceAndEvidenceTx,
  getNeutralCandidateId,
  MemoryFoundationError,
  memoryString,
  optionalMemoryString,
  parseMemoryDate,
  type EvidenceInput,
  type SourceInput
} from "@/lib/server/organizationalMemoryPrimitives";
import { commitValidation, loadKnowledge, loadKnowledgeCandidates, loadKnowledgeHistory } from "@/lib/server/persistenceService";
import type {
  EvidenceRecordView,
  KnowledgeChallengeDisposition,
  KnowledgeChallengeView,
  KnowledgeReuseOutcomeView,
  OrganizationalMemoryInspection,
  PreparedOrganizationalLearning,
  OrganizationalSourceView,
  ReuseOutcomeClassification
} from "@/types";
import type { CanonicalLearning, KnowledgeCandidate, KnowledgeItem, ReflectionDecision } from "@/types";

const OUTCOME_CLASSES = new Set<ReuseOutcomeClassification>(["SUCCESS", "CORRECTION_REQUIRED", "FAILURE"]);
const CHALLENGE_DISPOSITIONS = new Set<KnowledgeChallengeDisposition>(["REVALIDATED", "SCOPE_UPDATED", "DEPRECATED"]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapSource(row: any): OrganizationalSourceView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceKind: row.sourceKind,
    sourceSystem: row.sourceSystem,
    sourceObjectType: row.sourceObjectType,
    sourceObjectId: row.sourceObjectId,
    occurredAt: iso(row.occurredAt),
    capturedAt: iso(row.capturedAt),
    actorId: row.actorId ?? null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : null,
    createdAt: row.createdAt.toISOString()
  };
}

function mapEvidence(row: any): EvidenceRecordView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceId: row.sourceId,
    evidenceType: row.evidenceType,
    evidenceRole: row.evidenceRole,
    actorId: row.actorId ?? null,
    occurredAt: iso(row.occurredAt),
    content: row.content ?? null,
    reference: row.reference ?? null,
    state: row.state,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString()
  };
}

function mapOutcome(row: any): KnowledgeReuseOutcomeView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    knowledgeItemId: row.knowledgeItemId,
    knowledgeVersionId: row.knowledgeVersionId ?? null,
    sourceId: row.sourceId,
    evidenceId: row.evidenceId,
    actorId: row.actorId,
    reuseMode: row.reuseMode ?? null,
    classification: row.classification,
    requiredEdits: row.requiredEdits,
    trustAction: row.trustAction ?? null,
    trustDelta: row.trustDelta ?? null,
    trustEvidenceId: row.trustEvidenceId ?? null,
    knowledgeRevision: row.knowledgeRevision,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    source: row.source ? mapSource(row.source) : null,
    evidence: row.evidence ? mapEvidence(row.evidence) : null
  };
}

function mapChallenge(row: any): KnowledgeChallengeView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    knowledgeItemId: row.knowledgeItemId,
    knowledgeVersionId: row.knowledgeVersionId ?? null,
    sourceId: row.sourceId,
    evidenceId: row.evidenceId,
    openedBy: row.openedBy,
    rationale: row.rationale,
    state: row.state,
    disposition: row.disposition ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: iso(row.reviewedAt),
    decisionRationale: row.decisionRationale ?? null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function assertOrganizationExists(organizationId: string): Promise<void> {
  const id = assertOrganizationId(organizationId);
  const organization = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!organization) throw new MemoryFoundationError("ORGANIZATION_NOT_FOUND", `Organization ${id} was not found.`, 404);
}

function parseClassification(value: unknown): ReuseOutcomeClassification {
  if (typeof value !== "string" || !OUTCOME_CLASSES.has(value as ReuseOutcomeClassification)) {
    throw new MemoryFoundationError("INVALID_REQUEST", "classification must be SUCCESS, CORRECTION_REQUIRED, or FAILURE.");
  }
  return value as ReuseOutcomeClassification;
}

function parseDisposition(value: unknown): KnowledgeChallengeDisposition {
  if (typeof value !== "string" || !CHALLENGE_DISPOSITIONS.has(value as KnowledgeChallengeDisposition)) {
    throw new MemoryFoundationError("INVALID_REQUEST", "disposition must be REVALIDATED, SCOPE_UPDATED, or DEPRECATED.");
  }
  return value as KnowledgeChallengeDisposition;
}

function clampTrust(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export interface RecordReuseOutcomeInput {
  organizationId: string;
  knowledgeItemId: string;
  knowledgeVersionId?: string | null;
  source: SourceInput;
  evidence: EvidenceInput;
  actorId: string;
  reuseMode?: "human" | "automatic" | string | null;
  classification: ReuseOutcomeClassification;
  requiredEdits?: boolean;
  expectedKnowledgeRevision: number;
  idempotencyKey: string;
}

/** Records a domain-neutral outcome and applies the existing deterministic trust policy once. */
export async function recordReuseOutcome(input: RecordReuseOutcomeInput): Promise<KnowledgeReuseOutcomeView> {
  const organizationId = assertOrganizationId(input.organizationId);
  const knowledgeItemId = memoryString(input.knowledgeItemId, "knowledgeItemId", 160);
  const actorId = memoryString(input.actorId, "actorId", 160);
  const idempotencyKey = memoryString(input.idempotencyKey, "idempotencyKey", 240);
  const classification = parseClassification(input.classification);
  const requiredEdits = input.requiredEdits === true;
  const sourceObjectId = memoryString(input.source.sourceObjectId, "source.sourceObjectId", 300);
  const sourceSystem = memoryString(input.source.sourceSystem, "source.sourceSystem", 120);
  const sourceObjectType = memoryString(input.source.sourceObjectType, "source.sourceObjectType", 120);
  const evidenceIdempotencyKey = memoryString(input.evidence.idempotencyKey, "evidence.idempotencyKey", 240);
  if (!Number.isInteger(input.expectedKnowledgeRevision) || input.expectedKnowledgeRevision < 0) {
    throw new MemoryFoundationError("INVALID_REQUEST", "expectedKnowledgeRevision must be a non-negative integer.");
  }

  await assertOrganizationExists(organizationId);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.knowledgeReuseOutcome.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      include: { source: true, evidence: true }
    });
    if (replay) {
      if (replay.knowledgeItemId !== knowledgeItemId
          || replay.classification !== classification
          || replay.requiredEdits !== requiredEdits
          || replay.source.sourceSystem !== sourceSystem
          || replay.source.sourceObjectType !== sourceObjectType
          || replay.source.sourceObjectId !== sourceObjectId
          || replay.evidence.idempotencyKey !== evidenceIdempotencyKey) {
        throw new MemoryFoundationError("CONFLICT", "The outcome idempotency key was already used for a different outcome.");
      }
      return mapOutcome(replay);
    }

    const knowledge = await tx.knowledgeItem.findUnique({ where: { id: knowledgeItemId } });
    if (!knowledge || knowledge.organizationId !== organizationId) {
      throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested knowledge item was not found in this organization.", 404);
    }
    if (knowledge.governanceState === "challenged") {
      throw new MemoryFoundationError("CONFLICT", "An open challenge must be human-reviewed before another outcome can change this memory.");
    }
    if (knowledge.revision !== input.expectedKnowledgeRevision) {
      throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before recording an outcome.");
    }

    const { source, evidence } = await ensureSourceAndEvidenceTx(tx, organizationId, input.source, input.evidence);
    const baseTrust = knowledge.trustScore ?? 20;
    const modeDelta = input.reuseMode === "automatic" ? 3 : 5;
    const delta = classification === "SUCCESS" ? modeDelta + (input.requiredEdits ? -2 : 0) : classification === "CORRECTION_REQUIRED" ? -2 : -10;
    const nextTrust = clampTrust(baseTrust + delta);
    const content = asRecord(knowledge.content);
    const nextContent = {
      ...content,
      governanceState: "trusted"
    };
    const nextSuccesses = (knowledge.successfulResolutions ?? 0) + (classification === "SUCCESS" ? 1 : 0);
    const nextFailures = (knowledge.failedResolutions ?? 0) + (classification === "SUCCESS" ? 0 : 1);
    const nextTimesSeen = (knowledge.timesSeen ?? 0) + 1;
    const nextTimesReused = (knowledge.timesReused ?? 0) + 1;
    const nextTotal = nextSuccesses + nextFailures;
    const successRate = nextTotal === 0 ? 100 : Math.round((nextSuccesses / nextTotal) * 100);
    const autoResponseEligible = classification === "SUCCESS" && !input.requiredEdits && knowledge.autoResponseEligible === true && nextTrust >= 80;
    const updated = await tx.knowledgeItem.updateMany({
      where: { id: knowledge.id, organizationId, revision: input.expectedKnowledgeRevision },
      data: {
        governanceState: "trusted",
        trustScore: nextTrust,
        timesReused: nextTimesReused,
        timesSeen: nextTimesSeen,
        successfulResolutions: nextSuccesses,
        failedResolutions: nextFailures,
        successRate,
        lastUsedAt: new Date(),
        autoResponseEligible,
        humanReviewCount: (knowledge.humanReviewCount ?? 0) + (input.reuseMode === "human" ? 1 : 0),
        automaticResolutionCount: (knowledge.automaticResolutionCount ?? 0) + (input.reuseMode === "automatic" ? 1 : 0),
        content: jsonInput(nextContent),
        revision: { increment: 1 }
      }
    });
    if (updated.count !== 1) throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before recording an outcome.");
    const knowledgeRevision = input.expectedKnowledgeRevision + 1;
    const outcome = await tx.knowledgeReuseOutcome.create({
      data: {
        organizationId,
        knowledgeItemId,
        knowledgeVersionId: input.knowledgeVersionId ?? null,
        sourceId: source.id,
        evidenceId: evidence.id,
        actorId,
        reuseMode: input.reuseMode ?? null,
        classification,
        requiredEdits,
        trustAction: delta >= 0 ? "trust_increased" : "trust_decreased",
        trustDelta: delta,
        knowledgeRevision,
        idempotencyKey
      }
    });
    await tx.memoryEvidenceLink.createMany({
      data: [{ organizationId, knowledgeItemId, evidenceId: evidence.id, relationship: "reuse_outcome", knowledgeVersionId: input.knowledgeVersionId ?? null }],
      skipDuplicates: true
    });
    const committed = await tx.knowledgeReuseOutcome.findUnique({
      where: { id: outcome.id },
      include: { source: true, evidence: true }
    });
    return mapOutcome(committed ?? outcome);
  }).catch(async (error) => {
    if (assertUniqueViolation(error)) {
      const concurrent = await prisma.knowledgeReuseOutcome.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
        include: { source: true, evidence: true }
      });
      if (concurrent
          && concurrent.knowledgeItemId === knowledgeItemId
          && concurrent.classification === classification
          && concurrent.requiredEdits === requiredEdits
          && concurrent.source.sourceSystem === sourceSystem
          && concurrent.source.sourceObjectType === sourceObjectType
          && concurrent.source.sourceObjectId === sourceObjectId
          && concurrent.evidence.idempotencyKey === evidenceIdempotencyKey) {
        return mapOutcome(concurrent);
      }
      throw new MemoryFoundationError("CONFLICT", "The outcome was concurrently recorded with a conflicting logical identity.");
    }
    throw error;
  });
}

export async function listReuseOutcomes(organizationId: string, knowledgeItemId?: string): Promise<KnowledgeReuseOutcomeView[]> {
  const id = assertOrganizationId(organizationId);
  await assertOrganizationExists(id);
  const rows = await prisma.knowledgeReuseOutcome.findMany({
    where: { organizationId: id, ...(knowledgeItemId ? { knowledgeItemId: memoryString(knowledgeItemId, "knowledgeItemId", 160) } : {}) },
    include: { source: true, evidence: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return rows.map(mapOutcome);
}

export interface OpenKnowledgeChallengeInput {
  organizationId: string;
  knowledgeItemId: string;
  knowledgeVersionId?: string | null;
  source: SourceInput;
  evidence: EvidenceInput;
  actorId: string;
  rationale: string;
  expectedKnowledgeRevision: number;
  idempotencyKey: string;
}

export async function openKnowledgeChallenge(input: OpenKnowledgeChallengeInput): Promise<KnowledgeChallengeView> {
  const organizationId = assertOrganizationId(input.organizationId);
  const knowledgeItemId = memoryString(input.knowledgeItemId, "knowledgeItemId", 160);
  const actorId = memoryString(input.actorId, "actorId", 160);
  const rationale = memoryString(input.rationale, "rationale", 4000);
  const idempotencyKey = memoryString(input.idempotencyKey, "idempotencyKey", 240);
  if (!Number.isInteger(input.expectedKnowledgeRevision) || input.expectedKnowledgeRevision < 0) throw new MemoryFoundationError("INVALID_REQUEST", "expectedKnowledgeRevision must be a non-negative integer.");
  await assertOrganizationExists(organizationId);

  return prisma.$transaction(async (tx) => {
    const replay = await tx.knowledgeChallenge.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
    if (replay) return mapChallenge(replay);
    const knowledge = await tx.knowledgeItem.findUnique({ where: { id: knowledgeItemId } });
    if (!knowledge || knowledge.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested knowledge item was not found in this organization.", 404);
    if (knowledge.revision !== input.expectedKnowledgeRevision) throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before opening a challenge.");
    const { source, evidence } = await ensureSourceAndEvidenceTx(tx, organizationId, input.source, input.evidence);
    const content = { ...asRecord(knowledge.content), governanceState: "challenged" };
    const updated = await tx.knowledgeItem.updateMany({
      where: { id: knowledge.id, organizationId, revision: input.expectedKnowledgeRevision },
      data: { governanceState: "challenged", autoResponseEligible: false, content: jsonInput(content), revision: { increment: 1 } }
    });
    if (updated.count !== 1) throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before opening a challenge.");
    const challenge = await tx.knowledgeChallenge.create({
      data: {
        organizationId,
        knowledgeItemId,
        knowledgeVersionId: input.knowledgeVersionId ?? null,
        sourceId: source.id,
        evidenceId: evidence.id,
        openedBy: actorId,
        rationale,
        idempotencyKey
      }
    });
    await tx.memoryEvidenceLink.createMany({
      data: [{ organizationId, knowledgeItemId, evidenceId: evidence.id, relationship: "challenge", knowledgeVersionId: input.knowledgeVersionId ?? null }],
      skipDuplicates: true
    });
    return mapChallenge(challenge);
  }).catch((error) => {
    if (assertUniqueViolation(error)) throw new MemoryFoundationError("CONFLICT", "The challenge was concurrently opened; retry with the existing idempotency key.");
    throw error;
  });
}

export async function listKnowledgeChallenges(organizationId: string, knowledgeItemId?: string): Promise<KnowledgeChallengeView[]> {
  const id = assertOrganizationId(organizationId);
  await assertOrganizationExists(id);
  const rows = await prisma.knowledgeChallenge.findMany({
    where: { organizationId: id, ...(knowledgeItemId ? { knowledgeItemId: memoryString(knowledgeItemId, "knowledgeItemId", 160) } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return rows.map(mapChallenge);
}

function scopePatchRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemoryFoundationError("INVALID_REQUEST", "scopePatch must be an object.");
  const input = value as Record<string, unknown>;
  const allowed = ["category", "tags", "canonicalProblemTitle", "problemSummary", "resolutionWorkflow", "scopeNote"];
  const output: Record<string, unknown> = {};
  for (const key of allowed) {
    if (input[key] === undefined) continue;
    if (key === "tags" || key === "resolutionWorkflow") {
      if (!Array.isArray(input[key]) || input[key].some((item) => typeof item !== "string")) throw new MemoryFoundationError("INVALID_REQUEST", `${key} must be an array of strings.`);
      output[key] = [...new Set((input[key] as string[]).map((item) => item.trim()).filter(Boolean))];
    } else if (key === "scopeNote") {
      output[key] = memoryString(input[key], "scopePatch.scopeNote", 2000);
    } else {
      output[key] = memoryString(input[key], `scopePatch.${key}`, 500);
    }
  }
  if (Object.keys(output).length === 0) throw new MemoryFoundationError("INVALID_REQUEST", "SCOPE_UPDATED requires at least one supported scope field.");
  return output;
}

export interface ReviewKnowledgeChallengeInput {
  organizationId: string;
  challengeId: string;
  disposition: KnowledgeChallengeDisposition;
  actorId: string;
  rationale: string;
  expectedKnowledgeRevision: number;
  scopePatch?: unknown;
}

export async function reviewKnowledgeChallenge(input: ReviewKnowledgeChallengeInput): Promise<KnowledgeChallengeView> {
  const organizationId = assertOrganizationId(input.organizationId);
  const challengeId = memoryString(input.challengeId, "challengeId", 160);
  const actorId = memoryString(input.actorId, "actorId", 160);
  const rationale = memoryString(input.rationale, "rationale", 4000);
  const disposition = parseDisposition(input.disposition);
  if (!Number.isInteger(input.expectedKnowledgeRevision) || input.expectedKnowledgeRevision < 0) throw new MemoryFoundationError("INVALID_REQUEST", "expectedKnowledgeRevision must be a non-negative integer.");
  const scopePatch = disposition === "SCOPE_UPDATED" ? scopePatchRecord(input.scopePatch) : undefined;
  await assertOrganizationExists(organizationId);

  return prisma.$transaction(async (tx) => {
    const challenge = await tx.knowledgeChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested knowledge challenge was not found in this organization.", 404);
    if (challenge.state === "RESOLVED") {
      const current = await tx.knowledgeChallenge.findUnique({ where: { id: challenge.id } });
      return mapChallenge(current);
    }
    const knowledge = await tx.knowledgeItem.findUnique({ where: { id: challenge.knowledgeItemId } });
    if (!knowledge || knowledge.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The challenged knowledge item was not found in this organization.", 404);
    if (knowledge.revision !== input.expectedKnowledgeRevision) throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before reviewing the challenge.");

    const beforeState = asRecord(knowledge.content);
    const now = new Date();
    const nextState: JsonRecord = { ...beforeState, governanceState: disposition === "DEPRECATED" ? "trusted" : "trusted" };
    let lifecycleState = knowledge.lifecycleState;
    if (disposition === "DEPRECATED") {
      lifecycleState = "deprecated";
      nextState.autoResponseEligible = false;
    } else if (disposition === "REVALIDATED") {
      nextState.autoResponseEligible = false;
    } else if (scopePatch) {
      Object.assign(nextState, scopePatch);
      const versions = Array.isArray(nextState.knowledgeVersions) ? [...nextState.knowledgeVersions] : [];
      versions.push({
        versionId: `${knowledge.id}-challenge-v${versions.length + 1}`,
        version: versions.length + 1,
        createdAt: now.toISOString(),
        changeReason: rationale,
        sourceTicketId: knowledge.sourceTicketId,
        summary: `Scope updated after challenge: ${rationale}`
      });
      nextState.knowledgeVersions = versions;
      nextState.lastUpdated = now.toISOString();
      nextState.autoResponseEligible = false;
    }

    const updated = await tx.knowledgeItem.updateMany({
      where: { id: knowledge.id, organizationId, revision: input.expectedKnowledgeRevision },
      data: { lifecycleState, governanceState: "trusted", autoResponseEligible: false, content: jsonInput(nextState), revision: { increment: 1 } }
    });
    if (updated.count !== 1) throw new MemoryFoundationError("REVISION_CONFLICT", "The knowledge item changed; reload it before reviewing the challenge.");
    const resultingRevision = input.expectedKnowledgeRevision + 1;
    await tx.knowledgeChallengeDecision.create({
      data: {
        organizationId,
        challengeId: challenge.id,
        knowledgeItemId: knowledge.id,
        disposition,
        actorId,
        rationale,
        beforeState: jsonInput(beforeState),
        afterState: jsonInput(nextState),
        expectedRevision: input.expectedKnowledgeRevision,
        resultingRevision
      }
    });
    const resolved = await tx.knowledgeChallenge.update({
      where: { id: challenge.id },
      data: { state: "RESOLVED", disposition, reviewedBy: actorId, reviewedAt: now, decisionRationale: rationale }
    });
    return mapChallenge(resolved);
  }).catch((error) => {
    if (assertUniqueViolation(error)) throw new MemoryFoundationError("CONFLICT", "The challenge disposition was already committed.");
    throw error;
  });
}

export async function loadEvidenceRecord(organizationId: string, evidenceId: string): Promise<EvidenceRecordView> {
  const id = assertOrganizationId(organizationId);
  await assertOrganizationExists(id);
  const row = await prisma.evidenceRecord.findUnique({ where: { id: memoryString(evidenceId, "evidenceId", 160) } });
  if (!row || row.organizationId !== id) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested evidence was not found in this organization.", 404);
  return mapEvidence(row);
}

export async function loadSource(organizationId: string, sourceId: string): Promise<OrganizationalSourceView> {
  const id = assertOrganizationId(organizationId);
  await assertOrganizationExists(id);
  const row = await prisma.organizationalSource.findUnique({ where: { id: memoryString(sourceId, "sourceId", 160) } });
  if (!row || row.organizationId !== id) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested source was not found in this organization.", 404);
  return mapSource(row);
}

export async function listMemoryEvidence(organizationId: string, knowledgeItemId: string): Promise<Array<{ id: string; relationship: string; knowledgeVersionId: string | null; evidence: EvidenceRecordView; source: OrganizationalSourceView }>> {
  const id = assertOrganizationId(organizationId);
  const itemId = memoryString(knowledgeItemId, "knowledgeItemId", 160);
  await assertOrganizationExists(id);
  const rows = await prisma.memoryEvidenceLink.findMany({
    where: { organizationId: id, knowledgeItemId: itemId },
    include: { evidence: { include: { source: true } } },
    orderBy: { createdAt: "asc" },
    take: 500
  });
  return rows.map((row: any) => ({
    id: row.id,
    relationship: row.relationship,
    knowledgeVersionId: row.knowledgeVersionId ?? null,
    evidence: mapEvidence(row.evidence),
    source: mapSource(row.evidence.source)
  }));
}

export interface CreateOrganizationalSourceInput {
  organizationId: string;
  sourceKind: string;
  sourceSystem?: string;
  sourceObjectType?: string;
  sourceObjectId: string;
  occurredAt: Date;
  actorId: string;
  metadata: Prisma.InputJsonValue;
  idempotencyKey: string;
}

export async function createOrganizationalSource(input: CreateOrganizationalSourceInput): Promise<OrganizationalSourceView> {
  const organizationId = assertOrganizationId(input.organizationId as string);
  await assertOrganizationExists(organizationId);
  const idempotencyKey = memoryString(input.idempotencyKey, "idempotencyKey", 240);
  const source = await prisma.$transaction(async (tx) => ensureSourceTx(tx, organizationId, {
    sourceKind: memoryString(input.sourceKind, "sourceKind", 80),
    sourceSystem: memoryString(input.sourceSystem ?? "oip.organizational_memory", "sourceSystem", 120),
    sourceObjectType: memoryString(input.sourceObjectType ?? "organizational_event", "sourceObjectType", 120),
    sourceObjectId: memoryString(input.sourceObjectId, "sourceObjectId", 300),
    occurredAt: input.occurredAt,
    capturedAt: new Date(),
    actorId: memoryString(input.actorId, "actorId", 160),
    metadata: { ...(input.metadata as Record<string, unknown>), idempotencyKey }
  }));
  return mapSource(source);
}

export async function addOrganizationalEvidence(
  organizationId: string,
  sourceId: string,
  input: EvidenceInput
): Promise<EvidenceRecordView> {
  const id = assertOrganizationId(organizationId);
  await assertOrganizationExists(id);
  const evidence = await prisma.$transaction(async (tx) => {
    const source = await tx.organizationalSource.findUnique({ where: { id: memoryString(sourceId, "sourceId", 160) } });
    if (!source || source.organizationId !== id) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational source was not found in this organization.", 404);
    return ensureEvidenceTx(tx, id, source.id, input);
  });
  return mapEvidence(evidence);
}

function neutralSourceMetadata(source: OrganizationalSourceView): Record<string, unknown> {
  return asRecord(source.metadata);
}

function canonicalText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * Remove incidental person identifiers from the reusable lesson while leaving
 * organizational regions, systems, and other operational context intact.
 * Source and Evidence are still preserved verbatim for provenance.
 */
function redactCanonicalIdentity(value: string): string {
  return value
    .replace(/\b(?:employee|engineer|technician|coordinator|operator|user|customer|agent)\s+(?:[A-Z][a-z]+\s+){1,2}[A-Z][a-z]+\b/g, (match) => {
      const role = match.trim().split(/\s+/)[0];
      return `the affected ${role}`;
    })
    .replace(/\b(?:[A-Z][a-z]{2,}\s+){1,2}[A-Z][a-z]{2,}\b/g, (match) => {
      const phrase = match.trim();
      const preserved = new Set(["Meridian Field", "Field Operations", "East Region", "West Region", "North Region", "South Region"]);
      return preserved.has(phrase) ? phrase : "the affected employee";
    });
}

function stripTerminalPunctuation(value: string): string {
  return canonicalText(value).replace(/[.!?]+$/g, "").trim();
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

const CAUSAL_LANGUAGE = /\b(?:because|due to|caused by|root cause|result(?:ed|s) from|stale|out of sync|out-of-sync|unsynchroni[sz]ed|mismatch|retained|previous|prior|incorrect|mapping|assignment|permission|membership|group|policy|configuration|certificate|token|cache|index|state|record|queue)\b/i;
const SYMPTOM_LANGUAGE = /\b(?:could|can|cannot|can't|unable|failed|failure|missing|absent|not appear|did not appear|does not appear|doesn't appear|authenticate|authenticated|sign in|login|existing .* (?:visible|available|work))\b/i;
const ACTION_LANGUAGE = /\b(?:reconcil|refresh|updat|reset|restor|restart|add|remov|enabl|disabl|verif|check|compar|reload|reconnect|renew|apply|synchroni[sz]|repair|reconcile)\w*\b/i;

function tokenOverlap(left: string, right: string): number {
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "were", "with"]);
  const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter((token) => !stopWords.has(token)) ?? []);
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function evidenceScore(content: string, type: string, problem: string): number {
  const text = canonicalText(content);
  if (!text) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (type === "investigation") {
    if (CAUSAL_LANGUAGE.test(text)) score += 5;
    if (/\b(?:because|due to|caused by|root cause|result(?:ed|s) from)\b/i.test(text)) score += 3;
    if (/\b(?:stale|out of sync|out-of-sync|unsynchroni[sz]ed|retained|previous|prior|mapping|assignment|permission|membership|group|configuration|policy|certificate|token|cache|index)\b/i.test(text)) score += 3;
    if (SYMPTOM_LANGUAGE.test(text)) score -= 4;
    if (tokenOverlap(text, problem) >= 0.55 && !CAUSAL_LANGUAGE.test(text)) score -= 4;
  } else if (type === "action_taken") {
    if (ACTION_LANGUAGE.test(text)) score += 6;
    if (/\b(?:after|then|so that|to restore|to resolve)\b/i.test(text)) score += 1;
  } else if (type === "observation") {
    if (SYMPTOM_LANGUAGE.test(text)) score += 2;
  } else if (type === "confirmation") {
    if (/\b(?:after|resolved|restored|appeared|visible|returned|working|accessed|successful)\b/i.test(text)) score += 3;
  }
  return score;
}

function selectEvidenceContent(evidence: EvidenceRecordView[], type: string, problem: string, minimumScore = Number.NEGATIVE_INFINITY): string {
  const candidates = new Map<string, EvidenceRecordView>();
  for (const item of evidence) {
    if (item.evidenceType !== type) continue;
    const content = canonicalText(item.content);
    if (!content) continue;
    const key = content.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, item);
  }
  const ranked = [...candidates.values()]
    .map((item) => ({ item, score: evidenceScore(item.content ?? "", type, problem), text: canonicalText(item.content) }))
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text) || left.item.id.localeCompare(right.item.id));
  return ranked[0]?.text ?? "";
}

function selectRootCauseEvidence(evidence: EvidenceRecordView[], problem: string, context: string): string {
  const investigation = selectEvidenceContent(evidence, "investigation", problem, 2);
  if (investigation) return redactCanonicalIdentity(investigation);
  const systemResult = selectEvidenceContent(evidence, "system_result", problem, 2);
  if (systemResult && CAUSAL_LANGUAGE.test(systemResult)) return redactCanonicalIdentity(systemResult);
  if (context && CAUSAL_LANGUAGE.test(context) && tokenOverlap(context, problem) < 0.8) return redactCanonicalIdentity(context);
  return "Root cause not yet confirmed; available evidence supports the observed problem and intervention only.";
}

function actionDirective(value: string): string {
  const cleaned = stripTerminalPunctuation(value);
  if (!cleaned) return "apply the confirmed intervention";
  const pastTense = /(reconciled|refreshed|updated|reset|restored|restarted|added|removed|enabled|disabled|verified|checked|compared|reloaded|reconnected|renewed|applied|synchronized|synced|repaired)/i;
  const match = cleaned.match(new RegExp(`^.+?\\b((?:${pastTense.source.slice(1, -1)})(?:\\s+and\\s+(?:${pastTense.source.slice(1, -1)}))*)\\s+(.+)$`, "i"));
  if (match) {
    const verbMap: Record<string, string> = { reconciled: "reconcile", refreshed: "refresh", updated: "update", reset: "reset", restored: "restore", restarted: "restart", added: "add", removed: "remove", enabled: "enable", disabled: "disable", verified: "verify", checked: "check", compared: "compare", reloaded: "reload", reconnected: "reconnect", renewed: "renew", applied: "apply", synchronized: "synchronize", synced: "sync", repaired: "repair" };
    const verbs = match[1].split(/\s+and\s+/i).map((verb) => verbMap[verb.toLowerCase()] ?? verb.toLowerCase());
    return `${verbs.join(" and ")} ${match[2]}`;
  }
  if (/^(?:to\s+)?(?:apply|check|compare|enable|disable|reconcile|refresh|reload|repair|reset|restore|restart|synchronize|sync|update|verify)\b/i.test(cleaned)) return cleaned.replace(/^to\s+/i, "");
  return `follow the confirmed action \"${cleaned}\"`;
}

function buildCanonicalLearning(
  source: OrganizationalSourceView,
  evidence: EvidenceRecordView[],
  title: string,
  description: string
): CanonicalLearning {
  const metadata = neutralSourceMetadata(source);
  const location = canonicalText(metadata.location);
  const context = redactCanonicalIdentity(canonicalText(metadata.context));
  const problem = redactCanonicalIdentity(description || title);
  const investigation = selectRootCauseEvidence(evidence, problem, context);
  const action = redactCanonicalIdentity(selectEvidenceContent(evidence, "action_taken", problem) || "apply the confirmed intervention for the affected configuration");
  const scope = context || redactCanonicalIdentity(location) || source.sourceKind.replaceAll("_", " ").toLowerCase();
  const observation = redactCanonicalIdentity(selectEvidenceContent(evidence, "observation", problem) || problem);
  const problemClause = lowerFirst(stripTerminalPunctuation(problem) || "the scoped problem recurs");
  const scopeClause = lowerFirst(stripTerminalPunctuation(scope) || "the verified operational context");
  const causeConfirmed = !/^Root cause not yet confirmed\b/i.test(investigation);
  const causeClause = lowerFirst(stripTerminalPunctuation(investigation));
  const actionClause = actionDirective(action);
  const lesson = causeConfirmed
    ? `When ${problemClause} and the verified context is ${scopeClause}, check whether ${causeClause}; if confirmed, ${actionClause} before escalating beyond the affected scope.`
    : `When ${problemClause} and the verified context is ${scopeClause}, verify the contributing condition before ${actionClause} or escalating beyond the affected scope.`;
  const exclusions = [
    `Apply this lesson only within the verified ${scope} scope.`,
    "Do not treat this pattern as proof of a broader outage without checking the scoped condition."
  ];
  const whenToEscalate = `Escalate beyond ${scope} only if the scoped condition check and confirmed intervention do not resolve the problem.`;
  return {
    title,
    problem,
    rootCause: investigation,
    lesson,
    solution: action,
    scope,
    exclusions,
    signals: [observation, investigation].filter(Boolean).slice(0, 4),
    whenToEscalate
  };
}

export async function prepareOrganizationalLearning(
  organizationId: string,
  sourceId: string,
  actorId: string
): Promise<PreparedOrganizationalLearning> {
  const id = assertOrganizationId(organizationId);
  const source = await loadSource(id, sourceId);
  const evidence = await listOrganizationalSourceEvidence(id, source.id);
  if (evidence.length === 0) throw new MemoryFoundationError("INVALID_REQUEST", "Add at least one evidence item before preparing learning.");
  const metadata = neutralSourceMetadata(source);
  const title = typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : `${source.sourceKind.replaceAll("_", " ")} learning event`;
  const description = typeof metadata.description === "string" ? metadata.description.trim() : "";
  const canonicalLearning = buildCanonicalLearning(source, evidence, title, description);
  const now = new Date().toISOString();
  const candidate: KnowledgeCandidate = {
    id: getNeutralCandidateId(source.id),
    organizationId: id,
    sourceTicketIds: [],
    proposedAction: "create_new",
    proposedContent: {
      solution: canonicalLearning.lesson,
      customerResponseTemplate: "Apply this lesson only when the observed conditions and scope are present.",
      internalGuidance: canonicalLearning.solution,
      canonicalProblemTitle: title,
      category: source.sourceKind,
      canonicalLearning,
      lessons: [{
        id: `neutral-lesson-${source.id}`,
        title,
        rootCause: canonicalLearning.rootCause,
        solution: canonicalLearning.solution,
        customerResponse: "",
        signals: canonicalLearning.signals,
        whenToEscalate: canonicalLearning.whenToEscalate,
        doNotPromise: canonicalLearning.exclusions,
        createdAt: now,
        sourceTicketId: source.id
      }]
    },
    rationale: `Prepared by ${memoryString(actorId, "actorId", 160)} from ${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}. Human validation is required; preparation does not grant trust.`,
    status: "proposed",
    createdAt: now
  };
  await prisma.knowledgeCandidate.upsert({
    where: { id: candidate.id },
    create: {
      id: candidate.id,
      organizationId: id,
      sourceTicketIds: [],
      proposedAction: candidate.proposedAction,
      proposedContent: jsonInput(candidate.proposedContent),
      rationale: candidate.rationale,
      status: "proposed",
      createdAt: new Date(now)
    },
    update: {
      proposedContent: jsonInput(candidate.proposedContent),
      rationale: candidate.rationale
    }
  });
  const reflection: ReflectionDecision = {
    isLearningEvent: true,
    action: "create_new",
    rationale: candidate.rationale,
    problemNameRequired: false,
    suggestedProblemName: title,
    trustImpact: "increase",
    estimatedTrustDelta: 0
  };
  return { candidate, reflection };
}

export async function validateOrganizationalLearning(input: {
  organizationId: string;
  sourceId: string;
  candidateId: string;
  actorId: string;
  actorName: string;
  rationale: string;
  idempotencyKey: string;
}) {
  const organizationId = assertOrganizationId(input.organizationId);
  const source = await loadSource(organizationId, input.sourceId);
  const evidence = await listOrganizationalSourceEvidence(organizationId, source.id);
  if (evidence.length === 0) throw new MemoryFoundationError("INVALID_REQUEST", "Learning cannot be validated without source-linked evidence.");
  const candidateId = memoryString(input.candidateId, "candidateId", 160);
  if (candidateId !== getNeutralCandidateId(source.id)) {
    throw new MemoryFoundationError("CONFLICT", "The prepared learning candidate is not valid for the selected organizational source.");
  }
  const candidate = (await loadKnowledgeCandidates(organizationId)).find((item) => item.id === candidateId);
  if (!candidate || candidate.status !== "proposed") throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The prepared learning candidate was not found or was already reviewed.", 404);
  const content = asRecord(candidate.proposedContent);
  const title = memoryString(content.canonicalProblemTitle ?? neutralSourceMetadata(source).title ?? "Organizational learning", "canonicalProblemTitle", 500);
  const now = new Date().toISOString();
  const knowledgeId = `neutral-memory-${source.id}`;
  const versionId = `${knowledgeId}-v1`;
  const validationId = `neutral-validation-${candidate.id}`;
  const memoryChangeId = `neutral-memory-change-${candidate.id}`;
  const rationale = memoryString(input.rationale, "rationale", 4000);
  const actorName = memoryString(input.actorName, "actorName", 240);
  const sourceDescription = typeof neutralSourceMetadata(source).description === "string" ? String(neutralSourceMetadata(source).description) : title;
  const canonicalLearning = asRecord(content.canonicalLearning) as unknown as CanonicalLearning;
  const canonicalLesson = canonicalLearning && typeof canonicalLearning.lesson === "string"
    ? canonicalLearning
    : buildCanonicalLearning(source, evidence, title, sourceDescription);
  const item: KnowledgeItem = {
    id: knowledgeId,
    organizationId,
    revision: 0,
    title,
    problem: canonicalLesson.problem,
    approvedAnswer: canonicalLesson.lesson,
    category: typeof content.category === "string" ? content.category : source.sourceKind,
    tags: ["organizational-memory", source.sourceKind.toLowerCase()],
    sourceTicketId: source.id,
    timesReused: 0,
    createdAt: now,
    approvedAt: now,
    lifecycleState: "active",
    governanceState: "trusted",
    trustScore: 20,
    successRate: 100,
    autoResponseEligible: false,
    canonicalProblemId: `neutral-problem-${source.id}`,
    canonicalProblemTitle: title,
    problemSummary: canonicalLesson.problem,
    internalGuidance: canonicalLesson.solution,
    canonicalLearning: canonicalLesson,
    scopeNote: canonicalLesson.scope,
    resolutionWorkflow: evidence.map((entry) => entry.content ?? "").filter(Boolean),
    knowledgeVersions: [{ versionId, version: 1, createdAt: now, changeReason: "Initial human validation of organizational experience", sourceTicketId: source.id, summary: title }],
    lessons: Array.isArray(content.lessons) ? content.lessons as KnowledgeItem["lessons"] : [{
      id: `neutral-lesson-${source.id}`,
      title: canonicalLesson.title,
      rootCause: canonicalLesson.rootCause,
      solution: canonicalLesson.solution,
      customerResponse: "",
      signals: canonicalLesson.signals,
      whenToEscalate: canonicalLesson.whenToEscalate,
      doNotPromise: canonicalLesson.exclusions,
      createdAt: now,
      sourceTicketId: source.id
    }],
    validation: { validatedBy: actorName, validatedAt: now, validationBasis: rationale, validationScope: "Domain-neutral organizational experience", status: "validated" },
    provenance: { sourceTicketId: source.id, contributingTicketIds: [], createdBy: actorName, createdAt: now, validatedBy: actorName, validatedAt: now, validationBasis: rationale, validationScope: "Domain-neutral organizational experience" }
  };
  const validation = {
    id: validationId,
    organizationId,
    candidateId: candidate.id,
    knowledgeId,
    knowledgeVersionId: versionId,
    decision: "approved" as const,
    actor: actorName,
    roleExercised: "knowledge_validator" as const,
    rationale,
    timestamp: now
  };
  const memoryChange = {
    id: memoryChangeId,
    organizationId,
    knowledgeId,
    candidateId: candidate.id,
    validationRecordId: validationId,
    changeType: "create_new" as const,
    beforeState: null,
    afterState: item,
    timestamp: now
  };
  return commitValidation(organizationId, {
    candidate,
    validation,
    memoryChange,
    knowledgeItem: item,
    expectedKnowledgeRevision: null,
    idempotencyKey: memoryString(input.idempotencyKey, "idempotencyKey", 240),
    neutralContext: { sourceId: source.id, evidenceIds: evidence.map((entry) => entry.id) }
  }, { id: memoryString(input.actorId, "actorId", 160), name: actorName });
}

export async function listOrganizationalSourceEvidence(organizationId: string, sourceId: string): Promise<EvidenceRecordView[]> {
  const rows = await prisma.evidenceRecord.findMany({
    where: { organizationId, sourceId },
    orderBy: { createdAt: "asc" },
    take: 200
  });
  return rows.map(mapEvidence);
}

export async function loadOrganizationalMemoryInspection(organizationId: string, knowledgeItemId: string): Promise<OrganizationalMemoryInspection> {
  const id = assertOrganizationId(organizationId);
  const knowledgeItems = await loadKnowledge(id);
  const knowledgeItem = knowledgeItems.find((item) => item.id === memoryString(knowledgeItemId, "knowledgeItemId", 160));
  if (!knowledgeItem) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested knowledge item was not found in this organization.", 404);
  const sourceRow = await prisma.organizationalSource.findFirst({
    where: { organizationId: id, OR: [
      { id: knowledgeItem.sourceTicketId },
      { sourceSystem: "oip.support", sourceObjectType: "ticket", sourceObjectId: knowledgeItem.sourceTicketId }
    ] }
  });
  const [evidence, outcomes, challenges, history] = await Promise.all([
    listMemoryEvidence(id, knowledgeItem.id),
    listReuseOutcomes(id, knowledgeItem.id),
    listKnowledgeChallenges(id, knowledgeItem.id),
    loadKnowledgeHistory(id, knowledgeItem.id)
  ]);
  return {
    knowledgeItem,
    source: sourceRow ? mapSource(sourceRow) : null,
    evidence,
    outcomes,
    challenges,
    history
  };
}
