import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { ensureEvidenceTx, ensureSourceTx, MemoryFoundationError, memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { composeOrganizationalSkills } from "@/lib/server/skillService";
import { listAccessibleDomainIds } from "@/lib/server/domainAuthorization";
import { recordReuseOutcome } from "@/lib/server/organizationalMemoryService";
import type { ExecutionPackage as ExecutionPackageView, ExecutionSession as ExecutionSessionView, ExecutionOutcomeClassification, SkillCompositionResult } from "@/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapPackage(row: any): ExecutionPackageView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    requestedTask: row.requestedTask,
    status: row.status,
    packageVersion: row.packageVersion,
    payload: asRecord(row.payload),
    payloadDigest: row.payloadDigest,
    policy: asRecord(row.policy) as unknown as ExecutionPackageView["policy"],
    scope: asRecord(row.scope),
    riskLevel: row.riskLevel,
    humanReviewRequired: row.humanReviewRequired,
    createdBy: row.createdBy,
    idempotencyKey: row.idempotencyKey,
    requestId: row.requestId,
    correlationId: row.correlationId,
    expiresAt: iso(row.expiresAt),
    handedOffAt: iso(row.handedOffAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapSession(row: any): ExecutionSessionView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    packageId: row.packageId,
    status: row.status,
    executorType: row.executorType,
    externalCorrelationId: row.externalCorrelationId ?? null,
    resultPayload: row.resultPayload && typeof row.resultPayload === "object" ? asRecord(row.resultPayload) : null,
    resultReference: row.resultReference ?? null,
    resultDigest: row.resultDigest ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewDecision: row.reviewDecision ?? null,
    reviewNotes: row.reviewNotes ?? null,
    correctionPayload: row.correctionPayload && typeof row.correctionPayload === "object" ? asRecord(row.correctionPayload) : null,
    outcomeClassification: row.outcomeClassification ?? null,
    outcomeSourceId: row.outcomeSourceId ?? null,
    outcomeEvidenceId: row.outcomeEvidenceId ?? null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    receivedAt: iso(row.receivedAt),
    reviewedAt: iso(row.reviewedAt),
    updatedAt: row.updatedAt.toISOString()
  };
}

