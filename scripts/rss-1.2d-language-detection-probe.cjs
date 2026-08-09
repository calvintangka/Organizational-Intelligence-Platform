/*
 * RSS-1.2D — language runtime verification.
 *
 * This release probe is deliberately offline and read-only. It exercises the
 * production detector and response-policy modules with Unicode fixtures, then
 * checks their replay stability. Retrieval/persistence are covered separately
 * by the established TODO-058B and TODO-058E probes because they use the real
 * canonical and database paths respectively.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { CONFIDENT_DETECTION, detectLanguage } = require(path.join(root, "lib", "languageDetection.ts"));
const { resolveLanguagePolicy, resolveResponseLanguage } = require(path.join(root, "lib", "languagePolicy.ts"));

const failures = [];
const timings = [];

function check(label, fn) {
  try {
    const started = performance.now();
    fn();
    timings.push(performance.now() - started);
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL  ${label} -- ${error.message}`);
  }
}

const LOGIN_TICKETS = [
  ["en", "I cannot log in to my workspace because my password is rejected."],
  ["id", "Saya tidak bisa masuk ke ruang kerja karena kata sandi saya ditolak."],
  ["es", "No puedo iniciar sesión porque mi contraseña es rechazada."],
  ["fr", "Je ne peux pas me connecter car mon mot de passe est refusé."],
  ["de", "Ich kann mich nicht anmelden, weil mein Passwort abgelehnt wird."],
  ["pt", "Não consigo entrar porque minha senha é rejeitada."],
  ["it", "Non riesco ad accedere perché la mia password viene rifiutata."],
  ["ja", "パスワードが拒否されるため、ワークスペースにログインできません。"],
  ["zh", "由于密码被拒绝，我无法登录工作区。"],
  ["ko", "비밀번호가 거부되어 워크스페이스에 로그인할 수 없습니다."]
];

console.log("RSS-1.2D language detection verification\n");

check("A: all ten supported full tickets detect correctly with usable confidence", () => {
  for (const [expected, input] of LOGIN_TICKETS) {
    const detection = detectLanguage(input);
    assert.equal(detection.language, expected, `${expected}: got ${detection.language}`);
    assert.ok(detection.confidence >= CONFIDENT_DETECTION, `${expected}: confidence ${detection.confidence}`);
    assert.equal(detection.fallbackApplied, false, `${expected}: fallback is not a detection`);
  }
});

check("A/F/K: Unicode, emoji, abbreviations, OCR-like noise, and identifiers fail safely", () => {
  const safeFallbacks = [
    "😀 🚚 ✨",
    "OIP-2026-1234 INV-88001 +62-812-555-0101 2026-08-07T12:00:00Z",
    "https://support.example.com/login user@example.com",
    "S5O 0AUTH JVVV l0gin",
    "░▒▓ ███ 01010101"
  ];
  for (const input of safeFallbacks) {
    const detection = detectLanguage(input);
    assert.ok(detection.confidence < CONFIDENT_DETECTION, `${input}: confidence ${detection.confidence}`);
    assert.notEqual(resolveResponseLanguage(resolveLanguagePolicy({}), detection).reason, "customer_language");
  }
  const japanese = detectLanguage("📦 注文番号 ORD-1001 の配送について確認したいです。");
  assert.equal(japanese.language, "ja");
  const chinese = detectLanguage("订单号 ORD-1001 的配送仍然延迟。😀");
  assert.equal(chinese.language, "zh");
});

check("B/D/E/G: response policy is deterministic for mixed, code-switched, and quoted input", () => {
  const policy = resolveLanguagePolicy({});
  const cases = [
    "Halo, I cannot log in karena kata sandi saya ditolak.",
    "No puedo iniciar sesión, but I still cannot access my account.",
    "Current request: Saya tidak bisa masuk dan kata sandi saya ditolak.\n\nOn Tue, support wrote: We fixed your old login problem.",
    "Current request: I cannot log in; my password is rejected.\n\nRiwayat lama: Saya tidak bisa masuk."
  ];
  for (const input of cases) {
    const first = { detection: detectLanguage(input), response: resolveResponseLanguage(policy, detectLanguage(input)) };
    const second = { detection: detectLanguage(input), response: resolveResponseLanguage(policy, detectLanguage(input)) };
    assert.deepEqual(second, first, `non-deterministic result for ${input}`);
    assert.ok(["customer_language", "low_confidence_fallback"].includes(first.response.reason));
  }
});

check("B: each confident single-language ticket receives that customer language", () => {
  const policy = resolveLanguagePolicy({});
  for (const [expected, input] of LOGIN_TICKETS) {
    const response = resolveResponseLanguage(policy, detectLanguage(input));
    assert.equal(response.language, expected, `${expected}: response ${response.language}`);
    assert.equal(response.reason, "customer_language");
  }
});

check("I: detection/policy diagnostics always expose language, confidence, and reason", () => {
  for (const [, input] of LOGIN_TICKETS) {
    const detection = detectLanguage(input);
    const response = resolveResponseLanguage(resolveLanguagePolicy({}), detection);
    assert.ok(typeof detection.language === "string" && detection.language.length === 2);
    assert.ok(Number.isFinite(detection.confidence) && detection.confidence >= 0 && detection.confidence <= 1);
    assert.ok(["script", "lexical", "fallback"].includes(detection.method));
    assert.ok(typeof response.explanation === "string" && response.explanation.length > 0);
  }
});

check("L: 100 replays retain identical detection and response decisions", () => {
  const policy = resolveLanguagePolicy({});
  for (const [, input] of LOGIN_TICKETS) {
    const expected = JSON.stringify({ detection: detectLanguage(input), response: resolveResponseLanguage(policy, detectLanguage(input)) });
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const actual = JSON.stringify({ detection: detectLanguage(input), response: resolveResponseLanguage(policy, detectLanguage(input)) });
      assert.equal(actual, expected, `replay ${iteration + 1} diverged`);
    }
  }
});

check("H/IX: long multilingual documents and romanized input fail or resolve safely", () => {
  const longIndonesian = [
    "Permintaan saat ini: Saya tidak bisa masuk karena kata sandi ditolak.",
    "Log: OIP-2026-1 ERROR login; user@example.com; https://example.com/login.",
    "Riwayat lama: I cannot log in; the old issue was resolved.",
    "Catatan lampiran dan forwarded email: invoice INV-1 sudah selesai."
  ].join("\\n");
  const longEnglish = [
    "Current request: I cannot log in because my password is rejected.",
    "Log: OIP-2026-1 ERROR login; user@example.com; https://example.com/login.",
    "Quoted history: Saya tidak bisa masuk; masalah lama sudah selesai.",
    "Attachment and forwarded email: the old invoice issue is resolved."
  ].join("\\n");
  const idResult = detectLanguage(longIndonesian);
  const enResult = detectLanguage(longEnglish);
  assert.equal(idResult.language, "id");
  assert.equal(enResult.language, "en");
  assert.equal(detectLanguage("saya tidak bisa masuk karena kata sandi ditolak").language, "id");
  const japaneseRomaji = detectLanguage("watashi wa roguin dekimasen pasuwaado ga kyohi saremasu");
  assert.ok(japaneseRomaji.confidence < CONFIDENT_DETECTION, "Japanese romaji must not be falsely claimed as confident Japanese");
  assert.equal(resolveResponseLanguage(resolveLanguagePolicy({}), japaneseRomaji).reason, "low_confidence_fallback");
});

const total = timings.reduce((sum, value) => sum + value, 0);
console.log(`\n  local detector checks: ${timings.length}, total ${total.toFixed(2)}ms, max ${Math.max(...timings).toFixed(2)}ms`);
if (failures.length > 0) {
  console.error(`RSS-1.2D probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("RSS-1.2D probe passed: language detection and response decisions are stable.");
}
