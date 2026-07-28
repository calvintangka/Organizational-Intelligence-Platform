/*
 * TODO-058 multilingual foundation probe.
 *
 * Covers the phases implemented in this change:
 *   B  language detection across all ten supported languages
 *   E  concept vocabulary with multilingual aliases (one concept, many languages)
 *   F  response language policy resolution
 *   K  equivalent tickets in nine languages reaching the same CONCEPTS
 *   L  backward compatibility: an untouched profile is unchanged, and existing
 *      English behavior in the shipped matching layer is byte-identical
 *
 * Deterministic and offline: no database, no dev server, no AI provider.
 *
 * NOTE: Phases C/D/G (canonical matching, retrieval, and reflection running on
 * concepts) are DESIGNED, NOT IMPLEMENTED. The canonical assertions below record
 * today's real behavior so the gap is measured rather than assumed — see
 * docs/TODO-058-LANGUAGE-NEUTRAL-DESIGN.md.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  isSupportedLanguage,
  languageLabel
} = require(path.join(root, "lib", "languageDetection.ts"));
const {
  DEFAULT_LANGUAGE_POLICY,
  resolveLanguagePolicy,
  resolveResponseLanguage,
  responseLanguageInstruction
} = require(path.join(root, "lib", "languagePolicy.ts"));
const {
  BUILT_IN_CONCEPTS,
  buildConceptIndex,
  conceptsInText,
  normalizeConceptVocabulary,
  resolveConceptVocabulary
} = require(path.join(root, "lib", "conceptVocabulary.ts"));
const { foldForMatching } = require(path.join(root, "lib", "textNormalization.ts"));
const { normalizeOrganizationProfile } = require(path.join(root, "lib", "organizationProfile.ts"));
const { containsSignal } = require(path.join(root, "lib", "textSignal.ts"));
const { developerDemoProfile } = require(path.join(root, "data", "developerDemoFoundation.ts"));

const failures = [];

function check(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL  ${label} -- ${error.message}`);
  }
}

/** One login problem, expressed nine ways. */
const EQUIVALENT_TICKETS = [
  ["en", "I can't log in to my workspace. My password is rejected every time I try to sign in."],
  ["id", "Saya tidak bisa masuk ke ruang kerja saya. Kata sandi saya ditolak setiap kali saya mencoba login."],
  ["es", "No puedo iniciar sesión en mi espacio de trabajo. Mi contraseña es rechazada cada vez que intento entrar."],
  ["fr", "Je ne peux pas me connecter à mon espace de travail. Mon mot de passe est refusé à chaque tentative."],
  ["de", "Ich kann mich nicht bei meinem Arbeitsbereich anmelden. Mein Passwort wird jedes Mal abgelehnt."],
  ["pt", "Não consigo entrar no meu espaço de trabalho. Minha senha é rejeitada sempre que tento fazer login."],
  ["it", "Non riesco ad accedere al mio spazio di lavoro. La mia password viene rifiutata ogni volta."],
  ["ja", "ワークスペースにログインできません。サインインするたびにパスワードが拒否されます。"],
  ["ko", "워크스페이스에 로그인할 수 없습니다. 로그인하려고 할 때마다 비밀번호가 거부됩니다."],
  ["zh", "我无法登录我的工作区。每次尝试登录时，我的密码都被拒绝。"]
];

console.log("TODO-058 multilingual foundation probe\n");

/* ---------- Phase B: language detection ---------- */

check("B: every supported language is detected from a full ticket", () => {
  for (const [expected, text] of EQUIVALENT_TICKETS) {
    const result = detectLanguage(text);
    assert.equal(result.language, expected, `${expected}: detected ${result.language}`);
    assert.ok(result.confidence > 0.5, `${expected}: confidence ${result.confidence} too low`);
    assert.equal(result.fallbackApplied, false, `${expected}: must not be a fallback`);
  }
});

