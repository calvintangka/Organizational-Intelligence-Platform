/*
 * TODO-025D create-only mature-seed probe.
 *
 * Verifies: create-only gate, single-transaction atomicity under injected
 * failure, faithful persistence with historical actor attribution, TrustEvidence
 * seed-only persistence, create-only rerun no-op, organization isolation, server
 * authority, and structural spoofing protection (no route imports the seed
 * service). It writes ONLY to profile-oip-developer-demo and never touches the
 * protected mature organizations.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { seedDeveloperDemoMatureDataset, __TESTING__ } = require(path.join(root, "lib", "server", "developerDemoSeedService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { protectedSnapshot } = require("./seed-developer-demo-foundation.cjs");

const DEMO = __TESTING__.EXACT_TARGET;
const EXPECTED = __TESTING__.EXPECTED;

function assertAllPass(verification) {
  const failures = Object.entries(verification).filter(([, value]) => value !== "PASS");
  assert.deepEqual(failures, [], `Verification checks failed: ${JSON.stringify(failures)}`);
}

async function fullCounts(prisma) {
  const where = { organizationId: DEMO };
  return {
    knowledgeItem: await prisma.knowledgeItem.count({ where }),
    knowledgeCandidate: await prisma.knowledgeCandidate.count({ where }),
    validationRecord: await prisma.validationRecord.count({ where }),
    memoryChangeRecord: await prisma.memoryChangeRecord.count({ where }),
    ticketRecord: await prisma.ticketRecord.count({ where }),
    trustEvidence: await prisma.trustEvidence.count({ where }),
    emergingPattern: await prisma.emergingPattern.count({ where }),
    sequence: (await prisma.ticketSequence.findUnique({ where: { organizationId: DEMO } }))?.counter ?? null,
    metricsLifetime: (await prisma.orgMetrics.findUnique({ where: { organizationId: DEMO } }))?.lifetimeTickets ?? null
  };
}

function assertNoRouteImportsSeedService() {
  const apiRoot = path.join(root, "app", "api");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        if (fs.readFileSync(full, "utf8").includes("developerDemoSeedService")) offenders.push(full);
      }
    }
  };
  if (fs.existsSync(apiRoot)) walk(apiRoot);
  assert.deepEqual(offenders, [], `No API route may import the seed service (spoofing protection). Offenders: ${offenders.join(", ")}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const cases = {};

  // Structural spoofing protection: the seed service is unreachable via HTTP.
  assertNoRouteImportsSeedService();
  cases.A_noRouteImportsSeedService = "PASS";

  const protectedBefore = await protectedSnapshot(prisma);
  const before = await fullCounts(prisma);
  const startedEmpty =
    before.knowledgeItem === 0 && before.knowledgeCandidate === 0 && before.validationRecord === 0 &&
    before.memoryChangeRecord === 0 && before.ticketRecord === 0 && before.trustEvidence === 0 && before.emergingPattern === 0;

  if (startedEmpty) {
    // B. Single-transaction atomicity: an injected failure must roll everything back.
    process.env.DEVELOPER_DEMO_SEED_FAILURE_INJECTION = "after-write";
    await assert.rejects(
      () => seedDeveloperDemoMatureDataset(),
      /Injected failure/,
      "Injected failure must abort the seed."
    );
    delete process.env.DEVELOPER_DEMO_SEED_FAILURE_INJECTION;
    const afterInjection = await fullCounts(prisma);
    assert.equal(afterInjection.knowledgeItem, 0, "Rollback must leave zero knowledge.");
    assert.equal(afterInjection.ticketRecord, 0, "Rollback must leave zero tickets.");
    assert.equal(afterInjection.validationRecord, 0, "Rollback must leave zero validations.");
    assert.equal(afterInjection.memoryChangeRecord, 0, "Rollback must leave zero memory records.");
    assert.equal(afterInjection.trustEvidence, 0, "Rollback must leave zero trust evidence.");
    assert.equal(afterInjection.metricsLifetime, 0, "Rollback must leave foundation metrics untouched.");
    assert.equal(afterInjection.sequence, 0, "Rollback must leave the ticket sequence at 0.");
    cases.B_injectedFailureRollsBackFully = "PASS";

    // C. Real create-only seed.
    const seeded = await seedDeveloperDemoMatureDataset();
    assert.equal(seeded.outcome, "SEEDED");
    assert.equal(seeded.writesPerformed, true);
    assertAllPass(seeded.verification);
    cases.C_matureSeedPersisted = "PASS";
    cases.C_verificationAllPass = "PASS";
  } else {
    cases.B_injectedFailureRollsBackFully = "SKIPPED (already seeded)";
    cases.C_matureSeedPersisted = "SKIPPED (already seeded)";
    const existing = await seedDeveloperDemoMatureDataset({ verifyExisting: true });
    assert.equal(existing.outcome, "ALREADY_SEEDED");
    assertAllPass(existing.verification);
    cases.C_verificationAllPass = "PASS";
  }

  // D. Counts from fresh DB reads.
  const counts = await fullCounts(prisma);
  assert.equal(counts.knowledgeItem, EXPECTED.knowledgeItems);
  assert.equal(counts.knowledgeCandidate, EXPECTED.candidates);
  assert.equal(counts.validationRecord, EXPECTED.validations);
  assert.equal(counts.memoryChangeRecord, EXPECTED.memoryChangeRecords);
  assert.equal(counts.ticketRecord, EXPECTED.tickets);
  assert.equal(counts.trustEvidence, EXPECTED.trustEvidence);
  assert.equal(counts.sequence, EXPECTED.ticketSequence);
  assert.equal(counts.metricsLifetime, EXPECTED.tickets);
  cases.D_freshDatabaseCounts = "PASS";

  // E. Create-only rerun is a no-op that changes nothing.
  const rerun = await seedDeveloperDemoMatureDataset();
  assert.equal(rerun.outcome, "ALREADY_SEEDED");
  assert.equal(rerun.writesPerformed, false);
  const afterRerun = await fullCounts(prisma);
  assert.deepEqual(afterRerun, counts, "Create-only rerun must not change any counts, sequence, or metrics.");
  cases.E_createOnlyRerunNoOp = "PASS";

  // F. Server-authority reads return mature data without localStorage.
  const [authority, demoKnowledge] = await Promise.all([
    prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId: DEMO } }),
    persistence.loadKnowledge(DEMO)
  ]);
  assert.equal(authority?.authority, "server");
  assert.equal(demoKnowledge.length, EXPECTED.knowledgeItems);
  assert(demoKnowledge.every((item) => item.organizationId === DEMO), "Demo reads must stay organization-scoped.");
  cases.F_serverAuthorityReads = "PASS";

  // G. Actor attribution surfaced at the row level. The full synthetic team of 8
  // is expressed across the union of ticket + validation authorship (some actors
  // only open tickets, some only validate), matching the simulator definition.
  const [validationActors, ticketActors, memoryActors] = await Promise.all([
    prisma.validationRecord.findMany({ where: { organizationId: DEMO }, select: { actorId: true } }),
    prisma.ticketRecord.findMany({ where: { organizationId: DEMO }, select: { actorId: true } }),
    prisma.memoryChangeRecord.findMany({ where: { organizationId: DEMO }, select: { actorId: true } })
  ]);
  const distinctActors = new Set([
    ...validationActors.map((row) => row.actorId),
    ...ticketActors.map((row) => row.actorId),
    ...memoryActors.map((row) => row.actorId)
  ]);
  assert.equal(distinctActors.size, EXPECTED.actors, `Union of ticket+validation+memory actors must be ${EXPECTED.actors}.`);
  assert(validationActors.every((row) => row.actorId && row.actorId.startsWith("user-oip-demo-")), "All validation actorIds must be synthetic demo actors.");
  assert(memoryActors.every((row) => row.actorId && row.actorId.startsWith("user-oip-demo-")), "All memory actorIds must be synthetic demo actors.");
  assert([...distinctActors].every((id) => id && id.startsWith("user-oip-demo-")), "Every authored actor must be a synthetic demo actor.");
  cases.G_historicalActorAttribution = "PASS";

  // H. Next ticket allocation cannot collide with generated tickets.
  const nextSequence = (counts.sequence ?? 0) + 1;
  assert.equal(nextSequence, EXPECTED.ticketSequence + 1);
  const collision = await prisma.ticketRecord.count({ where: { organizationId: DEMO, ticketId: { endsWith: `-${String(nextSequence).padStart(4, "0")}` } } });
  assert.equal(collision, 0, "Next allocated sequence number must not already exist.");
  cases.H_nextTicketNoCollision = "PASS";

  // I. Protected mature organizations unchanged throughout.
  assert.deepEqual(await protectedSnapshot(prisma), protectedBefore, "Protected organizations must remain byte-identical.");
  cases.I_protectedOrganizationsUnchanged = "PASS";

  console.log(JSON.stringify({
    cases,
    organizationId: DEMO,
    counts,
    nextTicketSequence: nextSequence,
    startedEmpty,
    protectedOrganizationsUnchanged: true
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPrismaClient().$disconnect();
    } catch {
      /* ignore */
    }
  });
