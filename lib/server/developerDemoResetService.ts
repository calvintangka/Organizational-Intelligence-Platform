import "server-only";

import { createHash } from "node:crypto";

import { getPrismaClient } from "@/lib/server/prisma";
import { stableStringify } from "@/lib/persistence/migrationExportDigest";
import {
  DEVELOPER_DEMO_FOUNDATION_AT,
  DEVELOPER_DEMO_ORGANIZATION_ID,
  PROTECTED_ORGANIZATION_IDS,
  developerDemoActors
} from "@/data/developerDemoFoundation";
import {
  seedDeveloperDemoMatureDataset,
  __TESTING__ as SEED_TESTING
} from "@/lib/server/developerDemoSeedService";

/**
 * TODO-025I — hardened, developer-only reset/reseed for the single organization
 * profile-oip-developer-demo.
 *
 * SAFETY MODEL
 *  - Server-only; imported by the reset command and its probe, never by any API
 *    route. There is no HTTP surface to this destructive operation.
 *  - The target is a hardcoded constant. An allowlist (exactly the demo id) AND
 *    a denylist (every other known organization) are both enforced. There is no
 *    parameter or flag to point it at another organization.
 *  - Every destructive write is gated behind an explicit `confirm` flag; without
 *    it the workflow performs zero writes.
 *  - The reset is ONE transaction: it deletes only the demo's mature/history rows
 *    and zeroes OrgMetrics + TicketSequence (foundation identity, profile, users,
 *    memberships, and persistence authority are preserved). A failure rolls the
 *    whole reset back, so the mature dataset can never be left half-deleted.
 *  - Reset and reseed are two transactions (not one), so the recovery model is:
 *    a failure between them leaves the known empty foundation state, which is
 *    detectable and safely re-runnable. The command never claims success on a
 *    failure.
 */

const EXACT_TARGET = DEVELOPER_DEMO_ORGANIZATION_ID;
const EXPECTED_SIMULATION_DIGEST = "3d75a34468b14d711a3b3663fd3554a1435505a2483e13ac858de8fee26766bd";
const EXPECTED = SEED_TESTING.EXPECTED;

// Authoritative allowlist — exactly one organization may ever be reset.
const RESET_ALLOWLIST = new Set([EXACT_TARGET]);
// Defence-in-depth denylist — every other organization id known to the repo.
const RESET_DENYLIST = new Set([
  ...PROTECTED_ORGANIZATION_IDS,
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-legal",
  "profile-pramana-consulting",
  "profile-aether-labs",
  "test-oip-regression"
]);

// Mature/history tables emptied by a reset. Foundation rows (organization,
// memberships, users, persistence authority) are intentionally absent.
const MATURE_DELETE_MODELS = [
  "trustEvidence",
  "memoryChangeRecord",
  "validationRecord",
  "knowledgeCandidate",
  "knowledgeItem",
  "emergingPattern",
  "intelligenceLog",
  "ticketRecord"
] as const;

export class DeveloperDemoResetError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DeveloperDemoResetError";
  }
}

function assertResettableTarget(organizationId: string): void {
  if (!RESET_ALLOWLIST.has(organizationId)) {
    throw new DeveloperDemoResetError("NOT_ALLOWLISTED", `Reset refused: ${String(organizationId)} is not the developer-demo organization.`);
  }
  if (RESET_DENYLIST.has(organizationId)) {
    throw new DeveloperDemoResetError("DENYLISTED", `Reset refused: ${String(organizationId)} is a protected organization.`);
  }
  if (organizationId !== EXACT_TARGET) {
    throw new DeveloperDemoResetError("WRONG_TARGET", `Reset refused: target must be exactly ${EXACT_TARGET}.`);
  }
}

type PrismaClientLike = ReturnType<typeof getPrismaClient>;
type TxClient = Parameters<Parameters<PrismaClientLike["$transaction"]>[0]>[0];

function foundationZeroMetrics() {
  return {
    lifetimeTickets: 0,
    knowledgeReused: 0,
    autoResolutions: 0,
    humanResolutions: 0,
    totalResolutionTimeSec: 0,
    resolutionsCount: 0,
    memoryGrowthToday: 0,
    memoryGrowthDate: DEVELOPER_DEMO_FOUNDATION_AT.slice(0, 10),
    mergedTickets: 0,
    duplicatePreventions: 0,
    knowledgeVersions: 0,
    emergingPatternsDetected: 0,
    promotedPatterns: 0,
    aiCalls: 0,
    aiSuccesses: 0,
    aiFailures: 0,
    aiFallbacks: 0,
    aiAgreementSamples: 0,
    aiAgreementTotal: 0,
    humanAcceptedAISuggestions: 0,
    lastUpdatedAt: new Date(DEVELOPER_DEMO_FOUNDATION_AT)
  };
}

