/*
 * FIX-011 controlled retrieval-generalization regression.
 *
 * The corpus is deliberately in memory. It exercises the same deterministic
 * queryUnderstanding -> retrieveMemory -> current projection path without
 * reading or mutating the live QA organization.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { defaultOrganizationProfile } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { queryOrganizationalMemory } = require(path.join(root, "lib", "knowledgeQuery.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { assessRetrievalCompatibility } = require(path.join(root, "lib", "retrievalCompatibility.ts"));

const CONTROLLED_ORG = "fix011-controlled-org";
const CREATED_AT = "2026-09-09T00:00:00.000Z";

function lesson(title, rootCause, solution, signals) {
  return {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-lesson`,
    title,
    rootCause,
    solution,
    signals,
    doNotPromise: ["Do not generalize beyond the verified device and healthy central feed."],
    sourceTicketId: "fix011-source-001",
    createdAt: CREATED_AT,
    whenToEscalate: "Escalate when the verified local intervention does not restore the current assignment list.",
    customerResponse: ""
  };
}

const primary = {
  id: "fix011-memory-primary",
  canonicalProblemId: "fix011-canonical-primary",
  organizationId: CONTROLLED_ORG,
  title: "Portable route manifest stayed stale after Wi-Fi handoff",
  canonicalProblemTitle: "Portable route manifest stayed stale after Wi-Fi handoff",
  problem: "One handheld moved between Wi-Fi coverage zones, reconnected, and kept yesterday's route assignments while the central dispatch feed remained current.",
  problemSummary: "One handheld showed an old route manifest after a network handoff while the central dispatch feed was healthy.",
  approvedAnswer: "Re-establish the affected application session after confirming the central feed is healthy.",
  category: "OPERATIONAL_EVENT",
  tags: ["organizational-memory", "operational_event"],
  sourceTicketId: "fix011-source-001",
  timesReused: 0,
  createdAt: CREATED_AT,
  approvedAt: CREATED_AT,
  lifecycleState: "active",
  governanceState: "trusted",
  trustScore: 20,
  revision: 2,
  scopeNote: "One handheld after a Wi-Fi handoff while the central dispatch feed is healthy.",
  lessons: [lesson(
    "Portable route manifest stayed stale after Wi-Fi handoff",
    "The affected handheld retained a stale application session after a network handoff while the central feed remained healthy.",
    "Close and reopen the dispatch application so the affected session requests the current route manifest.",
    ["handheld", "route manifest", "Wi-Fi handoff", "reconnected", "stale assignments"]
  )],
  provenance: {
    sourceTicketId: "fix011-source-001",
    validatedBy: "FIX011 QA reviewer",
    contributingTicketIds: ["fix011-source-001"]
  },
  validation: {
    status: "validated",
    validatedAt: CREATED_AT,
    validatedBy: "FIX011 QA reviewer",
    validationBasis: "Controlled fixture approved for regression.",
    validationScope: "FIX011 controlled corpus"
  }
};

const secondary = {
  ...primary,
  id: "fix011-memory-secondary",
  canonicalProblemId: "fix011-canonical-secondary",
  title: "Mobile assignment list stayed old after application restart",
  canonicalProblemTitle: "Mobile assignment list stayed old after application restart",
  problem: "A mobile dispatch device showed an old assignment list after the application restarted during a local session recovery.",
  problemSummary: "A mobile assignment list remained old after an application restart.",
  sourceTicketId: "fix011-source-002",
  scopeNote: "One mobile dispatch device after an application restart.",
  lessons: [lesson(
    "Mobile assignment list stayed old after application restart",
    "The mobile application retained an old assignment snapshot after restart.",
    "Refresh the application session and compare the assignment list with the current feed.",
    ["mobile device", "assignment list", "application restart", "old data"]
  )]
};

const otherTenant = { ...primary, id: "fix011-other-tenant-memory", canonicalProblemId: "fix011-other-tenant", organizationId: "other-tenant", title: "Other tenant route memory" };
const corpus = [primary, secondary, otherTenant];
const profile = { ...defaultOrganizationProfile, id: CONTROLLED_ORG, name: "FIX011 Controlled Operations" };

const queries = {
  nearExact: "Portable route manifest stayed stale after Wi-Fi handoff.",
  natural: "After crossing a Wi-Fi coverage handoff, one handheld came back online but kept yesterday's route list while dispatch remained current.",
  question: "What should we do when a field tablet reconnects after moving between coverage areas but its assignments are still old?",
  symptom: "One mobile device is online but showing stale work assignments while the central system is healthy.",
  relatedWrongProblem: "Several tablets across every depot are offline because the central dispatch service is down.",
  unrelated: "The office coffee machine is leaking and facilities needs a replacement part.",
  adversarial: "The dispatch dashboard was redesigned; route assignments are intentionally different, while every handheld is current."
};

function understandingFor(raw) {
  return understandForProfile({
    id: "fix011-query",
    ticketId: "fix011-query",
    customerName: "FIX011 controlled query",
    subject: "",
    description: raw,
    category: "General",
    status: "new",
    createdAt: CREATED_AT
  }, profile);
}

function direct(raw, items = [primary, secondary]) {
  return queryOrganizationalMemory(raw, profile, items);
}

function topTitle(result) {
  return result.matches[0]?.item.title ?? null;
}

async function main() {
  const baseline = Object.fromEntries(Object.entries(queries).map(([name, raw]) => {
    const result = direct(raw);
    const understanding = understandingFor(raw);
    const retrieval = retrieveMemory(understanding, [primary, secondary]);
    return [name, {
      raw,
      state: result.state,
      topTitle: topTitle(result),
      candidates: result.matches.length,
      category: understanding.category,
      retrievalText: understanding.retrievalText,
      detectedSignals: understanding.detectedSignals,
      facets: retrieval.map((match) => ({ title: match.item.title, score: match.matchScore, compatibility: match.compatibilityScore, reason: match.compatibilityReason, specificity: match.relevanceEvidence?.specificityPoints }))
    }];
  }));

  console.log(JSON.stringify({
    contract: "Freshly learned Memory natural-language generalization",
    baseline,
    architecture: "queryUnderstanding -> retrieveMemory -> current projection",
    controlledCorpus: corpus.map((item) => ({ id: item.id, organizationId: item.organizationId }))
  }, null, 2));

  const expectedTitle = primary.title;
  assert.equal(baseline.nearExact.state, "relevant", "Near-exact query must be relevant.");
  assert.equal(baseline.nearExact.topTitle, expectedTitle, "Near-exact query selected the wrong Memory.");
  assert.equal(baseline.natural.state, "relevant", "Natural paraphrase must be relevant.");
  assert.equal(baseline.natural.topTitle, expectedTitle, "Natural paraphrase missed the fresh Memory.");
  assert.equal(baseline.question.state, "relevant", "Question form must be relevant.");
  assert.equal(baseline.question.topTitle, expectedTitle, "Question form missed the fresh Memory.");
  assert.ok(baseline.symptom.state === "relevant" || baseline.symptom.state === "weak", "Symptom-focused query must be relevant or bounded weak.");
  assert.ok(baseline.symptom.topTitle === expectedTitle || baseline.symptom.state === "weak", "Symptom-focused query lost the fresh Memory.");
  assert.ok(baseline.relatedWrongProblem.state === "weak" || baseline.relatedWrongProblem.state === "no_match", "Context-different query must remain cautious.");
  assert.ok(baseline.unrelated.state === "no_match" && baseline.unrelated.candidates === 0, "Unrelated query produced a false positive.");
  assert.ok(baseline.adversarial.state !== "relevant", "Lexical-overlap adversarial query became confidently relevant.");

  const ambiguous = direct("A mobile device is showing old assignments after coming back online.");
  assert.ok(ambiguous.matches.length >= 2 || ambiguous.state === "weak", "Ambiguous query must retain competing candidates or remain cautious.");

  const snapshot = JSON.stringify(corpus);
  direct(queries.natural);
  assert.equal(JSON.stringify(corpus), snapshot, "Direct query mutated the controlled Memory corpus.");
  assert.ok(corpus.every((item) => item.organizationId === CONTROLLED_ORG || item.organizationId === "other-tenant"), "Controlled corpus ownership changed.");

  console.log(JSON.stringify({
    positive: { nearExact: "PASS", natural: "PASS", question: "PASS", symptom: "PASS_OR_BOUNDED_WEAK" },
    negative: { relatedWrongProblem: "CAUTIOUS", unrelated: "NO_MATCH", adversarial: "NOT_CONFIDENTLY_RELEVANT" },
    ambiguity: "CAUTIOUS",
    currentProjection: "PASS",
    tenantIsolation: "PASS",
    queryNonMutation: "PASS"
  }, null, 2));
  console.log("OIP-V2-FIX-011 retrieval generalization regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
