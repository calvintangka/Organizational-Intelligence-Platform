/*
 * TODO-025H — read-only mature Developer Demo scale and responsiveness audit.
 *
 * Measures production server persistence readers and the pure production ticket
 * processing boundaries. It intentionally does not allocate ticket IDs, submit
 * tickets, activate organizations, or invoke any writer.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-025H audits the persisted mature organization read-only.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { curatedDeveloperDemoScenarios } = require(path.join(root, "data", "developerDemoScenarios.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { withPreDiscriminationLessonMatches, selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));
const { assessCompatibilityDecision, draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const RUNS = 6;

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

function milliseconds(value) {
  return `${value.toFixed(1)} ms`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(name, read, count) {
  const samples = [];
  let value;
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now();
    value = await read();
    samples.push(performance.now() - started);
  }
  const result = {
    operation: name,
    records: count(value),
    payloadBytes: bytes(value),
    firstMs: samples[0],
    medianMs: median(samples),
    slowestMs: Math.max(...samples)
  };
  console.log(`READ ${name}: records=${result.records}; payload=${(result.payloadBytes / 1024).toFixed(1)} KiB; first=${milliseconds(result.firstMs)}; median=${milliseconds(result.medianMs)}; slowest=${milliseconds(result.slowestMs)}`);
  return { result, value };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function ticket(id, subject, description) {
  return {
    id, ticketId: id, customerName: "TODO-025H audit", subject, description,
    category: "General", status: "new", createdAt: "2026-07-22T00:00:00.000Z"
  };
}

function processDeterministically(testTicket, profile, items) {
  const timings = {};
  let started = performance.now();
  const understanding = understandForProfile(testTicket, profile);
  timings.analysis = performance.now() - started;
  started = performance.now();
  const canonical = identifyCanonicalProblem(understanding, profile);
  timings.canonical = performance.now() - started;
  started = performance.now();
  const rawMatches = retrieveMemory(understanding, items, new Set());
  timings.retrieval = performance.now() - started;
  started = performance.now();
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, testTicket));
  const selected = compatible.length ? selectPreferredMatch(testTicket, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, testTicket) : null;
  timings.selectionAuthorization = performance.now() - started;
  started = performance.now();
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  timings.drafting = performance.now() - started;
  return { understanding, canonical, topMatch, lessonMatch, compatibility, draft, timings };
}

function summarizeProcessing(result) {
  return {
    category: result.understanding.category,
    canonical: result.topMatch?.item.id ?? null,
    lesson: result.lessonMatch?.lesson.id ?? null,
    authorized: result.draft.basedOnKnowledgeIds.length > 0,
    draftSource: result.draft.source
  };
}

function medianStage(results, stage) {
  return median(results.map((result) => result.timings[stage]));
}

async function verifyCounts() {
  const where = { organizationId: DEMO };
  const [knowledge, candidates, validations, changes, tickets, evidence, patterns] = await Promise.all([
    prisma.knowledgeItem.count({ where }), prisma.knowledgeCandidate.count({ where }),
    prisma.validationRecord.count({ where }), prisma.memoryChangeRecord.count({ where }),
    prisma.ticketRecord.count({ where }), prisma.trustEvidence.count({ where }),
    prisma.emergingPattern.count({ where })
  ]);
  const items = await persistence.loadKnowledge(DEMO);
  const lessons = items.reduce((total, item) => total + item.lessons.length, 0);
  const versions = items.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0);
  const counts = { knowledge, lessons, versions, tickets, candidates, validations, changes, evidence, patterns };
  console.log(`BASELINE ${JSON.stringify(counts)}`);
  assert.deepEqual(counts, { knowledge: 45, lessons: 180, versions: 130, tickets: 5000, candidates: 1800, validations: 1800, changes: 1800, evidence: 4500, patterns: 45 });
}

async function main() {
  const before = await snapshots();
  await verifyCounts();

  const resources = [
    ["organization profile", () => persistence.getOrganizationProfile(DEMO), () => 1],
    ["organization list", () => persistence.listOrganizationProfiles(), (value) => value.length],
    ["knowledge", () => persistence.loadKnowledge(DEMO), (value) => value.length],
    ["knowledge candidates", () => persistence.loadKnowledgeCandidates(DEMO), (value) => value.length],
    ["validation history", () => persistence.loadValidationRecords(DEMO), (value) => value.length],
    ["memory-change history", () => persistence.loadMemoryChangeRecords(DEMO), (value) => value.length],
    ["metrics", () => persistence.loadOrgMetrics(DEMO), (value) => value ? 1 : 0],
    ["intelligence log", () => persistence.loadIntelligenceLog(DEMO), (value) => value.length],
    ["emerging patterns", () => persistence.loadEmergingPatterns(DEMO), (value) => value.length],
    ["ticket collection", () => persistence.loadTicketRecords(DEMO), (value) => value.length]
  ];
  const measurements = [];
  for (const [name, read, count] of resources) measurements.push((await measure(name, read, count)).result);

  const hydrate = await measure("full organization hydration resource set", async () => Promise.all([
    persistence.listOrganizationProfiles(), persistence.loadKnowledge(DEMO), persistence.loadKnowledgeCandidates(DEMO),
    persistence.loadValidationRecords(DEMO), persistence.loadMemoryChangeRecords(DEMO), persistence.loadOrgMetrics(DEMO),
    persistence.loadIntelligenceLog(DEMO), persistence.loadEmergingPatterns(DEMO), persistence.loadTicketRecords(DEMO)
  ]), (value) => value.reduce((total, resource) => total + (Array.isArray(resource) ? resource.length : resource ? 1 : 0), 0));
  measurements.push(hydrate.result);

  for (const [from, to] of [["profile-maesa-tech", DEMO], [DEMO, "profile-fastdrop-logistics"], ["profile-fastdrop-logistics", DEMO]]) {
    const switchMeasure = await measure(`read-only switch preload ${from} → ${to}`, async () => Promise.all([
      persistence.getOrganizationProfile(to), persistence.loadKnowledge(to), persistence.loadKnowledgeCandidates(to),
      persistence.loadValidationRecords(to), persistence.loadMemoryChangeRecords(to), persistence.loadOrgMetrics(to),
      persistence.loadIntelligenceLog(to), persistence.loadEmergingPatterns(to), persistence.loadTicketRecords(to)
    ]), (value) => value.reduce((total, resource) => total + (Array.isArray(resource) ? resource.length : resource ? 1 : 0), 0));
    measurements.push(switchMeasure.result);
  }

  const [profile, knowledge] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  const scenarioDefinitions = [
    ...curatedDeveloperDemoScenarios,
    {
      id: "paraphrase", ticketSubject: "Sign-in keeps bouncing after the IdP signing credential was replaced",
      ticketBody: "Our SAML users return to the identity provider repeatedly after we renewed the certificate. authentication certificate redirect timeline.",
      expectedKnowledgeId: "demo-ki-sso-certificate-redirect-loop", expectedLessonId: "demo-les-sso-certificate-redirect-loop-001", expectedAuthorized: true
    },
    {
      id: "long-tail", ticketSubject: "Mobile Offline Export Loses Date Filters",
      ticketBody: "mobile offline export timeline root cause 01 mobile-offline-export-filters",
      expectedKnowledgeId: "demo-ki-mobile-offline-export-filters", expectedLessonId: "demo-les-mobile-offline-export-filters-001", expectedAuthorized: true
    }
  ];
  const retrievalMeasurements = [];
  for (const scenario of scenarioDefinitions) {
    const input = ticket(`TODO025H-${scenario.id}`, scenario.ticketSubject, scenario.ticketBody);
    const runs = Array.from({ length: RUNS }, () => processDeterministically(input, profile, knowledge));
    const result = runs[0];
    const summary = summarizeProcessing(result);
    console.log(`PROCESS ${scenario.id}: ${JSON.stringify(summary)}; analysis=${milliseconds(medianStage(runs, "analysis"))}; canonical=${milliseconds(medianStage(runs, "canonical"))}; retrieval=${milliseconds(medianStage(runs, "retrieval"))}; selection+authorization=${milliseconds(medianStage(runs, "selectionAuthorization"))}; drafting=${milliseconds(medianStage(runs, "drafting"))}`);
    check(`${scenario.id} preserves canonical selection`, summary.canonical === scenario.expectedKnowledgeId, summary.canonical ?? "none");
    check(`${scenario.id} preserves lesson selection`, summary.lesson === scenario.expectedLessonId, summary.lesson ?? "none");
    check(`${scenario.id} preserves authorization`, summary.authorized === scenario.expectedAuthorized, summary.draftSource);
    check(`${scenario.id} deterministic repeat`, new Set(runs.map((entry) => JSON.stringify(summarizeProcessing(entry)))).size === 1);
    retrievalMeasurements.push({ id: scenario.id, summary, analysisMs: medianStage(runs, "analysis"), canonicalMs: medianStage(runs, "canonical"), retrievalMs: medianStage(runs, "retrieval"), selectionAuthorizationMs: medianStage(runs, "selectionAuthorization"), draftingMs: medianStage(runs, "drafting") });
  }

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-025H must not modify protected persisted organizations.");
  console.log("AUDIT_SUMMARY");
  console.log(JSON.stringify({ runsPerMeasurement: RUNS, measurements, retrievalMeasurements, dataSafety: "protected snapshots unchanged" }, null, 2));
  console.log("TODO-025H scale/responsiveness audit probe passed. Timings are local direct persistence timings; HTTP transport, browser JSON parsing, and development compilation are intentionally reported separately as measurement limits.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
