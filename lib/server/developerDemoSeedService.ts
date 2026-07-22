import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/server/prisma";
import { stableStringify } from "@/lib/persistence/migrationExportDigest";
import { parseTicketId } from "@/lib/ticketIdFormat";
import {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  PROTECTED_ORGANIZATION_IDS,
  developerDemoActors
} from "@/data/developerDemoFoundation";
import { simulateDeveloperDemo } from "@/lib/developerDemo/simulator";
import type {
  DeveloperDemoSimulation,
  SimulatedMemoryChangeRecord,
  SimulatedPattern,
  SimulatedTicketRecord,
  SimulatedValidationRecord,
  TrustEvidenceIntent
} from "@/lib/developerDemo/types";
import type { KnowledgeCandidate, KnowledgeItem, OrgMetrics } from "@/types";

/**
 * TODO-025D — create-only persistence of the deterministic TODO-025C developer
 * demo dataset into PostgreSQL for the single organization
 * `profile-oip-developer-demo`.
 *
 * SAFETY MODEL
 *  - Server-only module. It is imported by the seed command and the TODO-025D
 *    probe, never by any API route, so there is no HTTP surface through which a
 *    client could reach it. That structural isolation is the primary protection
 *    against actor-identity spoofing: unlike normal validation commits (whose
 *    actor is derived from the authenticated session), this path writes the
 *    historical `actorId` from the trusted deterministic simulator, and it can
 *    only be invoked from a developer machine that already holds DATABASE_URL.
 *  - An exact-organization guard refuses every id except the developer demo and
 *    hard-refuses the protected mature organizations.
 *  - Every historical actorId is validated against the eight synthetic demo
 *    members before any write.
 *  - CREATE-ONLY: if any mature row already exists the runner makes zero writes
 *    and reports ALREADY_SEEDED (fully seeded) or CREATE_ONLY_ABORT (partial).
 *  - The whole dataset is written inside ONE transaction, so an injected or
 *    incidental failure rolls everything back — the organization can never be
 *    left partially mature.
 *
 * The migration import pipeline is intentionally NOT reused here: it hardcodes
 * `actorId: null` and its verifier re-derives the same null, so it cannot carry
 * historical actor attribution, and TrustEvidence is not part of the migration
 * format at all.
 */

const EXACT_TARGET = DEVELOPER_DEMO_ORGANIZATION_ID;
const CHUNK_SIZE = 500;
const TX_TIMEOUT_MS = 300_000;
const TX_MAX_WAIT_MS = 60_000;

const EXPECTED = {
  knowledgeItems: 45,
  lessons: 180,
  tickets: 5_000,
  candidates: 1_800,
  validations: 1_800,
  memoryChangeRecords: 1_800,
  trustEvidence: 4_500,
  knowledgeVersions: 130,
  actors: 8,
  ticketSequence: 5_000
} as const;

export type MatureSeedOutcome = "SEEDED" | "ALREADY_SEEDED" | "CREATE_ONLY_ABORT";

export interface MatureSeedResult {
  outcome: MatureSeedOutcome;
  organizationId: string;
  seed: string;
  simulationDigest: string;
  writesPerformed: boolean;
  counts: Record<string, number>;
  historyRange?: { start: string; end: string };
  ticketSequence?: number;
  nextTicketSequence?: number;
  heroArc?: { arcId: string; title: string; finalTrust: number; lessons: number; versions: number; validations: number };
  verification?: Record<string, string>;
  message?: string;
}

export class DeveloperDemoSeedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DeveloperDemoSeedError";
  }
}

function assertExactTarget(organizationId: string): void {
  if (organizationId !== EXACT_TARGET || (PROTECTED_ORGANIZATION_IDS as readonly string[]).includes(organizationId)) {
    throw new DeveloperDemoSeedError("REFUSED_TARGET", `Refusing developer-demo mature seed operation for ${String(organizationId)}.`);
  }
}

