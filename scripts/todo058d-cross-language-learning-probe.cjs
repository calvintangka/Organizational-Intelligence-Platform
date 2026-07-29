/*
 * TODO-058D — uniform cross-language lesson reuse.
 *
 * Uses the real production lesson matcher. Offline: no database, no dev server,
 * no AI provider. Production scoring is NOT reimplemented here.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const { findMatchingLesson } = require(path.join(root, "lib", "drafting.ts"));
const { extractConcepts } = require(path.join(root, "lib", "conceptExtraction.ts"));

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

function ticketOf(subject, description) {
  return { id: "t", customerName: "C", subject, description, category: "General", status: "new", createdAt: "2026-01-01T00:00:00.000Z" };
}

/** One lesson, authored in the internal documentation language (English). */
function itemWith(category, lessonId, signals) {
  return {
    id: "ki-fixture",
    category,
    lessons: [{
      id: lessonId,
      signals,
      rootCause: "Documented organizational root cause.",
      solution: "Documented organizational solution.",
      customerResponse: "Documented organizational customer response."
    }]
  };
}

/* Lesson families, each with equivalent tickets in all ten languages. */
const FAMILIES = [
  {
    name: "password reset",
    item: itemWith("Login", "les-password-reset", ["password reset", "login failure"]),
    tickets: {
      en: ["I cannot log in", "My password is rejected when I try to sign in."],
      id: ["Tidak bisa masuk", "Kata sandi saya ditolak setiap kali saya mencoba masuk ke akun."],
      es: ["No puedo iniciar sesión", "Mi contraseña es rechazada cada vez que intento iniciar sesión."],
      fr: ["Connexion impossible", "Mon mot de passe est refusé à chaque tentative de connexion."],
      de: ["Anmeldung fehlgeschlagen", "Mein Passwort wird jedes Mal abgelehnt, wenn ich mich anmelden will."],
      pt: ["Não consigo entrar", "Minha senha é rejeitada sempre que tento fazer login."],
      it: ["Non riesco ad accedere", "La mia password viene rifiutata ogni volta che provo ad accedere."],
      ja: ["ログインできません", "パスワードが拒否されてログインできません。"],
      ko: ["로그인 불가", "비밀번호가 거부되어 로그인할 수 없습니다."],
      zh: ["无法登录", "我的密码被拒绝，无法登录。"]
    }
  },
  {
    name: "duplicate invoice",
    item: itemWith("Billing", "les-duplicate-invoice", ["duplicate invoice", "invoice payment"]),
    tickets: {
      en: ["Duplicate invoice", "We received a duplicate invoice and the payment was charged twice."],
      id: ["Faktur ganda", "Kami menerima faktur duplikat dan pembayaran ditagih dua kali."],
      es: ["Factura duplicada", "Recibimos una factura duplicada y el pago se cobró dos veces."],
      fr: ["Facture en double", "Nous avons reçu une facture en double et le paiement a été prélevé deux fois."],
      de: ["Doppelte Rechnung", "Wir haben eine doppelte Rechnung erhalten und die Zahlung wurde zweimal abgebucht."],
      pt: ["Fatura duplicada", "Recebemos uma fatura duplicada e o pagamento foi cobrado duas vezes."],
      it: ["Fattura duplicata", "Abbiamo ricevuto una fattura duplicata e il pagamento è stato addebitato due volte."],
      ja: ["請求書の重複", "重複した請求書を受け取り、支払いが二重に請求されました。"],
      ko: ["청구서 중복", "중복된 청구서를 받았고 결제가 두 번 청구되었습니다."],
      zh: ["发票重复", "我们收到了重复的发票，付款被扣了两次。"]
    }
  },
  {
    name: "delivery delay",
    item: itemWith("Delivery Delay", "les-delivery-delay", ["delivery delay", "package not delivered"]),
    tickets: {
      en: ["Delivery delay", "Our shipment is delayed and the package has not been delivered."],
      id: ["Keterlambatan pengiriman", "Pengiriman kami terlambat dan paket belum sampai."],
      es: ["Retraso en la entrega", "Nuestro envío está retrasado y el paquete no ha llegado."],
      fr: ["Retard de livraison", "Notre colis est en retard de livraison et n'est pas arrivé."],
      de: ["Lieferverzögerung", "Unsere Lieferung hat eine Lieferverzögerung und das Paket kam nicht an."],
      pt: ["Atraso na entrega", "Nossa entrega está atrasada e a encomenda não chegou."],
      it: ["Ritardo nella consegna", "La nostra consegna è in ritardo e il pacco non è arrivato."],
      ja: ["配達遅延", "配送が遅れており、荷物が届かない状態です。"],
      ko: ["배송 지연", "배송 지연으로 택배가 도착하지 않았습니다."],
      zh: ["配送延迟", "我们的配送延迟了，包裹没有送达。"]
    }
  }
];