check("B: short subjects are still detected", () => {
  const shorts = [
    ["en", "I can't log in"], ["id", "Saya tidak bisa login"], ["es", "No puedo iniciar sesión"],
    ["fr", "Je ne peux pas me connecter"], ["de", "Ich kann mich nicht anmelden"], ["pt", "Não consigo fazer login"],
    ["it", "Non riesco ad accedere"], ["ja", "ログインできません"], ["ko", "로그인할 수 없습니다"], ["zh", "我无法登录"]
  ];
  for (const [expected, text] of shorts) {
    assert.equal(detectLanguage(text).language, expected, `${expected}: "${text}"`);
  }
});

check("B: detection is deterministic and provider-independent", () => {
  for (const [, text] of EQUIVALENT_TICKETS) {
    const a = JSON.stringify(detectLanguage(text));
    const b = JSON.stringify(detectLanguage(text));
    assert.equal(a, b, "repeated detection must be identical");
  }
});

check("B: empty and unusable input falls back without inventing a language", () => {
  for (const empty of ["", "   ", "!!! ??? ...", "12345"]) {
    const result = detectLanguage(empty);
    assert.equal(result.fallbackApplied, true, `"${empty}" must report a fallback`);
    assert.equal(result.confidence, 0, `"${empty}" must not claim confidence`);
    assert.equal(result.language, "en", `"${empty}" must use the default`);
  }
  assert.equal(detectLanguage("!!!", { defaultLanguage: "id" }).language, "id", "organization default must be honored");
  assert.equal(detectLanguage("!!!", { defaultLanguage: "bogus" }).language, "en", "an invalid default must not leak through");
});