/* --------------------------- column mappings --------------------------- */
/* These mirror the proven migrationImportExecutionService projections that the
 * app's mapKnowledge/mapTicket/... reads reconstruct, extended to preserve the
 * historical actorId that the migration path cannot carry. */

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function knowledgeContent(item: KnowledgeItem): Prisma.InputJsonValue {
  return jsonValue({
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

function knowledgeRow(item: KnowledgeItem): Prisma.KnowledgeItemCreateManyInput {
  const createdAt = new Date(item.createdAt);
  return {
    id: item.id,
    organizationId: EXACT_TARGET,
    title: item.title,
    category: item.category,
    canonicalProblemId: item.canonicalProblemId ?? null,
    canonicalProblemTitle: item.canonicalProblemTitle ?? null,
    lifecycleState: (item.lifecycleState ?? "active"),
    sourceTicketId: item.sourceTicketId,
    timesReused: item.timesReused ?? 0,
    timesSeen: item.timesSeen ?? null,
    successfulResolutions: item.successfulResolutions ?? null,
    failedResolutions: item.failedResolutions ?? null,
    successRate: item.successRate ?? null,
    trustScore: item.trustScore ?? null,
    autoResponseEligible: item.autoResponseEligible ?? null,
    humanReviewCount: item.humanReviewCount ?? null,
    automaticResolutionCount: item.automaticResolutionCount ?? null,
    createdAt,
    approvedAt: item.approvedAt ? new Date(item.approvedAt) : createdAt,
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
    lastValidatedAt: item.lastValidatedAt ? new Date(item.lastValidatedAt) : null,
    lastUpdatedAt: item.lastUpdated ? new Date(item.lastUpdated) : null,
    lastValidated: item.lastValidated ? new Date(item.lastValidated) : null,
    revision: item.revision ?? 1,
    content: knowledgeContent(item)
  };
}

function candidateRow(candidate: KnowledgeCandidate): Prisma.KnowledgeCandidateCreateManyInput {
  return {
    id: candidate.id,
    organizationId: EXACT_TARGET,
    relatedKnowledgeId: candidate.relatedKnowledgeId ?? null,
    sourceTicketIds: jsonValue(candidate.sourceTicketIds ?? []),
    proposedAction: candidate.proposedAction,
    proposedContent: jsonValue(candidate.proposedContent ?? {}),
    rationale: candidate.rationale,
    status: candidate.status,
    createdAt: new Date(candidate.createdAt)
  };
}

function validationRow(validation: SimulatedValidationRecord): Prisma.ValidationRecordCreateManyInput {
  return {
    id: validation.id,
    organizationId: EXACT_TARGET,
    candidateId: validation.candidateId,
    knowledgeItemId: validation.knowledgeId ?? null,
    knowledgeVersionId: validation.knowledgeVersionId ?? null,
    decision: validation.decision,
    actor: validation.actor,
    // Historical actor identity from the trusted deterministic simulator.
    actorId: validation.actorId,
    roleExercised: validation.roleExercised ?? "knowledge_validator",
    rationale: validation.rationale ?? null,
    timestamp: new Date(validation.timestamp)
  };
}

function memoryRow(record: SimulatedMemoryChangeRecord): Prisma.MemoryChangeRecordCreateManyInput {
  return {
    id: record.id,
    organizationId: EXACT_TARGET,
    knowledgeItemId: record.knowledgeId,
    candidateId: record.candidateId,
    validationRecordId: record.validationRecordId,
    actorId: record.actorId,
    changeType: record.changeType,
    beforeState: record.beforeState === null || record.beforeState === undefined
      ? Prisma.DbNull
      : jsonValue(record.beforeState),
    afterState: jsonValue(record.afterState),
    timestamp: new Date(record.timestamp)
  };
}

function ticketRow(ticket: SimulatedTicketRecord): Prisma.TicketRecordCreateManyInput {
  return {
    id: ticket.ticketId,
    organizationId: EXACT_TARGET,
    ticketId: ticket.ticketId,
    rawMessage: ticket.rawMessage,
    subject: ticket.subject ?? null,
    status: ticket.status,
    draftSource: ticket.draftSource ?? null,
    classification: ticket.classification === null ? Prisma.DbNull : jsonValue(ticket.classification),
    memoryMatch: ticket.memoryMatch === null ? Prisma.DbNull : jsonValue(ticket.memoryMatch),
    resolution: jsonValue(ticket.resolution ?? {}),
    reflection: jsonValue(ticket.reflection ?? {}),
    validationRecordIds: jsonValue(ticket.validationRecordIds ?? []),
    actorId: ticket.actorId,
    // TODO-026: persist the simulator's deterministic resolution mode so a fresh
    // reseed makes the auto-vs-human split durably reconstructable.
    resolutionMode: ticket.resolutionMode === "human" || ticket.resolutionMode === "automatic" ? ticket.resolutionMode : null,
    createdAt: new Date(ticket.createdAt)
  };
}

function patternRow(pattern: SimulatedPattern): Prisma.EmergingPatternCreateManyInput {
  return {
    id: pattern.id,
    organizationId: EXACT_TARGET,
    title: pattern.title,
    summary: `Recurring ${pattern.category} tickets consolidated into canonical knowledge.`,
    category: pattern.category,
    status: "promoted",
    tags: jsonValue([]),
    keywords: jsonValue([]),
    exampleTickets: jsonValue(pattern.sourceTicketIds),
    timesSeen: pattern.sourceTicketIds.length,
    confidenceScore: 1,
    suggestedCanonicalProblem: true,
    firstSeenAt: new Date(pattern.firstSeenAt),
    lastSeenAt: new Date(pattern.promotedAt)
  };
}

function trustEvidenceRow(intent: TrustEvidenceIntent): Prisma.TrustEvidenceCreateManyInput {
  // TrustEvidence has no actorId column; historical attribution for a reuse
  // event is preserved through validationRecordId -> ValidationRecord.actorId.
  return {
    id: intent.id,
    organizationId: EXACT_TARGET,
    knowledgeItemId: intent.knowledgeItemId,
    sourceTicketId: intent.sourceTicketId,
    trustEventType: intent.trustEventType,
    validationRecordId: intent.validationRecordId,
    delta: intent.delta,
    createdAt: new Date(intent.createdAt)
  };
}

function metricsUpdate(metrics: OrgMetrics): Prisma.OrgMetricsUncheckedUpdateInput {
  return {
    lifetimeTickets: metrics.lifetimeTickets,
    knowledgeReused: metrics.knowledgeReused,
    autoResolutions: metrics.autoResolutions,
    humanResolutions: metrics.humanResolutions,
    totalResolutionTimeSec: metrics.totalResolutionTimeSec,
    resolutionsCount: metrics.resolutionsCount,
    memoryGrowthToday: metrics.memoryGrowthToday,
    memoryGrowthDate: metrics.memoryGrowthDate,
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
    lastUpdatedAt: new Date(metrics.lastUpdatedAt)
  };
}

/* ----------------------------- utilities ----------------------------- */

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

type PrismaClientLike = ReturnType<typeof getPrismaClient>;
type TxClient = Parameters<Parameters<PrismaClientLike["$transaction"]>[0]>[0];

const MATURE_MODELS = [
  "knowledgeItem",
  "knowledgeCandidate",
  "validationRecord",
  "memoryChangeRecord",
  "ticketRecord",
  "trustEvidence",
  "emergingPattern"
] as const;

async function matureCounts(prisma: PrismaClientLike): Promise<Record<string, number>> {
  const where = { organizationId: EXACT_TARGET };
  const counts: Record<string, number> = {};
  for (const model of MATURE_MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    counts[model] = await (prisma as any)[model].count({ where });
  }
  return counts;
}

interface Preconditions {
  organizationId: string;
  syntheticActorIds: Set<string>;
}

async function assertPreconditions(prisma: PrismaClientLike): Promise<Preconditions> {
  const organization = await prisma.organization.findUnique({ where: { id: EXACT_TARGET } });
  if (!organization) {
    throw new DeveloperDemoSeedError("FOUNDATION_MISSING", "The developer-demo foundation organization does not exist. Run seed:developer-demo-foundation first.");
  }
  const authority = await prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId: EXACT_TARGET } });
  if (authority?.authority !== "server") {
    throw new DeveloperDemoSeedError("NOT_SERVER_AUTHORITATIVE", "The developer-demo organization is not server-authoritative.");
  }
  const actors = await prisma.user.findMany({
    where: { id: { in: developerDemoActors.map((actor) => actor.id) } },
    select: { id: true }
  });
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: EXACT_TARGET, userId: { in: developerDemoActors.map((actor) => actor.id) } },
    select: { userId: true }
  });
  const actorIds = new Set(actors.map((actor) => actor.id));
  const memberIds = new Set(memberships.map((membership) => membership.userId));
  for (const actor of developerDemoActors) {
    if (!actorIds.has(actor.id)) throw new DeveloperDemoSeedError("ACTOR_MISSING", `Synthetic actor ${actor.id} is missing.`);
    if (!memberIds.has(actor.id)) throw new DeveloperDemoSeedError("MEMBERSHIP_MISSING", `Synthetic actor ${actor.id} is not a member of the developer demo.`);
  }
  return { organizationId: EXACT_TARGET, syntheticActorIds: actorIds };
}