async function assertResetPreconditions(prisma: PrismaClientLike): Promise<void> {
  const organization = await prisma.organization.findUnique({ where: { id: EXACT_TARGET } });
  if (!organization) throw new DeveloperDemoResetError("FOUNDATION_MISSING", "The developer-demo foundation organization does not exist.");
  const authority = await prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId: EXACT_TARGET } });
  if (authority?.authority !== "server") throw new DeveloperDemoResetError("NOT_SERVER_AUTHORITATIVE", "The developer-demo organization is not server-authoritative.");
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: EXACT_TARGET, userId: { in: developerDemoActors.map((a) => a.id) } },
    select: { userId: true }
  });
  const memberIds = new Set(memberships.map((m) => m.userId));
  for (const actor of developerDemoActors) {
    if (!memberIds.has(actor.id)) throw new DeveloperDemoResetError("MEMBERSHIP_MISSING", `Synthetic actor ${actor.id} is not a member; refusing to reset an incomplete foundation.`);
  }
}

/**
 * Destroy only the developer-demo mature/history rows and return the org to the
 * TODO-025B empty foundation state, in ONE transaction. Foundation identity is
 * preserved. A failure rolls everything back.
 */
async function resetDeveloperDemoMatureData(prisma: PrismaClientLike): Promise<void> {
  await prisma.$transaction(async (tx: TxClient) => {
    // Re-assert the target inside the transaction as a last line of defence.
    assertResettableTarget(EXACT_TARGET);
    await tx.trustEvidence.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.memoryChangeRecord.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.validationRecord.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.knowledgeCandidate.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.knowledgeItem.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.emergingPattern.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.intelligenceLog.deleteMany({ where: { organizationId: EXACT_TARGET } });
    await tx.ticketRecord.deleteMany({ where: { organizationId: EXACT_TARGET } });
    // Zero (not delete) the foundation counters so the reseed's update path and
    // the TODO-025B empty-foundation contract both hold.
    const zero = foundationZeroMetrics();
    await tx.orgMetrics.upsert({
      where: { organizationId: EXACT_TARGET },
      create: { organizationId: EXACT_TARGET, ...zero },
      update: zero
    });
    await tx.ticketSequence.upsert({
      where: { organizationId: EXACT_TARGET },
      create: { organizationId: EXACT_TARGET, counter: 0 },
      update: { counter: 0 }
    });
    if (process.env.DEVELOPER_DEMO_RESET_FAILURE_INJECTION === "during-reset") {
      throw new DeveloperDemoResetError("INJECTED_RESET_FAILURE", "Injected failure inside the reset transaction.");
    }
  }, { timeout: 120_000, maxWait: 30_000 });
}

async function matureCounts(prisma: PrismaClientLike): Promise<Record<string, number>> {
  return SEED_TESTING.matureCounts(prisma);
}

function isEmptyFoundation(counts: Record<string, number>): boolean {
  return MATURE_DELETE_MODELS.every((model) => (counts[model] ?? 0) === 0)
    && (counts.knowledgeItem ?? 0) === 0;
}

