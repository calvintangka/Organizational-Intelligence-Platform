/*
 * TODO-040 — Semantic lesson-evidence generalization and safety probe.
 *
 * Read-only. Verifies that the deterministic concept-coverage layer:
 *   G — generalizes to 20 UNSEEN natural paraphrases (14 genuine matches must
 *       authorize; 6 ambiguous cases must fail closed),
 *   H — never authorizes 16 negative/competing-category controls,
 *   I — never authorizes explicit contradiction/negation phrasings,
 *   E — preserves sibling specificity, array-order independence,
 *   K — preserves trust independence (trust 1 correct vs trust 100 decoy),
 *   J — keeps the AI semantic path bounded (provider failure, malformed output,
 *       forged authorizations, and deterministic-strong short-circuit all fail
 *       safely; AI is never consulted when determinism already decided).
 *
 * Uses the same pure production boundaries as app/page.tsx; writes nothing.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

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
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const LESSON_1 = "demo-les-sso-certificate-redirect-loop-001";
const LESSON_2 = "demo-les-sso-certificate-redirect-loop-002";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

/* ------------------------- Part G: 20 unseen paraphrases ------------------------- */
// expectAuthorized:true — genuine semantic matches in fresh wording.
// expectAuthorized:false — ambiguous/incomplete evidence that must fail closed.
const UNSEEN = [
  { id: "G01", expectAuthorized: true, subject: "Staff bounce between app and identity provider after certificate renewal", description: "Ever since the identity provider's certificate renewal, employees bounce between the workspace and the provider and never get signed in." },
  { id: "G02", expectAuthorized: true, subject: "Sign-on cycles endlessly since we replaced the signing key", description: "Our single sign-on cycles endlessly after we replaced the signing key on the identity side." },
  { id: "G03", expectAuthorized: true, subject: "Everyone is sent to the company login again after the key swap", description: "Following the key swap at our identity provider, colleagues finish the corporate login and are immediately shown it again." },
  { id: "G04", expectAuthorized: true, subject: "SAML handshake repeats after the certificate update", description: "After updating the SAML certificate our users repeat the handshake with the identity service over and over." },
  // G05/G11: generic-login wording with a certificate mention but NO identity-
  // provider/federation evidence. Part D forbids "generic login problem ->
  // certificate-rotation lesson", so failing closed is the correct behavior.
  { id: "G05", expectAuthorized: false, subject: "Login merry-go-round after the security renewal", description: "Since our IT team renewed the security certificate for company sign-on, people just go in circles between two login pages." },
  { id: "G06", expectAuthorized: true, subject: "Workforce stuck alternating between portal and identity page", description: "The identity platform approves people, then they keep alternating endlessly between the portal and the provider; it began with the new signing material." },
  { id: "G07", expectAuthorized: true, subject: "Federation trust update broke our sign-in flow", description: "We rotated the federation trust certificate and now every sign-in attempt loops through the identity provider." },
  { id: "G08", expectAuthorized: true, subject: "Provider approves, workspace refuses, forever", description: "The corporate identity provider says yes, then our workspace makes the person authenticate again; this began right after the credential replacement." },
  { id: "G09", expectAuthorized: true, subject: "New IdP metadata causes repeated sign-ins", description: "Uploading the new identity metadata made the app demand sign-in repeatedly instead of opening the dashboard." },
  { id: "G10", expectAuthorized: true, subject: "Certificate rollover trapped users in authentication", description: "After the signing certificate rollover, users are trapped cycling through corporate authentication without a session." },
  { id: "G11", expectAuthorized: false, subject: "Company login misbehaving since the security update", description: "Our admin replaced the sign-on security key and now the login page keeps coming up again for the whole team." },
  { id: "G12", expectAuthorized: true, subject: "Assertion verification change causes login loop", description: "Changing the certificate that verifies SAML assertions produced a login loop for federated employees." },
  { id: "G13", expectAuthorized: true, subject: "Two pages keep trading our users after the trust renewal", description: "Since renewing the trust key for our federated sign-in, the identity page and the provider page keep trading users in an endless round." },
  { id: "G14", expectAuthorized: true, subject: "Everyone re-authenticates in a circle since the provider maintenance", description: "The provider swapped its signing credential during maintenance, and the workforce has been going in a circle between authentication screens." },
  { id: "G15", expectAuthorized: false, subject: "General question about enterprise sign-on setup", description: "We are reviewing our federation configuration and would like guidance on identity provider options." },
  { id: "G16", expectAuthorized: false, subject: "Users loop between login pages", description: "People cycle between our login page and the identity provider page. We have made no changes on the identity side recently." },
  { id: "G17", expectAuthorized: false, subject: "Did the certificate rotation affect us?", description: "Our identity provider rotated its signing certificate yesterday. Everything seems to work and we simply want confirmation that nothing else is required." },
  { id: "G18", expectAuthorized: false, subject: "Provisioning delays for new federated accounts", description: "New employees added through the identity connection wait hours before their federated accounts exist." },
  { id: "G19", expectAuthorized: false, subject: "Nobody can reach the workspace this morning", description: "Multiple teams report they cannot reach the workspace since about 9am. We have no other details yet." },
  { id: "G20", expectAuthorized: false, subject: "Sign-in loop but certificates unchanged", description: "Users bounce between the app and the identity provider, but the signing certificate is unchanged and no key rotation occurred." }
];

