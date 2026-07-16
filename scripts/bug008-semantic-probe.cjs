/*
 * TODO-009 Step 2 probe — semantic compatibility fallback (BUG-008).
 *
 * Exercises the REAL pipeline modules (analyzer, memory, drafting,
 * semanticCompatibility) with deterministic MOCK AI providers, against mature
 * Maesa memory loaded READ-ONLY from PostgreSQL. Nothing is written.
 *
 * Cases:
 *  A direct match          -> deterministic path, semantic fallback not consulted
 *  B mild paraphrase       -> deterministic strong-lesson path, no fallback needed
 *  C strong paraphrase     -> deterministic unknown -> semantic confirm -> lesson reused
 *  D known incompatibility -> hard veto; fallback not consulted; fake auth ignored
 *  E contradiction         -> hard veto; fallback not consulted; fake auth ignored
 *  F ambiguous semantic    -> fail closed (low/medium confidence never authorizes)
 *  G LLM unavailable       -> fail closed, aborts after first failed call
 *  H fabricated authorization cannot bypass drafting's deterministic re-checks
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
  console.error("DATABASE_URL is not configured; the read-only Maesa probe cannot run.");
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
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  draftResponse,
  isCompatibleForDrafting,
  assessCompatibilityDecision,
  authorizeSemanticLessonReuse
} = require(path.join(root, "lib", "drafting.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const MAESA = "profile-maesa-tech";
const LOGIN_ITEM = "canonical-login-issue";

function ticketOf(subject, description) {
  return {
    id: "semantic-probe-ticket",
    customerName: "Probe Customer",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

/** Mock provider factory: `decide(lesson)` returns the discrimination data (or null for a failed call). */
function mockProvider(decide, calls) {
  return {
    mode: "lmstudio",
    label: "Mock",
    async discriminateMatch(input) {
      calls.push(input.matchedProblemSummary);
      const data = decide(input);
      if (!data) return { ok: false, providerMode: "lmstudio", providerLabel: "Mock", latencyMs: 1, error: "mock unavailable" };
      return { ok: true, providerMode: "lmstudio", providerLabel: "Mock", latencyMs: 1, data };
    }
  };
}

const STRONG_PARAPHRASE = ticketOf(
  "Unable to access my workspace after device swap",
  "Hi team, my company issued me a different computer this week. Previously the browser filled in my Maesa credentials for me, so I never actually typed them. On the swapped device that stored sign-on is gone and I genuinely have no clue what it was. Could you walk me through regaining entry to my workspace?"
);

