/* TODO-033 read-only lazy validation/memory history probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-033 verifies persisted history read-only.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { evaluateTrust } = require(path.join(root, "lib", "trustEngine.ts"));

const DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const PROTECTED = [DEMO, MAESA, "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function snapshot(organizationId) {
  const where = { organizationId };
  return digest(await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId } }),
    prisma.ticketSequence.findUnique({ where: { organizationId } })
  ]));
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)])));
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function ordered(records) {
  return records.every((record, index) => {
    if (index === 0) return true;
    const prior = records[index - 1];
    return prior.timestamp < record.timestamp || (prior.timestamp === record.timestamp && prior.id <= record.id);
  });
}

async function hydration(includeHistory) {
  return Promise.all([
    persistence.listOrganizationProfiles(),
    persistence.loadKnowledge(DEMO),
    persistence.loadKnowledgeCandidates(DEMO),
    ...(includeHistory ? [persistence.loadValidationRecords(DEMO), persistence.loadMemoryChangeRecords(DEMO)] : []),
    persistence.loadOrgMetrics(DEMO),
    persistence.loadIntelligenceLog(DEMO),
    persistence.loadEmergingPatterns(DEMO),
    persistence.loadTicketRecords(DEMO)
  ]);
}

async function timed(read) {
  const started = performance.now();
  const value = await read();
  return { value, elapsedMs: performance.now() - started, payloadBytes: bytes(value) };
}

async function historyShape() {
  const [memoryGroups, validationGroups] = await Promise.all([
    prisma.memoryChangeRecord.groupBy({ by: ["knowledgeItemId"], where: { organizationId: DEMO }, _count: { _all: true } }),
    prisma.validationRecord.groupBy({ by: ["knowledgeItemId"], where: { organizationId: DEMO }, _count: { _all: true } })
  ]);
  const validationByItem = new Map(validationGroups.map((group) => [group.knowledgeItemId, group._count._all]));
  return memoryGroups.map((group) => ({
    knowledgeId: group.knowledgeItemId,
    memoryCount: group._count._all,
    validationCount: validationByItem.get(group.knowledgeItemId) ?? 0
  })).sort((left, right) => left.memoryCount - right.memoryCount || left.knowledgeId.localeCompare(right.knowledgeId));
}

async function measureHistory(label, knowledgeId) {
  const measurement = await timed(() => persistence.loadKnowledgeHistory(DEMO, knowledgeId));
  const history = measurement.value;
  check(`${label} history is scoped`, history.validationRecords.every((record) => record.organizationId === DEMO && record.knowledgeId === knowledgeId)
    && history.memoryChangeRecords.every((record) => record.organizationId === DEMO && record.knowledgeId === knowledgeId));
  check(`${label} history is deterministically ordered`, ordered(history.validationRecords) && ordered(history.memoryChangeRecords));
  console.log(`HISTORY ${label}: item=${knowledgeId}; validations=${history.validationRecords.length}; memoryChanges=${history.memoryChangeRecords.length}; payload=${(measurement.payloadBytes / 1024).toFixed(1)} KiB; read=${measurement.elapsedMs.toFixed(1)} ms`);
  return measurement;
}

async function main() {
  const beforeSnapshot = await snapshots();
  const [beforeHydration, afterHydration] = await Promise.all([
    timed(() => hydration(true)),
    timed(() => hydration(false))
  ]);
  const fullValidations = await persistence.loadValidationRecords(DEMO);
  const fullMemory = await persistence.loadMemoryChangeRecords(DEMO);
  console.log(`HYDRATION before=${(beforeHydration.payloadBytes / 1024 / 1024).toFixed(1)} MiB (${beforeHydration.elapsedMs.toFixed(1)} ms); after=${(afterHydration.payloadBytes / 1024 / 1024).toFixed(1)} MiB (${afterHydration.elapsedMs.toFixed(1)} ms); excluded validations=${(bytes(fullValidations) / 1024).toFixed(1)} KiB; excluded memory=${(bytes(fullMemory) / 1024 / 1024).toFixed(1)} MiB`);
  check("initial hydration excludes full validation and memory history", afterHydration.payloadBytes < beforeHydration.payloadBytes - bytes(fullValidations) - bytes(fullMemory) + 1024);

  const shape = await historyShape();
  const heroId = "demo-ki-sso-certificate-redirect-loop";
  const nonHero = shape.filter((entry) => entry.knowledgeId !== heroId);
  const small = nonHero[0];
  const medium = nonHero[Math.floor(nonHero.length / 2)];
  const smallHistory = await measureHistory("small", small.knowledgeId);
  const mediumHistory = await measureHistory("medium", medium.knowledgeId);
  const heroHistory = await measureHistory("HERO", heroId);
  check("representative history sizes preserve persisted counts", smallHistory.value.validationRecords.length === small.validationCount
    && smallHistory.value.memoryChangeRecords.length === small.memoryCount
    && mediumHistory.value.validationRecords.length === medium.validationCount
    && mediumHistory.value.memoryChangeRecords.length === medium.memoryCount);

  const [profile, items, maesaItems] = await Promise.all([
    persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO), persistence.loadKnowledge(MAESA)
  ]);
  const hero = items.find((item) => item.id === heroId);
  check("embedded curated provenance remains immediate", hero?.provenance?.sourceTicketId === "OIP-20230104-0001");
  check("scoped validation history preserves trust decision", evaluateTrust(hero, profile, heroHistory.value.validationRecords).decision === evaluateTrust(hero, profile, fullValidations).decision);

  await assert.rejects(
    () => persistence.loadKnowledgeHistory(DEMO, maesaItems[0].id),
    (error) => error?.code === "RESOURCE_NOT_FOUND" && error?.status === 404
  );
  check("cross-organization knowledge history fails closed", true);

  const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const routeSource = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "knowledge", "[knowledgeId]", "history", "route.ts"), "utf8");
  check("initial hydration does not invoke full-history readers", !pageSource.includes("persistence.loadValidationRecords(orgId)") && !pageSource.includes("persistence.loadMemoryChangeRecords(orgId)"));
  check("client cache is generation-safe and organization-keyed", pageSource.includes("knowledgeHistoryCache") && pageSource.includes("organizationSwitchGeneration.current") && pageSource.includes("`${organizationId}:${knowledgeId}`"));
  check("history API uses membership-protected organization route", routeSource.includes("withOrganizationRoute<KnowledgeHistoryRouteParams>"));

  const afterSnapshot = await snapshots();
  assert.deepEqual(afterSnapshot, beforeSnapshot, "TODO-033 must not modify protected organizations.");
  console.log(JSON.stringify({
    beforeHydrationBytes: beforeHydration.payloadBytes,
    afterHydrationBytes: afterHydration.payloadBytes,
    excludedValidationBytes: bytes(fullValidations),
    excludedMemoryChangeBytes: bytes(fullMemory),
    onDemand: [smallHistory, mediumHistory, heroHistory].map((entry) => ({
      validationRecords: entry.value.validationRecords.length,
      memoryChangeRecords: entry.value.memoryChangeRecords.length,
      payloadBytes: entry.payloadBytes,
      elapsedMs: Number(entry.elapsedMs.toFixed(1))
    })),
    dataSafety: "protected snapshots unchanged"
  }, null, 2));
  console.log("TODO-033 lazy-history probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
