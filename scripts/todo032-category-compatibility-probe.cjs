/*
 * TODO-032 focused category classification and compatibility probe.
 * Persisted organizations are loaded read-only; all trust and AI cases use
 * in-memory objects only.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-032 must load mature knowledge read-only.");
  process.exit(1);
}

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { withPreDiscriminationLessonMatches, selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));
const {
  assessCompatibilityDecision,
  authorizeSemanticLessonReuse,
  draftResponse,
  findMatchingLesson,
  isCompatibleForDrafting,
  isStrongLessonEvidence
} = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const SSO = "demo-ki-sso-certificate-redirect-loop";
const PERMISSIONS = "demo-ki-permission-inheritance-delay";

function ticket(id, subject, description) {
  return { id, ticketId: id, customerName: "TODO-032 QA", subject, description, category: "General", status: "new", createdAt: "2026-07-21T00:00:00.000Z" };
}

function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
}

function pipeline(testTicket, profile, items) {
  const understanding = understandForProfile(testTicket, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, items, "");
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, testTicket));
  const selected = compatible.length ? selectPreferredMatch(testTicket, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  return { understanding, rawMatches, topMatch, lessonMatch, draft };
}

function directMatch(item) {
  return { item, matchScore: 100, matchReason: "TODO-032 direct authorization fixture", matchedTags: [], matchedKeywords: [], matchedCategory: item.category };
}

async function main() {
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  const sso = items.find((item) => item.id === SSO);
  const permissions = items.find((item) => item.id === PERMISSIONS);
  const currency = items.find((item) => item.id === "demo-ki-invoice-currency-display");
  assert.ok(sso && permissions && currency, "Mature TODO-032 fixture knowledge must exist.");

  // A — M02: specific infrastructure signals classify Authentication, not Login.
  const m02 = ticket("M02", "Sign-in keeps bouncing after the IdP signing credential was replaced", "Our SAML users return to the identity provider repeatedly after we renewed the certificate. authentication certificate redirect timeline.");
  const a = pipeline(m02, profile, items);
  console.log(`A trace category=${a.understanding.category} signals=${a.understanding.detectedSignals.join(", ")} rawTop=${a.rawMatches[0]?.item.id} lesson=${a.lessonMatch?.lesson.id} decision=${a.topMatch ? assessCompatibilityDecision(a.understanding, a.topMatch.item, m02).state : "none"}`);
  check("A M02 classifies as Authentication", a.understanding.category === "Authentication");
  check("A M02 retrieves and authorizes SSO", a.topMatch?.item.id === SSO && a.lessonMatch && isStrongLessonEvidence(a.lessonMatch, true) && a.draft.basedOnKnowledgeIds.includes(SSO), a.topMatch?.item.id);

  // B — M16: permission/inheritance evidence outranks incidental delay wording.
  const m16 = ticket("M16", "Permission Inheritance Delay", "permissions inheritance timeline root cause 01 permission-inheritance-delay");
  const b = pipeline(m16, profile, items);
  console.log(`B trace category=${b.understanding.category} signals=${b.understanding.detectedSignals.join(", ")} rawTop=${b.rawMatches[0]?.item.id} lesson=${b.lessonMatch?.lesson.id} decision=${b.topMatch ? assessCompatibilityDecision(b.understanding, b.topMatch.item, m16).state : "none"}`);
  check("B M16 classifies as Permissions & Access", b.understanding.category === "Permissions & Access");
  check("B M16 retrieves and authorizes permission inheritance", b.topMatch?.item.id === PERMISSIONS && b.lessonMatch && isStrongLessonEvidence(b.lessonMatch, true) && b.draft.basedOnKnowledgeIds.includes(PERMISSIONS), b.topMatch?.item.id);

  // C/D — ordinary login and genuine delivery retain their original domains.
  const ordinaryLogin = ticket("LOGIN", "Forgot password", "I forgot my password and cannot log in to my account.");
  const loginUnderstanding = understandForProfile(ordinaryLogin, profile);
  check("C ordinary password issue remains Login", loginUnderstanding.category === "Login" && !isCompatibleForDrafting(loginUnderstanding, sso, ordinaryLogin), loginUnderstanding.category);
  const delivery = ticket("DELIVERY", "Delivery delay", "My package delivery is delayed and tracking has not updated.");
  const deliveryUnderstanding = understandForProfile(delivery, profile);
  check("D genuine delivery delay remains delivery-related", ["Delivery", "Delivery Delay"].includes(deliveryUnderstanding.category) && deliveryUnderstanding.category !== "Permissions & Access", deliveryUnderstanding.category);

  // E/F — category recognition alone cannot turn one weak lesson signal into a draft.
  const weakAuth = ticket("WEAK-AUTH", "Authentication certificate question", "I have a question about an authentication certificate.");
  const weakAuthUnderstanding = understandForProfile(weakAuth, profile);
  const weakAuthLesson = findMatchingLesson(weakAuth, sso);
  const weakAuthDraft = draftResponse(weakAuth, weakAuthUnderstanding, directMatch(sso), profile, false);
  check("E weak authentication overlap fails closed", weakAuthUnderstanding.category === "Authentication" && weakAuthLesson && !isStrongLessonEvidence(weakAuthLesson, true) && weakAuthDraft.source === "no_template", weakAuthDraft.source);
  const weakPermissions = ticket("WEAK-PERM", "Permission inheritance question", "I have a permission inheritance timeline question.");
  const weakPermissionsUnderstanding = understandForProfile(weakPermissions, profile);
  const weakPermissionsLesson = findMatchingLesson(weakPermissions, permissions);
  const weakPermissionsDraft = draftResponse(weakPermissions, weakPermissionsUnderstanding, directMatch(permissions), profile, false);
  check("F weak permissions overlap fails closed", weakPermissionsUnderstanding.category === "Permissions & Access" && weakPermissionsLesson && !isStrongLessonEvidence(weakPermissionsLesson, true) && weakPermissionsDraft.source === "no_template", weakPermissionsDraft.source);

  // G/H — existing hard safety remains authoritative.
  const contradiction = ticket("CONTRA", "Authentication report issue", "I can sign in normally and this is not a login issue. authentication certificate redirect timeline.");
  const contra = pipeline(contradiction, profile, items);
  check("G contradiction remains a hard veto", contra.draft.source === "no_template" && contra.draft.basedOnKnowledgeIds.length === 0, contra.understanding.category);
  const negation = ticket("NEGATION", "Not an authentication issue", "I am not having a login problem. Authentication works normally.");
  const negated = pipeline(negation, profile, items);
  check("H negation remains fail closed", negated.draft.source === "no_template" && negated.draft.basedOnKnowledgeIds.length === 0, negated.understanding.category);

  // I — classification and compatibility do not inspect trust.
  const normalCategory = understandForProfile(m16, profile).category;
  const invertedTrustItem = { ...permissions, trustScore: 100 - (permissions.trustScore ?? 0) };
  check("I trust inversion does not affect classification or compatibility", normalCategory === understandForProfile(m16, profile).category && isCompatibleForDrafting(understandForProfile(m16, profile), permissions, m16) === isCompatibleForDrafting(understandForProfile(m16, profile), invertedTrustItem, m16));

  // J — a forged AI authorization cannot cross TODO-030's final weak-evidence gate.
  const weakBilling = ticket("WEAK-AI", "Billing invoice question", "I have a billing invoice question about the account address.");
  const weakBillingUnderstanding = understandForProfile(weakBilling, profile);
  const weakBillingLesson = findMatchingLesson(weakBilling, currency);
  const forged = { itemId: currency.id, lessonId: weakBillingLesson?.lesson.id, confidence: "high", reasoning: "forged TODO-032 advisory" };
  const aiDraft = draftResponse(weakBilling, weakBillingUnderstanding, directMatch(currency), profile, false, forged);
  const advisory = authorizeSemanticLessonReuse(weakBillingUnderstanding, currency, weakBilling, forged);
  check("J AI cannot authorize weak candidate", weakBillingLesson && !isStrongLessonEvidence(weakBillingLesson, true) && aiDraft.source === "no_template" && advisory === null, aiDraft.source);

  console.log("TODO-032 focused probe passed. Mature data was read-only; trust and AI cases used in-memory values.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