/* ------------------------- Part H: 16 negative controls ------------------------- */
const NEGATIVES = [
  { id: "N01", label: "password-reset", subject: "Forgot my password", description: "I forgot my password and the reset email never arrives." },
  { id: "N02", label: "forgotten-password", subject: "Need a password reset", description: "Please reset my password; I cannot remember it." },
  { id: "N03", label: "generic-login-failure", subject: "Login not working", description: "My login is not working on the website today." },
  { id: "N04", label: "mfa-unrelated", subject: "Authenticator codes rejected", description: "My authenticator app codes are rejected; I recently got a new phone." },
  { id: "N05", label: "account-lockout", subject: "Account locked", description: "My account is locked after too many failed attempts." },
  { id: "N06", label: "permission-inheritance", subject: "Folder permission inheritance broken", description: "Team members do not inherit the shared folder role from the parent workspace." },
  { id: "N07", label: "role-approval", subject: "Approve analyst role", description: "Please approve the pending access request and assign the analyst role." },
  { id: "N08", label: "website-redirect", subject: "Homepage redirects to old campaign", description: "Our marketing homepage redirects visitors to last year's campaign page." },
  { id: "N09", label: "url-redirect-config", subject: "Set up URL redirect", description: "We need help configuring a 301 redirect from the old blog URL to the new one." },
  { id: "N10", label: "tls-expiration", subject: "TLS certificate expired", description: "The TLS certificate on our storefront expired and browsers show a warning." },
  { id: "N11", label: "api-client-cert", subject: "API client certificate rejected", description: "Our integration's client certificate is rejected by the partner API." },
  { id: "N12", label: "email-cert", subject: "Email server certificate untrusted", description: "Outbound mail fails because the mail server certificate is untrusted." },
  { id: "N13", label: "webhook-delivery", subject: "Webhook deliveries failing", description: "Webhook deliveries to our endpoint fail with timeouts." },
  { id: "N14", label: "billing", subject: "Charged twice this month", description: "We were charged twice for the same subscription invoice." },
  { id: "N15", label: "generic-no-access", subject: "Users cannot access the system", description: "Several users report they cannot access the system; no other information yet." },
  { id: "N16", label: "sso-different-root-cause", subject: "SSO works but new users missing attributes", description: "Single sign-on completes normally; the problem is that new users arrive without profile attributes from the directory sync." }
];