/** Structural digest of the persisted mature dataset for determinism comparison. */
async function persistedStructuralDigest(prisma: PrismaClientLike): Promise<string> {
  const where = { organizationId: EXACT_TARGET };
  const [knowledge, validations, evidence, metrics, sequence] = await Promise.all([
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" }, select: { id: true, trustScore: true, timesReused: true, content: true } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" }, select: { id: true, actorId: true, knowledgeItemId: true, timestamp: true } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" }, select: { knowledgeItemId: true, sourceTicketId: true, trustEventType: true, delta: true } }),
    prisma.orgMetrics.findUnique({ where: { organizationId: EXACT_TARGET } }),
    prisma.ticketSequence.findUnique({ where: { organizationId: EXACT_TARGET } })
  ]);
  const knowledgeShape = knowledge.map((k) => {
    const content = (k.content ?? {}) as { lessons?: Array<{ id: string }>; knowledgeVersions?: Array<{ versionId: string }> };
    return {
      id: k.id,
      trustScore: k.trustScore,
      timesReused: k.timesReused,
      lessons: (content.lessons ?? []).map((l) => l.id),
      versions: (content.knowledgeVersions ?? []).map((v) => v.versionId)
    };
  });
  const validationShape = validations.map((v) => ({ id: v.id, actorId: v.actorId, knowledgeItemId: v.knowledgeItemId, at: v.timestamp.toISOString() }));
  const evidenceShape = evidence.map((e) => `${e.knowledgeItemId}|${e.sourceTicketId}|${e.trustEventType}|${e.delta}`);
  const metricsShape = metrics ? { lifetimeTickets: metrics.lifetimeTickets, knowledgeReused: metrics.knowledgeReused, resolutionsCount: metrics.resolutionsCount, knowledgeVersions: metrics.knowledgeVersions, mergedTickets: metrics.mergedTickets } : null;
  return createHash("sha256").update(stableStringify({ knowledgeShape, validationShape, evidenceShape, metricsShape, sequence: sequence?.counter ?? null })).digest("hex");
}

async function protectedSnapshot(prisma: PrismaClientLike): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const organizationId of PROTECTED_ORGANIZATION_IDS) {
    const where = { organizationId };
    const value = {
      organization: await prisma.organization.findUnique({ where: { id: organizationId } }),
      memberships: await prisma.organizationMembership.findMany({ where, orderBy: { userId: "asc" } }),
      authority: await prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId } }),
      knowledge: await prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
      candidates: await prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
      validations: await prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
      memory: await prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
      tickets: await prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
      evidence: await prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
      patterns: await prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
      metrics: await prisma.orgMetrics.findUnique({ where: { organizationId } }),
      sequence: await prisma.ticketSequence.findUnique({ where: { organizationId } })
    };
    result[organizationId] = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  return result;
}

export type ResetOutcome = "ABORTED_NO_CONFIRMATION" | "RESET_ONLY" | "RESEEDED";

export interface ResetReseedResult {
  outcome: ResetOutcome;
  organizationId: string;
  destructive: boolean;
  writesPerformed: boolean;
  protectedOrganizationsUnchanged: boolean;
  countsBefore?: Record<string, number>;
  countsAfterReset?: Record<string, number>;
  countsAfterReseed?: Record<string, number>;
  seed?: string;
  simulationDigest?: string;
  persistedDigest?: string;
  ticketSequence?: number;
  verification?: Record<string, string>;
  message: string;
}

export interface ResetReseedOptions {
  confirm: boolean;
  reseed?: boolean;
  seed?: string;
}