const NON_ENGLISH = ["id", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"];

console.log("TODO-058D cross-language lesson reuse probe\n");

/* ---------- Part D: uniform cross-language lesson selection ---------- */

for (const family of FAMILIES) {
  check(`D: "${family.name}" selects ONE lesson for every non-English language`, () => {
    for (const lang of NON_ENGLISH) {
      const [subject, description] = family.tickets[lang];
      const result = findMatchingLesson(ticketOf(subject, description), family.item);
      assert.ok(result, `${family.name}/${lang}: no lesson matched`);
      assert.equal(result.lesson.id, family.item.lessons[0].id, `${family.name}/${lang}: wrong lesson`);
      assert.ok(!/[_-](?:en|id|es|fr|de|pt|it|ja|ko|zh)$/iu.test(result.lesson.id), "lesson id must not be language-scoped");
    }
  });
}

check("D: accented Latin and Indonesian now use concept evidence, not just CJK", () => {
  // The pre-TODO-058D gate was `ticketTokens.size === 0`, so only CJK qualified.
  const family = FAMILIES[0];
  for (const lang of ["id", "es", "fr", "de", "pt", "it"]) {
    const [subject, description] = family.tickets[lang];
    const result = findMatchingLesson(ticketOf(subject, description), family.item);
    assert.ok(result, `${lang}: expected a match`);
    assert.ok(Array.isArray(result.matchedConceptIds) && result.matchedConceptIds.length > 0,
      `${lang}: expected concept evidence, got ${JSON.stringify(result.matchedConceptIds)}`);
  }
});

check("D: concept evidence stays separate from lexical evidence", () => {
  const family = FAMILIES[0];
  const [subject, description] = family.tickets.ja;
  const result = findMatchingLesson(ticketOf(subject, description), family.item);
  assert.ok(result.matchedConceptIds.length > 0, "concept ids must be reported");
  assert.ok(Array.isArray(result.matchedSignals) && result.matchedSignals.length > 0, "matched signals must still be reported");
});

check("D: repeated runs are deterministic", () => {
  for (const family of FAMILIES) {
    for (const lang of NON_ENGLISH) {
      const [subject, description] = family.tickets[lang];
      const a = findMatchingLesson(ticketOf(subject, description), family.item);
      const b = findMatchingLesson(ticketOf(subject, description), family.item);
      assert.equal(a?.lesson.id, b?.lesson.id, `${family.name}/${lang}: unstable selection`);
    }
  }
});

/* ---------- Part C: English is never eligible for the concept path ---------- */

check("C: an English ticket never receives concept evidence", () => {
  for (const family of FAMILIES) {
    const [subject, description] = family.tickets.en;
    const result = findMatchingLesson(ticketOf(subject, description), family.item);
    if (result) {
      assert.ok(!result.matchedConceptIds, `${family.name}/en: English must stay on the lexical path`);
    }
  }
});

check("C: the internal documentation language is configurable, not hardcoded", () => {
  const family = FAMILIES[0];
  const [subject, description] = family.tickets.id;
  // With Indonesian as the internal language, an Indonesian ticket is no longer
  // a cross-language case and must fall back to the lexical path.
  const asForeign = findMatchingLesson(ticketOf(subject, description), family.item);
  const asInternal = findMatchingLesson(ticketOf(subject, description), family.item, { internalLanguage: "id" });
  assert.ok(asForeign?.matchedConceptIds, "with English lessons the Indonesian ticket uses concepts");
  assert.ok(!asInternal?.matchedConceptIds, "with Indonesian lessons it must not be treated as cross-language");
});

/* ---------- Part E: authorization safety ---------- */

check("E: generic concepts alone never authorize a lesson", () => {
  const item = itemWith("Login", "les-generic", ["account", "system"]);
  for (const [lang, subject, description] of [
    ["id", "Akun", "Akun saya."],
    ["es", "Cuenta", "Mi cuenta."],
    ["ja", "アカウント", "アカウントについて。"]
  ]) {
    const result = findMatchingLesson(ticketOf(subject, description), item);
    assert.equal(result, null, `${lang}: a generic concept must not authorize a lesson`);
  }
});

check("E: identifiers never authorize a lesson", () => {
  const family = FAMILIES[0];
  for (const identifier of ["https://example.com/login", "user@example.com", "OIP-20260728-5001"]) {
    const extraction = extractConcepts(identifier, {});
    assert.equal(extraction.empty, true, `${identifier} must yield no concepts`);
    const result = findMatchingLesson(ticketOf("ref", identifier), family.item);
    assert.equal(result, null, `${identifier} must not authorize a lesson`);
  }
});

check("E: a different-domain concept does not authorize an unrelated lesson", () => {
  // A delivery ticket must not reach a login lesson in any language.
  const loginItem = FAMILIES[0].item;
  for (const lang of ["es", "ja", "id"]) {
    const [subject, description] = FAMILIES[2].tickets[lang];
    const result = findMatchingLesson(ticketOf(subject, description), loginItem);
    assert.equal(result, null, `${lang}: a delivery ticket must not match the login lesson`);
  }
});

check("E: a single weak alias does not authorize a lesson", () => {
  const family = FAMILIES[0];
  for (const [lang, word] of [["id", "sandi"], ["es", "contraseña"]]) {
    const result = findMatchingLesson(ticketOf("info", word), family.item);
    assert.equal(result, null, `${lang}: one bare alias must not authorize a lesson`);
  }
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-058D probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-058D probe passed: cross-language lesson reuse is uniform and safe.");
}
