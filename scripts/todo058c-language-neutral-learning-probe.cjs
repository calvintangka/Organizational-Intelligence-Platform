/*
 * TODO-058C — language-neutral organizational learning probe.
 *
 * Uses the real production reflection and retrieval functions. Offline: no
 * database, no dev server, no AI provider, no fixtures.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const { generateReflection } = require(path.join(root, "lib", "reflection.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
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

const UND = { category: "Login", tags: [], detectedSignals: [], intent: "login_failure" };
const ITEM = {
  id: "demo-ki-sso-certificate-redirect-loop",
  title: "SSO Redirect Loop",
  canonicalProblemTitle: "SSO Redirect Loop After Certificate Rotation",
  customerResponseTemplate: "We reset the certificate binding and cleared the cached assertion so sign-in works again.",
  approvedAnswer: ""
};
const MATCH = { item: ITEM, similarity: 92 };

/** The same resolution, rendered in each language per organization policy. */
const RESOLUTIONS = {
  en: "We reset the certificate binding and cleared the cached assertion so sign-in works again.",
  id: "Kami mengatur ulang pengikatan sertifikat dan menghapus asersi yang di-cache sehingga login berfungsi kembali.",
  es: "Restablecimos el enlace del certificado y borramos la aserción en caché para que el inicio de sesión funcione.",
  fr: "Nous avons réinitialisé la liaison du certificat et vidé l'assertion en cache pour rétablir la connexion.",
  de: "Wir haben die Zertifikatsbindung zurückgesetzt und die zwischengespeicherte Assertion gelöscht.",
  pt: "Redefinimos a vinculação do certificado e limpamos a asserção em cache para o login voltar a funcionar.",
  it: "Abbiamo reimpostato l'associazione del certificato e cancellato l'asserzione memorizzata nella cache.",
  ja: "証明書のバインディングをリセットし、キャッシュされたアサーションを消去したため、サインインが再び機能します。",
  ko: "인증서 바인딩을 재설정하고 캐시된 어설션을 지워 로그인이 다시 작동합니다.",
  zh: "我们重置了证书绑定并清除了缓存的断言，因此登录恢复正常。"
};
const LANGS = Object.keys(RESOLUTIONS);

console.log("TODO-058C language-neutral learning probe\n");

/* ---------- Part B/E/F: one memory, one outcome, regardless of language ---------- */

check("B/E: every language produces the SAME reflection outcome as English", () => {
  const baseline = generateReflection(UND, RESOLUTIONS.en, MATCH, undefined, {
    responseLanguage: "en", internalLanguage: "en"
  });
  assert.equal(baseline.action, "trust_update_only", "English baseline must reinforce, not version");
  for (const lang of LANGS) {
    const decision = generateReflection(UND, RESOLUTIONS[lang], MATCH, undefined, {
      responseLanguage: lang, internalLanguage: "en"
    });
    assert.equal(decision.action, baseline.action, `${lang}: action ${decision.action} != English ${baseline.action}`);
    assert.equal(decision.existingItemId, ITEM.id, `${lang}: must target the same KnowledgeItem`);
    assert.equal(decision.isLearningEvent, baseline.isLearningEvent, `${lang}: learning-event flag must match`);
  }
});

check("F: trust is identical across languages and never penalized for translating", () => {
  const baseline = generateReflection(UND, RESOLUTIONS.en, MATCH, undefined, {
    responseLanguage: "en", internalLanguage: "en"
  });
  for (const lang of LANGS) {
    const decision = generateReflection(UND, RESOLUTIONS[lang], MATCH, undefined, {
      responseLanguage: lang, internalLanguage: "en"
    });
    assert.equal(decision.estimatedTrustDelta, baseline.estimatedTrustDelta,
      `${lang}: trust delta ${decision.estimatedTrustDelta} != English ${baseline.estimatedTrustDelta}`);
    assert.equal(decision.trustImpact, baseline.trustImpact, `${lang}: trust impact must match`);
    assert.notEqual(decision.trustImpact, "reset_partial", `${lang}: replying in policy language must not reset trust`);
  }
});

check("C/D: language alone never creates a new version or a duplicate lesson", () => {
  for (const lang of LANGS.filter((l) => l !== "en")) {
    const decision = generateReflection(UND, RESOLUTIONS[lang], MATCH, undefined, {
      responseLanguage: lang, internalLanguage: "en"
    });
    assert.notEqual(decision.action, "create_version", `${lang}: a translated reply must not create a version`);
    assert.notEqual(decision.action, "create_new", `${lang}: a translated reply must not create new knowledge`);
  }
});

check("B: the regression this fixes is real — the unguarded path punished translation", () => {
  // Without language context the old proxy still reads 0% overlap and versions.
  const unguarded = generateReflection(UND, RESOLUTIONS.ja, MATCH);
  assert.equal(unguarded.action, "create_version", "the unguarded proxy should still version (documents the defect)");
  assert.equal(unguarded.trustImpact, "reset_partial", "the unguarded proxy should still reset trust");
  const guarded = generateReflection(UND, RESOLUTIONS.ja, MATCH, undefined, {
    responseLanguage: "ja", internalLanguage: "en"
  });
  assert.equal(guarded.action, "trust_update_only", "with language context it must reinforce instead");
  assert.equal(guarded.estimatedTrustDelta, 5, "and gain trust rather than lose it");
});