export async function resetAndReseedDeveloperDemo(options: ResetReseedOptions): Promise<ResetReseedResult> {
  assertResettableTarget(EXACT_TARGET);
  const reseed = options.reseed !== false;

  if (!options.confirm) {
    return {
      outcome: "ABORTED_NO_CONFIRMATION",
      organizationId: EXACT_TARGET,
      destructive: false,
      writesPerformed: false,
      protectedOrganizationsUnchanged: true,
      message: "Refused: explicit destructive confirmation is required. Re-run with --confirm-reset to wipe and rebuild the developer-demo mature dataset."
    };
  }

  if (!process.env.DATABASE_URL) throw new DeveloperDemoResetError("NO_DATABASE_URL", "DATABASE_URL is required.");
  const prisma = getPrismaClient();

  // Snapshot protected organizations BEFORE any destructive write (CASE A guard).
  const protectedBefore = await protectedSnapshot(prisma);
  await assertResetPreconditions(prisma);
  if (process.env.DEVELOPER_DEMO_RESET_FAILURE_INJECTION === "before-reset") {
    throw new DeveloperDemoResetError("INJECTED_BEFORE_RESET", "Injected failure before reset; no writes performed.");
  }

  const countsBefore = await matureCounts(prisma);

  // Destructive reset (CASE B: injected failure rolls the whole reset back).
  await resetDeveloperDemoMatureData(prisma);

  const countsAfterReset = await matureCounts(prisma);
  if (!isEmptyFoundation(countsAfterReset)) {
    throw new DeveloperDemoResetError("RESET_INCOMPLETE", `Reset did not empty the organization: ${JSON.stringify(countsAfterReset)}.`);
  }

  // CASE C: a failure here leaves the empty foundation state — detectable and
  // safely re-runnable; we do NOT claim success.
  if (process.env.DEVELOPER_DEMO_RESET_FAILURE_INJECTION === "before-reseed") {
    throw new DeveloperDemoResetError("INJECTED_BEFORE_RESEED", "Injected failure after reset, before reseed. Organization is in the empty foundation state; re-run the command to reseed.");
  }

  if (!reseed) {
    const protectedAfter = await protectedSnapshot(prisma);
    const unchanged = stableStringify(protectedAfter) === stableStringify(protectedBefore);
    if (!unchanged) throw new DeveloperDemoResetError("PROTECTED_CHANGED", "Protected organizations changed during reset.");
    return {
      outcome: "RESET_ONLY",
      organizationId: EXACT_TARGET,
      destructive: true,
      writesPerformed: true,
      protectedOrganizationsUnchanged: true,
      countsBefore,
      countsAfterReset,
      message: "Developer-demo mature data was reset to the empty TODO-025B foundation state. No reseed was performed (--no-reseed)."
    };
  }

  // Reseed via the single authoritative TODO-025D create-only path (CASE D:
  // DEVELOPER_DEMO_SEED_FAILURE_INJECTION rolls the seed back, leaving the empty
  // foundation state rather than partial mature data).
  const seedResult = await seedDeveloperDemoMatureDataset({ seed: options.seed });
  if (seedResult.outcome !== "SEEDED") {
    throw new DeveloperDemoResetError("RESEED_NOT_SEEDED", `Reseed returned ${seedResult.outcome}; expected SEEDED on an empty foundation.`);
  }

  // Deterministic identity: the simulator digest must equal the approved baseline.
  if (seedResult.simulationDigest !== EXPECTED_SIMULATION_DIGEST) {
    throw new DeveloperDemoResetError("NON_DETERMINISTIC", `Reseed simulation digest ${seedResult.simulationDigest} != approved ${EXPECTED_SIMULATION_DIGEST}.`);
  }

  // CASE E: loud failure if post-reseed verification fails; never continue silently.
  if (process.env.DEVELOPER_DEMO_RESET_FAILURE_INJECTION === "verify-fail") {
    throw new DeveloperDemoResetError("INJECTED_VERIFY_FAILURE", "Injected post-reseed verification failure. The dataset is seeded but the run is reported as failed; re-run to rebuild deterministically.");
  }

  const countsAfterReseed = await matureCounts(prisma);
  const persistedDigest = await persistedStructuralDigest(prisma);
  const sequence = await prisma.ticketSequence.findUnique({ where: { organizationId: EXACT_TARGET } });

  const protectedAfter = await protectedSnapshot(prisma);
  const unchanged = stableStringify(protectedAfter) === stableStringify(protectedBefore);
  if (!unchanged) throw new DeveloperDemoResetError("PROTECTED_CHANGED", "Protected organizations changed during reset/reseed.");

  if (countsAfterReseed.knowledgeItem !== EXPECTED.knowledgeItems || countsAfterReseed.ticketRecord !== EXPECTED.tickets || countsAfterReseed.trustEvidence !== EXPECTED.trustEvidence) {
    throw new DeveloperDemoResetError("RESEED_COUNTS_WRONG", `Reseed counts unexpected: ${JSON.stringify(countsAfterReseed)}.`);
  }

  return {
    outcome: "RESEEDED",
    organizationId: EXACT_TARGET,
    destructive: true,
    writesPerformed: true,
    protectedOrganizationsUnchanged: true,
    countsBefore,
    countsAfterReset,
    countsAfterReseed,
    seed: seedResult.seed,
    simulationDigest: seedResult.simulationDigest,
    persistedDigest,
    ticketSequence: sequence?.counter,
    verification: seedResult.verification,
    message: "Developer-demo mature dataset was reset and deterministically reseeded. Protected organizations were left untouched."
  };
}

export const __TESTING__ = {
  EXACT_TARGET,
  EXPECTED_SIMULATION_DIGEST,
  RESET_ALLOWLIST,
  RESET_DENYLIST,
  assertResettableTarget,
  protectedSnapshot,
  persistedStructuralDigest,
  matureCounts,
  isEmptyFoundation,
  DeveloperDemoResetError
};