const SENSITIVE_KEYS = /(?:password|secret|token|credential|private.?key|api.?key)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested value omitted]";
  if (typeof value === "string") return value.length > 20000 ? `${value.slice(0, 20000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEYS.test(key)) continue;
      result[key] = sanitize(child, depth + 1);
    }
    return result;
  }
  return value;
}

function packageMemorySnapshot(row: any): Record<string, unknown> {
  const content = asRecord(row.content);
  return {
    id: row.id,
    title: row.title,
    domainId: row.domainId,
    revision: row.revision,
    lifecycleState: row.lifecycleState,
    governanceState: row.governanceState,
    scope: row.scope ?? null,
    problem: content.problem ?? null,
    approvedAnswer: content.approvedAnswer ?? content.solution ?? null,
    canonicalLearning: content.canonicalLearning ?? null,
    trustScore: row.trustScore ?? null,
    lastValidatedAt: row.lastValidatedAt?.toISOString?.() ?? null
  };
}

export async function createExecutionPackage(input: {
  organizationId: string;
  requestedTask: string;
  skillVersionIds: string[];
  createdBy: string;
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
}): Promise<ExecutionPackageView> {
  const requestedTask = memoryString(input.requestedTask, "requestedTask", 4000);
  const composition = await composeOrganizationalSkills({ organizationId: input.organizationId, skillVersionIds: input.skillVersionIds, requestedTask });
  if (composition.policy.mode === "ADVISORY") throw new MemoryFoundationError("CONFLICT", "Advisory Skills cannot produce an external execution package.");
  const skillRows = await prisma.organizationalSkillVersion.findMany({
    where: { organizationId: input.organizationId, id: { in: composition.skillVersionIds } },
    include: { skill: { include: { domain: true } }, memoryLinks: true }
  });
  const memoryIds = [...new Set(skillRows.flatMap((row) => row.memoryLinks.map((link) => link.knowledgeItemId)))];
  const memoryRows = memoryIds.length > 0 ? await prisma.knowledgeItem.findMany({ where: { organizationId: input.organizationId, id: { in: memoryIds } } }) : [];
  if (memoryRows.length !== memoryIds.length) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "A linked Memory item was not found in this organization.", 404);
  const evidenceRows = memoryIds.length > 0 ? await prisma.memoryEvidenceLink.findMany({ where: { organizationId: input.organizationId, knowledgeItemId: { in: memoryIds } }, include: { evidence: { include: { source: true } } }, orderBy: { createdAt: "asc" }, take: 200 }) : [];
  const payload = {
    packageVersion: 1,
    requestedTask,
    skills: skillRows.map((row) => ({ id: row.skillId, versionId: row.id, version: row.version, domainId: row.skill.domainId, name: row.skill.name, definition: sanitize(row.definition), fingerprint: row.fingerprint })),
    memory: memoryRows.map(packageMemorySnapshot),
    evidence: evidenceRows.map((link) => ({ id: link.evidence.id, memoryId: link.knowledgeItemId, relationship: link.relationship, evidenceType: link.evidence.evidenceType, sourceId: link.evidence.sourceId, sourceObjectType: link.evidence.source.sourceObjectType, sourceObjectId: link.evidence.source.sourceObjectId, reference: link.evidence.reference, occurredAt: link.evidence.occurredAt?.toISOString() ?? null })),
    requiredInputs: composition.inputs,
    capabilities: composition.policy.requiredCapabilities,
    tools: composition.policy.tools,
    permissions: composition.policy.permissions,
    scope: composition.policy.scope,
    riskLevel: composition.policy.riskLevel,
    policy: composition.policy,
    constraints: composition.constraints
  };
  const packageDigest = digest(payload);
  const existing = await prisma.executionPackage.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } } });
  if (existing) {
    if (existing.payloadDigest !== packageDigest) throw new MemoryFoundationError("CONFLICT", "The package idempotency key was already used for a different package.");
    return mapPackage(existing);
  }
  try {
    const row = await prisma.executionPackage.create({ data: { organizationId: input.organizationId, requestedTask, status: "PREPARED", packageVersion: 1, payload: json(payload), payloadDigest: packageDigest, policy: json(composition.policy), scope: json(composition.policy.scope), riskLevel: composition.policy.riskLevel, humanReviewRequired: composition.policy.humanReviewRequired, createdBy: input.createdBy, idempotencyKey: input.idempotencyKey, requestId: input.requestId, correlationId: input.correlationId } });
    return mapPackage(row);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const replay = await prisma.executionPackage.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } } });
      if (replay && replay.payloadDigest === packageDigest) return mapPackage(replay);
    }
    throw error;
  }
}

export async function getExecutionPackage(organizationId: string, packageId: string): Promise<ExecutionPackageView> {
  const row = await prisma.executionPackage.findUnique({ where: { id: memoryString(packageId, "packageId", 160) } });
  if (!row || row.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested execution package was not found in this organization.", 404);
  return mapPackage(row);
}

function packageDomainIds(packageView: ExecutionPackageView): string[] {
  const skills = Array.isArray(packageView.payload.skills) ? packageView.payload.skills : [];
  return [...new Set(skills.map((skill) => {
    const item = asRecord(skill);
    return typeof item.domainId === "string" ? item.domainId : null;
  }).filter((value): value is string => Boolean(value)))];
}

export async function assertExecutionPackageAccess(input: {
  organizationId: string;
  packageId: string;
  userId: string;
  capability: string;
}): Promise<ExecutionPackageView> {
  const packageView = await getExecutionPackage(input.organizationId, input.packageId);
  const accessible = await listAccessibleDomainIds({ organizationId: input.organizationId, userId: input.userId, capability: input.capability });
  const domains = packageDomainIds(packageView);
  if (domains.length === 0 || domains.some((domainId) => !accessible.includes(domainId))) {
    throw new MemoryFoundationError("FORBIDDEN", "The requested execution package is not available.", 403);
  }
  return packageView;
}

export async function listExecutionPackages(input: { organizationId: string; accessibleDomainIds: string[] }): Promise<ExecutionPackageView[]> {
  const rows = await prisma.executionPackage.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map(mapPackage).filter((packageView) => {
    const domains = packageDomainIds(packageView);
    return domains.length > 0 && domains.every((domainId) => input.accessibleDomainIds.includes(domainId));
  });
}

export async function receiveExecutionResult(input: {
  organizationId: string;
  packageId: string;
  executorType: string;
  resultPayload?: unknown;
  resultReference?: string | null;
  externalCorrelationId?: string | null;
  idempotencyKey: string;
}): Promise<ExecutionSessionView> {
  const pkg = await getExecutionPackage(input.organizationId, input.packageId);
  const sanitized = input.resultPayload === undefined ? null : sanitize(input.resultPayload);
  const resultDigest = digest({ packageDigest: pkg.payloadDigest, result: sanitized, reference: input.resultReference ?? null });
  const existing = await prisma.executionSession.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } } });
  if (existing) {
    if (existing.resultDigest !== resultDigest) throw new MemoryFoundationError("CONFLICT", "The result idempotency key was already used for a different result.");
    return mapSession(existing);
  }
  if (pkg.status === "EXPIRED" || pkg.status === "CANCELLED") throw new MemoryFoundationError("CONFLICT", "This execution package is no longer available for result intake.");
  const row = await prisma.$transaction(async (tx) => {
    const session = await tx.executionSession.create({ data: { organizationId: input.organizationId, packageId: pkg.id, status: "RESULT_RECEIVED", executorType: memoryString(input.executorType, "executorType", 120), externalCorrelationId: input.externalCorrelationId?.trim().slice(0, 240) || null, resultPayload: sanitized === null ? undefined : json(sanitized), resultReference: input.resultReference?.trim().slice(0, 1000) || null, resultDigest, idempotencyKey: input.idempotencyKey, receivedAt: new Date() } });
    await tx.executionPackage.update({ where: { id: pkg.id }, data: { status: "RESULT_RECEIVED" } });
    return session;
  });
  return mapSession(row);
}

export async function getExecutionSession(organizationId: string, sessionId: string): Promise<ExecutionSessionView> {
  const row = await prisma.executionSession.findUnique({ where: { id: memoryString(sessionId, "sessionId", 160) } });
  if (!row || row.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested execution session was not found in this organization.", 404);
  return mapSession(row);
}

export async function reviewExecutionSession(input: {
  organizationId: string;
  sessionId: string;
  reviewerId: string;
  decision: "ACCEPTED" | "CORRECTED" | "REJECTED" | "UNRESOLVED";
  outcomeClassification: ExecutionOutcomeClassification;
  notes: string;
  correction?: unknown;
  idempotencyKey: string;
}): Promise<{ session: ExecutionSessionView; candidateId: string | null; challengeId: string | null }> {
  const session = await getExecutionSession(input.organizationId, input.sessionId);
  const candidateId = input.outcomeClassification === "CORRECTION" || input.outcomeClassification === "NEW_LESSON" ? `execution-candidate-${session.id}` : null;
  const challengeId = input.outcomeClassification === "CHALLENGE" || input.outcomeClassification === "SCOPE_CHANGE" ? `execution-challenge-${session.id}` : null;
  if (session.status !== "RESULT_RECEIVED" && session.status !== "HUMAN_REVIEW") {
    const replaySource = await prisma.organizationalSource.findUnique({ where: { organizationId_sourceSystem_sourceObjectType_sourceObjectId: { organizationId: input.organizationId, sourceSystem: "oip.execution", sourceObjectType: "execution_session", sourceObjectId: session.id } }, select: { id: true } });
    const replayEvidence = replaySource ? await prisma.evidenceRecord.findUnique({ where: { organizationId_sourceId_idempotencyKey: { organizationId: input.organizationId, sourceId: replaySource.id, idempotencyKey: `execution-review:${session.id}:${input.idempotencyKey}` } }, select: { id: true } }) : null;
    if (replayEvidence) return { session, candidateId, challengeId };
    throw new MemoryFoundationError("CONFLICT", "Only a received execution result can be reviewed.");
  }
  const pkg = await getExecutionPackage(input.organizationId, session.packageId);
  const payload = asRecord(pkg.payload);
  const memory = Array.isArray(payload.memory) ? payload.memory[0] as Record<string, unknown> | undefined : undefined;
  const memoryId = typeof memory?.id === "string" ? memory.id : null;
  const domainId = typeof memory?.domainId === "string" ? memory.domainId : null;
  const sanitizedCorrection = input.correction === undefined ? null : sanitize(input.correction);
  const resultContent = session.resultPayload ? JSON.stringify(session.resultPayload).slice(0, 12000) : session.resultReference ?? "External executor returned no inline result.";
  const evidenceIdempotency = `execution-result:${session.id}`;
  const reviewEvidenceIdempotency = `execution-review:${session.id}:${input.idempotencyKey}`;
  if (input.outcomeClassification === "REINFORCEMENT" && memoryId && typeof memory?.revision === "number") {
    await recordReuseOutcome({
      organizationId: input.organizationId,
      knowledgeItemId: memoryId,
      knowledgeVersionId: typeof memory.versionId === "string" ? memory.versionId : null,
      source: { sourceKind: "EXECUTION_OUTCOME", domainId, sourceSystem: "oip.execution", sourceObjectType: "execution_session", sourceObjectId: session.id, actorId: input.reviewerId, scope: pkg.scope as unknown as Prisma.InputJsonValue, metadata: { packageId: pkg.id, packageDigest: pkg.payloadDigest, executorType: session.executorType, outcomeClassification: input.outcomeClassification } },
      evidence: { evidenceType: "execution_result", evidenceRole: "observed_outcome", actorId: input.reviewerId, content: resultContent, reference: session.resultReference, idempotencyKey: evidenceIdempotency, metadata: { packageDigest: pkg.payloadDigest, resultDigest: session.resultDigest } },
      actorId: input.reviewerId,
      reuseMode: "human",
      classification: "SUCCESS",
      requiredEdits: false,
      expectedKnowledgeRevision: memory.revision,
      idempotencyKey: `execution-reuse:${session.id}`
    });
  }
  const row = await prisma.$transaction(async (tx) => {
    const source = await ensureSourceTx(tx, input.organizationId, { sourceKind: "EXECUTION_OUTCOME", domainId, sourceSystem: "oip.execution", sourceObjectType: "execution_session", sourceObjectId: session.id, actorId: input.reviewerId, scope: pkg.scope as unknown as Prisma.InputJsonValue, metadata: { packageId: pkg.id, packageDigest: pkg.payloadDigest, executorType: session.executorType, outcomeClassification: input.outcomeClassification } });
    const evidence = await ensureEvidenceTx(tx, input.organizationId, source.id, { evidenceType: "execution_result", evidenceRole: "observed_outcome", actorId: session.reviewedBy ?? input.reviewerId, content: resultContent, reference: session.resultReference, idempotencyKey: evidenceIdempotency, metadata: { packageDigest: pkg.payloadDigest, resultDigest: session.resultDigest } });
    await ensureEvidenceTx(tx, input.organizationId, source.id, { evidenceType: "human_review", evidenceRole: "review_decision", actorId: input.reviewerId, content: input.notes, idempotencyKey: reviewEvidenceIdempotency, metadata: { decision: input.decision, outcomeClassification: input.outcomeClassification } });
    if (candidateId && memoryId) {
      const current = await tx.knowledgeItem.findUnique({ where: { id: memoryId }, select: { organizationId: true, title: true, revision: true, domainId: true, content: true } });
      if (!current || current.organizationId !== input.organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The execution Memory target was not found in this organization.", 404);
      const currentContent = asRecord(current.content);
      const candidateContent: Record<string, unknown> = {
        solution: input.notes,
        customerResponseTemplate: "Review the corrected execution result before reuse.",
        internalGuidance: input.notes,
        category: "EXECUTION_OUTCOME",
        canonicalProblemTitle: current.title
      };
      if (currentContent.canonicalLearning !== undefined) candidateContent.canonicalLearning = currentContent.canonicalLearning;
      await tx.knowledgeCandidate.upsert({
        where: { id: candidateId },
        create: { id: candidateId, organizationId: input.organizationId, relatedKnowledgeId: memoryId, domainId: current.domainId ?? domainId, sourceId: source.id, sourceTicketIds: [], proposedAction: input.outcomeClassification === "NEW_LESSON" ? "create_new" : "create_version", proposedContent: json(candidateContent), rationale: `Human review of external execution result ${session.id}. Further validation is required.`, status: "proposed", createdAt: new Date() },
        update: {}
      });
    }
    if (challengeId && memoryId) {
      await tx.knowledgeChallenge.upsert({
        where: { id: challengeId },
        create: { id: challengeId, organizationId: input.organizationId, knowledgeItemId: memoryId, knowledgeVersionId: typeof memory?.versionId === "string" ? memory.versionId : null, sourceId: source.id, evidenceId: evidence.id, openedBy: input.reviewerId, rationale: input.notes, state: "OPEN", idempotencyKey: `execution-challenge:${session.id}` },
        update: {}
      });
    }
    return tx.executionSession.update({ where: { id: session.id }, data: { status: input.decision, reviewedBy: input.reviewerId, reviewDecision: input.decision, reviewNotes: input.notes.slice(0, 8000), correctionPayload: sanitizedCorrection === null ? undefined : json(sanitizedCorrection), outcomeClassification: input.outcomeClassification, outcomeSourceId: source.id, outcomeEvidenceId: evidence.id, reviewedAt: new Date() } });
  });
  return { session: mapSession(row), candidateId, challengeId };
}
