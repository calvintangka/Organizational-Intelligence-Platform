/* TODO-035 read-only Knowledge Explorer derivation reassessment. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-035 audits mature Knowledge Explorer data read-only.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { KnowledgeView } = require(path.join(root, "components", "views", "KnowledgeView.tsx"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const RENDER_RUNS = 7;
const DERIVATION_RUNS = 2_000;

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

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

async function timed(read) {
  const started = performance.now();
  const value = await read();
  return { value, elapsedMs: performance.now() - started, payloadBytes: bytes(value) };
}

function historyState(ids) {
  return Object.fromEntries(ids.map((id) => [id, { state: "loaded" }]));
}

function viewProps(resources, validations, changes, loadedIds) {
  return {
    knowledgeItems: resources.knowledge,
    knowledgeCandidates: resources.candidates,
    emergingPatterns: resources.patterns,
    validationRecords: validations,
    memoryChangeRecords: changes,
    historyLoadState: historyState(loadedIds),
    darkMode: false,
    orgId: DEMO,
    onPromote: () => undefined,
    onImportPack: () => undefined,
    onValidatePackCandidate: () => null,
    onRejectPackCandidate: () => undefined,
    onLoadHistory: async () => undefined
  };
}

function measureRender(label, props) {
  renderToStaticMarkup(React.createElement(KnowledgeView, props));
  const samples = [];
  let output = "";
  for (let index = 0; index < RENDER_RUNS; index += 1) {
    const started = performance.now();
    output = renderToStaticMarkup(React.createElement(KnowledgeView, props));
    samples.push(performance.now() - started);
  }
  const result = {
    label,
    medianMs: median(samples),
    slowestMs: Math.max(...samples),
    markupBytes: Buffer.byteLength(output)
  };
  console.log(`RENDER ${label}: median=${result.medianMs.toFixed(2)} ms; slowest=${result.slowestMs.toFixed(2)} ms; markup=${(result.markupBytes / 1024).toFixed(1)} KiB`);
  return result;
}

function measureHistoryDerivation(label, items, validations, changes) {
  const comparisonsPerPass = items.length * (validations.length + changes.length);
  let matched = 0;
  const started = performance.now();
  for (let run = 0; run < DERIVATION_RUNS; run += 1) {
    for (const item of items) {
      matched += validations.filter((record) => record.knowledgeId === item.id).length;
      matched += changes.filter((record) => record.knowledgeId === item.id).length;
    }
  }
  const perPassMs = (performance.now() - started) / DERIVATION_RUNS;
  const result = { label, comparisonsPerPass, perPassMs, matchedPerPass: matched / DERIVATION_RUNS };
  console.log(`DERIVE ${label}: comparisons=${comparisonsPerPass}; matched=${result.matchedPerPass}; average=${perPassMs.toFixed(4)} ms/render`);
  return result;
}

async function historyShape() {
  const groups = await prisma.memoryChangeRecord.groupBy({
    by: ["knowledgeItemId"],
    where: { organizationId: DEMO },
    _count: { _all: true }
  });
  return groups
    .map((group) => ({ knowledgeId: group.knowledgeItemId, count: group._count._all }))
    .sort((left, right) => left.count - right.count || left.knowledgeId.localeCompare(right.knowledgeId));
}

async function main() {
  const before = await snapshots();
  const [knowledge, candidates, patterns, shape] = await Promise.all([
    persistence.loadKnowledge(DEMO),
    persistence.loadKnowledgeCandidates(DEMO),
    persistence.loadEmergingPatterns(DEMO),
    historyShape()
  ]);
  const resources = { knowledge, candidates, patterns };
  const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  check("mature Knowledge Explorer opens with 45 items", knowledge.length === 45);
  check("initial Knowledge Explorer receives no audit history", pageSource.includes("Promise.resolve([] as ValidationRecord[])")
    && pageSource.includes("Promise.resolve([] as MemoryChangeRecord[])"));

  const nonHero = shape.filter((entry) => entry.knowledgeId !== HERO);
  const smallId = nonHero[0].knowledgeId;
  const mediumId = nonHero[Math.floor(nonHero.length / 2)].knowledgeId;
  const [small, medium, hero] = await Promise.all([
    timed(() => persistence.loadKnowledgeHistory(DEMO, smallId)),
    timed(() => persistence.loadKnowledgeHistory(DEMO, mediumId)),
    timed(() => persistence.loadKnowledgeHistory(DEMO, HERO))
  ]);
  check("small history is item-scoped", small.value.validationRecords.every((record) => record.knowledgeId === smallId)
    && small.value.memoryChangeRecords.every((record) => record.knowledgeId === smallId));
  check("medium history is item-scoped", medium.value.validationRecords.every((record) => record.knowledgeId === mediumId)
    && medium.value.memoryChangeRecords.every((record) => record.knowledgeId === mediumId));
  check("HERO history preserves 140 validations and 140 changes", hero.value.validationRecords.length === 140 && hero.value.memoryChangeRecords.length === 140);

  const emptyValidations = [];
  const emptyChanges = [];
  const smallValidations = small.value.validationRecords;
  const smallChanges = small.value.memoryChangeRecords;
  const mediumValidations = medium.value.validationRecords;
  const mediumChanges = medium.value.memoryChangeRecords;
  const heroValidations = hero.value.validationRecords;
  const heroChanges = hero.value.memoryChangeRecords;
  const combinedValidations = [...smallValidations, ...mediumValidations, ...heroValidations];
  const combinedChanges = [...smallChanges, ...mediumChanges, ...heroChanges];

  const derivations = [
    measureHistoryDerivation("view-open", knowledge, emptyValidations, emptyChanges),
    measureHistoryDerivation("small-history", knowledge, smallValidations, smallChanges),
    measureHistoryDerivation("medium-history", knowledge, mediumValidations, mediumChanges),
    measureHistoryDerivation("HERO-history", knowledge, heroValidations, heroChanges),
    measureHistoryDerivation("three-loaded-items", knowledge, combinedValidations, combinedChanges)
  ];
  const renders = [
    measureRender("view-open", viewProps(resources, [], [], [])),
    measureRender("small-history", viewProps(resources, smallValidations, smallChanges, [smallId])),
    measureRender("medium-history", viewProps(resources, mediumValidations, mediumChanges, [mediumId])),
    measureRender("HERO-history", viewProps(resources, heroValidations, heroChanges, [HERO])),
    measureRender("three-loaded-items", viewProps(resources, combinedValidations, combinedChanges, [smallId, mediumId, HERO]))
  ];

  const viewSource = fs.readFileSync(path.join(root, "components", "views", "KnowledgeView.tsx"), "utf8");
  const overlaySource = fs.readFileSync(path.join(root, "components", "MemoryNetworkOverlay.tsx"), "utf8");
  check("full validation and memory readers remain absent from hydration", !pageSource.includes("persistence.loadValidationRecords(orgId)")
    && !pageSource.includes("persistence.loadMemoryChangeRecords(orgId)"));
  check("history cache is organization/item keyed", pageSource.includes("`${organizationId}:${knowledgeId}`"));
  check("completed and concurrent history reads are deduplicated", pageSource.includes("knowledgeHistoryCache.current[key]")
    && pageSource.includes("knowledgeHistoryRequests.current[key]"));
  check("organization switching clears history cache", pageSource.includes("clearKnowledgeHistoryCache()"));
  check("reopening a loaded item does not request history again", viewSource.includes('itemHistoryState.state === "not_loaded"'));
  check("history derivation remains simple loaded-array filtering", viewSource.includes("validationRecords.filter")
    && viewSource.includes("memoryChangeRecords.filter"));
  check("memory network derivation is isolated and memoized", overlaySource.includes("useMemo(() => deriveEdges(items), [items])"));
  check("loaded-history derivation remains bounded to opened items", derivations.at(-1).matchedPerPass === combinedValidations.length + combinedChanges.length);

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-035 must not modify protected organizations.");
  console.log(JSON.stringify({
    verdict: "NO_OPTIMIZATION_NEEDED",
    items: knowledge.length,
    lessons: knowledge.reduce((total, item) => total + item.lessons.length, 0),
    histories: {
      small: { knowledgeId: smallId, validations: smallValidations.length, changes: smallChanges.length, payloadBytes: small.payloadBytes, readMs: Number(small.elapsedMs.toFixed(1)) },
      medium: { knowledgeId: mediumId, validations: mediumValidations.length, changes: mediumChanges.length, payloadBytes: medium.payloadBytes, readMs: Number(medium.elapsedMs.toFixed(1)) },
      hero: { knowledgeId: HERO, validations: heroValidations.length, changes: heroChanges.length, payloadBytes: hero.payloadBytes, readMs: Number(hero.elapsedMs.toFixed(1)) }
    },
    derivations,
    renders,
    measurementScope: "direct PostgreSQL reads plus React server-render and pure-derivation surrogates; not a browser paint profile",
    cacheBehavior: "organization/item keyed; concurrent-deduplicated; cleared on switch; reopen does not refetch",
    knowledgeSearch: "not implemented in the current view; no search derivation to optimize",
    dataSafety: "protected snapshots unchanged"
  }, null, 2));
  console.log("TODO-035 Knowledge Explorer derivation reassessment passed: no production optimization needed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
