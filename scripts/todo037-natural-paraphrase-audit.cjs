/*
 * TODO-037 — Natural-language paraphrase retrieval audit.
 *
 * Read-only: this probe loads the persisted Developer Demo and exercises the
 * same pure production boundaries used by app/page.tsx. It intentionally does
 * not add a retrieval heuristic or write tickets, metrics, or history.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-037 is a read-only persisted-memory audit.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isCompatibleForDrafting
} = require(path.join(root, "lib", "drafting.ts"));
const {
  selectPreferredMatch,
  withPreDiscriminationLessonMatches
} = require(path.join(root, "lib", "lessonSelection.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo037-natural-paraphrase-fixtures.json"), "utf8"));
const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function organizationSnapshot(organizationId) {
  const where = { organizationId };
  const [organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence] = await Promise.all([
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
  ]);
  return {
    digest: digest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }),
    counts: {
      knowledge: knowledge.length, candidates: candidates.length, validations: validations.length,
      memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length
    }
  };
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)])));
}

function ticket(definition, prefix = "TODO037") {
  return {
    id: `${prefix}-${definition.id}`,
    ticketId: `${prefix}-${definition.id}`,
    customerName: "TODO-037 Audit",
    subject: definition.subject,
    description: definition.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-22T00:00:00.000Z"
  };
}

/** Production orchestration glue; retrieval/ranking/gates are imported above. */
function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatibleMatches = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatibleMatches.length ? selectPreferredMatch(input, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, input) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  const heroItem = items.find((item) => item.id === HERO);
  const heroLesson = heroItem ? findMatchingLesson(input, heroItem) : null;
  const heroCompatibility = heroItem ? assessCompatibilityDecision(understanding, heroItem, input) : null;
  return { understanding, canonical, rawMatches, matches, compatibleMatches, selected, topMatch, lessonMatch, compatibility, heroLesson, heroCompatibility, draft };
}

function resultSummary(result) {
  const heroRank = result.rawMatches.findIndex((match) => match.item.id === HERO);
  return {
    category: result.understanding.category,
    detectedSignals: result.understanding.detectedSignals,
    canonicalProblem: result.canonical.title,
    rawTop: result.rawMatches[0]?.item.id ?? null,
    candidates: result.rawMatches.slice(0, 5).map((match) => ({ id: match.item.id, score: match.matchScore })),
    top3: result.rawMatches.slice(0, 3).map((match) => match.item.id),
    heroRank: heroRank < 0 ? null : heroRank + 1,
    selectedCanonical: result.topMatch?.item.id ?? null,
    lesson: result.lessonMatch?.lesson.id ?? null,
    lessonSignals: result.lessonMatch?.matchedSignals ?? [],
    lessonCandidateIds: result.topMatch?.item.lessons?.map((lesson) => lesson.id) ?? [],
    compatibility: result.compatibility?.state ?? "none",
    compatibilityReason: result.compatibility?.reason ?? null,
    strongEvidence: Boolean(result.lessonMatch && result.lessonMatch.score >= 2 && result.lessonMatch.multiTokenMatches >= 1),
    authorized: result.draft.basedOnKnowledgeIds.includes(HERO),
    basedOn: result.draft.basedOnKnowledgeIds,
    finalPath: result.draft.source,
    draftPreview: result.draft.draftResponse.slice(0, 120)
  };
}

function classifyFailure(result, expectedAuthorized, expectedCanonical = HERO) {
  if (expectedAuthorized && result.understanding.category !== "Authentication") return "analyzer/category";
  if (expectedAuthorized && result.rawMatches.findIndex((m) => m.item.id === expectedCanonical) < 0) return "retrieval/recall";
  if (expectedAuthorized && !result.topMatch) {
    if (!result.heroLesson) return "lesson-evidence";
    if (result.heroCompatibility?.state !== "compatible") return "semantic/root-cause-compatibility";
    return "selection/ranking";
  }
  if (expectedAuthorized && result.topMatch?.item.id !== expectedCanonical) return "selection/ranking";
  if (expectedAuthorized && !result.lessonMatch) return "lesson-evidence";
  if (expectedAuthorized && result.compatibility?.state !== "compatible") return "semantic/root-cause-compatibility";
  if (expectedAuthorized && !result.draft.basedOnKnowledgeIds.includes(expectedCanonical)) return "drafting-authorization";
  if (!expectedAuthorized && result.draft.basedOnKnowledgeIds.length > 0) return "safety-authorization";
  return null;
}

function appendSignal(definition, text, suffix) {
  return ticket({ ...definition, id: `${definition.id}-${suffix}`, description: `${definition.description} ${text}` });
}