function assertActorsResolve(simulation: DeveloperDemoSimulation, syntheticActorIds: Set<string>): void {
  const referenced = new Set<string>();
  for (const ticket of simulation.resources.tickets) referenced.add(ticket.actorId);
  for (const validation of simulation.resources.validations) referenced.add(validation.actorId);
  for (const memory of simulation.resources.memoryChanges) referenced.add(memory.actorId);
  for (const actorId of referenced) {
    if (!syntheticActorIds.has(actorId)) {
      throw new DeveloperDemoSeedError("UNRESOLVED_ACTOR", `Historical dataset references unknown actor ${actorId}.`);
    }
  }
}

/* --------------------------- persistence --------------------------- */

async function persistDataset(prisma: PrismaClientLike, simulation: DeveloperDemoSimulation): Promise<void> {
  const resources = simulation.resources;
  await prisma.$transaction(async (tx: TxClient) => {
    // Re-check emptiness inside the transaction to close any race with a
    // concurrent seed: a create-only run must never upsert over mature data.
    for (const model of MATURE_MODELS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (tx as any)[model].count({ where: { organizationId: EXACT_TARGET } });
      if (existing > 0) {
        throw new DeveloperDemoSeedError("CREATE_ONLY_RACE", `Mature ${model} rows already exist; aborting create-only seed.`);
      }
    }

    // Dependency-friendly order (also correct if a future FK is added). Because
    // this is a single transaction, any failure rolls the whole set back.
    for (const batch of chunk(resources.knowledgeItems.map(knowledgeRow), CHUNK_SIZE)) {
      await tx.knowledgeItem.createMany({ data: batch });
    }
    for (const batch of chunk(resources.candidates.map(candidateRow), CHUNK_SIZE)) {
      await tx.knowledgeCandidate.createMany({ data: batch });
    }
    for (const batch of chunk(resources.validations.map(validationRow), CHUNK_SIZE)) {
      await tx.validationRecord.createMany({ data: batch });
    }
    for (const batch of chunk(resources.tickets.map(ticketRow), CHUNK_SIZE)) {
      await tx.ticketRecord.createMany({ data: batch });
    }
    for (const batch of chunk(resources.memoryChanges.map(memoryRow), CHUNK_SIZE)) {
      await tx.memoryChangeRecord.createMany({ data: batch });
    }
    for (const batch of chunk(resources.patterns.map(patternRow), CHUNK_SIZE)) {
      await tx.emergingPattern.createMany({ data: batch });
    }
    for (const batch of chunk(resources.trustEvidenceIntents.map(trustEvidenceRow), CHUNK_SIZE)) {
      await tx.trustEvidence.createMany({ data: batch });
    }

    // Final data validity markers, written last and inside the same transaction.
    await tx.orgMetrics.update({
      where: { organizationId: EXACT_TARGET },
      data: metricsUpdate(resources.metrics)
    });
    await tx.ticketSequence.update({
      where: { organizationId: EXACT_TARGET },
      data: { counter: resources.ticketSequence.counter }
    });

    if (process.env.DEVELOPER_DEMO_SEED_FAILURE_INJECTION === "after-write") {
      throw new DeveloperDemoSeedError("INJECTED_FAILURE", "Injected failure after writes but before commit.");
    }
  }, { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS });
}

