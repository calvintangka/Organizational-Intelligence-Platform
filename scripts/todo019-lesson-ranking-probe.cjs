/*
 * TODO-019 sibling-lesson ranking specificity probe.
 *
 * Verifies the deterministic sibling-lesson ranking change in
 * lib/drafting.ts findMatchingLesson: when several compatible sibling lessons
 * of one KnowledgeItem share the same primary match score, the lesson with
 * stronger problem-specific evidence (multi-token matches, then distinct
 * ticket-evidence coverage, then a stable lesson-id fallback) is selected —
 * NEVER lesson array position and NEVER trust.
 *
 * Maesa canonical-login-issue is loaded READ-ONLY; array-order and ambiguity
 * cases operate on in-memory copies only. Nothing is written to any org.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });
require("dotenv").config({ path: path.join(root, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the read-only TODO-019 probe cannot run.");
  process.exit(1);
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") return path.join(__dirname, "stubs", "server-only.cjs");
  if (request.startsWith("@/")) {
    const mapped = path.join(root, request.slice(2));
    if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
    if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
    if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename
    });
    module._compile(output.outputText.replace(/import\.meta\.url/g, "require('node:url').pathToFileURL(__filename).href"), filename);
  };
}

const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { findMatchingLesson, isStrongLessonEvidence, isCompatibleForDrafting, assessRootCauseCompatibility } = require(path.join(root, "lib", "drafting.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const MAESA = "profile-maesa-tech";
const LOGIN_ITEM = "canonical-login-issue";
const GENERIC_LESSON = "lesson-1782992719264-968o"; // "infrequent use / never recorded password"
const DEVICE_SWITCH_LESSONS = new Set([
  "lesson-1783579667941-43jz", // browser-saved credentials; switching devices removed autofill
  "lesson-1783585050591-f47l"  // browser autofill; switched laptops; saved password did not transfer
]);

const failures = [];
function check(name, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!condition) failures.push(name + (detail ? ": " + detail : ""));
}

function ticketOf(subject, description) {
  return { id: `todo019-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, customerName: "Probe Customer", subject, description, category: "General", status: "new", createdAt: new Date().toISOString() };
}

function reportCompeting(ticket, item) {
  const rows = (item.lessons ?? []).map((lesson) => {
    const single = { ...item, lessons: [lesson] };
    const lm = findMatchingLesson(ticket, single);
    return { id: lesson.id, label: (lesson.title ?? lesson.rootCause).slice(0, 46), score: lm ? lm.score : 0, multi: lm ? lm.multiTokenMatches : 0, cov: lm ? lm.ticketEvidenceCoverage : 0 };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || b.multi - a.multi || b.cov - a.cov);
  for (const r of rows) console.log(`     lesson ${r.id} score=${r.score} multiToken=${r.multi} coverage=${r.cov} "${r.label}"`);
  return rows;
}

async function main() {
  const profile = await service.getOrganizationProfile(MAESA);
  const items = await service.loadKnowledge(MAESA);
  const loginItem = items.find((i) => i.id === LOGIN_ITEM);
  assert.ok(loginItem, "Maesa must contain canonical-login-issue");
  console.log(`Loaded Maesa READ-ONLY. login item has ${loginItem.lessons.length} sibling lessons.\n`);

  /* ---------- CASE A — specific browser-autofill/device-switch ticket ---------- */
  console.log("=== CASE A — browser-autofill / device-switch (Daniel) ===");
  const daniel = ticketOf(
    "Can't log in to my Maesa account on new laptop",
    "Hi Maesa Tech Support, I recently received a new laptop from my company and now I can't log in to my Maesa account. On my old laptop, my browser always filled in the password automatically, so I don't remember what the password was. I tried entering a few passwords that I normally use, but none of them worked. How can I regain access to my account? Thanks, Daniel"
  );
  const compA = reportCompeting(daniel, loginItem);
  const winnerA = findMatchingLesson(daniel, loginItem);
  console.log(`   winner = ${winnerA.lesson.id} "${(winnerA.lesson.title ?? winnerA.lesson.rootCause).slice(0, 60)}"`);
  check("A winner is a browser-autofill/device-switch lesson", DEVICE_SWITCH_LESSONS.has(winnerA.lesson.id), winnerA.lesson.id);
  check("A generic infrequent-use lesson did NOT win", winnerA.lesson.id !== GENERIC_LESSON);
  check("A winner still qualifies as strong evidence", isStrongLessonEvidence(winnerA, true));

  /* ---------- CASE B — genuine generic forgotten-password ticket ---------- */
  console.log("\n=== CASE B — generic forgotten-password (no device/browser evidence) ===");
  const generic = ticketOf(
    "Forgot my Maesa password",
    "Hi, I only log in very infrequently and I never wrote my password down anywhere, so now I simply cannot recall the password to my account. What is the quickest way to reset it and set a new password? Thanks."
  );
  reportCompeting(generic, loginItem);
  const winnerB = findMatchingLesson(generic, loginItem);
  console.log(`   winner = ${winnerB.lesson.id} "${(winnerB.lesson.title ?? winnerB.lesson.rootCause).slice(0, 60)}"`);
  check("B generic infrequent-use lesson wins when it is the better match", winnerB.lesson.id === GENERIC_LESSON, winnerB.lesson.id);

  /* ---------- CASE C — direct strong match unchanged ---------- */
  console.log("\n=== CASE C — direct strong match ===");
  const direct = ticketOf(
    "Cannot sign in after switching laptops",
    "Hi, I switched laptops this week and my browser no longer saved my Maesa password. My saved logins did not transfer to the new laptop, and since I always relied on browser autofill I don't remember it when typing manually. Could you help me set up a new password?"
  );
  const winnerC = findMatchingLesson(direct, loginItem);
  console.log(`   winner = ${winnerC.lesson.id} score=${winnerC.score} "${(winnerC.lesson.title ?? winnerC.lesson.rootCause).slice(0, 60)}"`);
  check("C direct match selects a device-switch lesson with strong score", DEVICE_SWITCH_LESSONS.has(winnerC.lesson.id) && winnerC.score >= 5, `id=${winnerC.lesson.id} score=${winnerC.score}`);

  /* ---------- CASE D — mild paraphrase still retrieves a login lesson ---------- */
  console.log("\n=== CASE D — mild paraphrase ===");
  const mild = ticketOf(
    "Can't get into Maesa from my replacement machine",
    "Hello, I recently replaced my old notebook with a new machine. Chrome used to fill my Maesa password in automatically, but on this device the field stays empty and I honestly have no idea what the password is because the browser always handled it for me. How do I get back into my account?"
  );
  const winnerD = findMatchingLesson(mild, loginItem);
  console.log(`   winner = ${winnerD.lesson.id} score=${winnerD.score} "${(winnerD.lesson.title ?? winnerD.lesson.rootCause).slice(0, 60)}"`);
  check("D mild paraphrase still matches a login lesson (strong)", !!winnerD && isStrongLessonEvidence(winnerD, true));

  /* ---------- CASE E — weak overlap must NOT authorize lesson reuse ---------- */
  console.log("\n=== CASE E — weak overlap ===");
  const weak = ticketOf(
    "Update the billing address shown on future invoices",
    "My password works fine and I can sign in normally. I need the billing address on future invoices updated because we moved offices; the invoice still shows the previous company address."
  );
  const undE = understandForProfile(weak, profile);
  const lmE = findMatchingLesson(weak, loginItem);
  const strongE = isStrongLessonEvidence(lmE, undE.category !== "Uncategorized" && undE.category !== "General");
  const compatE = isCompatibleForDrafting(undE, loginItem, weak);
  console.log(`   category=${undE.category} lessonMatch=${lmE ? `score=${lmE.score} multi=${lmE.multiTokenMatches}` : "none"} strong=${strongE} isCompatibleForDrafting=${compatE}`);
  check("E weak overlap is not compatible for drafting the login item", compatE === false);

  /* ---------- CASE F — contradiction remains a hard veto ---------- */
  console.log("\n=== CASE F — contradiction ===");
  const contra = ticketOf(
    "Dashboard error after signing in",
    "I can sign in normally and I remember my password, so this is not a login issue. After logging in, the analytics dashboard shows an error page instead of my reports."
  );
  const undF = understandForProfile(contra, profile);
  const lmF = findMatchingLesson(contra, loginItem);
  const compatF = assessRootCauseCompatibility(undF, loginItem, contra);
  console.log(`   lessonMatch=${lmF ? `score=${lmF.score}` : "none (contradicted lessons skipped)"} rootCauseCompatible=${compatF.compatible} contradiction=${!!compatF.contradiction}`);
  check("F contradiction: no login lesson authorized", isCompatibleForDrafting(undF, loginItem, contra) === false);

  /* ---------- CASE G — genuinely equal evidence resolves to stable id ---------- */
  console.log("\n=== CASE G — ambiguous equal evidence (stable id fallback) ===");
  const twinItem = {
    ...loginItem,
    lessons: [
      { id: "lesson-zzz-second", title: "Twin B", rootCause: "duplicate", solution: "reset password", customerResponse: "Reset your password.", signals: ["cannot recall password", "set a new password"], createdAt: new Date().toISOString(), sourceTicketId: "t" },
      { id: "lesson-aaa-first", title: "Twin A", rootCause: "duplicate", solution: "reset password", customerResponse: "Reset your password.", signals: ["cannot recall password", "set a new password"], createdAt: new Date().toISOString(), sourceTicketId: "t" }
    ]
  };
  const ambTicket = ticketOf("cannot recall password", "I cannot recall password and want to set a new password.");
  const winnerG = findMatchingLesson(ambTicket, twinItem);
  console.log(`   winner = ${winnerG.lesson.id} (both twins score=${winnerG.score} multi=${winnerG.multiTokenMatches} coverage=${winnerG.ticketEvidenceCoverage})`);
  check("G equal-evidence twins resolve to lexicographically smallest id", winnerG.lesson.id === "lesson-aaa-first", winnerG.lesson.id);

  /* ---------- CASE H — array-order independence ---------- */
  console.log("\n=== CASE H — array-order independence ===");
  const orders = [
    loginItem.lessons.slice(),
    loginItem.lessons.slice().reverse(),
    loginItem.lessons.slice().sort((a, b) => (a.id < b.id ? 1 : -1)),
    loginItem.lessons.slice().sort(() => 0.5 - ((Math.sin(1) + 1) / 2)) // fixed deterministic non-identity shuffle
  ];
  const winners = orders.map((lessons) => findMatchingLesson(daniel, { ...loginItem, lessons }).lesson.id);
  console.log(`   winners across ${orders.length} orderings: ${[...new Set(winners)].join(", ")}`);
  check("H winner is identical across all lesson orderings", new Set(winners).size === 1, winners.join("|"));
  check("H order-independent winner is the device-switch lesson", DEVICE_SWITCH_LESSONS.has(winners[0]), winners[0]);

  console.log("\n=== SUMMARY ===");
  if (failures.length > 0) {
    console.error(`FAILURES (${failures.length}):\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("All TODO-019 cases passed. Read-only probe complete; no data was written.");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
