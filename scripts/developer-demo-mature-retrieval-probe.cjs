/*
 * TODO-025F — PostgreSQL-backed mature-memory retrieval and AI behavior QA.
 *
 * This is intentionally read-only. It uses the same production retrieval,
 * lesson-selection, compatibility, semantic-authorization, drafting, and AI
 * adapter modules used by the application. The small pipeline below is only
 * the page's orchestration glue; no retrieval or ranking code is duplicated.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; the mature-memory QA probe is read-only and cannot use a fixture substitute.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem, resolveLessonIdForItem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  draftResponse,
  findMatchingLesson,
  isCompatibleForDrafting,
  assessCompatibilityDecision
} = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));

const DEMO = "profile-oip-developer-demo";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const findings = [];
const matrix = [];

function stableDigest(value) {
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
    digest: stableDigest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }),
    counts: {
      knowledge: knowledge.length, candidates: candidates.length, validations: validations.length,
      memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length
    }
  };
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)])));
}

function ticket(id, subject, description) {
  return {
    id, ticketId: id, customerName: "Mature QA", subject, description,
    category: "General", status: "new", createdAt: "2026-07-21T00:00:00.000Z"
  };
}

/** Exact production orchestration around the extracted pure boundaries. */
function runPipeline(testTicket, profile, knowledgeItems) {
  const understanding = understandForProfile(testTicket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, knowledgeItems, new Set());
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, knowledgeItems, canonical.title);
  const compatibleMatches = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, testTicket));
  const selected = compatibleMatches.length ? selectPreferredMatch(testTicket, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, testTicket) : null;
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  return { understanding, canonical, rawMatches, matches, compatibleMatches, selected, topMatch, lessonMatch, compatibility, draft };
}

function concise(result) {
  return {
    canonical: result.topMatch?.item.id ?? null,
    lesson: result.lessonMatch?.lesson.id ?? null,
    authorization: result.draft.basedOnKnowledgeIds,
    source: result.draft.source,
    trust: result.topMatch?.item.trustScore ?? null,
    compatibility: result.compatibility?.state ?? "none",
    signals: result.lessonMatch?.matchedSignals ?? [],
    candidates: result.rawMatches.slice(0, 4).map((match) => `${match.item.id}:${match.matchScore}:trust${match.item.trustScore}`)
  };
}

function finding(classification, severity, caseId, expected, result, rootCause, followUp) {
  const actual = concise(result);
  findings.push({ classification, severity, caseId, expected, actual, rootCause, followUp });
  console.log(`FINDING ${classification} [${severity}] ${caseId}: ${rootCause}`);
}

function checkCase(definition, profile, knowledgeItems) {
  const result = runPipeline(definition.ticket, profile, knowledgeItems);
  const authorized = result.draft.basedOnKnowledgeIds.length > 0;
  const canonicalOk = !definition.expectedCanonical || result.topMatch?.item.id === definition.expectedCanonical;
  const lessonOk = !definition.expectedLesson || result.lessonMatch?.lesson.id === definition.expectedLesson;
  const authorizationOk = definition.authorize === undefined || authorized === definition.authorize;
  const passed = canonicalOk && lessonOk && authorizationOk;
  const actual = concise(result);
  matrix.push({ id: definition.id, domain: definition.domain, expectedCanonical: definition.expectedCanonical ?? "no unsafe selection", expectedLesson: definition.expectedLesson ?? "no required lesson", authorize: definition.authorize, passed, actual });
  console.log(`${passed ? "PASS" : "FAIL"} ${definition.id} [${definition.domain}] canonical=${actual.canonical ?? "none"} lesson=${actual.lesson ?? "none"} authorized=${authorized}`);
  if (!passed) {
    finding(
      definition.classification ?? (authorizationOk ? "CANONICAL_RETRIEVAL_FAILURE" : "DRAFTING_AUTHORIZATION_FAILURE"),
      definition.severity ?? "high", definition.id,
      { canonical: definition.expectedCanonical, lesson: definition.expectedLesson, authorize: definition.authorize }, result,
      definition.rootCause ?? "The production pipeline did not select and authorize the expected persisted knowledge.",
      definition.followUp ?? "Create a separate retrieval/ranking remediation TODO; do not change algorithms in TODO-025F."
    );
  }
  return result;
}