/* ---------- Part O-equivalent: English is untouched ---------- */

check("English same-language behavior is byte-identical with and without context", () => {
  const without = generateReflection(UND, RESOLUTIONS.en, MATCH);
  const withSame = generateReflection(UND, RESOLUTIONS.en, MATCH, undefined, {
    responseLanguage: "en", internalLanguage: "en"
  });
  assert.deepEqual(withSame, without, "same-language context must not alter the decision");
});

check("a genuinely rewritten same-language answer still creates a version", () => {
  const rewritten = "Please raise a new certificate signing request with the identity provider and re-upload the metadata before retrying.";
  const decision = generateReflection(UND, rewritten, MATCH, undefined, {
    responseLanguage: "en", internalLanguage: "en"
  });
  assert.equal(decision.action, "create_version", "real divergence must still be captured as a version");
});

/* ---------- Part G: canonical refinement across languages ---------- */

check("G: duplicate-invoice reaches the invoice canonical in every language", () => {
  const invoice = {
    en: ["Duplicate invoice charge", "We received a duplicate invoice and were charged twice for the same payment."],
    id: ["Faktur ganda", "Kami menerima faktur duplikat dan pembayaran kami ditagih dua kali."],
    es: ["Factura duplicada", "Recibimos una factura duplicada y nos cobraron el pago dos veces."],
    fr: ["Facture en double", "Nous avons reçu une facture en double et le paiement a été prélevé deux fois."],
    de: ["Doppelte Rechnung", "Wir haben eine doppelte Rechnung erhalten und die Zahlung wurde zweimal abgebucht."],
    ja: ["請求書の重複", "重複した請求書を受け取り、同じ支払いが二重に請求されました。"],
    ko: ["청구서 중복", "중복된 청구서를 받았고 동일한 결제가 두 번 청구되었습니다."],
    zh: ["发票重复", "我们收到了重复的发票，同一笔付款被扣了两次。"]
  };
  const ids = new Set();
  for (const [lang, [subject, description]] of Object.entries(invoice)) {
    const ticket = { id: `inv-${lang}`, customerName: "C", subject, description, category: "General", status: "new", createdAt: "2026-01-01T00:00:00.000Z" };
    const canonical = identifyCanonicalProblem(understandForProfile(ticket, developerDemoProfile), developerDemoProfile);
    ids.add(canonical.id);
  }
  assert.deepEqual([...ids], ["canonical-billing-invoice-issue"], `expected one invoice canonical, got ${JSON.stringify([...ids])}`);
});

/* ---------- Part L: precision must not be lost ---------- */

check("L: different problems stay different, they are not merged by language neutrality", () => {
  const distinct = [
    ["password", "I cannot sign in", "My password is rejected when I try to log in."],
    ["permission", "Access denied", "My role lacks permission to open the shared project workspace."],
    ["delivery", "Late package", "Our shipment is delayed and the package has not been delivered."],
    ["invoice", "Duplicate invoice", "We received a duplicate invoice and were charged twice."]
  ];
  const byLabel = new Map();
  for (const [label, subject, description] of distinct) {
    const ticket = { id: label, customerName: "C", subject, description, category: "General", status: "new", createdAt: "2026-01-01T00:00:00.000Z" };
    const understanding = understandForProfile(ticket, developerDemoProfile);
    byLabel.set(label, identifyCanonicalProblem(understanding, developerDemoProfile).id);
  }
  const ids = [...byLabel.values()];
  assert.equal(new Set(ids).size, ids.length, `distinct problems must keep distinct canonicals: ${JSON.stringify([...byLabel])}`);
});

check("L: a low-similarity cross-language match adds evidence but never silently reinforces", () => {
  const weak = generateReflection(UND, RESOLUTIONS.ja, { item: ITEM, similarity: 55 }, undefined, {
    responseLanguage: "ja", internalLanguage: "en"
  });
  assert.equal(weak.action, "merge_existing", "weak similarity must add supporting evidence, not confirm");
  assert.equal(weak.isLearningEvent, true, "it must still be recorded as a learning event");
});

/* ---------- Part I: explainability ---------- */

check("I: the reflection rationale explains the language reasoning to a reviewer", () => {
  const decision = generateReflection(UND, RESOLUTIONS.ja, MATCH, undefined, {
    responseLanguage: "ja", internalLanguage: "en"
  });
  assert.ok(decision.rationale.includes("ja"), "the rationale must name the reply language");
  assert.ok(decision.rationale.includes("en"), "the rationale must name the documentation language");
  assert.ok(/language alone never creates/i.test(decision.rationale), "it must state that language alone creates nothing");
  assert.ok(decision.rationale.includes("92%"), "it must still show the similarity evidence");
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-058C probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-058C probe passed: organizational learning is language-neutral.");
}