check("B: all ten required languages are supported", () => {
  for (const code of ["en", "id", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"]) {
    assert.ok(SUPPORTED_LANGUAGES.includes(code), `${code} must be supported`);
    assert.ok(isSupportedLanguage(code));
    assert.ok(typeof languageLabel(code) === "string" && languageLabel(code).length > 0);
  }
});

/* ---------- Unicode-safe folding ---------- */

check("folding preserves every script and folds diacritics", () => {
  assert.equal(foldForMatching("No puedo iniciar sesión"), "no puedo iniciar sesion");
  assert.equal(foldForMatching("Não consigo"), "nao consigo");
  assert.equal(foldForMatching("Ich kann mich nicht anmelden über"), "ich kann mich nicht anmelden uber");
  assert.equal(foldForMatching("ログインできません"), "ログインできません");
  assert.equal(foldForMatching("로그인할 수 없습니다"), "로그인할 수 없습니다");
  assert.equal(foldForMatching("我无法登录"), "我无法登录");
  // The measured Phase A defect: the shipped English normalizer destroys these.
  assert.equal("No puedo iniciar sesión".toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(), "no puedo iniciar sesi n");
  assert.equal("ログインできません".toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(), "");
});

/* ---------- Phase E: concept vocabulary ---------- */

check("E: one concept carries every language's wording", () => {
  const invoice = BUILT_IN_CONCEPTS.find((concept) => concept.id === "invoice");
  assert.ok(invoice, "the invoice concept must exist");
  for (const alias of ["invoice", "faktur", "factura", "請求書", "fattura"]) {
    assert.ok(
      invoice.aliases.some((candidate) => foldForMatching(candidate) === foldForMatching(alias)),
      `invoice must include the alias ${alias}`
    );
  }
});

check("E: aliases in different languages resolve to ONE concept id", () => {
  const index = buildConceptIndex(BUILT_IN_CONCEPTS);
  const ids = ["invoice", "faktur", "factura", "請求書", "fattura", "fatura"].map((alias) => index.get(foldForMatching(alias)));
  assert.deepEqual([...new Set(ids)], ["invoice"], `expected one concept id, got ${JSON.stringify(ids)}`);
});

check("E: concept normalization drops malformed rows and merges duplicate ids", () => {
  const normalized = normalizeConceptVocabulary([
    { id: "Invoice", label: "Invoice", aliases: ["Factura", "factura", " faktur "] },
    { id: "invoice", label: "Invoice again", aliases: ["請求書"] },
    { id: "", label: "", aliases: ["ignored"] },
    null,
    "not an object",
    { label: "Refund Requests", aliases: ["reembolso", 42] }
  ]);
  const invoice = normalized.find((concept) => concept.id === "invoice");
  assert.ok(invoice, "duplicate ids must merge into one concept");
  assert.equal(normalized.filter((concept) => concept.id === "invoice").length, 1, "no duplicate concept rows");
  assert.deepEqual(invoice.aliases, ["Factura", "faktur", "請求書"], "case-duplicate aliases must collapse");
  assert.ok(normalized.some((concept) => concept.id === "refund_requests"), "a label-only concept must get a neutral id");
  assert.ok(!normalized.some((concept) => concept.id === ""), "malformed rows must be dropped");
});

check("E: organization concepts extend built-ins without duplicating them", () => {
  const withOwn = resolveConceptVocabulary({
    conceptVocabulary: [{ id: "invoice", label: "Invoice", aliases: ["nota tagihan"] }, { id: "sla", label: "SLA", aliases: ["service level"] }]
  });
  const ids = withOwn.map((concept) => concept.id);
  assert.equal(new Set(ids).size, ids.length, "concept ids must be unique");
  const invoice = withOwn.find((concept) => concept.id === "invoice");
  assert.ok(invoice.aliases.includes("nota tagihan"), "organization alias must be added");
  assert.ok(invoice.aliases.some((a) => foldForMatching(a) === "factura"), "built-in aliases must be retained");
  assert.ok(ids.includes("sla"), "organization-only concepts must be present");
});

/* ---------- Phase K: cross-language convergence on concepts ---------- */

check("K: equivalent tickets in ten languages reach the SAME concepts", () => {
  const concepts = resolveConceptVocabulary(developerDemoProfile);
  const perLanguage = EQUIVALENT_TICKETS.map(([code, text]) => [code, conceptsInText(text, concepts).sort()]);
  for (const [code, found] of perLanguage) {
    assert.ok(found.includes("login"), `${code}: must reach the login concept, got ${JSON.stringify(found)}`);
    assert.ok(found.includes("password"), `${code}: must reach the password concept, got ${JSON.stringify(found)}`);
  }
  // No language produces a language-suffixed or otherwise forked concept.
  const everyConcept = new Set(perLanguage.flatMap(([, found]) => found));
  for (const concept of everyConcept) {
    assert.ok(!/_(en|id|es|fr|de|pt|it|ja|ko|zh)$/u.test(concept), `${concept} must not be language-scoped`);
  }
});

check("K: concept matching does not fire on unrelated text", () => {
  const concepts = resolveConceptVocabulary(developerDemoProfile);
  assert.deepEqual(conceptsInText("The weather is nice and I like monkeys", concepts), [], "unrelated English must match nothing");
  assert.deepEqual(conceptsInText("", concepts), [], "empty text must match nothing");
});

/* ---------- Phase F: response language policy ---------- */

check("F: default policy replies in the customer's language", () => {
  const policy = resolveLanguagePolicy({});
  assert.deepEqual(policy, DEFAULT_LANGUAGE_POLICY, "an unconfigured profile must resolve to the product default");
  for (const [code, text] of EQUIVALENT_TICKETS) {
    const decision = resolveResponseLanguage(policy, detectLanguage(text));
    assert.equal(decision.language, code, `${code}: expected a reply in the customer's language`);
    assert.equal(decision.reason, "customer_language");
  }
});

check("F: organization-language mode ignores the detected language", () => {
  const policy = resolveLanguagePolicy({ languagePolicy: { organizationLanguage: "id", responseMode: "organization_language", internalLanguage: "id", minimumDetectionConfidence: 0.6 } });
  for (const [, text] of EQUIVALENT_TICKETS) {
    const decision = resolveResponseLanguage(policy, detectLanguage(text));
    assert.equal(decision.language, "id", "every reply must use the organization language");
    assert.equal(decision.reason, "organization_language");
  }
});

check("F: fixed-language mode always replies in the configured language", () => {
  const policy = resolveLanguagePolicy({ languagePolicy: { organizationLanguage: "en", responseMode: "fixed_language", fixedResponseLanguage: "ja", internalLanguage: "en", minimumDetectionConfidence: 0.6 } });
  for (const [, text] of EQUIVALENT_TICKETS) {
    assert.equal(resolveResponseLanguage(policy, detectLanguage(text)).language, "ja");
  }
  // A fixed mode with no language configured falls back to the organization language.
  const incomplete = resolveLanguagePolicy({ languagePolicy: { organizationLanguage: "de", responseMode: "fixed_language", internalLanguage: "de", minimumDetectionConfidence: 0.6 } });
  assert.equal(resolveResponseLanguage(incomplete, detectLanguage("I can't log in")).language, "de");
});

check("F: a low-confidence detection never picks the reply language", () => {
  const policy = resolveLanguagePolicy({});
  const weak = resolveResponseLanguage(policy, { language: "fr", confidence: 0.2 });
  assert.equal(weak.language, "en", "a weak guess must fall back to the organization language");
  assert.equal(weak.reason, "low_confidence_fallback");
  const none = resolveResponseLanguage(policy, null);
  assert.equal(none.reason, "low_confidence_fallback", "a missing detection must fall back");
});

check("F: malformed stored policy is coerced, never trusted", () => {
  const policy = resolveLanguagePolicy({
    languagePolicy: { organizationLanguage: "klingon", responseMode: "shout", internalLanguage: 42, minimumDetectionConfidence: 9 }
  });
  assert.equal(policy.organizationLanguage, "en");
  assert.equal(policy.responseMode, "customer_language");
  assert.equal(policy.internalLanguage, "en");
  assert.equal(policy.minimumDetectionConfidence, 1, "confidence must clamp into 0..1");
});

check("F: the prompt instruction names exactly one language", () => {
  const decision = resolveResponseLanguage(resolveLanguagePolicy({}), detectLanguage(EQUIVALENT_TICKETS[7][1]));
  const instruction = responseLanguageInstruction(decision);
  assert.ok(instruction.includes("Japanese"), "the instruction must name the target language");
  assert.ok(instruction.includes("Do not mix languages"), "the instruction must forbid mixing");
});

/* ---------- Phase L: backward compatibility ---------- */

check("L: a profile with no language settings is unchanged by normalization", () => {
  const normalized = normalizeOrganizationProfile(developerDemoProfile);
  assert.equal("languagePolicy" in normalized, false, "an unconfigured profile must not gain a stored policy");
  assert.equal("conceptVocabulary" in normalized, false, "an unconfigured profile must not gain a stored vocabulary");
  assert.deepEqual(normalized.businessVocabulary, developerDemoProfile.businessVocabulary, "existing vocabulary must be untouched");
});

check("L: configured language settings survive normalization", () => {
  const configured = {
    ...developerDemoProfile,
    languagePolicy: { organizationLanguage: "id", responseMode: "organization_language", internalLanguage: "id", minimumDetectionConfidence: 0.75 },
    conceptVocabulary: [{ id: "sla", label: "SLA", aliases: ["service level"] }]
  };
  const normalized = normalizeOrganizationProfile(configured);
  assert.equal(normalized.languagePolicy.organizationLanguage, "id");
  assert.equal(normalized.languagePolicy.minimumDetectionConfidence, 0.75);
  assert.equal(normalized.conceptVocabulary.length, 1);
  assert.equal(normalized.conceptVocabulary[0].id, "sla");
});

check("L: the shipped English signal matcher is untouched", () => {
  // Phase C has NOT replaced these; existing retrieval behavior must be identical.
  assert.equal(containsSignal("i cannot log in to my account", "log in"), true);
  assert.equal(containsSignal("the monkey escaped", "key"), false);
  assert.equal(containsSignal("password reset requested", "password"), true);
  assert.equal(containsSignal("ログインできません", "ログイン"), false, "the English matcher still cannot see CJK — Phase C is pending");
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-058 probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-058 probe passed: detection, concept vocabulary, and response language policy are language-neutral.");
}
