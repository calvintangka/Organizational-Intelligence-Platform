/* RSS-1.2D-FINAL: 1,000 complete deterministic multilingual pipeline replays. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { assessBusinessRelevanceForProfile, understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { findMatchingLesson } = require(path.join(root, "lib", "drafting.ts"));
const { detectLanguage } = require(path.join(root, "lib", "languageDetection.ts"));
const { resolveLanguagePolicy, resolveResponseLanguage } = require(path.join(root, "lib", "languagePolicy.ts"));
const { developerDemoProfile } = require(path.join(root, "data", "developerDemoFoundation.ts"));

const tickets = [
  ["en", "I cannot log in to my workspace. My password is rejected every time I try to sign in."],
  ["id", "Saya tidak bisa masuk ke ruang kerja. Kata sandi saya ditolak setiap kali saya mencoba login."],
  ["es", "No puedo iniciar sesión en mi espacio de trabajo. Mi contraseña es rechazada cada vez."],
  ["fr", "Je ne peux pas me connecter à mon espace de travail. Mon mot de passe est refusé à chaque tentative."],
  ["de", "Ich kann mich nicht bei meinem Arbeitsbereich anmelden. Mein Passwort wird jedes Mal abgelehnt."],
  ["pt", "Não consigo entrar no meu espaço de trabalho. Minha senha é rejeitada sempre que tento fazer login."],
  ["it", "Non riesco ad accedere al mio spazio di lavoro. La mia password viene rifiutata ogni volta."],
  ["ja", "ワークスペースにログインできません。パスワードが毎回拒否されます。"],
  ["zh", "我无法登录我的工作区。每次尝试登录时，密码都被拒绝。"],
  ["ko", "워크스페이스에 로그인할 수 없습니다. 비밀번호가 매번 거부됩니다."]
];

const knowledge = {
  id: "rss12d-final-login-knowledge",
  organizationId: developerDemoProfile.id,
  title: "Password rejected at sign-in",
  category: "Login",
  canonicalProblemId: "rss12d-final-login-canonical",
  canonicalProblemTitle: "Login Issue",
  problem: "Password rejected at sign-in",
  problemSummary: "Password rejected at sign-in",
  approvedAnswer: "Reset the password and clear cached credentials.",
  customerResponseTemplate: "We reset your password and cleared cached credentials.",
  internalGuidance: "Reset the password and clear cached credentials.",
  tags: ["login", "password"],
  trustScore: 80,
  createdAt: "2026-08-07T00:00:00.000Z",
  approvedAt: "2026-08-07T00:00:00.000Z",
  lessons: [{
    id: "rss12d-final-login-lesson",
    rootCause: "Cached credentials survived a password rotation.",
    solution: "Reset the password and clear cached credentials.",
    customerResponse: "We reset your password and cleared cached credentials.",
    signals: ["password rejected", "cannot log in", "sign in"],
    createdAt: "2026-08-07T00:00:00.000Z"
  }]
};

function run(language, text, index) {
  const ticket = { id: `rss12d-final-${index}`, customerName: "Probe Customer", subject: text.split(".")[0], description: text, category: "General", status: "new", createdAt: "2026-08-07T00:00:00.000Z" };
  const detection = detectLanguage(text);
  const policy = resolveLanguagePolicy({});
  const response = resolveResponseLanguage(policy, detection);
  const relevance = assessBusinessRelevanceForProfile(text, developerDemoProfile);
  const understanding = understandForProfile(ticket, developerDemoProfile);
  const canonical = identifyCanonicalProblem(understanding, developerDemoProfile);
  const matches = retrieveMemory(understanding, [knowledge]);
  const lesson = matches[0] ? findMatchingLesson(ticket, matches[0].item, { internalLanguage: "en" }) : null;
  return { language, detection: detection.language, response: response.language, canonical: canonical.id, retrieval: matches[0]?.item.id ?? null, lesson: lesson?.lesson.id ?? null, relevant: relevance.isRelevant };
}

const expected = new Map();
const started = performance.now();
for (let index = 0; index < 1000; index += 1) {
  const [language, text] = tickets[index % tickets.length];
  const actual = run(language, text, index);
  if (!expected.has(language)) expected.set(language, actual);
  assert.deepEqual(actual, expected.get(language), `${language} replay ${index + 1} diverged`);
  assert.equal(actual.detection, language, `${language}: detection drift`);
  assert.equal(actual.response, language, `${language}: response drift`);
  assert.equal(actual.canonical, "canonical-login-issue", `${language}: canonical drift`);
  assert.equal(actual.retrieval, "rss12d-final-login-canonical", `${language}: retrieval drift`);
  assert.equal(actual.lesson, "rss12d-final-login-lesson", `${language}: lesson drift`);
  assert.equal(actual.relevant, true, `${language}: relevance drift`);
}

console.log(`RSS-1.2D-FINAL stability passed: 1000 complete replays, ${(performance.now() - started).toFixed(1)}ms.`);
