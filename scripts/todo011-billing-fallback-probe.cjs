/*
 * TODO-011 / PRODUCT-CONTENT-001 read-only audit probe.
 *
 * Runs five distinct Billing intents through the REAL deterministic pipeline
 * (same page glue as bug008-retrieval-probe) against mature Maesa memory
 * loaded READ-ONLY from PostgreSQL. Prints a compact trace per case plus the
 * draft produced, and flags charge-dispute-specific language appearing in
 * responses to non-dispute billing intents. Nothing is written.
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
  console.error("DATABASE_URL is not configured; the read-only probe cannot run.");
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
  isStrongLessonEvidence,
  findMatchingLesson,
  assessCompatibilityDecision
} = require(path.join(root, "lib", "drafting.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const MAESA = "profile-maesa-tech";

/* ---- page.tsx selection glue (same copies as bug008-retrieval-probe) ---- */
function isStrongLessonMatch(lessonMatch) { return isStrongLessonEvidence(lessonMatch); }
function selectPreferredMatch(ticket, matches) {
  if (matches.length === 0) return null;
  const annotated = matches.map((match) => ({ match, lessonMatch: findMatchingLesson(ticket, match.item) }));
  const lessonBacked = annotated.filter((entry) => isStrongLessonMatch(entry.lessonMatch));
  const pool = lessonBacked.length > 0 ? lessonBacked : annotated;
  const topScore = Math.max(...pool.map((entry) => entry.match.matchScore));
  const relevantCluster = pool.filter((entry) => entry.match.matchScore >= topScore - 10);
  return relevantCluster.reduce((best, current) => {
    const bestTrust = best.match.item.trustScore ?? 0;
    const currentTrust = current.match.item.trustScore ?? 0;
    if (currentTrust !== bestTrust) return currentTrust > bestTrust ? current : best;
    const bestLessonScore = best.lessonMatch?.score ?? 0;
    const currentLessonScore = current.lessonMatch?.score ?? 0;
    if (currentLessonScore !== bestLessonScore) return currentLessonScore > bestLessonScore ? current : best;
    if (current.match.matchScore !== best.match.matchScore) return current.match.matchScore > best.match.matchScore ? current : best;
    return current;
  }, relevantCluster[0]);
}
function normalizeLessonSearchText(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}
function isLessonSearchCandidate(ticket, understanding, item, canonicalProblemTitle) {
  if (!item.lessons?.length) return false;
  if (!isCompatibleForDrafting(understanding, item, ticket)) return false;
  const targetTokens = new Set(normalizeLessonSearchText(`${canonicalProblemTitle} ${understanding.category}`));
  const itemTokens = normalizeLessonSearchText(`${item.canonicalProblemTitle ?? ""} ${item.title} ${item.category} ${item.tags.join(" ")}`);
  return itemTokens.some((token) => targetTokens.has(token));
}
function moveMatchToFront(matches, matchId) {
  if (!matchId) return matches;
  return [...matches.filter((m) => m.item.id === matchId), ...matches.filter((m) => m.item.id !== matchId)];
}
function withPreDiscriminationLessonMatches(ticket, understanding, matches, items, canonicalProblemTitle) {
  const lessonMatches = items
    .filter((item) => isLessonSearchCandidate(ticket, understanding, item, canonicalProblemTitle))
    .map((item) => ({ item, lessonMatch: findMatchingLesson(ticket, item) }))
    .filter((entry) => isStrongLessonMatch(entry.lessonMatch));
  if (lessonMatches.length === 0) return matches;
  const best = lessonMatches.reduce((winner, current) => {
    if (current.lessonMatch.score !== winner.lessonMatch.score) return current.lessonMatch.score > winner.lessonMatch.score ? current : winner;
    return (current.item.trustScore ?? 0) > (winner.item.trustScore ?? 0) ? current : winner;
  }, lessonMatches[0]);
  const existing = matches.find((m) => m.item.id === best.item.id);
  const boosted = {
    item: best.item,
    matchScore: Math.max(existing?.matchScore ?? 0, 95),
    matchReason: "Validated lesson match (pre-discrimination).",
    matchedTags: existing?.matchedTags ?? [],
    matchedKeywords: best.lessonMatch.matchedSignals.slice(0, 4),
    matchedCategory: best.item.category
  };
  return moveMatchToFront([boosted, ...matches.filter((m) => m.item.id !== best.item.id)], best.item.id);
}
/* ------------------------------------------------------------------------ */

