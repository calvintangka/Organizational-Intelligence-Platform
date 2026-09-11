/* OIP-V2-FIX-014 saveOrgLog reliability regression. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { saveIntelligenceLog } = require(path.join(root, "lib", "server", "persistenceService.ts"));
const persistenceServiceSource = fs.readFileSync(path.join(root, "lib", "server", "persistenceService.ts"), "utf8");

const MAX_ENTRIES = 80;
const timestamp = Date.now();
const organizationAId = `oip-v2-fix-014-a-${timestamp}`;
const organizationBId = `oip-v2-fix-014-b-${timestamp}`;

function entry(id, index, event = "FIX-014 regression event") {
  return {
    id,
    timestamp: new Date(Date.UTC(2026, 8, 11, 0, 0, index)).toISOString(),
    event,
    detail: `FIX-014 ${id}`
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  assert.match(persistenceServiceSource, /const MAX_INTELLIGENCE_LOG_ENTRIES = 80/);
  assert.match(persistenceServiceSource, /const boundedEntries = normalizedEntries\.slice\(-MAX_INTELLIGENCE_LOG_ENTRIES\)/);
  assert.match(persistenceServiceSource, /FOR UPDATE/);
  assert.doesNotMatch(persistenceServiceSource, /id: \{ notIn: entries\.map\(\(entry\) => entry\.id\) \}/);

  const prisma = getPrismaClient();
  let organizationA;
  let organizationB;
  try {
    [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          id: organizationAId,
          name: "OIP FIX-014 Reliability A",
          industry: "Regression",
          description: "Disposable FIX-014 saveOrgLog regression organization.",
          settings: {},
          createdAt: new Date()
        }
      }),
      prisma.organization.create({
        data: {
          id: organizationBId,
          name: "OIP FIX-014 Reliability B",
          industry: "Regression",
          description: "Disposable FIX-014 tenant-isolation organization.",
          settings: {},
          createdAt: new Date()
        }
      })
    ]);

    const seededRows = Array.from({ length: 614 }, (_, index) => entry(`oip-v2-fix-014-seed-${timestamp}-${index}`, index));
    await prisma.intelligenceLog.createMany({
      data: seededRows.map((row) => ({ ...row, organizationId: organizationA.id }))
    });

    const largeSnapshot = Array.from({ length: 2000 }, (_, index) => entry(`oip-v2-fix-014-large-${timestamp}-${index}`, 1000 + index, "large bounded snapshot"));
    const largeStartedAt = Date.now();
    await saveIntelligenceLog(organizationA.id, largeSnapshot);
    const largeDurationMs = Date.now() - largeStartedAt;
    const afterLarge = await prisma.intelligenceLog.findMany({
      where: { organizationId: organizationA.id },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }]
    });
    assert.equal(afterLarge.length, MAX_ENTRIES, "large snapshots must retain only the bounded tail");
    assert.equal(afterLarge[0].id, largeSnapshot.at(-1).id, "the newest large-snapshot entry must persist");

    const burstBase = afterLarge.slice(0, 78).map((row) => ({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      event: row.event,
      detail: row.detail ?? undefined
    }));
    const concurrentA = entry(`oip-v2-fix-014-concurrent-a-${timestamp}`, 5000, "concurrent A");
    const concurrentB = entry(`oip-v2-fix-014-concurrent-b-${timestamp}`, 5001, "concurrent B");
    const concurrentResults = await Promise.allSettled([
      saveIntelligenceLog(organizationA.id, [...burstBase, concurrentA]),
      saveIntelligenceLog(organizationA.id, [...burstBase, concurrentB])
    ]);
    assert.deepEqual(concurrentResults.map((result) => result.status), ["fulfilled", "fulfilled"], "same-organization concurrent saves must both commit");

    const afterConcurrent = await prisma.intelligenceLog.findMany({ where: { organizationId: organizationA.id } });
    const concurrentIds = new Set(afterConcurrent.map((row) => row.id));
    assert.equal(afterConcurrent.length, MAX_ENTRIES, "concurrent writes must preserve the retention bound");
    assert.equal(concurrentIds.size, afterConcurrent.length, "intelligence-log IDs must remain unique");
    assert.equal(concurrentIds.has(concurrentA.id), true, "concurrent A must not be lost");
    assert.equal(concurrentIds.has(concurrentB.id), true, "concurrent B must not be lost");

    const foreignEntry = entry(`oip-v2-fix-014-foreign-${timestamp}`, 6000, "foreign tenant control");
    await prisma.intelligenceLog.create({ data: { ...foreignEntry, organizationId: organizationB.id } });
    const beforeTenantCheck = await prisma.intelligenceLog.count({ where: { organizationId: organizationA.id } });
    const tenantError = await saveIntelligenceLog(organizationA.id, [foreignEntry]).then(() => null, (error) => error);
    assert.equal(tenantError?.code, "CONFLICT", "cross-tenant IDs must be rejected");
    assert.equal(await prisma.intelligenceLog.count({ where: { organizationId: organizationA.id } }), beforeTenantCheck, "tenant rejection must not alter the target organization");
    assert.equal((await prisma.intelligenceLog.findUnique({ where: { id: foreignEntry.id }, select: { organizationId: true } })).organizationId, organizationB.id, "foreign row ownership must remain unchanged");

    console.log("OIP-V2-FIX-014 saveOrgLog reliability regression: PASS");
    console.log(`bounded 2000-entry snapshot: PASS (${largeDurationMs} ms)`);
    console.log("concurrent same-organization writes: PASS");
    console.log("lost updates: 0");
    console.log("unexpected duplicate entries: 0");
    console.log("tenant isolation: PASS");
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("OIP-V2-FIX-014 saveOrgLog reliability regression: FAIL");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
