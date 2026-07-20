/*
 * TODO-009 / BUG-008 read-only retrieval audit probe.
 *
 * Runs the REAL deterministic retrieval pipeline (understandForProfile ->
 * identifyCanonicalProblem -> retrieveMemory -> lesson matching -> root-cause
 * compatibility -> draftResponse) against mature Maesa Tech memory loaded
 * READ-ONLY from PostgreSQL. Nothing is written: only loadKnowledge and
 * getOrganizationProfile are called.
 *
 * The selection glue (isStrongLessonMatch, selectPreferredMatch,
 * withPreDiscriminationLessonMatches) is imported from the authoritative
 * production module lib/lessonSelection.ts (TODO-023) — the same
 * implementation app/page.tsx uses — so this probe fails if production
 * lesson-selection behavior regresses.
 *
 * Exit code: non-zero only when a SAFETY case (weak overlap / contradiction /
 * ambiguous / cold start) misbehaves. The paraphrase case reports
 * REPRODUCED/NOT-REPRODUCED without failing - reproducing BUG-008 is the goal.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the read-only Maesa retrieval probe cannot run.");
  process.exit(1);
}


const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  draftResponse,
  isCompatibleForDrafting,
  findMatchingLesson,
  assessRootCauseCompatibility
} = require(path.join(root, "lib", "drafting.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const {
  selectPreferredMatch,
  withPreDiscriminationLessonMatches
} = require(path.join(root, "lib", "lessonSelection.ts"));

const MAESA = "profile-maesa-tech";

/* ------------------------------- probe harness ------------------------------- */