function ticketOf(subject, description) {
  return {
    id: "todo011-probe",
    customerName: "Probe Customer",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

// Markers of charge-dispute / payment-investigation specificity.
const DISPUTE_MARKERS = [
  "pending authorization", "reverses automatically", "charged twice", "duplicate charge",
  "failed transaction", "3-5 business days", "bank app", "do not retry", "avoid retrying",
  "review the charge", "billed amount", "payment error"
];
// Markers of invoice-retrieval specificity.
const INVOICE_MARKERS = ["invoice number", "invoice reference", "invoice or order details"];

function markersIn(text, markers) {
  const lower = text.toLowerCase();
  return markers.filter((marker) => lower.includes(marker));
}

async function main() {
  const persistedProfile = await service.getOrganizationProfile(MAESA);
  const seedProfile = seedOrganizationProfiles.find((candidate) => candidate.id === MAESA);
  assert.ok(seedProfile, "Seed Maesa profile must exist for deterministic isolation");
  const persistedVocabularyAvailable = persistedProfile.supportedDomains.length > 0 && persistedProfile.businessVocabulary.length > 0;
  const profile = persistedVocabularyAvailable ? persistedProfile : seedProfile;
  if (!persistedVocabularyAvailable) {
    console.warn("MATURE_PROFILE_WARNING: Maesa PostgreSQL vocabulary is empty; Billing logic is running read-only with the checked-in Maesa profile. Current runtime profile drift remains a separate failure.");
  }
  const knowledgeItems = await service.loadKnowledge(MAESA);
  console.log(`Loaded Maesa READ-ONLY: ${knowledgeItems.length} knowledge items.\n`);
  const failures = [];

  const cases = [
    ["A billing-profile update", "Update the company details on our billing account",
      "Hello, our company was renamed and we moved offices. I need to change the company name and billing address on my account so everything is registered correctly going forward.",
      { category: "Billing", intent: "billing_charge_issue", canonical: "Billing & Charge Issue", dispute: false, invoice: false }],
    ["B duplicate charge", "Charged twice for the same subscription",
      "I was charged twice for the same subscription this month. Two identical charges appear for one renewal. Please fix the duplicate charge.",
      { category: "Billing", intent: "billing_charge_issue", canonical: "Billing & Charge Issue", dispute: true, invoice: false }],
    ["C refund request", "Refund request after cancellation",
      "I cancelled my subscription and would like to request a refund for the unused months remaining on my plan.",
      { category: "Refund", intent: "refund_request", canonical: "Refund Request", dispute: false, invoice: false }],
    ["D invoice request", "Copy of last month's invoice",
      "Can you send me a copy of last month's invoice? I cannot find it in my inbox and need it for our records.",
      { category: "Billing", intent: "invoice_question", canonical: "Billing & Invoice Issue", dispute: false, invoice: true }],
    ["E payment failure", "Payment keeps failing on renewal",
      "My payment keeps failing when I try to renew my subscription. The card is valid but the transaction does not go through.",
      { category: "Billing", intent: "payment_authorization_confusion", canonical: "Payment Authorization Confusion", dispute: false, invoice: false }]
  ];

  for (const [label, subject, description, expectation] of cases) {
    const ticket = ticketOf(subject, description);
    const und = understandForProfile(ticket, profile);
    const canonical = identifyCanonicalProblem(und, profile);
    const raw = retrieveMemory(und, knowledgeItems, new Set());
    const matches = withPreDiscriminationLessonMatches(ticket, und, raw, knowledgeItems, canonical.title);
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(und, m.item, ticket));
    const selected = compatibleMatches.length > 0 ? selectPreferredMatch(ticket, compatibleMatches) : null;
    const topMatch = selected?.match ?? null;
    const draft = draftResponse(ticket, und, topMatch, profile, false);

    console.log(`=== ${label} ===`);
    console.log(`ticket: "${subject}"`);
    console.log(`category=${und.category} intent=${und.intent ?? "-"}`);
    console.log(`canonical: ${canonical.title}`);
    console.log(`top retrieval: ${raw[0] ? `${raw[0].item.id}(${raw[0].matchScore}%)` : "none"}`);
    if (topMatch) {
      const decision = assessCompatibilityDecision(und, topMatch.item, ticket);
      const lesson = findMatchingLesson(ticket, topMatch.item);
      console.log(`selected item: ${topMatch.item.id}(${topMatch.matchScore}%) decision=${decision.state}`);
      console.log(`lesson match: ${lesson ? `score=${lesson.score} multiToken=${lesson.multiTokenMatches} strong=${isStrongLessonEvidence(lesson)} title="${lesson.lesson.title ?? lesson.lesson.rootCause.slice(0, 70)}" signals=[${lesson.matchedSignals.join("; ")}]` : "none"}`);
    } else {
      const decision = raw[0] ? assessCompatibilityDecision(und, raw[0].item, ticket) : null;
      console.log(`selected item: none (top raw candidate decision=${decision?.state ?? "n/a"}: ${decision?.reason ?? ""})`);
    }
    console.log(`draft source=${draft.source} basedOn=[${draft.basedOnKnowledgeIds.join(",")}]`);
    console.log(`confidenceNote: ${draft.confidenceNote.slice(0, 160)}`);
    const disputeHits = markersIn(draft.draftResponse, DISPUTE_MARKERS);
    const invoiceHits = markersIn(draft.draftResponse, INVOICE_MARKERS);
    console.log(`draft (first 340 chars): ${draft.draftResponse.replace(/\s+/g, " ").slice(0, 340)}`);
    console.log(`dispute-specific markers in draft: [${disputeHits.join("; ")}]`);
    console.log(`invoice-specific markers in draft: [${invoiceHits.join("; ")}]`);
    if (und.category !== expectation.category) {
      failures.push(`${label}: CLASSIFICATION_FAILURE expected=${expectation.category} actual=${und.category}`);
    }
    if (und.intent !== expectation.intent) {
      failures.push(`${label}: CLASSIFICATION_FAILURE expectedIntent=${expectation.intent} actual=${und.intent ?? "none"}`);
    }
    if (canonical.title !== expectation.canonical) {
      failures.push(`${label}: CANONICAL_MAPPING_FAILURE expected=${expectation.canonical} actual=${canonical.title}`);
    }
    if (topMatch?.item.category === "Subscription") {
      failures.push(`${label}: IRRELEVANT_FALLBACK selected unrelated Subscription knowledge`);
    }
    // Relevance flags apply to FALLBACK guidance only. A validated
    // lesson-informed draft is human-approved specific content (category 1:
    // correct specific reuse), even when its wording mentions invoices.
    const isValidatedLessonDraft = draft.confidenceNote.startsWith("Lesson-informed");
    if (!isValidatedLessonDraft && !expectation.dispute && disputeHits.length > 0 && draft.source !== "no_template") {
      console.log(">>> RELEVANCE FLAG: non-dispute billing intent received dispute-specific fallback guidance");
      failures.push(`${label}: IRRELEVANT_FALLBACK non-dispute intent received dispute-specific guidance`);
    }
    if (!isValidatedLessonDraft && !expectation.invoice && !expectation.dispute && invoiceHits.length > 0 && draft.source !== "no_template") {
      console.log(">>> RELEVANCE FLAG: non-invoice billing intent received invoice-specific fallback guidance");
      failures.push(`${label}: IRRELEVANT_FALLBACK non-invoice intent received invoice-specific guidance`);
    }
    console.log("");
  }
  if (failures.length > 0) {
    console.error(`TODO-011 FAILURES:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
  console.log("Read-only probe complete; no data was written.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
