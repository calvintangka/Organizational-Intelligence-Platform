/* TODO-025C determinism, integrity, and PostgreSQL non-mutation probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { installProbeHarness } = require("../lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { simulateDeveloperDemo } = require(path.join(root, "lib", "developerDemo", "simulator.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  businessCounts,
  protectedSnapshot
} = require("../seed-developer-demo-foundation.cjs");

function keyCounts(simulation) {
  const knowledge = simulation.resources.knowledgeItems;
  return {
    arcs: simulation.arcs.length,
    knowledgeItems: knowledge.length,
    lessons: knowledge.reduce((total, item) => total + (item.lessons?.length ?? 0), 0),
    tickets: simulation.resources.tickets.length,
    candidates: simulation.resources.candidates.length,
    validations: simulation.resources.validations.length,
    memoryChanges: simulation.resources.memoryChanges.length,
    trustEvidenceIntents: simulation.resources.trustEvidenceIntents.length,
    knowledgeVersions: knowledge.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0)
  };
}

async function databaseSnapshot(prisma) {
  const foundation = {
    organization: await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ORGANIZATION_ID } }),
    memberships: await prisma.organizationMembership.findMany({
      where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID },
      orderBy: { userId: "asc" }
    }),
    authority: await prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } }),
    batches: await prisma.migrationImportBatch.findMany({
      where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID },
      orderBy: { id: "asc" },
      include: { resources: { orderBy: { id: "asc" } }, conflicts: { orderBy: { id: "asc" } } }
    }),
    counts: await businessCounts(prisma)
  };
  return {
    foundationDigest: crypto.createHash("sha256").update(JSON.stringify(foundation)).digest("hex"),
    protected: await protectedSnapshot(prisma),
    counts: foundation.counts
  };
}

async function main() {
  const prisma = getPrismaClient();
  try {
    const before = await databaseSnapshot(prisma);
    const first = simulateDeveloperDemo();
    const second = simulateDeveloperDemo();
    const alternate = simulateDeveloperDemo(`${first.config.seed}-alternate`);
    const after = await databaseSnapshot(prisma);

    assert.equal(first.digest, second.digest, "Default-seed digests differ.");
    assert.deepEqual(keyCounts(first), keyCounts(second), "Default-seed counts differ.");
    assert.deepEqual(first.representativeHeroArc, second.representativeHeroArc, "Representative HERO lifecycle differs.");
    assert.notEqual(first.digest, alternate.digest, "A different seed must change the digest.");
    assert.equal(Object.values(alternate.integrity).every((count) => count === 0), true, "Alternate seed failed integrity.");
    assert.equal(
      first.events.every((event) => event.organizationId === DEVELOPER_DEMO_ORGANIZATION_ID),
      true,
      "A generated event crossed organization ownership."
    );
    assert.deepEqual(after, before, "PostgreSQL changed during in-memory simulation.");
    assert.equal(after.counts.knowledgeItem, 0);
    assert.equal(after.counts.ticketRecord, 0);
    assert.equal(after.counts.validationRecord, 0);
    assert.equal(after.counts.memoryChangeRecord, 0);
    assert.equal(after.counts.trustEvidence, 0);

    console.log(JSON.stringify({
      cases: {
        A_defaultRun1: "PASS",
        B_defaultRun2: "PASS",
        C_identicalDigest: "PASS",
        D_identicalCounts: "PASS",
        E_identicalHeroLifecycle: "PASS",
        F_differentSeedDifferentDigest: "PASS",
        G_alternateSeedIntegrity: "PASS",
        H_organizationIsolation: "PASS",
        I_noPostgreSQLWrites: "PASS",
        J_foundationRemainsEmpty: "PASS"
      },
      defaultDigestRun1: first.digest,
      defaultDigestRun2: second.digest,
      alternateDigest: alternate.digest,
      counts: keyCounts(first),
      foundationCounts: after.counts,
      protectedOrganizationsUnchanged: true
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
