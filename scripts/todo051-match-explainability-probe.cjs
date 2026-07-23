/*
 * TODO-051 — Match explainability and authorization consistency probe.
 *
 * Read-only. It exercises the production retrieval/lesson/drafting path for
 * the five developer-demo cases, then checks the presentation model against
 * the actual grounded-memory decision. Pure cases cover paraphrase, exact
 * wording, weak overlap, trust independence, contradiction, wrong domain, and
 * cold start without changing mature data.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { buildMatchExplainability } = require(path.join(root, "lib", "explainability.ts"));

const DEMO = "profile-oip-developer-demo";
const PROFILE = "profile-oip-developer-demo";

function ticket(id, subject, description) {
  return { id, ticketId: id, customerName: "TODO-051 Probe", subject, description, category: "General", status: "new", createdAt: "2026-07-23T00:00:00.000Z" };
}

function responseFor(input, draft, match, lesson) {
  const authorized = draft.basedOnKnowledgeIds.length > 0;
  return {
    ticketId: input.id,
    ...draft,
    draftMode: authorized ? (lesson ? "lesson_grounded" : "memory_grounded") : "cold_start",
    groundingLabel: lesson?.lesson.title ?? lesson?.lesson.rootCause ?? match?.item.canonicalProblemTitle ?? "no organizational knowledge"
  };
}

function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const raw = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, raw, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatible.length ? selectPreferredMatch(input, compatible) : null;
  const match = selected?.match ?? null;
  const lesson = match ? findMatchingLesson(input, match.item) : null;
  const draft = draftResponse(input, understanding, match, profile, false);
  const response = responseFor(input, draft, match, lesson);
  return { understanding, raw, match, lesson, draft, response, explanation: buildMatchExplainability(match, input, response) };
}

function check(label, condition, detail) {
  if (!condition) throw new Error(`${label}: ${detail ?? "failed"}`);
  console.log(`PASS ${label}`);
}

async function main() {
  const items = await persistence.loadKnowledge(DEMO);
  const profile = await persistence.getOrganizationProfile(PROFILE);
  assert.ok(profile, "Developer demo profile must exist.");

  const manual = [
    ["Calvin duplicate subscription charge", ticket("M1", "Duplicate Invoice After Seat Changes", "Two invoice lines charge the same seat period after a seat change. billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change."), "demo-ki-duplicate-invoice-seat-change", true],
    ["Satya duplicate integration events", ticket("M2", "Webhook Delivery Replay Ordering", "A replayed webhook update arrived before its related create event. integrations webhook delivery replay ordering dependency order."), "demo-ki-webhook-delivery-replay", true],
    ["Luna role/access issue", ticket("M3", "Guest Workspace Access Boundary", "A guest can see the workspace but not the linked resource because an explicit grant is missing. permissions guest workspace access."), "demo-ki-guest-workspace-access", true],
    ["Rishi dashboard totals", ticket("M4", "Dashboard totals do not add up", "I am rishi sunak from british government. The dashboard total differs from a manual calculation for the same period; no export or character corruption is involved."), null, false],
    ["Mark SSO loop", ticket("M5", "SSO Redirect Loop After Certificate Rotation", "The identity provider certificate was rotated and users are sent back to sign-in. authentication certificate redirect timeline."), "demo-ki-sso-certificate-redirect-loop", true]
  ];

  const manualRows = [];
  for (const [label, input, expectedId, expectedAuthorized] of manual) {
    const result = runPipeline(input, profile, items);
    const actualAuthorized = result.draft.basedOnKnowledgeIds.length > 0;
    check(`${label} authorization`, actualAuthorized === expectedAuthorized, `selected=${result.match?.item.id ?? "none"} source=${result.draft.source}`);
    if (expectedId) check(`${label} canonical`, result.match?.item.id === expectedId, result.match?.item.id);
    check(`${label} explanation-state`, result.explanation.authorized === actualAuthorized, JSON.stringify(result.explanation));
    check(`${label} no-percent-display`, !JSON.stringify(result.explanation).includes("%"));
    manualRows.push({ label, canonical: result.match?.item.id ?? null, lesson: result.lesson?.lesson.id ?? null, relevance: result.explanation.relevance, lessonEvidence: result.explanation.lessonEvidence, trust: result.match?.item.trustScore ?? null, authorized: actualAuthorized, draftMode: result.response.draftMode });
  }

  const source = items.find((item) => item.id === "demo-ki-sso-certificate-redirect-loop");
  assert.ok(source, "HERO knowledge item must exist.");
  const syntheticMatch = { item: source, matchScore: 5, matchReason: "low lexical overlap", matchedCategory: source.category, matchedTags: [], matchedKeywords: [] };
  const authorizedResponse = { ticketId: "P", basedOnKnowledgeIds: [source.id], source: "deterministic", draftMode: "lesson_grounded", groundingLabel: "semantic lesson" };
  const rejectedResponse = { ticketId: "P", basedOnKnowledgeIds: [], source: "no_template", draftMode: "cold_start", groundingLabel: "no organizational knowledge" };

  const semantic = buildMatchExplainability(syntheticMatch, ticket("P", "Sign-in returns to provider", "Users bounce back after an identity-provider key change."), authorizedResponse);
  check("semantic paraphrase is strong when authorized", semantic.authorized && semantic.relevance === "Strong" && semantic.lessonEvidence === "Strong");
  const exact = buildMatchExplainability({ ...syntheticMatch, matchScore: 95 }, ticket("P2", "SSO Redirect Loop After Certificate Rotation", "authentication certificate redirect timeline"), authorizedResponse);
  check("exact wording does not change authorization model", exact.authorized && exact.decision === semantic.decision);
  const weak = buildMatchExplainability(syntheticMatch, ticket("P3", "Authentication question", "Generic login help."), rejectedResponse);
  check("weak overlap is not reusable", !weak.authorized && weak.decision === "Not authorized for grounded reuse");
  const wrongDomain = buildMatchExplainability({ ...syntheticMatch, matchedCategory: null, matchScore: 88, item: { ...source, trustScore: 100, category: "Billing" } }, ticket("P4", "Generic billing", "Invoice question."), rejectedResponse);
  check("high trust wrong domain is not authorized", !wrongDomain.authorized && wrongDomain.relevance === "Strong");
  const cold = buildMatchExplainability(null, ticket("P5", "New problem", "No known symptoms yet."), rejectedResponse);
  check("cold start explains no memory", cold.decision === "No compatible Organizational Memory used" && cold.relevance === "None");

  const trustScores = [1, 50, 68, 95, 100].map((trustScore) => buildMatchExplainability({ ...syntheticMatch, item: { ...source, trustScore } }, ticket("T", "SSO paraphrase", "Provider key changed and sign-in loops."), authorizedResponse));
  check("trust does not change relevance display", new Set(trustScores.map((row) => `${row.relevance}|${row.lessonEvidence}|${row.decision}`)).size === 1);

  console.log("\n=== TODO-051 MANUAL RESULTS ===");
  for (const row of manualRows) console.log(JSON.stringify(row));
  console.log("\nTODO-051 MATCH EXPLAINABILITY: PASS");
}

main().catch((error) => { console.error(error); process.exit(1); });
