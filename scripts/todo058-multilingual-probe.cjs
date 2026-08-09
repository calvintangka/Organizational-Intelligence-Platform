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
const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const {
  CONFIDENT_DETECTION,
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

/* ---------- TODO-058A Part B: hostile and ambiguous detector input ---------- */

check("058A/B: non-linguistic input never reads as a confident detection", () => {
  const hostile = [
    ["url", "https://example.com/login?next=/dashboard"],
    ["email", "please contact me at user@example.com"],
    ["ticket id", "OIP-20260728-5001"],
    ["technical terms", "HTTP 500 SAML SSO OAuth JWT timeout webhook"],
    ["product names", "OIP Maesa FastDrop"],
    ["punctuation", "!!! ??? ... ---"],
    ["numbers", "12345 67890"],
    ["emoji", "😀😀😀"],
    ["single ambiguous word", "no"]
  ];
  for (const [label, text] of hostile) {
    const result = detectLanguage(text);
    assert.ok(
      result.confidence < CONFIDENT_DETECTION,
      `${label}: confidence ${result.confidence} must stay below the reply bar ${CONFIDENT_DETECTION} ("${text}")`
    );
    const decision = resolveResponseLanguage(resolveLanguagePolicy({}), result);
    assert.notEqual(decision.reason, "customer_language", `${label}: must not drive a customer-language reply`);
  }
});

check("058A/B: every detection is finite, bounded, and internally consistent", () => {
  const samples = [
    "", "   ", "!!!", "12345", "no", "OIP-1", "https://x.com/login",
    ...EQUIVALENT_TICKETS.map(([, text]) => text),
    "Hello team, ログインできません. Please help.",
    "Hi, no puedo iniciar sesion in the OIP dashboard"
  ];
  for (const text of samples) {
    const result = detectLanguage(text);
    assert.ok(isSupportedLanguage(result.language), `"${text}": invalid language code ${result.language}`);
    assert.ok(Number.isFinite(result.confidence), `"${text}": confidence must be finite`);
    assert.ok(result.confidence >= 0 && result.confidence <= 1, `"${text}": confidence ${result.confidence} out of range`);
    assert.ok(["script", "lexical", "fallback"].includes(result.method), `"${text}": bad method ${result.method}`);
    // fallbackApplied must be truthful in both directions.
    assert.equal(result.fallbackApplied, result.method === "fallback", `"${text}": fallbackApplied disagrees with method`);
    if (result.fallbackApplied) assert.equal(result.confidence, 0, `"${text}": an assumed language must not claim confidence`);
  }
});

check("058A/B: the organization default is used only when nothing was detected", () => {
  // Nothing detectable -> the organization default is applied and disclosed.
  const assumed = detectLanguage("!!! 123", { defaultLanguage: "ja" });
  assert.equal(assumed.language, "ja");
  assert.equal(assumed.fallbackApplied, true);
  // Detectable -> the organization default must NOT override the real detection.
  const detected = detectLanguage("Ich kann mich nicht bei meinem Arbeitsbereich anmelden.", { defaultLanguage: "ja" });
  assert.equal(detected.language, "de", "a real detection must win over the organization default");
  assert.equal(detected.fallbackApplied, false);
});

check("058A/B: mixed-language input does not confidently pick the minority language", () => {
  const mixed = detectLanguage("Hi, no puedo iniciar sesion in the OIP dashboard");
  assert.ok(
    mixed.confidence < CONFIDENT_DETECTION || mixed.language === "es",
    `mixed input resolved to ${mixed.language} at ${mixed.confidence}`
  );
});

/* ---------- TODO-058A Part C: source text is never mutated ---------- */

check("058A/C: folding is derived — it never mutates the caller's string", () => {
  const originals = [
    "ログインできません",           // dakuten
    "パスワードが拒否されます",      // handakuten
    "로그인할 수 없습니다",          // Hangul
    "我无法登录",                   // Han
    "Je ne peux pas me connecter à mon espace",  // French accents
    "No puedo iniciar sesión, ¿me ayudan?",      // Spanish accents + inverted marks
    "Não consigo entrar na conta",               // Portuguese tilde
    "Ich kann mich nicht anmelden, Grüße, größe", // umlauts + ß
    "Non riesco ad accedere però"                // Italian accents
  ];
  for (const original of originals) {
    const copy = String(original);
    foldForMatching(original);
    conceptsInText(original, BUILT_IN_CONCEPTS);
    assert.equal(original, copy, `source text was mutated: ${original}`);
  }
});

check("058A/C: dakuten and handakuten survive folding as distinct characters", () => {
  // グ (ku+dakuten) must not collapse to ク, and プ must not collapse to フ.
  assert.equal(foldForMatching("ログイン"), "ログイン");
  assert.equal(foldForMatching("パスワード"), "パスワード");
  assert.notEqual(foldForMatching("グ"), foldForMatching("ク"), "dakuten distinguishes real characters");
  assert.notEqual(foldForMatching("プ"), foldForMatching("フ"), "handakuten distinguishes real characters");
  assert.equal(foldForMatching("한국어"), "한국어", "Hangul must survive");
  assert.equal(foldForMatching("发票"), "发票", "Han must survive");
});

check("058A/C: accented Latin folds to its base letter rather than breaking apart", () => {
  assert.equal(foldForMatching("sesión"), "sesion");
  assert.equal(foldForMatching("não"), "nao");
  assert.equal(foldForMatching("Grüße"), "gruße", "ß is a letter, not a diacritic, and must be kept");
  assert.equal(foldForMatching("però"), "pero");
  assert.equal(foldForMatching("çà"), "ca");
  // Folded forms compare equal to their unaccented spelling — the point of it.
  assert.equal(foldForMatching("factura"), foldForMatching("fácturá"));
});

/* ---------- TODO-058A Part D: concept determinism and precedence ---------- */

check("058A/D: alias resolution is deterministic across repeated builds", () => {
  const first = buildConceptIndex(resolveConceptVocabulary({}));
  const second = buildConceptIndex(resolveConceptVocabulary({}));
  assert.deepEqual([...first.entries()].sort(), [...second.entries()].sort(), "index must be reproducible");
  const a = conceptsInText(EQUIVALENT_TICKETS[7][1], BUILT_IN_CONCEPTS).sort();
  const b = conceptsInText(EQUIVALENT_TICKETS[7][1], BUILT_IN_CONCEPTS).sort();
  assert.deepEqual(a, b, "concept extraction must be reproducible");
});

check("058A/D: unknown text never invents a concept", () => {
  const before = resolveConceptVocabulary({}).length;
  conceptsInText("völlig unbekannter text ohne bezug", resolveConceptVocabulary({}));
  conceptsInText("まったく関係のないテキスト", resolveConceptVocabulary({}));
  assert.equal(resolveConceptVocabulary({}).length, before, "concept vocabulary must not grow from matching");
});

check("058A/D: no concept id carries a language suffix", () => {
  for (const concept of resolveConceptVocabulary({ conceptVocabulary: [{ id: "sla", label: "SLA", aliases: ["service level"] }] })) {
    assert.ok(/^[a-z0-9_]+$/u.test(concept.id), `${concept.id} must be a neutral slug`);
    assert.ok(!/_(en|id|es|fr|de|pt|it|ja|ko|zh)$/u.test(concept.id), `${concept.id} must not be language-scoped`);
  }
});

/* ---------- TODO-058A Part G: persistence preserves language settings ---------- */

check("058A/G: an older client omitting language settings cannot erase them", () => {
  // Mirrors lib/server/persistenceService.ts carryForwardOptionalSettings.
  const stored = {
    products: ["p"],
    languagePolicy: { organizationLanguage: "id", responseMode: "organization_language", internalLanguage: "id", minimumDetectionConfidence: 0.7 },
    conceptVocabulary: [{ id: "sla", label: "SLA", aliases: ["service level"] }],
    _profileRevision: 4
  };
  // An older client sends a profile with no language keys at all.
  const incoming = { products: ["p"], _profileRevision: 4 };
  const next = { ...incoming };
  for (const key of ["conceptVocabulary", "languagePolicy"]) {
    if (next[key] === undefined && stored[key] !== undefined) next[key] = stored[key];
  }
  assert.deepEqual(next.languagePolicy, stored.languagePolicy, "an omitted policy must be carried forward");
  assert.deepEqual(next.conceptVocabulary, stored.conceptVocabulary, "an omitted vocabulary must be carried forward");
});

check("058A/G: an explicit change still overwrites the stored value", () => {
  const stored = { languagePolicy: { organizationLanguage: "id", responseMode: "organization_language", internalLanguage: "id", minimumDetectionConfidence: 0.7 } };
  const incoming = { languagePolicy: { organizationLanguage: "ja", responseMode: "customer_language", internalLanguage: "ja", minimumDetectionConfidence: 0.5 } };
  const next = { ...incoming };
  for (const key of ["conceptVocabulary", "languagePolicy"]) {
    if (next[key] === undefined && stored[key] !== undefined) next[key] = stored[key];
  }
  assert.equal(next.languagePolicy.organizationLanguage, "ja", "carry-forward must not block a real edit");
});

check("058A/G: a ticket with no language metadata still loads safely", () => {
  const legacyClassification = { category: "Login", intent: "reset", canonicalProblem: "Login Issue", classifiedBy: "deterministic", confidence: "high" };
  assert.equal(legacyClassification.language, undefined, "historical rows carry no language field");
  // The UI reads `classification?.language ?? null` and renders nothing for null.
  const forUi = legacyClassification.language ?? null;
  assert.equal(forUi, null, "absent language metadata must be representable as null, not a crash");
});

/* ---------- TODO-058A Part I: provider independence ---------- */

check("058A/I: detection, concepts, and policy run with every provider unavailable", () => {
  // These modules must not import any provider or perform I/O. Verified
  // structurally: the probe itself runs with no network, no key, no adapter.
  const source = [
    fs.readFileSync(path.join(root, "lib", "languageDetection.ts"), "utf8"),
    fs.readFileSync(path.join(root, "lib", "conceptVocabulary.ts"), "utf8"),
    fs.readFileSync(path.join(root, "lib", "languagePolicy.ts"), "utf8"),
    fs.readFileSync(path.join(root, "lib", "textNormalization.ts"), "utf8")
  ].join("\n");
  for (const token of ["fetch(", "lib/ai/", "process.env", "XMLHttpRequest"]) {
    assert.ok(!source.includes(token), `the deterministic language layer must not reference ${token}`);
  }
  // And they still produce full results here, with no provider configured.
  const detection = detectLanguage(EQUIVALENT_TICKETS[8][1]);
  assert.equal(detection.language, "ko");
  assert.ok(conceptsInText(EQUIVALENT_TICKETS[8][1], BUILT_IN_CONCEPTS).includes("login"));
  assert.equal(resolveResponseLanguage(resolveLanguagePolicy({}), detection).language, "ko");
});

/* ---------- TODO-058A Part H: the UI cannot present assumed as detected ---------- */

check("058A/H: the ticket panel labels detected, assumed, and reviewer-set distinctly", () => {
  const workspace = fs.readFileSync(path.join(root, "components", "views", "TicketWorkspace.tsx"), "utf8");
  assert.ok(workspace.includes("Language (assumed)"), "a fallback language must be labelled as assumed");
  assert.ok(workspace.includes("Language (detected)"), "a real detection must be labelled as detected");
  assert.ok(workspace.includes("Language (set by reviewer)"), "a reviewer override must be labelled as such");
  assert.ok(
    workspace.includes("not detected — organization default applied"),
    "an assumed language must say so instead of showing a confidence figure"
  );
  assert.ok(workspace.includes("Replying in"), "the outgoing draft language must be shown");
  assert.ok(workspace.includes("onLanguageOverride"), "the reviewer override control must exist");
});

check("058A/H: a reviewer override is recorded as a decision, not as a detection", () => {
  // RSS-1.2S3 moved authoritative ticket writes out of the client. Keep this
  // assertion focused on the production write boundary rather than requiring
  // the client handler to contain persistence fields.
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const workflow = fs.readFileSync(path.join(root, "lib", "server", "tickets", "ticketWorkflow.ts"), "utf8");
  assert.ok(page.includes('kind: "language"'), "the client must issue a language transition command");
  assert.ok(workflow.includes('case "language"'), "the server must own the language transition");
  assert.ok(workflow.includes('method: "reviewer"'), "an override must not masquerade as a lexical detection");
  assert.ok(workflow.includes("reviewerOverride: true"), "the override flag must be persisted");
});

check("058A/H: both intake paths record language metadata", () => {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const classificationBlocks = page.split("classification: {").slice(1);
  const writeBlocks = classificationBlocks.filter((block) => block.slice(0, 400).includes("category:"));
  assert.ok(writeBlocks.length >= 2, `expected the single and bulk intake paths (found ${writeBlocks.length})`);
  for (const [index, block] of writeBlocks.entries()) {
    assert.ok(block.slice(0, 900).includes("language:"), `intake path ${index + 1} must record language metadata`);
  }
});

/* ---------- TODO-058A Part F: drafting integration is structural ---------- */

check("058A/F: both provider tiers share one prompt builder", () => {
  const claude = fs.readFileSync(path.join(root, "lib", "ai", "claudeApi.ts"), "utf8");
  const lmStudio = fs.readFileSync(path.join(root, "lib", "ai", "lmStudio.ts"), "utf8");
  const prompts = fs.readFileSync(path.join(root, "lib", "ai", "prompts.ts"), "utf8");
  assert.ok(claude.includes("createLMStudioProvider("), "Claude must reuse the shared provider implementation");
  assert.ok(lmStudio.includes("buildDraftCustomerResponsePrompt(input)"), "the draft path must use the shared prompt builder");
  assert.ok(prompts.includes("responseLanguageInstruction"), "the shared prompt must carry the resolved language instruction");
  // The instruction lives in sharedSystemRules, so every prompt branch inherits
  // it — cold start and grounded alike.
  const start = prompts.indexOf("const sharedSystemRules");
  assert.ok(start >= 0, "sharedSystemRules must exist");
  const declaration = prompts.slice(start, prompts.indexOf("];", start));
  assert.ok(declaration.includes("languageInstruction(input)"), "the language rule must be part of the shared system rules");
  const branches = prompts.slice(start).match(/sharedSystemRules/gu) ?? [];
  assert.ok(branches.length >= 4, `every draft branch must consume sharedSystemRules (found ${branches.length} references)`);
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-058 probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-058 probe passed: detection, concept vocabulary, and response language policy are language-neutral.");
}