/* --------------------------- verification --------------------------- */

function normalizeKnowledge(item: KnowledgeItem): unknown {
  // Compare the durable, meaning-bearing shape. `revision` is a persistence
  // concern (undefined in the simulator, 1 once stored) and is excluded.
  const clone = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete clone.revision;
  return clone;
}

async function verifyPersisted(
  prisma: PrismaClientLike,
  simulation: DeveloperDemoSimulation
): Promise<Record<string, string>> {
  const resources = simulation.resources;
  const where = { organizationId: EXACT_TARGET };
  const checks: Record<string, string> = {};
  const failures: string[] = [];
  const record = (name: string, ok: boolean, detail = "") => {
    checks[name] = ok ? "PASS" : `FAIL${detail ? ` (${detail})` : ""}`;
    if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  };

  const [
    knowledgeRows, candidateRows, validationRows, memoryRows, ticketRows, evidenceRows, patternRows, metricsRow, sequenceRow
  ] = await Promise.all([
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { ticketId: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId: EXACT_TARGET } }),
    prisma.ticketSequence.findUnique({ where: { organizationId: EXACT_TARGET } })
  ]);

  const lessons = knowledgeRows.reduce((total, row) => {
    const content = (row.content ?? {}) as { lessons?: unknown[] };
    return total + (Array.isArray(content.lessons) ? content.lessons.length : 0);
  }, 0);
  const versions = knowledgeRows.reduce((total, row) => {
    const content = (row.content ?? {}) as { knowledgeVersions?: unknown[] };
    return total + (Array.isArray(content.knowledgeVersions) ? content.knowledgeVersions.length : 0);
  }, 0);

  record("count.knowledgeItems", knowledgeRows.length === EXPECTED.knowledgeItems, `${knowledgeRows.length}/${EXPECTED.knowledgeItems}`);
  record("count.lessons", lessons === EXPECTED.lessons, `${lessons}/${EXPECTED.lessons}`);
  record("count.knowledgeVersions", versions === EXPECTED.knowledgeVersions, `${versions}/${EXPECTED.knowledgeVersions}`);
  record("count.candidates", candidateRows.length === EXPECTED.candidates, `${candidateRows.length}/${EXPECTED.candidates}`);
  record("count.validations", validationRows.length === EXPECTED.validations, `${validationRows.length}/${EXPECTED.validations}`);
  record("count.memoryChangeRecords", memoryRows.length === EXPECTED.memoryChangeRecords, `${memoryRows.length}/${EXPECTED.memoryChangeRecords}`);
  record("count.tickets", ticketRows.length === EXPECTED.tickets, `${ticketRows.length}/${EXPECTED.tickets}`);
  record("count.trustEvidence", evidenceRows.length === EXPECTED.trustEvidence, `${evidenceRows.length}/${EXPECTED.trustEvidence}`);
  record("count.patterns", patternRows.length === resources.patterns.length, `${patternRows.length}/${resources.patterns.length}`);

  // Knowledge faithfulness (trust, lessons, versions, provenance, counters).
  const reloadedKnowledge = knowledgeRows.map((row) => mapKnowledgeRow(row));
  const expectedKnowledgeDigest = digest(resources.knowledgeItems.map(normalizeKnowledge));
  const actualKnowledgeDigest = digest(reloadedKnowledge.map(normalizeKnowledge));
  record("faithful.knowledge", expectedKnowledgeDigest === actualKnowledgeDigest);

  // Validation faithfulness INCLUDING historical actorId.
  record(
    "faithful.validations.withActorId",
    digest(resources.validations.map(expectedValidation)) === digest(validationRows.map(actualValidation))
  );
  record(
    "faithful.memoryChanges.withActorId",
    digest(resources.memoryChanges.map(expectedMemory)) === digest(memoryRows.map(actualMemory))
  );
  record(
    "faithful.tickets.withActorId",
    digest(resources.tickets.map(expectedTicket)) === digest(ticketRows.map(actualTicket))
  );
  // TODO-026 forward-compatible: a persisted resolutionMode must equal the
  // simulator's mode; null rows (a pre-TODO-026 seed, or genuinely unresolved
  // tickets) are accepted as unknown and never forced to match.
  const simTicketMode = new Map(resources.tickets.map((t) => [t.ticketId, t.resolutionMode ?? null]));
  const modeMismatch = ticketRows.filter((row) => row.resolutionMode !== null && row.resolutionMode !== simTicketMode.get(row.ticketId)).length;
  const nullModeRows = ticketRows.filter((row) => row.resolutionMode === null).length;
  record("faithful.tickets.resolutionMode", modeMismatch === 0, `mismatch=${modeMismatch}, nullMode=${nullModeRows}`);
  record(
    "faithful.candidates",
    digest(resources.candidates.map(expectedCandidate)) === digest(candidateRows.map(actualCandidate))
  );
  record(
    "faithful.trustEvidence",
    digest(resources.trustEvidenceIntents.map(expectedEvidence)) === digest(evidenceRows.map(actualEvidence))
  );

  // Actor integrity.
  const usedActors = new Set<string>();
  for (const row of validationRows) if (row.actorId) usedActors.add(row.actorId);
  for (const row of memoryRows) if (row.actorId) usedActors.add(row.actorId);
  for (const row of ticketRows) if (row.actorId) usedActors.add(row.actorId);
  const validActorIds = new Set(developerDemoActors.map((actor) => actor.id));
  const allActorsValid = [...usedActors].every((actorId) => validActorIds.has(actorId));
  record("actor.distinctCount", usedActors.size === EXPECTED.actors, `${usedActors.size}/${EXPECTED.actors}`);
  record("actor.allResolve", allActorsValid);
  record("actor.noNullValidationActor", validationRows.every((row) => Boolean(row.actorId)));
  record("actor.noNullMemoryActor", memoryRows.every((row) => Boolean(row.actorId)));

  // Referential integrity (no orphans / no cross-org).
  const candidateIds = new Set(candidateRows.map((row) => row.id));
  const validationIds = new Set(validationRows.map((row) => row.id));
  const knowledgeIds = new Set(knowledgeRows.map((row) => row.id));
  const ticketIds = new Set(ticketRows.map((row) => row.ticketId));
  record("ref.validationsHaveCandidate", validationRows.every((row) => candidateIds.has(row.candidateId)));
  record("ref.memoryHasValidation", memoryRows.every((row) => validationIds.has(row.validationRecordId)));
  record("ref.memoryHasCandidate", memoryRows.every((row) => candidateIds.has(row.candidateId)));
  record("ref.memoryHasKnowledge", memoryRows.every((row) => knowledgeIds.has(row.knowledgeItemId)));
  record("ref.evidenceHasValidation", evidenceRows.every((row) => validationIds.has(row.validationRecordId)));
  record("ref.evidenceHasKnowledge", evidenceRows.every((row) => knowledgeIds.has(row.knowledgeItemId)));
  record("ref.evidenceHasTicket", evidenceRows.every((row) => ticketIds.has(row.sourceTicketId)));
  record("ref.knowledgeHasSourceTicket", knowledgeRows.every((row) => ticketIds.has(row.sourceTicketId)));

  const crossOrg =
    knowledgeRows.every((row) => row.organizationId === EXACT_TARGET) &&
    validationRows.every((row) => row.organizationId === EXACT_TARGET) &&
    memoryRows.every((row) => row.organizationId === EXACT_TARGET) &&
    ticketRows.every((row) => row.organizationId === EXACT_TARGET) &&
    evidenceRows.every((row) => row.organizationId === EXACT_TARGET);
  record("isolation.allDemoOwned", crossOrg);

  // TrustEvidence uniqueness (unique key upheld).
  const evidenceKeys = new Set(evidenceRows.map((row) => `${row.organizationId}|${row.knowledgeItemId}|${row.sourceTicketId}|${row.trustEventType}`));
  record("evidence.uniqueKeys", evidenceKeys.size === evidenceRows.length);

  // Metrics + sequence.
  record("metrics.match", Boolean(metricsRow) && digest(actualMetrics(metricsRow!)) === digest(expectedMetrics(resources.metrics)));
  record("sequence.counter", sequenceRow?.counter === EXPECTED.ticketSequence, `${sequenceRow?.counter}/${EXPECTED.ticketSequence}`);

  // Next-ticket collision safety.
  const highestSequence = ticketRows.reduce((max, row) => Math.max(max, parseTicketId(row.ticketId)?.sequenceNumber ?? 0), 0);
  record("nextTicket.noCollision", (sequenceRow?.counter ?? 0) >= highestSequence && highestSequence === EXPECTED.tickets, `highest=${highestSequence}`);

  // Timestamp span (multi-year).
  const createdTimes = ticketRows.map((row) => row.createdAt.getTime());
  const minTime = Math.min(...createdTimes);
  const maxTime = Math.max(...createdTimes);
  const spanYears = (maxTime - minTime) / (1000 * 60 * 60 * 24 * 365);
  record("history.multiYearSpan", spanYears >= 3, `${spanYears.toFixed(2)}y`);
  record("history.startsIn2023", new Date(minTime).toISOString().slice(0, 4) === "2023");

  // HERO arc survives with lifecycle/provenance. representativeHeroArc.arcId is
  // the narrative arc id; its persisted knowledge item is the arc's canonical id.
  const hero = simulation.representativeHeroArc;
  const heroArc = simulation.arcs.find((arc) => arc.arcClass === "HERO" && arc.id === hero.arcId) ?? simulation.arcs.find((arc) => arc.id === hero.arcId);
  const heroKnowledgeId = heroArc?.canonical.id;
  const heroRow = knowledgeRows.find((row) => row.id === heroKnowledgeId);
  const heroContent = (heroRow?.content ?? {}) as { lessons?: unknown[]; knowledgeVersions?: unknown[]; provenance?: unknown };
  const heroValidations = validationRows.filter((row) => row.knowledgeItemId === heroKnowledgeId).length;
  record("hero.knowledgePersisted", Boolean(heroRow));
  record("hero.finalTrust", heroRow?.trustScore === hero.finalTrust, `${heroRow?.trustScore}/${hero.finalTrust}`);
  record("hero.lessons", (heroContent.lessons?.length ?? 0) === hero.lessons, `${heroContent.lessons?.length}/${hero.lessons}`);
  record("hero.versions", (heroContent.knowledgeVersions?.length ?? 0) === hero.versions, `${heroContent.knowledgeVersions?.length}/${hero.versions}`);
  record("hero.validations", heroValidations === hero.validations, `${heroValidations}/${hero.validations}`);
  record("hero.provenance", Boolean(heroContent.provenance));

  if (failures.length > 0) {
    throw new DeveloperDemoSeedError("VERIFICATION_FAILED", `Post-seed verification failed: ${failures.join("; ")}`);
  }
  return checks;
}

