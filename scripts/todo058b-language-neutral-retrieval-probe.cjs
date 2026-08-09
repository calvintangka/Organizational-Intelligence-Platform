/*
 * TODO-058B — language-neutral retrieval probe.
 *
 * Uses the REAL production functions (assessBusinessRelevanceForProfile,
 * understandForProfile, identifyCanonicalProblem, findMatchingLesson). The
 * pipeline is not reimplemented here. Offline: no database, no dev server, no AI
 * provider, no fixtures to clean up.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const { assessBusinessRelevanceForProfile, understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { extractConcepts, onlyGenericConcepts } = require(path.join(root, "lib", "conceptExtraction.ts"));
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

const LANGS = ["en", "id", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"];

function ticketOf(id, subject, description) {
  return {
    id, customerName: "Probe Customer", subject, description,
    category: "General", status: "new", createdAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Run the real deterministic path for one ticket. */
function runPipeline(subject, description) {
  const ticket = ticketOf("todo058b", subject, description);
  const relevance = assessBusinessRelevanceForProfile(`${subject} ${description}`, developerDemoProfile);
  const understanding = understandForProfile(ticket, developerDemoProfile);
  const canonical = identifyCanonicalProblem(understanding, developerDemoProfile);
  return { relevance, understanding, canonical };
}

/* Four problem families, each expressed in all ten supported languages. */
const FAMILIES = {
  login: {
    en: ["I can't log in", "I can't log in to my workspace. My password is rejected every time I try to sign in."],
    id: ["Saya tidak bisa login", "Saya tidak bisa masuk ke ruang kerja saya. Kata sandi saya ditolak setiap kali."],
    es: ["No puedo iniciar sesión", "No puedo iniciar sesión en mi espacio de trabajo. Mi contraseña es rechazada cada vez."],
    fr: ["Je ne peux pas me connecter", "Je ne peux pas me connecter à mon espace de travail. Mon mot de passe est refusé."],
    de: ["Ich kann mich nicht anmelden", "Ich kann mich nicht bei meinem Arbeitsbereich anmelden. Mein Passwort wird abgelehnt."],
    pt: ["Não consigo fazer login", "Não consigo entrar no meu espaço de trabalho. Minha senha é rejeitada sempre."],
    it: ["Non riesco ad accedere", "Non riesco ad accedere al mio spazio di lavoro. La mia password viene rifiutata."],
    ja: ["ログインできません", "ワークスペースにログインできません。サインインするたびにパスワードが拒否されます。"],
    ko: ["로그인할 수 없습니다", "워크스페이스에 로그인할 수 없습니다. 비밀번호가 계속 거부됩니다."],
    zh: ["我无法登录", "我无法登录我的工作区。每次尝试登录时，我的密码都被拒绝。"]
  },
  invoice: {
    en: ["Duplicate invoice charge", "We received a duplicate invoice and were charged twice for the same payment."],
    id: ["Faktur ganda", "Kami menerima faktur duplikat dan pembayaran kami ditagih dua kali."],
    es: ["Factura duplicada", "Recibimos una factura duplicada y nos cobraron el pago dos veces."],
    fr: ["Facture en double", "Nous avons reçu une facture en double et le paiement a été prélevé deux fois."],
    de: ["Doppelte Rechnung", "Wir haben eine doppelte Rechnung erhalten und die Zahlung wurde zweimal abgebucht."],
    pt: ["Fatura duplicada", "Recebemos uma fatura duplicada e o pagamento foi cobrado duas vezes."],
    it: ["Fattura duplicata", "Abbiamo ricevuto una fattura duplicata e il pagamento è stato addebitato due volte."],
    ja: ["請求書の重複", "重複した請求書を受け取り、同じ支払いが二重に請求されました。"],
    ko: ["청구서 중복", "중복된 청구서를 받았고 동일한 결제가 두 번 청구되었습니다."],
    zh: ["发票重复", "我们收到了重复的发票，同一笔付款被扣了两次。"]
  },
  mfa_device: {
    en: ["MFA after new phone", "I replaced my phone and the verification code from my authenticator no longer works."],
    id: ["MFA setelah ganti perangkat", "Saya mengganti perangkat dan kode verifikasi dari aplikasi autentikasi tidak berfungsi."],
    es: ["MFA tras nuevo dispositivo", "Cambié de dispositivo y el código de verificación ya no funciona."],
    fr: ["MFA après nouvel appareil", "J'ai un nouvel appareil et le code de vérification ne fonctionne plus."],
    de: ["MFA nach neuem Gerät", "Ich habe ein neues Gerät und der Bestätigungscode funktioniert nicht mehr."],
    pt: ["MFA após novo dispositivo", "Troquei de aparelho e o código de verificação não funciona mais."],
    it: ["MFA dopo nuovo dispositivo", "Ho un nuovo dispositivo e il codice di verifica non funziona più."],
    ja: ["機種変更後のMFA", "機種変更をしたため、認証コードが使えなくなりました。"],
    ko: ["기기 변경 후 MFA", "기기 변경 후 인증 번호를 더 이상 사용할 수 없습니다."],
    zh: ["更换设备后的MFA", "我更换设备后，验证码无法再使用。"]
  },
  delivery: {
    en: ["Delivery delay", "Our shipment is delayed and the package has not been delivered on the promised date."],
    id: ["Keterlambatan pengiriman", "Pengiriman kami terlambat dan paket belum sampai pada tanggal yang dijanjikan."],
    es: ["Retraso en la entrega", "Nuestro envío está retrasado y el paquete no ha llegado en la fecha prometida."],
    fr: ["Retard de livraison", "Notre colis est en retard de livraison et n'est pas arrivé à la date prévue."],
    de: ["Lieferverzögerung", "Unsere Lieferung hat eine Lieferverzögerung und das Paket kam nicht an."],
    pt: ["Atraso na entrega", "Nossa entrega está atrasada e a encomenda não chegou na data prometida."],
    it: ["Ritardo nella consegna", "La nostra consegna è in ritardo e il pacco non è arrivato nella data prevista."],
    ja: ["配達遅延", "配送が遅れており、荷物が届かない状態です。"],
    ko: ["배송 지연", "배송 지연으로 택배가 약속된 날짜에 도착하지 않았습니다."],
    zh: ["配送延迟", "我们的配送延迟了，包裹没有在承诺的日期送达。"]
  }
};

