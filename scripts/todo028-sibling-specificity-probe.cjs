/*
 * TODO-028 focused sibling-lesson specificity probe.
 *
 * Loads persisted Developer Demo and Maesa lessons read-only. The synthetic
 * tie/contradiction cases are in-memory copies only; no organization data is
 * created, updated, or deleted.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-028 uses persisted lessons read-only.");
  process.exit(1);
}

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const {
  draftResponse,
  findMatchingLesson,
  normalizeLessonSignalText,
  ticketContradictsLesson
} = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const SSO = "demo-ki-sso-certificate-redirect-loop";
const SPECIFIC = "demo-les-sso-certificate-redirect-loop-004";
const GENERIC = "demo-les-sso-certificate-redirect-loop-001";
const DANIEL_LESSONS = new Set(["lesson-1783579667941-43jz", "lesson-1783585050591-f47l"]);

function ticket(id, subject, description) {
  return { id, ticketId: id, customerName: "TODO-028 QA", subject, description, category: "General", status: "new", createdAt: "2026-07-21T00:00:00.000Z" };
}

function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
}

function perLesson(ticketValue, item, lesson) {
  return findMatchingLesson(ticketValue, { ...item, lessons: [lesson] });
}

function printEvidenceMatrix(caseName, ticketValue, item) {
  const winner = findMatchingLesson(ticketValue, item);
  console.log(`\n=== ${caseName} sibling evidence matrix ===`);
  for (const lesson of item.lessons) {
    const result = perLesson(ticketValue, item, lesson);
    const matched = result?.matchedSignals ?? [];
    const unmatchedSpecific = lesson.signals.filter((signal) => /\broot\s+cause\s+\d+\b/i.test(signal) && !matched.includes(signal));
    console.log(JSON.stringify({
      lessonId: lesson.id,
      rootCause: lesson.rootCause,
      signals: lesson.signals,
      normalizedSignals: lesson.signals.map(normalizeLessonSignalText),
      matchedSignals: matched,
      matchedSignalCount: result?.score ?? 0,
      multiTokenCount: result?.multiTokenMatches ?? 0,
      ticketEvidenceCoverage: result?.ticketEvidenceCoverage ?? 0,
      unmatchedSpecificEvidence: unmatchedSpecific,
      finalComparatorResult: winner?.lesson.id === lesson.id ? "winner" : "not winner"
    }));
  }
  return winner;
}

async function main() {
  const [profile, items, maesaProfile, maesaItems] = await Promise.all([
    persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO),
    persistence.getOrganizationProfile(MAESA), persistence.loadKnowledge(MAESA)
  ]);
  const sso = items.find((item) => item.id === SSO);
  assert.ok(sso, "Persisted SSO canonical is required.");
  assert.equal(sso.lessons.length, 10, "Mature SSO fixture must retain its ten sibling lessons.");

  // A/B — persisted M03/M05 evidence must prefer the actual structured root cause.
  const m03 = ticket("M03", "SSO Redirect Loop After Certificate Rotation", "Certificate validity or signing metadata no longer matches. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop");
  const m05 = ticket("M05", "SSO Redirect Loop After Certificate Rotation", "Certificate signing metadata does not match after rotation. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop");
  const winnerA = printEvidenceMatrix("CASE A — M03 specific SSO", m03, sso);
  const winnerB = printEvidenceMatrix("CASE B — M05 crowded siblings", m05, sso);
  check("A M03 specific lesson wins", winnerA?.lesson.id === SPECIFIC, winnerA?.lesson.id);
  check("B M05 specific lesson wins", winnerB?.lesson.id === SPECIFIC, winnerB?.lesson.id);

  // C — no ordinal evidence means generic lesson remains the stable fallback.
  const genericTicket = ticket("M04", "SSO Redirect Loop After Certificate Rotation", "authentication certificate redirect timeline");
  const winnerC = findMatchingLesson(genericTicket, sso);
  check("C generic sibling wins without specific evidence", winnerC?.lesson.id === GENERIC, winnerC?.lesson.id);

  // D — every input ordering gives the same winner.
  const orders = [sso.lessons, [...sso.lessons].reverse(), [...sso.lessons].sort((a, b) => b.id.localeCompare(a.id))];
  const orderWinners = orders.map((lessons) => findMatchingLesson(m05, { ...sso, lessons })?.lesson.id);
  check("D array-order independence", new Set(orderWinners).size === 1 && orderWinners[0] === SPECIFIC, orderWinners.join(" | "));

  // E — sibling selection has no trust input, even when inert trust-like fields are inverted.
  const trusted = { ...sso, lessons: sso.lessons.map((lesson, index) => ({ ...lesson, trustScore: index })) };
  const inverted = { ...sso, lessons: sso.lessons.map((lesson, index) => ({ ...lesson, trustScore: 100 - index })) };
  const trustWinners = [findMatchingLesson(m05, trusted)?.lesson.id, findMatchingLesson(m05, inverted)?.lesson.id];
  check("E trust inversion does not change sibling winner", trustWinners[0] === SPECIFIC && trustWinners[0] === trustWinners[1], trustWinners.join(" | "));

  // F — genuinely identical evidence uses stable lexical lesson IDs.
  const twin = { ...sso, lessons: [
    { ...sso.lessons[0], id: "lesson-zzz-second", signals: ["certificate redirect"] },
    { ...sso.lessons[0], id: "lesson-aaa-first", signals: ["certificate redirect"] }
  ] };
  const twinWinner = findMatchingLesson(ticket("TWIN", "Certificate redirect", "certificate redirect"), twin);
  check("F identical evidence falls back to lexical lesson ID", twinWinner?.lesson.id === "lesson-aaa-first", twinWinner?.lesson.id);

  // G — existing contradiction veto skips all login/authentication siblings.
  const contradiction = ticket("CONTRA", "Report unavailable", "I can sign in normally and this is not a login issue. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop");
  check("G contradicted sibling cannot win", findMatchingLesson(contradiction, sso) === null && ticketContradictsLesson(contradiction, sso.lessons[3]));

  // H — selecting a lesson still cannot authorize weak evidence at the TODO-030 boundary.
  const tax = items.find((item) => item.id === "demo-ki-invoice-tax-rounding");
  const weak = ticket("WEAK", "Billing invoice question", "I have a billing invoice question about the account address.");
  const weakUnderstanding = understandForProfile(weak, profile);
  const weakMatch = { item: tax, matchScore: 100, matchReason: "TODO-028 weak fixture", matchedTags: [], matchedKeywords: [], matchedCategory: tax.category };
  const weakDraft = draftResponse(weak, weakUnderstanding, weakMatch, profile, false);
  check("H weak lesson evidence remains drafting-unauthorized", weakDraft.source === "no_template" && weakDraft.basedOnKnowledgeIds.length === 0, weakDraft.source);

  // I — TODO-019's real Daniel browser/device-switch case remains specific.
  const login = maesaItems.find((item) => item.id === "canonical-login-issue");
  assert.ok(login, "Maesa login canonical is required.");
  const daniel = ticket("DANIEL", "Can't log in to my Maesa account on new laptop", "Hi Maesa Tech Support, I recently received a new laptop from my company and now I can't log in to my Maesa account. On my old laptop, my browser always filled in the password automatically, so I don't remember what the password was. I tried entering a few passwords that I normally use, but none of them worked. How can I regain access to my account? Thanks, Daniel");
  const danielWinner = findMatchingLesson(daniel, login);
  check("I Daniel device-switch lesson remains selected", DANIEL_LESSONS.has(danielWinner?.lesson.id), danielWinner?.lesson.id);

  // J — curly apostrophes normalize differently today, but neither M03 nor M05 contains one.
  const ascii = normalizeLessonSignalText("don't remember password");
  const curly = normalizeLessonSignalText("don’t remember password");
  console.log(`INFO J apostrophe audit: ASCII="${ascii}" curly="${curly}"; not part of the M03/M05 root cause.`);

  console.log("TODO-028 focused probe passed. Persisted data was read-only; synthetic cases were in memory only.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