/* ---- projection helpers shared by verification ---- */

interface KnowledgeRowLike {
  id: string; organizationId: string; revision: number; title: string; category: string;
  canonicalProblemId: string | null; canonicalProblemTitle: string | null; lifecycleState: string;
  sourceTicketId: string; timesReused: number; timesSeen: number | null; successfulResolutions: number | null;
  failedResolutions: number | null; successRate: number | null; trustScore: number | null;
  autoResponseEligible: boolean | null; humanReviewCount: number | null; automaticResolutionCount: number | null;
  createdAt: Date; approvedAt: Date; lastUsedAt: Date | null; lastValidatedAt: Date | null;
  lastUpdatedAt: Date | null; lastValidated: Date | null; content: unknown;
}

function iso(value: Date | null): string | null | undefined {
  return value ? value.toISOString() : null;
}

function mapKnowledgeRow(row: KnowledgeRowLike): KnowledgeItem {
  const content = (row.content ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    organizationId: row.organizationId,
    revision: row.revision,
    title: row.title,
    problem: String(content.problem ?? row.canonicalProblemTitle ?? row.title),
    approvedAnswer: String(content.approvedAnswer ?? content.solution ?? ""),
    category: row.category,
    tags: Array.isArray(content.tags) ? (content.tags as string[]) : [],
    sourceTicketId: row.sourceTicketId,
    timesReused: row.timesReused,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt.toISOString(),
    lifecycleState: row.lifecycleState as KnowledgeItem["lifecycleState"],
    provenance: content.provenance as KnowledgeItem["provenance"],
    validation: content.validation as KnowledgeItem["validation"],
    timesSeen: row.timesSeen ?? undefined,
    successfulResolutions: row.successfulResolutions ?? undefined,
    failedResolutions: row.failedResolutions ?? undefined,
    successRate: row.successRate ?? undefined,
    trustScore: row.trustScore ?? undefined,
    lastUsedAt: iso(row.lastUsedAt),
    lastValidatedAt: iso(row.lastValidatedAt),
    autoResponseEligible: row.autoResponseEligible ?? undefined,
    humanReviewCount: row.humanReviewCount ?? undefined,
    automaticResolutionCount: row.automaticResolutionCount ?? undefined,
    canonicalProblemId: row.canonicalProblemId ?? undefined,
    canonicalProblemTitle: row.canonicalProblemTitle ?? undefined,
    problemSummary: content.problemSummary as string | undefined,
    internalGuidance: content.internalGuidance as string | undefined,
    customerResponseTemplate: content.customerResponseTemplate as string | undefined,
    resolutionWorkflow: content.resolutionWorkflow as string[] | undefined,
    exampleTickets: (content.exampleTickets ?? []) as KnowledgeItem["exampleTickets"],
    knowledgeVersions: (content.knowledgeVersions ?? []) as KnowledgeItem["knowledgeVersions"],
    learningHistory: (content.learningHistory ?? []) as KnowledgeItem["learningHistory"],
    lessons: (content.lessons ?? []) as KnowledgeItem["lessons"],
    lastUpdated: row.lastUpdatedAt ? row.lastUpdatedAt.toISOString() : undefined,
    lastValidated: row.lastValidated ? row.lastValidated.toISOString() : undefined
  };
}