function compactFixtureResult(definition, result, expectedAuthorized) {
  const actual = resultSummary(result);
  return {
    id: definition.id,
    subject: definition.subject,
    expectedAuthorized,
    ...actual,
    passed: expectedAuthorized
      ? actual.selectedCanonical === HERO && actual.authorized
      : !actual.authorized,
    failureLayer: classifyFailure(result, expectedAuthorized)
  };
}

function mockSemanticProvider(calls) {
  return {
    mode: "lmstudio",
    label: "TODO-037 controlled mock",
    async discriminateMatch(input) {
      calls.push(input.matchedCanonicalTitle);
      return {
        ok: true,
        providerMode: "lmstudio",
        providerLabel: "TODO-037 controlled mock",
        latencyMs: 0,
        data: { isDistinctFromMatch: false, confidence: "high", reasoning: "Controlled audit confirmation only." }
      };
    }
  };
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  if (profile.id !== DEMO || items.length !== 45) throw new Error(`Expected mature Developer Demo profile with 45 items; got ${profile.id}/${items.length}.`);
  const hero = items.find((item) => item.id === HERO);
  if (!hero) throw new Error(`Missing ${HERO}.`);

  const manualTicket = ticket(fixture.manualTicket, "TODO037-MANUAL");
  const manualResult = runPipeline(manualTicket, profile, items);
  const manual = compactFixtureResult(fixture.manualTicket, manualResult, true);
  console.log(`MANUAL ${manual.passed ? "PASS" : "FAIL"} category=${manual.category} canonical=${manual.selectedCanonical ?? "none"} lesson=${manual.lesson ?? "none"} authorized=${manual.authorized} path=${manual.finalPath}`);
  console.log(`MANUAL TRACE ${JSON.stringify(manual)}`);

  const paraphrases = fixture.genuineParaphrases.map((definition) => {
    const result = runPipeline(ticket(definition), profile, items);
    return compactFixtureResult(definition, result, true);
  });
  for (const row of paraphrases) {
    console.log(`PARAPHRASE ${row.passed ? "PASS" : "FAIL"} ${row.id} canonical=${row.selectedCanonical ?? "none"} rank=${row.heroRank ?? "none"} lesson=${row.lesson ?? "none"} authorized=${row.authorized} layer=${row.failureLayer ?? "-"}`);
  }

  const controls = fixture.controls.map((definition) => {
    const result = runPipeline(ticket(definition), profile, items);
    return { ...compactFixtureResult(definition, result, false), label: definition.label };
  });
  for (const row of controls) {
    console.log(`CONTROL ${row.passed ? "PASS" : "FAIL"} ${row.id} (${row.label}) canonical=${row.selectedCanonical ?? "none"} authorized=${row.authorized} layer=${row.failureLayer ?? "-"}`);
  }

  const exactWordDependency = fixture.genuineParaphrases.map((definition) => {
    const natural = runPipeline(ticket(definition), profile, items);
    const oneSignal = runPipeline(appendSignal(definition, "authentication certificate", "one-signal"), profile, items);
    const manySignals = runPipeline(appendSignal(definition, "authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop", "many-signals"), profile, items);
    return {
      id: definition.id,
      naturalAuthorized: natural.draft.basedOnKnowledgeIds.includes(HERO),
      oneSignalAuthorized: oneSignal.draft.basedOnKnowledgeIds.includes(HERO),
      manySignalsAuthorized: manySignals.draft.basedOnKnowledgeIds.includes(HERO),
      naturalCanonical: natural.topMatch?.item.id ?? null,
      oneSignalCanonical: oneSignal.topMatch?.item.id ?? null,
      manySignalsCanonical: manySignals.topMatch?.item.id ?? null,
      naturalFailureLayer: classifyFailure(natural, true),
      oneSignalFailureLayer: classifyFailure(oneSignal, true),
      manySignalsFailureLayer: classifyFailure(manySignals, true)
    };
  });
  const dependencySummary = {
    naturalAuthorized: exactWordDependency.filter((row) => row.naturalAuthorized).length,
    oneSignalAuthorized: exactWordDependency.filter((row) => row.oneSignalAuthorized).length,
    manySignalsAuthorized: exactWordDependency.filter((row) => row.manySignalsAuthorized).length,
    total: exactWordDependency.length
  };
  console.log(`EXACT-WORD natural=${dependencySummary.naturalAuthorized}/${dependencySummary.total} oneSignal=${dependencySummary.oneSignalAuthorized}/${dependencySummary.total} manySignals=${dependencySummary.manySignalsAuthorized}/${dependencySummary.total}`);

  const safety = {};
  const contradiction = controls.find((row) => row.id === "C11");
  const negation = controls.find((row) => row.id === "C12");
  const weak = controls.find((row) => row.id === "C10");
  safety.contradictionBlocked = contradiction && !contradiction.authorized;
  safety.negationBlocked = negation && !negation.authorized;
  safety.weakOverlapBlocked = weak && !weak.authorized;

  const aiCalls = [];
  // TODO-040: the original harness input (genuineParaphrases[0]) now carries
  // STRONG deterministic lesson evidence, so the bounded semantic fallback
  // correctly refuses to run for it (it may only resolve state "unknown").
  // Use a purpose-built vague-SSO ticket whose deterministic evidence is still
  // insufficient so this case keeps verifying the same property: the controlled
  // semantic path can authorize within its boundary when determinism cannot.
  const semanticTicket = ticket({
    id: "AI-SEMANTIC-UNKNOWN",
    subject: "Enterprise identity trouble after maintenance",
    description: "Staff using the corporate identity service describe intermittent trouble completing enterprise workspace access after a scheduled maintenance window. We have no clear symptom details yet."
  }, "TODO037-AI");
  const semanticUnderstanding = understandForProfile(semanticTicket, profile);
  const semanticEvaluation = await evaluateSemanticLessonCompatibility(mockSemanticProvider(aiCalls), semanticTicket, semanticUnderstanding, hero);
  const semanticDraft = draftResponse(semanticTicket, semanticUnderstanding, {
    item: hero, matchScore: 1, matchReason: "controlled semantic candidate", matchedTags: [], matchedKeywords: [], matchedCategory: hero.category
  }, profile, false, semanticEvaluation.authorization);
  safety.controlledSemanticAuthorization = semanticEvaluation.authorization?.itemId === HERO && semanticDraft.basedOnKnowledgeIds.includes(HERO);
  safety.semanticCalls = aiCalls.length;

  const hardGateCalls = [];
  const hardGateTicket = ticket({ id: "AI-HARD-GATE", subject: "Reports fail after successful sign-in", description: "I can sign in normally and this is not an authentication issue. The report is unavailable." }, "TODO037-AI");
  const hardGateUnderstanding = understandForProfile(hardGateTicket, profile);
  const hardGate = await evaluateSemanticLessonCompatibility(mockSemanticProvider(hardGateCalls), hardGateTicket, hardGateUnderstanding, hero);
  safety.aiCannotBypassContradiction = !hardGate.authorization && hardGateCalls.length === 0;
  safety.hardGateReason = hardGate.declineReason;

  const metrics = {
    canonicalCandidateRecall: paraphrases.filter((row) => row.heroRank !== null).length / paraphrases.length,
    canonicalSelectionRecall: paraphrases.filter((row) => row.selectedCanonical === HERO).length / paraphrases.length,
    top3Recall: paraphrases.filter((row) => row.heroRank !== null && row.heroRank <= 3).length / paraphrases.length,
    authorizationSuccess: paraphrases.filter((row) => row.authorized).length / paraphrases.length,
    falseNegatives: paraphrases.filter((row) => !row.authorized).length,
    controlFalsePositives: controls.filter((row) => row.authorized).length,
    controlsPassed: controls.filter((row) => row.passed).length,
    controlsTotal: controls.length
  };
  const safetyFailure = Object.entries(safety).some(([key, value]) => ["contradictionBlocked", "negationBlocked", "weakOverlapBlocked", "controlledSemanticAuthorization", "aiCannotBypassContradiction"].includes(key) && value !== true);
  const coreWeakness = metrics.authorizationSuccess < 1 || metrics.canonicalSelectionRecall < 1;
  const verdict = safetyFailure ? "SAFETY_FAILURE" : coreWeakness ? "CORE_RETRIEVAL_WEAKNESS_CONFIRMED" : "PASS";
  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);

  const report = {
    verdict,
    manual,
    paraphrases,
    controls,
    metrics,
    exactWordDependency: { ...dependencySummary, cases: exactWordDependency },
    safety,
    protectedUnchanged,
    snapshots: { before, after }
  };
  console.log(`METRICS ${JSON.stringify(metrics)}`);
  console.log(`SAFETY ${JSON.stringify(safety)}`);
  console.log(`SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"}`);
  console.log(`SNAPSHOT-DIGESTS ${JSON.stringify({ before, after })}`);
  console.log(`VERDICT ${verdict}`);
  console.log(JSON.stringify(report, null, 2));
  if (safetyFailure) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