console.log("TODO-058B language-neutral retrieval probe\n");

/* ---------- Part M: cross-language convergence on real production functions ---------- */

/**
 * KNOWN GAP, asserted rather than hidden.
 *
 * Canonical SUB-selection inside a category runs off `understanding.intent`,
 * which `inferIntent` derives from English regexes. Category converges for every
 * language, but a language that cannot express those English intent phrases
 * falls through to the category's general canonical instead of the
 * invoice-specific one. Listed explicitly so the gap cannot silently widen —
 * any NEW divergence fails the probe. Closing it means concept-aware intent
 * inference, which is deliberately out of this change's scope.
 */
/* CLOSED by TODO-058C Part G: concept-driven intent refinement now routes
 * "faktur duplikat" / "請求書の重複" to the invoice-specific canonical, so every
 * family converges on one canonical id and no gap remains. */
const KNOWN_CANONICAL_GAPS = {};

for (const [family, byLanguage] of Object.entries(FAMILIES)) {
  check(`M: "${family}" reaches ONE canonical across all ten languages`, () => {
    const results = LANGS.map((lang) => {
      const [subject, description] = byLanguage[lang];
      return { lang, ...runPipeline(subject, description) };
    });
    const baseline = results.find((entry) => entry.lang === "en");
    assert.ok(baseline, "English baseline required");
    for (const entry of results) {
      assert.equal(entry.relevance.isRelevant, true, `${family}/${entry.lang}: must be business relevant`);
      assert.notEqual(entry.understanding.category, "Uncategorized", `${family}/${entry.lang}: must not be Uncategorized`);
      assert.equal(entry.understanding.category, baseline.understanding.category,
        `${family}/${entry.lang}: category ${entry.understanding.category} != English ${baseline.understanding.category}`);
      const gap = KNOWN_CANONICAL_GAPS[family];
      const allowed = gap ? [baseline.canonical.id, gap.id] : [baseline.canonical.id];
      assert.ok(allowed.includes(entry.canonical.id),
        `${family}/${entry.lang}: canonical ${entry.canonical.id} is neither the English canonical ${baseline.canonical.id} nor the recorded gap`);
      // The canonical must at minimum stay inside the shared category, so no
      // language is ever routed into a different part of memory.
      assert.equal(entry.canonical.category, baseline.canonical.category,
        `${family}/${entry.lang}: canonical category diverged`);
    }
    const canonicalIds = [...new Set(results.map((entry) => entry.canonical.id))];
    assert.ok(canonicalIds.length === 1 || Boolean(KNOWN_CANONICAL_GAPS[family]),
      `${family}: expected one canonical, got ${JSON.stringify(canonicalIds)}`);
  });
}