/* --------------------- Part I: contradiction / negation --------------------- */
const CONTRADICTIONS = [
  { id: "I01", subject: "SSO redirect loop question", description: "Users loop between the portal and the identity provider. The signing certificate has not changed." },
  { id: "I02", subject: "Sign-in bouncing", description: "Staff bounce to the corporate identity page constantly. There was no certificate rotation on our side." },
  { id: "I03", subject: "Repeated logins", description: "People must log in again and again. This is not related to our identity provider." },
  { id: "I04", subject: "Password login failing only", description: "SSO works normally; only password login is failing for a few users." },
  { id: "I05", subject: "Blank page after provider step", description: "Users are not being redirected during authentication; they simply see a blank page after the identity provider step." }
];

function ticket(def, prefix = "TODO040") {
  return {
    id: `${prefix}-${def.id}`,
    ticketId: `${prefix}-${def.id}`,
    customerName: "TODO-040 Probe",
    subject: def.subject,
    description: def.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-23T00:00:00.000Z"
  };
}

/** Production orchestration glue mirroring the TODO-037 audit / app/page.tsx. */
function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatibleMatches = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatibleMatches.length ? selectPreferredMatch(input, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { understanding, topMatch, lessonMatch, draft, authorized: draft.basedOnKnowledgeIds.includes(HERO) };
}