async function main() {
  const profile = await service.getOrganizationProfile(MAESA);
  if (profile.supportedDomains.length === 0 || profile.businessVocabulary.length === 0) {
    console.error(
      "Maesa profile vocabulary is EMPTY again — an open stale browser session can re-save the pre-restore profile over the fix. " +
      "Re-run: node scripts/restore-maesa-profile-vocabulary.cjs (idempotent), reload any open Maesa browser tab, then re-run this probe."
    );
    process.exit(1);
  }
  const knowledgeItems = await service.loadKnowledge(MAESA);
  const loginItem = knowledgeItems.find((item) => item.id === LOGIN_ITEM);
  assert.ok(loginItem, "Maesa login knowledge item must exist");
  // Maesa holds TWO validated lessons describing the same underlying problem
  // (browser-saved credentials lost on a device switch, password never
  // memorized). Confirming either is a correct semantic outcome.
  const autofillLessons = (loginItem.lessons ?? []).filter((lesson) => /autofill/i.test(`${lesson.rootCause} ${lesson.signals.join(" ")}`));
  assert.ok(autofillLessons.length > 0, "Maesa autofill lesson must exist");
  const autofillLesson = autofillLessons[0];
  const autofillLessonIds = new Set(autofillLessons.map((lesson) => lesson.id));
  const isAutofill = (input) => /autofill/i.test(input.matchedProblemSummary);
  const failures = [];
  const check = (label, condition, detail) => {
    console.log(`${label}: ${condition ? "PASS" : `FAIL${detail ? ` (${detail})` : ""}`}`);
    if (!condition) failures.push(label);
  };

  function pipeline(ticket, provider, fabricatedAuthorization) {
    const und = understandForProfile(ticket, profile);
    const matches = retrieveMemory(und, knowledgeItems, new Set());
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(und, m.item, ticket));
    return { und, matches, compatibleMatches };
  }

  /* A. Direct match — deterministic path; fallback must not be consulted. */
  {
    const ticket = ticketOf(
      "Cannot sign in after switching laptops",
      "Hi, I switched laptops this week and my browser no longer saved my Maesa password. My saved logins did not transfer to the new laptop, and since I always relied on browser autofill I don't remember it when typing manually. Could you help me set up a new password?"
    );
    const { und, compatibleMatches } = pipeline(ticket);
    const decision = assessCompatibilityDecision(und, loginItem, ticket);
    check("A1 direct: deterministic decision compatible", decision.state === "compatible", decision.state);
    const calls = [];
    const evaluation = await evaluateSemanticLessonCompatibility(mockProvider(() => null, calls), ticket, und, loginItem);
    check("A2 direct: semantic fallback refuses to run (state not unknown)", evaluation.authorization === null && calls.length === 0);
    const top = compatibleMatches.find((m) => m.item.id === LOGIN_ITEM) ?? compatibleMatches[0];
    const draft = draftResponse(ticket, und, top, profile, false);
    check("A3 direct: lesson-informed draft via existing path", draft.basedOnKnowledgeIds.includes(LOGIN_ITEM), draft.source);
  }

  /* B. Mild paraphrase — deterministic strong-lesson exception still authorizes. */
  {
    const ticket = ticketOf(
      "Can't get into Maesa from my replacement machine",
      "Hello, I recently replaced my old notebook with a new machine. Chrome used to fill my Maesa password in automatically, but on this device the field stays empty and I honestly have no idea what the password is because the browser always handled it for me. How do I get back into my account?"
    );
    const { und, compatibleMatches } = pipeline(ticket);
    const top = compatibleMatches.find((m) => m.item.id === LOGIN_ITEM) ?? null;
    const draft = draftResponse(ticket, und, top, profile, false);
    check("B mild paraphrase: lesson retrieved deterministically", !!top && draft.basedOnKnowledgeIds.includes(LOGIN_ITEM));
  }

  /* C. Strong paraphrase — unknown -> semantic confirm -> correct lesson reused. */
  {
    const ticket = STRONG_PARAPHRASE;
    const { und, matches, compatibleMatches } = pipeline(ticket);
    const decision = assessCompatibilityDecision(und, loginItem, ticket);
    check("C1 strong paraphrase: deterministic root-cause unknown", decision.state === "unknown", decision.state);
    check("C2 strong paraphrase: deterministic gate yields no compatible match", compatibleMatches.length === 0);
    check("C3 strong paraphrase: retrieval still ranks login item first", matches[0]?.item.id === LOGIN_ITEM, matches[0]?.item.id);

    const calls = [];
    const provider = mockProvider(
      (input) => (isAutofill(input)
        ? { isDistinctFromMatch: false, confidence: "high", reasoning: "Same problem: browser-saved credential lost on device change, password never memorized." }
        : { isDistinctFromMatch: true, confidence: "high", reasoning: "Different root cause." }),
      calls
    );
    const evaluation = await evaluateSemanticLessonCompatibility(provider, ticket, und, matches[0].item);
    check("C4 strong paraphrase: semantic fallback invoked", calls.length > 0, `calls=${calls.length}`);
    check("C5 strong paraphrase: correct lesson authorized", autofillLessonIds.has(evaluation.authorization?.lessonId), evaluation.authorization?.lessonId);

    const draft = draftResponse(ticket, und, matches[0], profile, false, evaluation.authorization);
    check("C6 strong paraphrase: lesson-informed draft produced", draft.basedOnKnowledgeIds.includes(LOGIN_ITEM) && draft.source === "deterministic", draft.source);
    check("C7 strong paraphrase: draft uses the validated lesson response", draft.draftResponse.length > 0 && draft.confidenceNote.includes("semantic match"));
  }

  /* D. Known incompatible root cause — hard veto; semantic cannot run or override. */
  {
    const ticket = ticketOf(
      "My account is locked out",
      "I am locked out of my account. The system says account locked after too many attempts. Please unlock it."
    );
    const { und } = pipeline(ticket);
    const decision = assessCompatibilityDecision(und, loginItem, ticket);
    check("D1 incompatible families: deterministic hard veto", decision.state === "incompatible", decision.state);
    const calls = [];
    const evaluation = await evaluateSemanticLessonCompatibility(
      mockProvider(() => ({ isDistinctFromMatch: false, confidence: "high", reasoning: "attempted override" }), calls),
      ticket, und, loginItem
    );
    check("D2 incompatible families: fallback refuses (no LLM calls)", evaluation.authorization === null && calls.length === 0, `calls=${calls.length}`);
    const fake = { itemId: LOGIN_ITEM, lessonId: autofillLesson.id, confidence: "high", reasoning: "forged" };
    check("D3 incompatible families: forged authorization ignored", authorizeSemanticLessonReuse(und, loginItem, ticket, fake) === null);
    const draft = draftResponse(ticket, und, { item: loginItem, matchScore: 100, matchReason: "probe" }, profile, false, fake);
    check("D4 incompatible families: draft stays safe", !draft.basedOnKnowledgeIds.includes(LOGIN_ITEM), draft.source);
  }

  /* E. Contradiction — hard veto; semantic cannot run or override. */
  {
    const ticket = ticketOf(
      "Dashboard error after signing in",
      "I can sign in normally and I remember my password, so this is not a login issue. After logging in, the analytics dashboard shows an error page instead of my reports."
    );
    const { und } = pipeline(ticket);
    const decision = assessCompatibilityDecision(und, loginItem, ticket);
    check("E1 contradiction: deterministic hard veto", decision.state === "incompatible", decision.state);
    const calls = [];
    const evaluation = await evaluateSemanticLessonCompatibility(
      mockProvider(() => ({ isDistinctFromMatch: false, confidence: "high", reasoning: "attempted override" }), calls),
      ticket, und, loginItem
    );
    check("E2 contradiction: fallback refuses (no LLM calls)", evaluation.authorization === null && calls.length === 0);
    const fake = { itemId: LOGIN_ITEM, lessonId: autofillLesson.id, confidence: "high", reasoning: "forged" };
    const draft = draftResponse(ticket, und, { item: loginItem, matchScore: 100, matchReason: "probe" }, profile, false, fake);
    check("E3 contradiction: forged authorization ignored by drafting", draft.source === "no_template" && draft.basedOnKnowledgeIds.length === 0, draft.source);
  }

  /* F. Ambiguous semantic result — fail closed. */
  {
    const ticket = STRONG_PARAPHRASE;
    const { und, matches } = pipeline(ticket);
    for (const [label, data] of [
      ["low confidence", { isDistinctFromMatch: false, confidence: "low", reasoning: "unsure" }],
      ["medium (malformed default)", { isDistinctFromMatch: false, confidence: "medium", reasoning: "No reasoning provided." }]
    ]) {
      const calls = [];
      const evaluation = await evaluateSemanticLessonCompatibility(mockProvider(() => data, calls), ticket, und, matches[0].item);
      const draft = draftResponse(ticket, und, matches[0], profile, false, evaluation.authorization);
      check(`F ambiguous (${label}): fail closed to no_template`, evaluation.authorization === null && draft.source === "no_template");
    }
  }

  /* G. LLM unavailable — fail closed, abort after the first failed call. */
  {
    const ticket = STRONG_PARAPHRASE;
    const { und, matches } = pipeline(ticket);
    const calls = [];
    const evaluation = await evaluateSemanticLessonCompatibility(mockProvider(() => null, calls), ticket, und, matches[0].item);
    const draft = draftResponse(ticket, und, matches[0], profile, false, evaluation.authorization);
    check("G1 LLM unavailable: no authorization", evaluation.authorization === null);
    check("G2 LLM unavailable: aborts immediately (single call)", calls.length === 1, `calls=${calls.length}`);
    check("G3 LLM unavailable: safe no_template draft", draft.source === "no_template");
  }

  /* H. Fabricated authorization cannot bypass deterministic re-checks. */
  {
    const ticket = STRONG_PARAPHRASE;
    const { und, matches } = pipeline(ticket);
    const forgeries = [
      ["wrong item id", { itemId: "canonical-billing-invoice-issue", lessonId: autofillLesson.id, confidence: "high", reasoning: "forged" }],
      ["nonexistent lesson id", { itemId: LOGIN_ITEM, lessonId: "no-such-lesson", confidence: "high", reasoning: "forged" }],
      ["non-high confidence", { itemId: LOGIN_ITEM, lessonId: autofillLesson.id, confidence: "medium", reasoning: "forged" }]
    ];
    for (const [label, forged] of forgeries) {
      const draft = draftResponse(ticket, und, matches[0], profile, false, forged);
      check(`H forged authorization (${label}): rejected`, draft.source === "no_template" && draft.basedOnKnowledgeIds.length === 0, draft.source);
    }
    // A VALID authorization for a genuinely-unknown case still works (sanity).
    const valid = { itemId: LOGIN_ITEM, lessonId: autofillLesson.id, confidence: "high", reasoning: "valid" };
    const draft = draftResponse(ticket, und, matches[0], profile, false, valid);
    check("H sanity: valid authorization on unknown state is honored", draft.basedOnKnowledgeIds.includes(LOGIN_ITEM));
  }

  console.log(`\n${failures.length === 0 ? "All semantic compatibility cases passed." : `FAILURES: ${failures.join("; ")}`}`);
  console.log("Read-only probe complete; no data was written. Cold-start false-positive remains pending Step 3.");
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
