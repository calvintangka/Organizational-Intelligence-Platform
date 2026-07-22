/*
 * TODO-025I reset/reseed hardening probe.
 *
 * Exercises the destructive developer-demo reset/reseed tool end to end:
 * no-API-surface, exact-target guard, confirmation gate, single-transaction
 * reset rollback, reset+reseed determinism, all failure-injection recovery
 * cases, create-only seed preservation, and protected-organization safety.
 *
 * This probe is itself destructive to profile-oip-developer-demo ONLY. It leaves
 * the organization correctly reseeded, and asserts every protected organization
 * is byte-identical before and after.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { resetAndReseedDeveloperDemo, __TESTING__ } = require(path.join(root, "lib", "server", "developerDemoResetService.ts"));
const { seedDeveloperDemoMatureDataset } = require(path.join(root, "lib", "server", "developerDemoSeedService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const DEMO = __TESTING__.EXACT_TARGET;
const RESET_ENV = "DEVELOPER_DEMO_RESET_FAILURE_INJECTION";
const SEED_ENV = "DEVELOPER_DEMO_SEED_FAILURE_INJECTION";
const cases = {};

function setInjection(env, value) { if (value === null) delete process.env[env]; else process.env[env] = value; }

function assertNoApiImport() {
  const apiRoot = path.join(root, "app", "api");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("developerDemoResetService")) offenders.push(full);
    }
  };
  if (fs.existsSync(apiRoot)) walk(apiRoot);
  assert.deepEqual(offenders, [], `No API route may import the reset service. Offenders: ${offenders.join(", ")}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();

  // Clean any leftover injection env from a prior aborted run.
  setInjection(RESET_ENV, null);
  setInjection(SEED_ENV, null);

  // Part 13 — no HTTP surface.
  assertNoApiImport();
  cases.A_noApiSurface = "PASS";

  const protectedBefore = await __TESTING__.protectedSnapshot(prisma);
  const startCounts = await __TESTING__.matureCounts(prisma);
  const startedMature = startCounts.knowledgeItem === 45;

  // Part 2 — exact-target guard (allowlist + denylist).
  assert.doesNotThrow(() => __TESTING__.assertResettableTarget(DEMO));
  for (const bad of ["profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-legal", "test-oip-regression", "profile-aether-labs", "anything-else"]) {
    assert.throws(() => __TESTING__.assertResettableTarget(bad), /refused/i, `Guard must refuse ${bad}.`);
  }
  cases.B_exactTargetGuard = "PASS";

  // Part 3 — refusal without confirmation performs zero writes.
  const aborted = await resetAndReseedDeveloperDemo({ confirm: false });
  assert.equal(aborted.outcome, "ABORTED_NO_CONFIRMATION");
  assert.equal(aborted.writesPerformed, false);
  assert.deepEqual(await __TESTING__.matureCounts(prisma), startCounts, "Refusal must not change data.");
  cases.C_refusalWithoutConfirmationZeroWrites = "PASS";

  // Part 10 CASE A — failure before reset: zero writes.
  setInjection(RESET_ENV, "before-reset");
  await assert.rejects(() => resetAndReseedDeveloperDemo({ confirm: true }), /before reset/i);
  setInjection(RESET_ENV, null);
  assert.deepEqual(await __TESTING__.matureCounts(prisma), startCounts, "CASE A must not change data.");
  cases.D_failureBeforeReset_zeroWrites = "PASS";

  // Part 10 CASE B — failure during the reset transaction rolls back fully.
  if (startedMature) {
    setInjection(RESET_ENV, "during-reset");
    await assert.rejects(() => resetAndReseedDeveloperDemo({ confirm: true }), /reset transaction/i);
    setInjection(RESET_ENV, null);
    assert.deepEqual(await __TESTING__.matureCounts(prisma), startCounts, "CASE B rollback must leave the mature dataset intact.");
    cases.E_failureDuringReset_rollsBack = "PASS";
  } else {
    cases.E_failureDuringReset_rollsBack = "SKIPPED (org not mature at start)";
  }

  // Part 10 CASE C — reset succeeds, failure before reseed → empty foundation, rerunnable.
  setInjection(RESET_ENV, "before-reseed");
  await assert.rejects(() => resetAndReseedDeveloperDemo({ confirm: true }), /before reseed/i);
  setInjection(RESET_ENV, null);
  assert(__TESTING__.isEmptyFoundation(await __TESTING__.matureCounts(prisma)), "CASE C must leave the empty foundation state.");
  cases.F_failureBeforeReseed_emptyFoundationRerunnable = "PASS";

  // Part 10 CASE D — failure during reseed rolls the seed back to empty foundation (not partial).
  setInjection(SEED_ENV, "after-write");
  await assert.rejects(() => resetAndReseedDeveloperDemo({ confirm: true }), /Injected failure/i);
  setInjection(SEED_ENV, null);
  assert(__TESTING__.isEmptyFoundation(await __TESTING__.matureCounts(prisma)), "CASE D must leave the empty foundation state, not partial mature data.");
  cases.G_failureDuringReseed_emptyNotPartial = "PASS";

  // Recover: real reset + reseed (#1). Determinism digest captured.
  const first = await resetAndReseedDeveloperDemo({ confirm: true });
  assert.equal(first.outcome, "RESEEDED");
  assert.equal(Object.values(first.verification).filter((v) => v !== "PASS").length, 0, "Reseed #1 verification must all pass.");
  assert.equal(first.countsAfterReseed.knowledgeItem, 45);
  assert.equal(first.countsAfterReseed.trustEvidence, 4500);
  assert.equal(first.ticketSequence, 5000);
  cases.H_resetReseed_seededAndVerified = "PASS";

  // Part 10 CASE E — post-reseed verification failure reported loudly (data seeded).
  setInjection(RESET_ENV, "verify-fail");
  await assert.rejects(() => resetAndReseedDeveloperDemo({ confirm: true }), /verification failure/i);
  setInjection(RESET_ENV, null);
  assert.equal((await __TESTING__.matureCounts(prisma)).knowledgeItem, 45, "CASE E leaves a seeded (not corrupt) dataset.");
  cases.I_postReseedVerificationFailsLoudly = "PASS";

  // Part 8 / Part 11 — determinism: second reset+reseed produces an identical structural digest.
  const second = await resetAndReseedDeveloperDemo({ confirm: true });
  assert.equal(second.outcome, "RESEEDED");
  assert.equal(second.simulationDigest, __TESTING__.EXPECTED_SIMULATION_DIGEST);
  assert.equal(second.persistedDigest, first.persistedDigest, "Two reseeds with the same seed must produce identical persisted structural digests.");
  cases.J_deterministicReseed = "PASS";

  // Part 11 — create-only seed command remains create-only (ALREADY_SEEDED).
  const createOnly = await seedDeveloperDemoMatureDataset();
  assert.equal(createOnly.outcome, "ALREADY_SEEDED");
  assert.equal(createOnly.writesPerformed, false);
  cases.K_createOnlySeedPreserved = "PASS";

  // Part 6 — reset-only mode leaves the empty foundation, then restore mature for a clean exit.
  const resetOnly = await resetAndReseedDeveloperDemo({ confirm: true, reseed: false });
  assert.equal(resetOnly.outcome, "RESET_ONLY");
  assert(__TESTING__.isEmptyFoundation(await __TESTING__.matureCounts(prisma)), "reset-only must leave the empty foundation state.");
  cases.L_resetOnlyFoundationState = "PASS";
  const restored = await resetAndReseedDeveloperDemo({ confirm: true });
  assert.equal(restored.outcome, "RESEEDED");
  assert.equal(restored.persistedDigest, first.persistedDigest, "Restored reseed must match the deterministic digest.");
  cases.M_restoredMature = "PASS";

  // Part 9 — protected organizations untouched throughout the destructive run.
  const protectedAfter = await __TESTING__.protectedSnapshot(prisma);
  assert.deepEqual(protectedAfter, protectedBefore, "Protected organizations must be byte-identical.");
  cases.N_protectedOrganizationsUnchanged = "PASS";

  console.log(JSON.stringify({
    cases,
    organizationId: DEMO,
    startedMature,
    deterministicDigest: first.persistedDigest,
    finalCounts: await __TESTING__.matureCounts(prisma),
    protectedOrganizationsUnchanged: true
  }, null, 2));
}

main()
  .catch((error) => {
    setInjection(RESET_ENV, null);
    setInjection(SEED_ENV, null);
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  })
  .finally(async () => { try { await getPrismaClient().$disconnect(); } catch { /* ignore */ } });
