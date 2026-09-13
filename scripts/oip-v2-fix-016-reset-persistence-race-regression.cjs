/*
 * OIP-V2-FIX-016 — organization reset must serialize with resource snapshots.
 *
 * This is a disposable server-side regression for the Settings reset flow.
 * Before the fix, resetOrganizationData() could delete org_metrics while an
 * emerging-pattern snapshot writer held only the metrics-row lock. The two
 * transactions then interleaved and surfaced a misleading HTTP 500 from the
 * otherwise valid saveEmergingPatterns path.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { resetOrganizationData, saveEmergingPatterns } = require(path.join(root, "lib", "server", "persistenceService.ts"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the reset/persistence race probe cannot run.");
  process.exit(1);
}

const prisma = getPrismaClient();
const organizationId = `oip-v2-fix-016-${Date.now()}`;
const now = new Date().toISOString();
const pattern = {
  id: `${organizationId}-pattern`,
  organizationId,
  title: "Disposable reset race pattern",
  summary: "Disposable reset race regression",
  category: "Probe",
  tags: ["probe"],
  keywords: ["reset"],
  exampleTickets: [],
  timesSeen: 1,
  confidenceScore: 0.5,
  suggestedCanonicalProblem: false,
  status: "monitoring",
  firstSeenAt: now,
  lastSeenAt: now
};

async function main() {
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: "OIP-V2-FIX-016 Disposable",
      industry: "Probe",
      description: "Disposable reset/persistence race regression.",
      settings: {},
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  });

  try {
    const iterations = 20;
    for (let index = 0; index < iterations; index += 1) {
      const results = await Promise.allSettled([
        resetOrganizationData(organizationId),
        saveEmergingPatterns(organizationId, [pattern])
      ]);
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }

    const [organization, metrics, patterns] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
      prisma.orgMetrics.findUnique({ where: { organizationId }, select: { organizationId: true } }),
      prisma.emergingPattern.count({ where: { organizationId } })
    ]);
    assert.ok(organization, "the disposable organization must remain intact");
    assert.ok(metrics, "a serialized resource write must leave an authoritative metrics row");
    assert.ok(patterns === 0 || patterns === 1, "the serialized reset/write result must be coherent");
    console.log(JSON.stringify({
      probe: "OIP-V2-FIX-016",
      status: "PASS",
      iterations,
      resetAndPatternWritesSerialized: true,
      finalPatternCount: patterns,
      disposableFixtureDeleted: false
    }, null, 2));
  } finally {
    await prisma.organization.delete({ where: { id: organizationId } });
  }

  console.log(JSON.stringify({
    probe: "OIP-V2-FIX-016",
    disposableFixtureDeleted: true
  }));
}

main().catch(async (error) => {
  console.error(error);
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