check("M: no canonical or category id is language-scoped", () => {
  for (const byLanguage of Object.values(FAMILIES)) {
    for (const lang of LANGS) {
      const [subject, description] = byLanguage[lang];
      const { understanding, canonical } = runPipeline(subject, description);
      for (const value of [canonical.id, canonical.title, understanding.category]) {
        assert.ok(!/[ _-](?:en|id|es|fr|de|pt|it|ja|ko|zh)$/iu.test(String(value)), `${value} must not be language-scoped`);
      }
    }
  }
});

check("M: repeated runs are deterministic", () => {
  for (const byLanguage of Object.values(FAMILIES)) {
    for (const lang of LANGS) {
      const [subject, description] = byLanguage[lang];
      const first = runPipeline(subject, description);
      const second = runPipeline(subject, description);
      assert.equal(first.canonical.id, second.canonical.id, `${lang}: canonical must be stable`);
      assert.equal(first.understanding.category, second.understanding.category, `${lang}: category must be stable`);
    }
  }
});

/* ---------- Part O: English is the compatibility baseline ---------- */

check("O: English tickets never take the concept-assist path", () => {
  for (const byLanguage of Object.values(FAMILIES)) {
    const [subject, description] = byLanguage.en;
    const { understanding } = runPipeline(subject, description);
    const conceptSignals = (understanding.detectedSignals ?? []).filter((s) => String(s).startsWith("concept:"));
    assert.equal(conceptSignals.length, 0,
      `English must be resolved lexically, but concept evidence appeared: ${JSON.stringify(conceptSignals)}`);
  }
});

check("O: concept assist is recorded only where it was actually used", () => {
  const assisted = [];
  for (const lang of LANGS) {
    const [subject, description] = FAMILIES.login[lang];
    const { understanding } = runPipeline(subject, description);
    if ((understanding.detectedSignals ?? []).some((s) => String(s).startsWith("concept:"))) assisted.push(lang);
  }
  // en/id/pt/it already worked lexically (English loanwords); the other six are
  // exactly the languages the Phase A audit measured failing.
  assert.deepEqual(assisted, ["es", "fr", "de", "ja", "ko", "zh"], `unexpected concept-assist set: ${JSON.stringify(assisted)}`);
});

/* ---------- Part N: negative and ambiguous cases must fail closed ---------- */

check("N: non-problem input never becomes relevant or categorized", () => {
  const negatives = [
    ["punctuation", "!!!", "??? ... ---"],
    ["numbers", "12345", "67890 000"],
    ["email address", "contact", "user@example.com"],
    ["ticket id", "ref", "OIP-20260728-5001"],
    ["product name only", "OIP", "FastDrop Maesa"]
  ];
  for (const [label, subject, description] of negatives) {
    const { understanding } = runPipeline(subject, description);
    assert.ok(
      understanding.category === "Uncategorized" || understanding.category === "General",
      `${label}: must not be categorized, got ${understanding.category}`
    );
  }
});

check("N: identifiers contribute no CONCEPT evidence", () => {
  // The concept layer must not read a problem out of an identifier. Note the
  // English lexical layer separately classifies "https://example.com/login" as
  // Login on a clean tree — that is PRE-EXISTING behavior, unchanged here and
  // recorded as a finding rather than silently altered (Part O).
  for (const identifier of ["https://example.com/login", "user@example.com", "OIP-20260728-5001", "www.example.com/invoice"]) {
    const extraction = extractConcepts(identifier, developerDemoProfile);
    assert.equal(extraction.empty, true, `${identifier} must yield no concepts, got ${JSON.stringify(extraction.conceptIds)}`);
  }
});

check("N: email entities and malformed identifiers remain non-semantic", () => {
  for (const identifier of [
    "one@example.com two@example.org",
    "one@@example..com",
    "one @ example . com",
    "  user@example.com  ",
    "用户@example.com"
  ]) {
    const extraction = extractConcepts(identifier, developerDemoProfile);
    assert.equal(extraction.empty, true, `${identifier} must yield no concepts`);
    const { understanding } = runPipeline("contact", identifier);
    assert.ok(
      understanding.category === "Uncategorized" || understanding.category === "General",
      `${identifier}: identifier-only input must fail closed, got ${understanding.category}`
    );
  }
});