function mockProvider(decision, calls) {
  return {
    mode: "lmstudio", label: "QA boundary mock",
    async discriminateMatch(input) {
      calls.push(input.matchedCanonicalTitle);
      const data = decision(input);
      return data
        ? { ok: true, providerMode: "lmstudio", providerLabel: "QA boundary mock", latencyMs: 0, data }
        : { ok: false, providerMode: "lmstudio", providerLabel: "QA boundary mock", latencyMs: 0, error: "simulated unavailable" };
    }
  };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

async function aiAdapterAudit(profile, knowledgeItems) {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  global.window = {};
  const config = { mode: "lmstudio", baseUrl: "http://qa.invalid/v1", model: "qa-model", timeoutMs: 5000, proxyPath: "/api/ai/chat" };
  const input = {
    ticket: ticket("QA-AI-001", "Webhook Signature Failure After Secret Rotation", "integrations webhook signature timeline"),
    organizationProfile: profile,
    deterministicUnderstanding: understandForProfile(ticket("QA-AI-002", "Webhook Signature Failure After Secret Rotation", "integrations webhook signature timeline"), profile),
    deterministicPatternTitle: "QA pattern", patternSummary: "QA pattern"
  };
  async function run(outcomes) {
    const calls = [];
    global.fetch = async (endpoint) => {
      calls.push(endpoint);
      const current = outcomes[calls.length - 1];
      return current === "ok"
        ? response({ choices: [{ message: { content: '{"title":"QA pattern","confidence":90}' } }] })
        : current === "malformed"
          ? response({ choices: [{ message: { content: "not-json" } }] })
          : response({ error: "unavailable" }, 503);
    };
    const result = await createAIAdapter(config).provider.suggestPatternName(input);
    return { result, calls };
  }
  try {
    const lm = await run(["ok"]);
    const fallback = await run(["fail", "ok"]);
    const unavailable = await run(["fail", "fail"]);
    const malformed = await run(["malformed", "fail"]);
    const checks = [
      ["LM success skips NVIDIA", lm.result.ok && lm.calls.length === 1 && lm.calls[0] === "/api/ai/chat"],
      ["LM failure invokes NVIDIA", fallback.result.ok && fallback.calls.join("|") === "/api/ai/chat|/api/ai/nvidia"],
      ["both unavailable fail closed", !unavailable.result.ok && unavailable.calls.length === 2],
      ["malformed AI fails closed", !malformed.result.ok && malformed.calls.length === 2]
    ];
    for (const [label, passed] of checks) {
      console.log(`${passed ? "PASS" : "FAIL"} AI ${label}`);
      if (!passed) finding("AI_FAILOVER_FAILURE", "high", `AI-${label}`, label, { rawMatches: [], draft: { basedOnKnowledgeIds: [], source: "no_template" } }, "The production adapter chain did not preserve its expected route/fail-closed behavior.", "Create an AI adapter regression TODO.");
    }

    const sso = knowledgeItems.find((item) => item.id === "demo-ki-sso-certificate-redirect-loop");
    const contradictory = ticket("QA-AI-003", "I am not having a login problem", "I can sign in normally; this is not an authentication issue.");
    const understanding = understandForProfile(contradictory, profile);
    const semanticCalls = [];
    const semantic = await evaluateSemanticLessonCompatibility(
      mockProvider(() => ({ isDistinctFromMatch: false, confidence: "high", reasoning: "unsafe override" }), semanticCalls),
      contradictory, understanding, sso
    );
    const hardGatePassed = semantic.authorization === null && semanticCalls.length === 0;
    console.log(`${hardGatePassed ? "PASS" : "FAIL"} AI hard gate cannot be bypassed`);
    if (!hardGatePassed) finding("SEMANTIC_COMPATIBILITY_FAILURE", "critical", "AI-HARD-GATE", "No AI authorization for unclassified/contradictory ticket", { rawMatches: [], draft: { basedOnKnowledgeIds: semantic.authorization ? [semantic.authorization.itemId] : [], source: "no_template" } }, "Semantic compatibility accepted an unsafe override.", "Block curated scenarios and create a safety remediation TODO.");
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
}

async function main() {
  const before = await snapshots();
  const profile = await persistence.getOrganizationProfile(DEMO);
  const knowledgeItems = await persistence.loadKnowledge(DEMO);
  assert.equal(knowledgeItems.length, 45, "Mature QA must load the 45 persisted Developer Demo knowledge items.");
  console.log(`Loaded ${profile.name} from PostgreSQL: ${knowledgeItems.length} knowledge items, ${knowledgeItems.reduce((n, item) => n + item.lessons.length, 0)} lessons.`);

  const cases = [
    { id: "M01 exact-known", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", authorize: true, ticket: ticket("M01", "SSO Redirect Loop After Certificate Rotation", "authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop") },
    { id: "M02 paraphrase", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", authorize: true, ticket: ticket("M02", "Sign-in keeps bouncing after the IdP signing credential was replaced", "Our SAML users return to the identity provider repeatedly after we renewed the certificate. authentication certificate redirect timeline.") },
    { id: "M03 specific-sibling", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", expectedLesson: "demo-les-sso-certificate-redirect-loop-004", authorize: true, classification: "LESSON_RANKING_FAILURE", ticket: ticket("M03", "SSO Redirect Loop After Certificate Rotation", "Certificate validity or signing metadata no longer matches. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop") },
    { id: "M04 generic-sibling", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", expectedLesson: "demo-les-sso-certificate-redirect-loop-001", authorize: true, ticket: ticket("M04", "SSO Redirect Loop After Certificate Rotation", "authentication certificate redirect timeline") },
    { id: "M05 crowded-siblings", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", expectedLesson: "demo-les-sso-certificate-redirect-loop-004", authorize: true, classification: "LESSON_RANKING_FAILURE", ticket: ticket("M05", "SSO Redirect Loop After Certificate Rotation", "Certificate signing metadata does not match after rotation. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop") },
    { id: "M06 related-canonicals", domain: "billing", expectedCanonical: "demo-ki-duplicate-invoice-seat-change", authorize: true, ticket: ticket("M06", "Duplicate Invoice After Seat Changes", "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change") },
    { id: "M07 weak-overlap", domain: "billing", authorize: false, ticket: ticket("M07", "Invoice mentions a webhook status word", "I need a billing invoice address changed. No integration or signature failure occurred.") },
    { id: "M08 contradiction", domain: "authentication", authorize: false, ticket: ticket("M08", "Dashboard is unavailable", "I can sign in normally and this is not a login issue. My report dashboard is blank.") },
    { id: "M09 negation", domain: "authentication", authorize: false, ticket: ticket("M09", "I am not having a login problem", "I am not having a login problem. I can access the account normally; please investigate an unrelated report issue.") },
    { id: "M10 ambiguous", domain: "unsupported", authorize: false, ticket: ticket("M10", "Something is wrong", "Something seems off. Please look into it.") },
    { id: "M11 long-tail", domain: "mobile", expectedCanonical: "demo-ki-mobile-offline-export-filters", authorize: true, ticket: ticket("M11", "Mobile Offline Export Loses Date Filters", "mobile offline export timeline root cause 01 mobile-offline-export-filters") },
    { id: "M12 high-frequency", domain: "billing", expectedCanonical: "demo-ki-invoice-tax-rounding", authorize: true, ticket: ticket("M12", "Invoice Tax Rounding Difference", "billing invoice tax timeline root cause 01 invoice-tax-rounding") },
    { id: "M13 unknown-alias", domain: "aliases", authorize: false, ticket: ticket("M13", "No lesson reference", "This has no supported historical lesson reference.") },
    { id: "M14 deprecated", domain: "billing", expectedCanonical: "demo-ki-invoice-pdf-stale-address", authorize: true, ticket: ticket("M14", "Invoice PDF Shows Previous Address", "billing invoice address timeline root cause 01 invoice-pdf-stale-address") },
    { id: "M15 integrations", domain: "integrations", expectedCanonical: "demo-ki-webhook-signature-secret-rotation", authorize: true, ticket: ticket("M15", "Webhook Signature Failure After Secret Rotation", "integrations webhook signature timeline root cause 01 webhook-signature-secret-rotation") },
    { id: "M16 permissions", domain: "permissions", expectedCanonical: "demo-ki-permission-inheritance-delay", authorize: true, ticket: ticket("M16", "Permission Inheritance Delay", "permissions inheritance timeline root cause 01 permission-inheritance-delay") },
    { id: "M17 reporting", domain: "reporting", expectedCanonical: "demo-ki-scheduled-report-timezone", authorize: true, ticket: ticket("M17", "Scheduled Report Timezone Boundary", "reporting report timezone timeline root cause 01 scheduled-report-timezone") },
    { id: "M18 notifications", domain: "notifications", expectedCanonical: "demo-ki-email-notification-suppression", authorize: true, ticket: ticket("M18", "Email Notification Suppression", "notifications email timeline root cause 01 email-notification-suppression") },
    { id: "HERO-1", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", authorize: true, ticket: ticket("HERO-1", "SSO Redirect Loop After Certificate Rotation", "authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop") },
    { id: "HERO-2", domain: "authentication", expectedCanonical: "demo-ki-sso-certificate-redirect-loop", authorize: true, ticket: ticket("HERO-2", "Our SAML sign-on circles after the new certificate", "After the IdP certificate update, users are redirected back and forth. authentication certificate redirect timeline.") },
    { id: "HERO-3", domain: "authentication", expectedCanonical: "demo-ki-sso-domain-verification", authorize: true, ticket: ticket("HERO-3", "SSO domain verification remains pending", "authentication sso domain timeline root cause 01 sso-domain-verification") },
    { id: "HERO-4", domain: "authentication", authorize: false, ticket: ticket("HERO-4", "Reports are failing", "I can sign in normally and this is not an authentication problem. The report is unavailable.") },
    { id: "HERO-5", domain: "authentication", authorize: false, ticket: ticket("HERO-5", "General account question", "I have a question about my account, but no sign-in or certificate problem.") }
  ];
  for (const entry of cases) checkCase(entry, profile, knowledgeItems);

  const sso = knowledgeItems.find((item) => item.id === "demo-ki-sso-certificate-redirect-loop");
  const crowdedTicket = cases[4].ticket; // M05; retained as a stable test fixture order.
  const orderWinners = [sso.lessons, [...sso.lessons].reverse()].map((lessons) => findMatchingLesson(crowdedTicket, { ...sso, lessons }).lesson.id);
  console.log(`${new Set(orderWinners).size === 1 ? "PASS" : "FAIL"} sibling array-order independence: ${orderWinners.join(" | ")}`);
  if (new Set(orderWinners).size !== 1) finding("LESSON_RANKING_FAILURE", "high", "SIBLING-ORDER", "Same winner under reordering", runPipeline(crowdedTicket, profile, knowledgeItems), "findMatchingLesson is array-order-dependent.", "Create a sibling-ranking determinism TODO.");

  const billing = runPipeline(cases[5].ticket, profile, knowledgeItems);
  const invertedTrust = billing.compatibleMatches.map((match) => ({ ...match, item: { ...match.item, trustScore: 100 - (match.item.trustScore ?? 0) } }));
  const regularWinner = billing.selected?.match.item.id;
  const invertedWinner = selectPreferredMatch(cases[5].ticket, invertedTrust)?.match.item.id;
  console.log(`${regularWinner === invertedWinner ? "PASS" : "FAIL"} trust independence: regular=${regularWinner} inverted=${invertedWinner}`);
  if (regularWinner !== invertedWinner) finding("LESSON_RANKING_FAILURE", "high", "SIBLING-TRUST", "Trust must not change relevance winner", billing, "selectPreferredMatch compares trust before lesson evidence and match score inside its relevant cluster.", "Create a separate TODO to make relevance ordering precede trust in cross-item selection.");

  const aliases = knowledgeItems.flatMap((item) => item.lessons.flatMap((lesson) => (lesson.aliasLessonIds ?? []).map((alias) => ({ item, lesson, alias }))));
  if (aliases.length === 0) console.log("DATASET_GAP alias: mature Developer Demo has no historical lesson aliases to resolve; unknown reference fails closed by M13.");
  else {
    const sample = aliases[0];
    assert.equal(resolveLessonIdForItem(sample.item, sample.alias), sample.lesson.id, "Historical alias must resolve to its canonical lesson.");
    console.log(`PASS historical alias ${sample.alias} -> ${sample.lesson.id}`);
  }

  // Draft grounding comes from the selected persisted lesson, not a sibling.
  const draftCase = runPipeline(cases[0].ticket, profile, knowledgeItems);
  const draftLesson = draftCase.lessonMatch?.lesson;
  const sibling = sso.lessons.find((lesson) => lesson.id !== draftLesson?.id);
  const selectedRootCause = draftLesson?.rootCause.split(";")[0].trim();
  const groundedDraft = Boolean(draftLesson)
    && draftCase.draft.draftResponse.includes(selectedRootCause)
    && draftCase.draft.draftResponse.includes(cases[0].ticket.ticketId)
    && !draftCase.draft.draftResponse.includes(sibling?.rootCause ?? "__none__")
    && !draftLesson.doNotPromise.some((prohibition) => draftCase.draft.draftResponse.includes(prohibition));
  console.log(`${groundedDraft ? "PASS" : "FAIL"} drafting uses the selected lesson without sibling metadata or prohibited promises`);
  if (!groundedDraft) finding("DRAFTING_AUTHORIZATION_FAILURE", "high", "DRAFT-GROUNDING", "Selected lesson-only grounded response with safety language", draftCase, "The lesson-informed draft is not grounded exclusively in the selected persisted lesson.", "Create a drafting-grounding remediation TODO.");

  await aiAdapterAudit(profile, knowledgeItems);

  // Byte-level deterministic production decisions, excluding AI wording.
  const deterministic = cases.slice(0, 18).every((entry) => {
    const a = concise(runPipeline(entry.ticket, profile, knowledgeItems));
    const b = concise(runPipeline(entry.ticket, profile, knowledgeItems));
    return JSON.stringify(a) === JSON.stringify(b);
  });
  console.log(`${deterministic ? "PASS" : "FAIL"} deterministic retrieval/ranking/authorization repeats`);
  if (!deterministic) finding("LESSON_RANKING_FAILURE", "high", "DETERMINISM", "Identical deterministic decision", runPipeline(cases[0].ticket, profile, knowledgeItems), "Production retrieval or ranking changed for identical input.", "Create a deterministic retrieval remediation TODO.");

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-025F must not modify Developer Demo, Maesa, FastDrop, Pramana, or test-oip-regression.");
  const passed = matrix.filter((entry) => entry.passed).length;
  console.log(`\nMATRIX ${passed}/${matrix.length} passed; findings=${findings.length}.`);
  console.log(JSON.stringify({ snapshots: before, matrix, findings }, null, 2));
  if (findings.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
