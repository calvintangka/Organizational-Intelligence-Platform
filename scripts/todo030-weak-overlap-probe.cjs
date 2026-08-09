/*
 * TODO-030 focused weak-overlap authorization safety probe.
 *
 * Loads mature memory read-only and exercises the production analyzer,
 * retrieval, selection, compatibility, semantic, and drafting boundaries.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-030 may not substitute fixtures for mature PostgreSQL memory.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { withPreDiscriminationLessonMatches, selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isRetrievalCandidateEligible,
  isStrongLessonEvidence,
  ticketContradictsLesson
} = require(path.join(root, "lib", "drafting.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));

const DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const PROTECTED = [DEMO, MAESA, "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function snapshot(organizationId) {
  const where = { organizationId };
  const value = await Promise.all([
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
  return digest(value);
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)])));
}

function ticket(id, subject, description) {
  return {
    id, ticketId: id, customerName: "TODO-030 QA", subject, description,
    category: "General", status: "new", createdAt: "2026-07-21T00:00:00.000Z"
  };
}

function pipeline(testTicket, profile, items) {
  const understanding = understandForProfile(testTicket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isRetrievalCandidateEligible(understanding, match.item, testTicket));
  const selected = compatible.length ? selectPreferredMatch(testTicket, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const draft = draftResponse(testTicket, understanding, topMatch, profile, items.length === 0);
  return { understanding, rawMatches, matches, compatible, topMatch, lessonMatch, draft };
}

function draftForPersistedItem(testTicket, profile, item) {
  const understanding = understandForProfile(testTicket, profile);
  const topMatch = {
    item, matchScore: 100, matchReason: "TODO-030 selected-candidate authorization fixture",
    matchedTags: [], matchedKeywords: [], matchedCategory: item.category
  };
  const lessonMatch = findMatchingLesson(testTicket, item);
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  return { understanding, topMatch, lessonMatch, draft };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function successfulLessonDraft(result, expectedItemId) {
  return result.draft.source === "deterministic"
    && result.draft.basedOnKnowledgeIds.includes(expectedItemId)
    && result.lessonMatch
    && isStrongLessonEvidence(result.lessonMatch, result.understanding.category !== "General" && result.understanding.category !== "Uncategorized");
}

function semanticProvider(decide, calls) {
  return {
    mode: "lmstudio", label: "TODO-030 boundary mock",
    async discriminateMatch(input) {
      calls.push(input);
      return {
        ok: true, providerMode: "lmstudio", providerLabel: "TODO-030 boundary mock", latencyMs: 0,
        data: decide(input)
      };
    }
  };
}

async function main() {
  const before = await snapshots();
  const [profile, items, maesaProfile, maesaItems] = await Promise.all([
    persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO),
    persistence.getOrganizationProfile(MAESA), persistence.loadKnowledge(MAESA)
  ]);

  // A — exact M07 reproduction: candidate may remain selected, authorization must not.
  const m07Ticket = ticket(
    "M07",
    "Invoice mentions a webhook status word",
    "I need a billing invoice address changed. No integration or signature failure occurred."
  );
  const m07 = pipeline(m07Ticket, profile, items);
  // TODO-052: with coherent lesson data, "billing invoice address changed" ranks
  // invoice-pdf-stale-address (invoice PDF / billing address) above the currency
  // canonical. Evidence is still weak (score 1) and the draft still fails closed.
  check("A M07 selected the audited candidate", m07.topMatch?.item.id === "demo-ki-invoice-pdf-stale-address", m07.topMatch?.item.id);
  check("A M07 lesson evidence is weak", Boolean(m07.lessonMatch)
    && m07.lessonMatch.score === 1
    && m07.lessonMatch.multiTokenMatches === 1
    && m07.lessonMatch.ticketEvidenceCoverage === 2
    && !isStrongLessonEvidence(m07.lessonMatch, true));
  check("A M07 fails closed", m07.draft.source === "no_template" && m07.draft.basedOnKnowledgeIds.length === 0, m07.draft.source);

  // B — strong persisted currency evidence remains authorized.
  const currencyItem = items.find((item) => item.id === "demo-ki-invoice-currency-display");
  const currency = draftForPersistedItem(ticket(
    "TODO030-B", "Invoice Currency Display Difference",
    "The billing invoice uses the wrong display currency. currency timeline root cause 01 invoice-currency-display"
  ), profile, currencyItem);
  check("B strong invoice-currency lesson authorizes", successfulLessonDraft(currency, "demo-ki-invoice-currency-display"), `${currency.topMatch?.item.id}/${currency.lessonMatch?.lesson.id}`);

  // C — specific persisted address evidence may authorize the correct item, never currency.
  const addressTicket = ticket(
    "TODO030-C", "Invoice PDF Shows Previous Address",
    "The billing invoice PDF still has our stale address after the profile update. stale timeline root cause 03 invoice-pdf-stale-address"
  );
  const addressPipeline = pipeline(addressTicket, profile, items);
  const addressItem = items.find((item) => item.id === "demo-ki-invoice-pdf-stale-address");
  const address = draftForPersistedItem(addressTicket, profile, addressItem);
  check("C address evidence never authorizes currency lesson", !addressPipeline.draft.basedOnKnowledgeIds.includes("demo-ki-invoice-currency-display"));
  check("C strong address lesson authorizes its item when selected", successfulLessonDraft(address, "demo-ki-invoice-pdf-stale-address"), `${address.topMatch?.item.id}/${address.lessonMatch?.lesson.id}`);

  // D/E — generic domain vocabulary is useful for recall but insufficient for lesson reuse.
  const genericBilling = pipeline(ticket("TODO030-D", "Billing question", "I have a billing invoice question about my account."), profile, items);
  check("D generic billing fails closed", genericBilling.draft.source === "no_template" && genericBilling.draft.basedOnKnowledgeIds.length === 0);
  const genericLogin = pipeline(ticket("TODO030-E", "Can't log in", "I can't log in to my account."), maesaProfile, maesaItems);
  check("E generic login fails closed", genericLogin.draft.source === "no_template" && genericLogin.draft.basedOnKnowledgeIds.length === 0);

  // F — strong exact SSO lesson remains authorized.
  const exact = pipeline(ticket(
    "TODO030-F", "SSO Redirect Loop After Certificate Rotation",
    "authentication certificate redirect timeline root cause 01 sso-certificate-redirect-loop"
  ), profile, items);
  check("F strong exact lesson authorizes", successfulLessonDraft(exact, "demo-ki-sso-certificate-redirect-loop"));

  // G — legitimate semantic fallback remains available for deterministic unknown.
  const paraphraseTicket = ticket(
    "TODO030-G", "Unable to access my workspace after device swap",
    "My company issued a different computer. The browser used to fill my credentials, so I never typed them; the stored sign-on is gone."
  );
  const paraphraseUnderstanding = understandForProfile(paraphraseTicket, maesaProfile);
  const loginItem = maesaItems.find((item) => item.id === "canonical-login-issue");
  const semanticCalls = [];
  const semantic = await evaluateSemanticLessonCompatibility(
    semanticProvider((input) => ({
      isDistinctFromMatch: !/browser|autofill|saved credential/i.test(`${input.matchedCanonicalTitle} ${input.matchedProblemSummary}`),
      confidence: "high", reasoning: "Deterministic TODO-030 semantic fixture"
    }), semanticCalls),
    paraphraseTicket, paraphraseUnderstanding, loginItem
  );
  const semanticDraft = draftResponse(
    paraphraseTicket, paraphraseUnderstanding,
    { item: loginItem, matchScore: 100, matchReason: "QA", matchedTags: [], matchedKeywords: [], matchedCategory: loginItem.category },
    maesaProfile, false, semantic.authorization
  );
  check("G strong paraphrase semantic fallback remains possible", Boolean(semantic.authorization)
    && semanticCalls.length > 0
    && semanticDraft.basedOnKnowledgeIds.includes(loginItem.id));

  // H/I — contradiction and negation remain fail-closed.
  const contradiction = pipeline(ticket("TODO030-H", "Report problem", "I can sign in normally and this is not a login issue. My report is blank."), profile, items);
  check("H contradiction remains a hard veto", contradiction.draft.source === "no_template" && contradiction.draft.basedOnKnowledgeIds.length === 0);
  const negation = pipeline(ticket("TODO030-I", "Not an authentication problem", "I am not having a login problem. Authentication works normally."), profile, items);
  check("I negation remains fail closed", negation.draft.source === "no_template" && negation.draft.basedOnKnowledgeIds.length === 0);

  // J — directly present a high-trust mature item with only generic overlap.
  const taxItem = items.find((item) => item.id === "demo-ki-invoice-tax-rounding");
  const weakHighTrustTicket = ticket("TODO030-J", "Billing invoice question", "I have a billing invoice question about the account address.");
  const weakHighTrustUnderstanding = understandForProfile(weakHighTrustTicket, profile);
  const weakHighTrustMatch = { item: taxItem, matchScore: 100, matchReason: "QA", matchedTags: [], matchedKeywords: [], matchedCategory: taxItem.category };
  const weakHighTrustLesson = findMatchingLesson(weakHighTrustTicket, taxItem);
  const weakHighTrustDraft = draftResponse(weakHighTrustTicket, weakHighTrustUnderstanding, weakHighTrustMatch, profile, false);
  check("J high trust cannot rescue weak lesson evidence", taxItem.trustScore === 98
    && Boolean(weakHighTrustLesson)
    && !isStrongLessonEvidence(weakHighTrustLesson, true)
    && weakHighTrustDraft.source === "no_template"
    && weakHighTrustDraft.basedOnKnowledgeIds.length === 0);

  // K — even a forged high-confidence semantic authorization cannot cross the final weak gate.
  const forged = {
    itemId: m07.topMatch.item.id,
    lessonId: m07.lessonMatch.lesson.id,
    confidence: "high",
    reasoning: "Forced compatible by QA boundary mock"
  };
  const aiWeakDraft = draftResponse(m07Ticket, m07.understanding, m07.topMatch, profile, false, forged);
  // The corrected M07 retrieval winner is the invoice-address item. Its
  // root-cause state is intentionally `unknown` (not compatible) because the
  // ticket carries only a weak billing-invoice signal; the final draft must
  // still fail closed even when a forged AI authorization is supplied.
  check("K AI high-confidence cannot rescue weak deterministic evidence", aiWeakDraft.source === "no_template"
    && aiWeakDraft.basedOnKnowledgeIds.length === 0
    && assessCompatibilityDecision(m07.understanding, m07.topMatch.item, m07Ticket).state === "unknown"
    && !ticketContradictsLesson(m07Ticket, m07.lessonMatch.lesson));

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-030 must not modify any mature or regression organization.");
  console.log("TODO-030 focused probe passed. Mature organization digests are unchanged.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