function ticketOf(subject, description) {
  return {
    id: `bug008-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    customerName: "Probe Customer",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

/** Full deterministic pipeline exactly as app/page.tsx wires it (AI advisory excluded â€” advisory never authorizes reuse). */
function runPipeline(ticket, profile, knowledgeItems) {
  const und = understandForProfile(ticket, profile);
  const canonical = identifyCanonicalProblem(und, profile);
  const rawMatches = retrieveMemory(und, knowledgeItems, new Set());
  const matches = withPreDiscriminationLessonMatches(ticket, und, rawMatches, knowledgeItems, canonical.title);
  const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(und, m.item, ticket));
  const selected = compatibleMatches.length > 0 ? selectPreferredMatch(ticket, compatibleMatches) : null;
  const topMatch = selected?.match ?? (compatibleMatches.length > 0 ? compatibleMatches[0] : null);
  const draft = draftResponse(ticket, und, topMatch, profile, knowledgeItems.length === 0);
  return { und, canonical, rawMatches, matches, compatibleMatches, topMatch, draft };
}

function traceCase(label, ticket, profile, knowledgeItems, focusItemId) {
  const result = runPipeline(ticket, profile, knowledgeItems);
  const { und, canonical, rawMatches, compatibleMatches, topMatch, draft } = result;
  console.log(`\n=== ${label} ===`);
  console.log(`ticket: "${ticket.subject}"`);
  console.log(`understanding: category=${und.category} intent=${und.intent ?? "-"} tags=[${und.tags.join(",")}] signals=[${und.detectedSignals.join(",")}]`);
  console.log(`canonical problem: ${canonical.title}`);
  console.log(`retrieveMemory candidates: ${rawMatches.slice(0, 3).map((m) => `${m.item.id}(${m.matchScore}%)`).join(", ") || "none"}`);

  const focus = knowledgeItems.find((item) => item.id === focusItemId);
  if (focus) {
    const compat = assessRootCauseCompatibility(und, focus, ticket);
    const lesson = findMatchingLesson(ticket, focus);
    console.log(`focus item ${focusItemId}:`);
    console.log(`  root-cause gate: compatible=${compat.compatible} ticketFamily=${compat.ticketFamily} itemFamily=${compat.itemFamily}`);
    console.log(`  reason: ${compat.reason}`);
    console.log(`  lesson signal match: ${lesson ? `score=${lesson.score} signals=[${lesson.matchedSignals.join("; ")}] rootCause="${lesson.lesson.rootCause.slice(0, 80)}..."` : "none"}`);
    console.log(`  isCompatibleForDrafting=${isCompatibleForDrafting(und, focus, ticket)}`);
  }
  console.log(`compatible matches after gate: ${compatibleMatches.map((m) => `${m.item.id}(${m.matchScore}%)`).join(", ") || "none"}`);
  console.log(`final: topMatch=${topMatch ? `${topMatch.item.id}(${topMatch.matchScore}%)` : "null"} draftSource=${draft.source} basedOn=[${draft.basedOnKnowledgeIds.join(",")}]`);
  console.log(`confidenceNote: ${draft.confidenceNote.slice(0, 180)}`);
  return result;
}

function runMatrix(profileLabel, profile, knowledgeItems, failures) {
  console.log(`\n########## PROFILE: ${profileLabel} ##########`);
  const LOGIN_ITEM = "canonical-login-issue";

  /* 1. Direct match â€” near-identical wording to the stored lesson. */
  const direct = traceCase(
    "CASE 1 - DIRECT MATCH",
    ticketOf(
      "Cannot sign in after switching laptops",
      "Hi, I switched laptops this week and my browser no longer saved my Maesa password. My saved logins did not transfer to the new laptop, and since I always relied on browser autofill I don't remember it when typing manually. Could you help me set up a new password?"
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const directOk = direct.topMatch?.item.id === LOGIN_ITEM && direct.draft.basedOnKnowledgeIds.includes(LOGIN_ITEM);
  console.log(`CASE 1 expected=lesson retrieved actual=${directOk ? "retrieved" : "NOT retrieved"} => ${directOk ? "PASS" : "FAIL"}`);
  if (!directOk) failures.push(profileLabel + ": direct match must reuse the validated login lesson");

  /* 2a. Mild paraphrase - keeps a few shared tokens (password/new/cannot). */
  const mildParaphrase = traceCase(
    "CASE 2a - MILD PARAPHRASE",
    ticketOf(
      "Can't get into Maesa from my replacement machine",
      "Hello, I recently replaced my old notebook with a new machine. Chrome used to fill my Maesa password in automatically, but on this device the field stays empty and I honestly have no idea what the password is because the browser always handled it for me. How do I get back into my account?"
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const mildRetrieved = mildParaphrase.draft.basedOnKnowledgeIds.includes(LOGIN_ITEM);
  console.log(`CASE 2a expected=lesson retrieved actual=${mildRetrieved ? "retrieved" : "NOT retrieved"} => ${mildRetrieved ? "retrieved" : "BUG-008 REPRODUCED"}`);

  /* 2b. Strong paraphrase - same underlying problem (browser-saved credentials
     lost on a device change, password never memorized), no verbatim signal
     tokens. A human support agent immediately recognizes the stored lesson. */
  const paraphrase = traceCase(
    "CASE 2b - STRONG PARAPHRASE (BUG-008)",
    ticketOf(
      "Unable to access my workspace after device swap",
      "Hi team, my company issued me a different computer this week. Previously the browser filled in my Maesa credentials for me, so I never actually typed them. On the swapped device that stored sign-on is gone and I genuinely have no clue what it was. Could you walk me through regaining entry to my workspace?"
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const paraphraseRetrieved = paraphrase.draft.basedOnKnowledgeIds.includes(LOGIN_ITEM);
  // This probe runs WITHOUT an AI provider, so the deterministic-only path is
  // EXPECTED to fail closed here; the Step 2 semantic fallback recovers this
  // case (verified by scripts/bug008-semantic-probe.cjs).
  console.log(`CASE 2b expected(deterministic-only)=fail closed actual=${paraphraseRetrieved ? "retrieved" : "NOT retrieved"} => ${paraphraseRetrieved ? "unexpected deterministic retrieval" : "fails closed as designed; semantic fallback covers it"}`);

  /* 3. Weak overlap â€” shares login vocabulary, different underlying problem. */
  const weak = traceCase(
    "CASE 3 - WEAK OVERLAP",
    ticketOf(
      "Update the billing address shown on future invoices",
      "My password works fine and I can sign in normally. I need the billing address on future invoices updated because we moved offices; the invoice still shows the previous company address."
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const weakSafe = !weak.draft.basedOnKnowledgeIds.includes(LOGIN_ITEM);
  console.log(`CASE 3 expected=login lesson rejected actual=${weakSafe ? "rejected" : "REUSED"} => ${weakSafe ? "PASS" : "FAIL"}`);
  if (!weakSafe) failures.push(profileLabel + ": weak-overlap ticket must not reuse the login lesson");

  /* 4. Contradiction â€” ticket contradicts the stored lesson's assumption. */
  const contradiction = traceCase(
    "CASE 4 - CONTRADICTION",
    ticketOf(
      "Dashboard error after signing in",
      "I can sign in normally and I remember my password, so this is not a login issue. After logging in, the analytics dashboard shows an error page instead of my reports."
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const contradictionSafe = !contradiction.draft.basedOnKnowledgeIds.includes(LOGIN_ITEM);
  console.log(`CASE 4 expected=login lesson rejected actual=${contradictionSafe ? "rejected" : "REUSED"} => ${contradictionSafe ? "PASS" : "FAIL"}`);
  if (!contradictionSafe) failures.push(profileLabel + ": contradicting ticket must not reuse the login lesson");

  /* 5. Ambiguous â€” compatibility unclear; no unsafe reuse. */
  const ambiguous = traceCase(
    "CASE 5 - AMBIGUOUS",
    ticketOf(
      "Something is wrong with my account",
      "Hi, something seems off with my account since yesterday. Can someone take a look? Thanks."
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const ambiguousSafe = ambiguous.draft.basedOnKnowledgeIds.length === 0 || ambiguous.draft.source === "no_template";
  console.log(`CASE 5 expected=no unsafe reuse actual=source=${ambiguous.draft.source} basedOn=${ambiguous.draft.basedOnKnowledgeIds.length} => ${ambiguousSafe ? "PASS" : "FAIL"}`);
  if (!ambiguousSafe) failures.push(profileLabel + ": ambiguous ticket must not silently reuse a template");

  /* 6. Cold start â€” no relevant lesson exists anywhere in memory. */
  const cold = traceCase(
    "CASE 6 - COLD START",
    ticketOf(
      "Webhook signature verification failing",
      "Since yesterday our integration reports that webhook signature verification fails for every event payload you send us. Nothing changed on our side."
    ),
    profile, knowledgeItems, LOGIN_ITEM
  );
  const coldSafe = cold.draft.basedOnKnowledgeIds.length === 0;
  console.log(`CASE 6 expected=no lesson retrieved actual=basedOn=${cold.draft.basedOnKnowledgeIds.length} source=${cold.draft.source} => ${coldSafe ? "PASS" : "FAIL"}`);
  if (!coldSafe) failures.push(profileLabel + ": cold-start ticket must not be answered from unrelated knowledge");

  console.log(`\n[${profileLabel}] strong paraphrase (deterministic-only): ${paraphraseRetrieved ? "retrieved deterministically" : "fails closed; recovered by the Step 2 semantic fallback"}`);
  return { paraphraseRetrieved, mildRetrieved, directOk };
}

async function main() {
  const serverProfile = await service.getOrganizationProfile(MAESA);
  const knowledgeItems = await service.loadKnowledge(MAESA);
  console.log(`Loaded Maesa READ-ONLY: ${knowledgeItems.length} knowledge items.`);
  console.log(`Server profile vocabulary sizes: products=${serverProfile.products.length} services=${serverProfile.services.length} supportedDomains=${serverProfile.supportedDomains.length} businessVocabulary=${serverProfile.businessVocabulary.length}`);

  const loginItem = knowledgeItems.find((item) => item.id === "canonical-login-issue");
  assert.ok(loginItem, "Maesa must contain the canonical login knowledge item");
  assert.ok(
    (loginItem.lessons ?? []).some((lesson) => /autofill|switched laptops/i.test(`${lesson.rootCause} ${lesson.signals.join(" ")}`)),
    "Maesa must contain the validated browser-autofill/switched-laptop lesson (BUG-008 target)"
  );

  const seedProfile = seedOrganizationProfiles.find((profile) => profile.id === MAESA);
  assert.ok(seedProfile, "Seed Maesa profile must exist for the isolation run");

  const failures = [];
  // Run 1: the profile the real server-authoritative app actually uses today.
  const serverRun = runMatrix("SERVER (as persisted in PostgreSQL)", serverProfile, knowledgeItems, failures);
  // Run 2: the full seed vocabulary â€” isolates matching logic from profile data loss.
  const seedRun = runMatrix("SEED (full vocabulary, isolation run)", seedProfile, knowledgeItems, failures);

  console.log("\n=== OVERALL SUMMARY ===");
  console.log(`Server profile run - direct: ${serverRun.directOk ? "retrieved" : "missed"}; mild paraphrase: ${serverRun.mildRetrieved ? "retrieved" : "MISSED"}; strong paraphrase (deterministic-only): ${serverRun.paraphraseRetrieved ? "retrieved" : "fails closed (semantic fallback covers it)"}`);
  console.log(`Seed profile run   - direct: ${seedRun.directOk ? "retrieved" : "missed"}; mild paraphrase: ${seedRun.mildRetrieved ? "retrieved" : "MISSED"}; strong paraphrase (deterministic-only): ${seedRun.paraphraseRetrieved ? "retrieved" : "fails closed (semantic fallback covers it)"}`);
  if (failures.length > 0) {
    console.error(`SAFETY FAILURES:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("All safety cases passed. Read-only probe complete; no data was written.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

