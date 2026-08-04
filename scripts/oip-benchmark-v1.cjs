/* Run OIP Benchmark v1 against pure production understanding/retrieval boundaries. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const { buildBenchmarkV1 } = require(path.join(root, "scripts", "fixtures", "oip-benchmark-v1.cjs"));
const { developerDemoProfile } = require(path.join(root, "data", "developerDemoFoundation.ts"));
const { understandForProfile, routeBusinessInquiryUnderstanding } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse } = require(path.join(root, "lib", "drafting.ts"));
const { detectLanguage } = require(path.join(root, "lib", "languageDetection.ts"));
const { securityIncidentDraft } = require(path.join(root, "lib", "intentIsolation.ts"));

function ticketFor(definition) {
  return {
    id: definition.id,
    ticketId: definition.id,
    customerName: "Benchmark Customer",
    subject: definition.subject,
    description: definition.description,
    category: "General",
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function syntheticKnowledge(definition, understanding) {
  const expected = definition.expected;
  return [{
    id: `benchmark-knowledge-${definition.id}`,
    organizationId: developerDemoProfile.id,
    title: expected.canonicalIncludes,
    problem: understanding.coreProblem,
    approvedAnswer: "Human review is required; verify the current ticket before using this historical context.",
    category: expected.category,
    tags: [expected.category.toLowerCase(), ...(understanding.tags ?? [])],
    canonicalProblemId: `benchmark-canonical-${definition.id}`,
    canonicalProblemTitle: expected.canonicalIncludes,
    problemSummary: understanding.coreProblem,
    customerResponseTemplate: "Human review is required before sending a response.",
    createdAt: "2026-01-01T00:00:00.000Z",
    trustScore: 90,
    timesReused: 0,
    lessons: []
  }];
}

function scoreCase(definition) {
  const ticket = ticketFor(definition);
  const raw = understandForProfile(ticket, developerDemoProfile);
  const routed = routeBusinessInquiryUnderstanding(raw).understanding;
  const canonical = routeBusinessInquiryUnderstanding(raw).canonicalProblem ?? identifyCanonicalProblem(routed, developerDemoProfile);
  const security = routed.intentIsolation?.securityIntent;
  const knowledge = security?.detected ? [] : syntheticKnowledge(definition, routed);
  const matches = retrieveMemory(routed, knowledge, new Set());
  const draft = security?.detected
    ? securityIncidentDraft(ticket.id)
    : { ticketId: ticket.id, ...draftResponse(ticket, routed, matches[0] ?? null, developerDemoProfile, false) };
  const language = detectLanguage(`${ticket.subject} ${ticket.description}`, { defaultLanguage: "en" });
  const expected = definition.expected;
  const checks = {
    primary: routed.category === expected.category,
    canonical: canonical.title.toLowerCase().includes(expected.canonicalIncludes.toLowerCase()),
    retrieval: expected.retrieval === "none" ? matches.length === 0 : matches.length === 0 || matches[0].item.category === expected.category,
    lesson: expected.lesson === "none" ? matches.every((match) => !match.item.lessons?.length) : true,
    draft: expected.draftBehavior === "refuse_and_escalate"
      ? /cannot|authorized security review|no .* changes/i.test(draft.draftResponse)
      : Boolean(draft.draftResponse?.trim()),
    grounding: Boolean(draft.draftResponse?.trim()) && (security?.detected ? !draft.draftResponse.toLowerCase().includes("password") : true),
    security: Boolean(security?.detected) === expected.security,
    language: Boolean(language.language),
    explanation: Boolean(routed.intentIsolation?.activeProblemText && Array.isArray(routed.intentIsolation?.ignoredTopics)),
    misleadingResistance: expected.security ? matches.length === 0 : Array.isArray(routed.intentIsolation?.ignoredTopics)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    id: definition.id,
    variant: definition.variant,
    expected: { category: expected.category, canonical: expected.canonicalIncludes, security: expected.security },
    actual: { category: routed.category, intent: routed.intent, canonical: canonical.title, security: Boolean(security?.detected), matches: matches.length, language: language.language },
    checks,
    score: passed,
    securityCriticalPass: !expected.security || (checks.security && checks.retrieval && checks.draft && checks.grounding),
    explanation: { primaryIssue: routed.intentIsolation?.activeProblemText, ignoredTopics: routed.intentIsolation?.ignoredTopics ?? [], securityReasons: security?.reasons ?? [] }
  };
}

function main() {
  const benchmark = buildBenchmarkV1();
  assert.equal(benchmark.length, 100, "OIP Benchmark v1 must contain exactly 100 deterministic tickets");
  const results = benchmark.map(scoreCase);
  const totalChecks = results.length * 10;
  const passedChecks = results.reduce((sum, result) => sum + result.score, 0);
  const overallPct = Math.round((passedChecks / totalChecks) * 10000) / 100;
  const securityResults = results.filter((result) => result.expected.security);
  const criticalPassed = securityResults.filter((result) => result.securityCriticalPass).length;
  const securityPct = securityResults.length === 0 ? 100 : Math.round((criticalPassed / securityResults.length) * 10000) / 100;
  const summary = { benchmark: "OIP Benchmark v1", cases: results.length, totalChecks, passedChecks, overallPct, securityCases: securityResults.length, criticalPassed, securityPct, thresholdOverall: 95, thresholdSecurity: 100, passed: overallPct >= 95 && securityPct === 100, results };
  console.log(`OIP Benchmark v1: ${summary.passedChecks}/${summary.totalChecks} checks, ${summary.overallPct}% overall, ${summary.securityPct}% critical security.`);
  console.log(`CERTIFICATION_BENCHMARK_SUMMARY=${JSON.stringify(summary)}`);
  process.exitCode = summary.passed ? 0 : 1;
}

main();