check("M: mixed-language invoice evidence converges without leaking quoted history", () => {
  const mixed = runPipeline(
    "Duplicate invoice / factura duplicada",
    "We were charged twice for invoice INV-1001 and factura INV-1002."
  );
  assert.equal(mixed.understanding.category, "Billing");
  assert.equal(mixed.canonical.id, "canonical-duplicate-invoice");

  const quotedResolved = runPipeline(
    "Invoice question",
    'The old case said "duplicate invoice" but it was resolved last month. Please explain the current invoice total.'
  );
  assert.equal(quotedResolved.understanding.category, "Billing");
  assert.notEqual(quotedResolved.canonical.id, "canonical-duplicate-invoice");
  assert.ok(quotedResolved.understanding.intentIsolation.ignoredTopics.includes("billing"));
});

check("M: multiple and whitespace-separated invoice evidence stays deterministic", () => {
  const cases = [
    ["Invoice review", "Invoices INV-1 and INV-2 appear twice in the same billing period."],
    ["Invoice issue", "Duplicate   invoice\\nwas charged twice."]
  ];
  for (const [subject, description] of cases) {
    const first = runPipeline(subject, description);
    const second = runPipeline(subject, description);
    assert.equal(first.understanding.category, "Billing");
    assert.equal(first.canonical.category, "Billing");
    assert.equal(first.canonical.id, second.canonical.id);
    assert.equal(first.understanding.intent, second.understanding.intent);
  }
});

check("N: generic concepts alone never establish relevance or a category", () => {
  const generics = [
    ["account only", "akun", "akun"],
    ["report only", "laporan", "laporan"],
    ["system word", "sistem", "sistem"]
  ];
  for (const [label, subject, description] of generics) {
    const extraction = extractConcepts(`${subject} ${description}`, developerDemoProfile);
    if (!extraction.empty) {
      assert.ok(onlyGenericConcepts(extraction), `${label}: expected only generic concepts`);
    }
    const { understanding } = runPipeline(subject, description);
    assert.ok(
      understanding.category === "Uncategorized" || understanding.category === "General",
      `${label}: a generic concept must not select a category, got ${understanding.category}`
    );
  }
});

check("N: a single weak alias does not authorize a category", () => {
  const { understanding } = runPipeline("info", "sandi");
  assert.ok(
    understanding.category === "Uncategorized" || understanding.category === "General",
    `one bare alias must not categorize, got ${understanding.category}`
  );
});

check("N: unsupported-language text fails closed rather than guessing", () => {
  // Swahili is not a supported language and shares no concept aliases.
  const { understanding } = runPipeline("Habari", "Sina uhakika wa jambo hili kabisa.");
  assert.ok(
    understanding.category === "Uncategorized" || understanding.category === "General",
    `unsupported language must fail closed, got ${understanding.category}`
  );
});

/* ---------- Part B: extraction contract ---------- */

check("B: extraction never mutates ticket text and never invents concepts", () => {
  const original = "ログインできません。パスワードが拒否されます。";
  const copy = String(original);
  const extraction = extractConcepts(original, developerDemoProfile);
  assert.equal(original, copy, "source text must not be mutated");
  assert.ok(extraction.conceptIds.includes("login"), "expected the login concept");
  assert.deepEqual(extraction.conceptIds, [...extraction.conceptIds].sort(), "concept ids must be sorted for stable comparison");
  const unknown = extractConcepts("völlig unbekannter text ohne bezug", developerDemoProfile);
  assert.equal(unknown.empty, true, "unknown text must produce no concepts");
});

check("B: repeated aliases do not inflate evidence", () => {
  const once = extractConcepts("invoice", developerDemoProfile);
  const many = extractConcepts("invoice invoice invoice invoice", developerDemoProfile);
  const evidenceOnce = once.matches.find((m) => m.conceptId === "invoice").evidence;
  const evidenceMany = many.matches.find((m) => m.conceptId === "invoice").evidence;
  assert.equal(evidenceOnce, evidenceMany, "repetition must not increase evidence");
});

check("B: organization aliases are attributed to the organization", () => {
  const withOwn = extractConcepts("we hit the tingkat layanan limit", {
    conceptVocabulary: [{ id: "sla", label: "SLA", aliases: ["tingkat layanan"] }]
  });
  const match = withOwn.matches.find((m) => m.conceptId === "sla");
  assert.ok(match, "organization concept must be extracted");
  assert.equal(match.source, "organization", "source must be attributed to the organization");
  assert.deepEqual(withOwn.organizationConceptIds, ["sla"]);
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-058B probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-058B probe passed: deterministic retrieval is language-neutral and English behavior is preserved.");
}