function expectedValidation(v: SimulatedValidationRecord) {
  return { id: v.id, organizationId: EXACT_TARGET, candidateId: v.candidateId, knowledgeItemId: v.knowledgeId ?? null, knowledgeVersionId: v.knowledgeVersionId ?? null, decision: v.decision, actor: v.actor, actorId: v.actorId, roleExercised: v.roleExercised ?? "knowledge_validator", rationale: v.rationale ?? null, timestamp: new Date(v.timestamp).toISOString() };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualValidation(row: any) {
  return { id: row.id, organizationId: row.organizationId, candidateId: row.candidateId, knowledgeItemId: row.knowledgeItemId, knowledgeVersionId: row.knowledgeVersionId, decision: row.decision, actor: row.actor, actorId: row.actorId, roleExercised: row.roleExercised, rationale: row.rationale, timestamp: row.timestamp.toISOString() };
}
function expectedMemory(m: SimulatedMemoryChangeRecord) {
  return { id: m.id, organizationId: EXACT_TARGET, knowledgeItemId: m.knowledgeId, candidateId: m.candidateId, validationRecordId: m.validationRecordId, actorId: m.actorId, changeType: m.changeType, beforeState: m.beforeState ?? null, afterState: m.afterState, timestamp: new Date(m.timestamp).toISOString() };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualMemory(row: any) {
  return { id: row.id, organizationId: row.organizationId, knowledgeItemId: row.knowledgeItemId, candidateId: row.candidateId, validationRecordId: row.validationRecordId, actorId: row.actorId, changeType: row.changeType, beforeState: row.beforeState ?? null, afterState: row.afterState, timestamp: row.timestamp.toISOString() };
}
function expectedTicket(t: SimulatedTicketRecord) {
  return { organizationId: EXACT_TARGET, ticketId: t.ticketId, rawMessage: t.rawMessage, subject: t.subject ?? null, status: t.status, draftSource: t.draftSource ?? null, classification: t.classification ?? null, memoryMatch: t.memoryMatch ?? null, resolution: t.resolution ?? {}, reflection: t.reflection ?? {}, validationRecordIds: t.validationRecordIds ?? [], actorId: t.actorId, createdAt: new Date(t.createdAt).toISOString() };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualTicket(row: any) {
  return { organizationId: row.organizationId, ticketId: row.ticketId, rawMessage: row.rawMessage, subject: row.subject, status: row.status, draftSource: row.draftSource, classification: row.classification ?? null, memoryMatch: row.memoryMatch ?? null, resolution: row.resolution, reflection: row.reflection, validationRecordIds: row.validationRecordIds, actorId: row.actorId, createdAt: row.createdAt.toISOString() };
}
function expectedCandidate(c: KnowledgeCandidate) {
  return { id: c.id, organizationId: EXACT_TARGET, relatedKnowledgeId: c.relatedKnowledgeId ?? null, sourceTicketIds: c.sourceTicketIds ?? [], proposedAction: c.proposedAction, proposedContent: c.proposedContent ?? {}, rationale: c.rationale, status: c.status, createdAt: new Date(c.createdAt).toISOString() };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualCandidate(row: any) {
  return { id: row.id, organizationId: row.organizationId, relatedKnowledgeId: row.relatedKnowledgeId, sourceTicketIds: row.sourceTicketIds, proposedAction: row.proposedAction, proposedContent: row.proposedContent, rationale: row.rationale, status: row.status, createdAt: row.createdAt.toISOString() };
}
function expectedEvidence(e: TrustEvidenceIntent) {
  return { id: e.id, organizationId: EXACT_TARGET, knowledgeItemId: e.knowledgeItemId, sourceTicketId: e.sourceTicketId, trustEventType: e.trustEventType, validationRecordId: e.validationRecordId, delta: e.delta, createdAt: new Date(e.createdAt).toISOString() };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualEvidence(row: any) {
  return { id: row.id, organizationId: row.organizationId, knowledgeItemId: row.knowledgeItemId, sourceTicketId: row.sourceTicketId, trustEventType: row.trustEventType, validationRecordId: row.validationRecordId, delta: row.delta, createdAt: row.createdAt.toISOString() };
}
function expectedMetrics(m: OrgMetrics) {
  return { ...m, organizationId: EXACT_TARGET };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actualMetrics(row: any): OrgMetrics {
  return {
    organizationId: row.organizationId, lifetimeTickets: row.lifetimeTickets, knowledgeReused: row.knowledgeReused,
    autoResolutions: row.autoResolutions, humanResolutions: row.humanResolutions, totalResolutionTimeSec: row.totalResolutionTimeSec,
    resolutionsCount: row.resolutionsCount, memoryGrowthToday: row.memoryGrowthToday, memoryGrowthDate: row.memoryGrowthDate,
    lastUpdatedAt: row.lastUpdatedAt.toISOString(), mergedTickets: row.mergedTickets ?? undefined, duplicatePreventions: row.duplicatePreventions ?? undefined,
    knowledgeVersions: row.knowledgeVersions ?? undefined, emergingPatternsDetected: row.emergingPatternsDetected ?? undefined,
    promotedPatterns: row.promotedPatterns ?? undefined, aiCalls: row.aiCalls ?? undefined, aiSuccesses: row.aiSuccesses ?? undefined,
    aiFailures: row.aiFailures ?? undefined, aiFallbacks: row.aiFallbacks ?? undefined, aiAgreementSamples: row.aiAgreementSamples ?? undefined,
    aiAgreementTotal: row.aiAgreementTotal ?? undefined, humanAcceptedAISuggestions: row.humanAcceptedAISuggestions ?? undefined
  };
}

/* --------------------------- orchestrator --------------------------- */

function fullyMatchesExpected(counts: Record<string, number>): boolean {
  return counts.knowledgeItem === EXPECTED.knowledgeItems
    && counts.knowledgeCandidate === EXPECTED.candidates
    && counts.validationRecord === EXPECTED.validations
    && counts.memoryChangeRecord === EXPECTED.memoryChangeRecords
    && counts.ticketRecord === EXPECTED.tickets
    && counts.trustEvidence === EXPECTED.trustEvidence;
}

function allEmpty(counts: Record<string, number>): boolean {
  return MATURE_MODELS.every((model) => counts[model] === 0);
}

export interface SeedOptions {
  seed?: string;
  /** When true, re-run the verification even on an ALREADY_SEEDED organization. */
  verifyExisting?: boolean;
}

export async function seedDeveloperDemoMatureDataset(options: SeedOptions = {}): Promise<MatureSeedResult> {
  assertExactTarget(EXACT_TARGET);
  if (!process.env.DATABASE_URL) throw new DeveloperDemoSeedError("NO_DATABASE_URL", "DATABASE_URL is required.");
  const prisma = getPrismaClient();

  const simulation = simulateDeveloperDemo(options.seed);
  const { syntheticActorIds } = await assertPreconditions(prisma);
  assertActorsResolve(simulation, syntheticActorIds);

  const base: Pick<MatureSeedResult, "organizationId" | "seed" | "simulationDigest"> = {
    organizationId: EXACT_TARGET,
    seed: simulation.config.seed,
    simulationDigest: simulation.digest
  };

  const before = await matureCounts(prisma);

  if (!allEmpty(before)) {
    if (fullyMatchesExpected(before)) {
      const result: MatureSeedResult = {
        ...base,
        outcome: "ALREADY_SEEDED",
        writesPerformed: false,
        counts: before,
        message: "The developer-demo organization is already fully seeded; no writes were performed."
      };
      if (options.verifyExisting) result.verification = await verifyPersisted(prisma, simulation);
      return result;
    }
    return {
      ...base,
      outcome: "CREATE_ONLY_ABORT",
      writesPerformed: false,
      counts: before,
      message: "The developer-demo organization holds partial mature data. Create-only seed aborted; no writes were performed. A reset (future TODO) is required before reseeding."
    };
  }

  await persistDataset(prisma, simulation);
  const verification = await verifyPersisted(prisma, simulation);
  const after = await matureCounts(prisma);
  const sequenceRow = await prisma.ticketSequence.findUnique({ where: { organizationId: EXACT_TARGET } });

  return {
    ...base,
    outcome: "SEEDED",
    writesPerformed: true,
    counts: after,
    historyRange: { start: simulation.config.historyStart, end: simulation.config.historyEnd },
    ticketSequence: sequenceRow?.counter,
    nextTicketSequence: (sequenceRow?.counter ?? 0) + 1,
    heroArc: {
      arcId: simulation.representativeHeroArc.arcId,
      title: simulation.representativeHeroArc.title,
      finalTrust: simulation.representativeHeroArc.finalTrust,
      lessons: simulation.representativeHeroArc.lessons,
      versions: simulation.representativeHeroArc.versions,
      validations: simulation.representativeHeroArc.validations
    },
    verification
  };
}

export const __TESTING__ = { EXPECTED, EXACT_TARGET, matureCounts };