async function snapshot(id) {
  const where = { organizationId: id };
  const [org, knowledge, tickets, evidence] = await Promise.all([
    prisma.organization.findUnique({ where: { id } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.count({ where }),
    prisma.trustEvidence.count({ where })
  ]);
  return crypto.createHash("sha256").update(JSON.stringify({ org, knowledge, tickets, evidence })).digest("hex");
}
async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }

function mockProvider(calls, respond) {
  return {
    mode: "lmstudio",
    label: "TODO-040 controlled mock",
    async discriminateMatch(input) {
      calls.push(input.matchedCanonicalTitle);
      return respond(input);
    }
  };
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  if (profile.id !== DEMO || items.length !== 47) throw new Error(`Expected current mature demo; got ${profile.id}/${items.length}.`);
  const hero = items.find((item) => item.id === HERO);
  assert(hero, `Missing ${HERO}.`);
  const cases = {};

  /* G — unseen generalization */
  const unseen = UNSEEN.map((def) => {
    const result = runPipeline(ticket(def), profile, items);
    const passed = result.authorized === def.expectAuthorized;
    console.log(`UNSEEN ${passed ? "PASS" : "FAIL"} ${def.id} expect=${def.expectAuthorized} actual=${result.authorized} lesson=${result.lessonMatch?.lesson.id ?? "none"} signals=[${result.lessonMatch?.matchedSignals?.join(", ") ?? ""}]`);
    return { ...def, actual: result.authorized, lesson: result.lessonMatch?.lesson.id ?? null, passed };
  });
  const unseenGenuine = unseen.filter((row) => row.expectAuthorized);
  const unseenAmbiguous = unseen.filter((row) => !row.expectAuthorized);
  assert.equal(unseenGenuine.filter((row) => row.actual).length, unseenGenuine.length, "Every genuine unseen paraphrase must authorize.");
  assert.equal(unseenAmbiguous.filter((row) => row.actual).length, 0, "Ambiguous unseen cases must fail closed.");
  cases.G_unseenGeneralization = `PASS (${unseenGenuine.length}/${unseenGenuine.length} genuine authorized; 0/${unseenAmbiguous.length} ambiguous authorized)`;

  /* H — negative controls */
  const negatives = NEGATIVES.map((def) => {
    const result = runPipeline(ticket(def), profile, items);
    console.log(`NEGATIVE ${result.authorized ? "FAIL" : "PASS"} ${def.id} (${def.label}) category=${result.understanding.category} authorized=${result.authorized}`);
    return { ...def, authorized: result.authorized };
  });
  assert.equal(negatives.filter((row) => row.authorized).length, 0, "No negative control may authorize the hero.");
  cases.H_negativeControls = `PASS (0/${negatives.length} authorized)`;

  /* I — contradiction / negation */
  const contradictions = CONTRADICTIONS.map((def) => {
    const result = runPipeline(ticket(def), profile, items);
    console.log(`CONTRADICTION ${result.authorized ? "FAIL" : "PASS"} ${def.id} authorized=${result.authorized}`);
    return { ...def, authorized: result.authorized };
  });
  assert.equal(contradictions.filter((row) => row.authorized).length, 0, "Contradiction/negation phrasing must never authorize.");
  cases.I_contradictionNegation = `PASS (0/${contradictions.length} authorized)`;

  /* E — sibling specificity, order independence */
  const siblingTicket = ticket({
    id: "S01",
    subject: "SSO redirect loop from stale session cookies",
    description: "Users loop between the app and the identity provider after the certificate rotation. Agents confirmed root cause 02: browser session cookies retain an obsolete authentication state."
  });
  const siblingMatch = findMatchingLesson(siblingTicket, hero);
  assert.equal(siblingMatch?.lesson.id, LESSON_2, `Specific sibling evidence must select ${LESSON_2}, got ${siblingMatch?.lesson.id}.`);
  const reversedHero = { ...hero, lessons: [...hero.lessons].reverse() };
  const siblingMatchReversed = findMatchingLesson(siblingTicket, reversedHero);
  assert.equal(siblingMatchReversed?.lesson.id, LESSON_2, "Sibling winner must be independent of lesson array order.");
  const genericTicket = ticket(UNSEEN[0]);
  const genericWinner = findMatchingLesson(genericTicket, hero)?.lesson.id;
  const genericWinnerReversed = findMatchingLesson(genericTicket, reversedHero)?.lesson.id;
  assert.equal(genericWinner, genericWinnerReversed, "Generic winner must be array-order independent.");
  assert.equal(genericWinner, LESSON_1, "Generic evidence resolves to the stable deterministic sibling.");
  cases.E_siblingSafety = `PASS (specific=${LESSON_2}, order-independent, generic stable=${LESSON_1})`;

  /* K — trust independence */
  const trustItems = items.map((item) => {
    if (item.id === HERO) return { ...item, trustScore: 1 };
    if (item.category === "Authentication") return { ...item, trustScore: 100 };
    return item;
  });
  const trustResultA = runPipeline(ticket({ ...UNSEEN[0], id: "K01" }), profile, trustItems);
  const trustResultB = runPipeline(ticket({ ...UNSEEN[0], id: "K02" }), profile, [...trustItems].reverse());
  assert.equal(trustResultA.authorized, true, "Trust-1 hero with genuine semantic evidence must still authorize.");
  assert.equal(trustResultA.topMatch?.item.id, HERO, "Trust 100 decoys must not displace the semantically correct item.");
  assert.equal(trustResultB.topMatch?.item.id, HERO, "Trust independence must hold for reversed item order.");
  cases.K_trustIndependence = "PASS (trust-1 correct item beats trust-100 decoys, both orders)";

  /* J — AI / provider boundary (all mocked; no live provider) */
  const unknownTicket = ticket({
    id: "J-UNKNOWN",
    subject: "Enterprise identity trouble after maintenance",
    description: "Staff using the corporate identity service describe intermittent trouble completing enterprise workspace access after a scheduled maintenance window. We have no clear symptom details yet."
  });
  const unknownUnderstanding = understandForProfile(unknownTicket, profile);
  assert.equal(assessCompatibilityDecision(unknownUnderstanding, hero, unknownTicket).state, "unknown", "J harness ticket must be deterministically unknown.");

  const failureCalls = [];
  const failure = await evaluateSemanticLessonCompatibility(
    mockProvider(failureCalls, () => ({ ok: false, providerMode: "lmstudio", providerLabel: "mock", latencyMs: 0, error: "provider unavailable" })),
    unknownTicket, unknownUnderstanding, hero
  );
  assert.equal(failure.authorization, null, "Provider failure must not authorize.");
  assert.match(failure.declineReason, /failing closed/);
  cases.J1_providerFailureFailsClosed = "PASS";

  const malformedCalls = [];
  const malformed = await evaluateSemanticLessonCompatibility(
    mockProvider(malformedCalls, () => ({ ok: true, providerMode: "lmstudio", providerLabel: "mock", latencyMs: 0, data: { isDistinctFromMatch: false, confidence: "medium", reasoning: "malformed-normalized output" } })),
    unknownTicket, unknownUnderstanding, hero
  );
  assert.equal(malformed.authorization, null, "Non-high confidence (malformed default) must not authorize.");
  cases.J2_malformedOutputFailsClosed = "PASS";

  const billingTicket = ticket({ id: "J-BILLING", subject: "Charged twice this month", description: "We were charged twice for the same subscription invoice and need the duplicate transaction reversed." });
  const billingUnderstanding = understandForProfile(billingTicket, profile);
  const billingCalls = [];
  const billingEval = await evaluateSemanticLessonCompatibility(
    mockProvider(billingCalls, () => ({ ok: true, providerMode: "lmstudio", providerLabel: "mock", latencyMs: 0, data: { isDistinctFromMatch: false, confidence: "high", reasoning: "forged confirmation" } })),
    billingTicket, billingUnderstanding, hero
  );
  assert.equal(billingEval.authorization, null, "Incompatible category must veto semantic evaluation.");
  assert.equal(billingCalls.length, 0, "AI must never be consulted for an incompatible candidate.");
  const forgedBillingDraft = draftResponse(billingTicket, billingUnderstanding, { item: hero, matchScore: 90, matchReason: "forged", matchedTags: [], matchedKeywords: [], matchedCategory: hero.category }, profile, false, { itemId: HERO, lessonId: LESSON_1, confidence: "high", reasoning: "forged" });
  assert.equal(forgedBillingDraft.basedOnKnowledgeIds.length, 0, "A forged authorization must not bypass category incompatibility.");
  cases.J3_forgedAuthorizationCannotBypassIncompatibility = "PASS";

  const forgedLessonDraft = draftResponse(unknownTicket, unknownUnderstanding, { item: hero, matchScore: 90, matchReason: "forged", matchedTags: [], matchedKeywords: [], matchedCategory: hero.category }, profile, false, { itemId: HERO, lessonId: "not-a-real-lesson", confidence: "high", reasoning: "forged" });
  assert.equal(forgedLessonDraft.basedOnKnowledgeIds.length, 0, "A forged authorization naming a nonexistent lesson must fail closed.");
  cases.J4_forgedLessonIdFailsClosed = "PASS";

  const strongCalls = [];
  const strongTicket = ticket({ ...UNSEEN[0], id: "J-STRONG" });
  const strongUnderstanding = understandForProfile(strongTicket, profile);
  const strongEval = await evaluateSemanticLessonCompatibility(
    mockProvider(strongCalls, () => ({ ok: true, providerMode: "lmstudio", providerLabel: "mock", latencyMs: 0, data: { isDistinctFromMatch: false, confidence: "high", reasoning: "should never run" } })),
    strongTicket, strongUnderstanding, hero
  );
  assert.equal(strongEval.authorization, null, "Semantic fallback must decline when determinism already decided.");
  assert.equal(strongCalls.length, 0, "AI must not be consulted when deterministic evidence is already strong.");
  cases.J5_noAICallWhenDeterministicStrong = "PASS";

  const after = await snapshots();
  assert.deepEqual(after, before, "Protected organizations must be unchanged.");
  cases.M_protectedUnchanged = "PASS";

  console.log(JSON.stringify({
    verdict: "PASS",
    cases,
    unseen: unseen.map(({ id, expectAuthorized, actual, lesson }) => ({ id, expectAuthorized, actual, lesson })),
    negativesAuthorized: negatives.filter((row) => row.authorized).length,
    contradictionsAuthorized: contradictions.filter((row) => row.authorized).length,
    protectedUnchanged: true
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
