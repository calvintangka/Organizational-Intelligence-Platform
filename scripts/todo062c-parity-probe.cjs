const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { parseBulkUploadFile, analyzeBulkEntries } = require(path.join(root, "lib", "bulkUpload.ts"));
const { assessBusinessRelevanceForProfile, routeBusinessInquiryUnderstanding, understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { detectLanguage } = require(path.join(root, "lib", "languageDetection.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));

const ORG = "profile-oip-developer-demo";
const FIXTURE = path.join(root, "tmp", "TODO-062B-developer-bulk.csv");

function makeTicket(entry) {
  return {
    id: `bulk-ticket-${entry.id}`,
    customerName: "Bulk Upload",
    subject: entry.message.length > 80 ? `${entry.message.slice(0, 80)}…` : entry.message,
    description: entry.message,
    category: "General",
    status: "new",
    createdAt: "2026-07-29T00:00:00.000Z"
  };
}

function singleResult(entry, profile, knowledgeItems) {
  const ticket = makeTicket(entry);
  const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, profile);
  const originalUnderstanding = understandForProfile(ticket, profile);
  const routed = routeBusinessInquiryUnderstanding(originalUnderstanding);
  const canonical = routed.canonicalProblem
    ? { id: `canonical-${routed.canonicalProblem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title: routed.canonicalProblem.title, problemSummary: routed.canonicalProblem.problemSummary, category: routed.canonicalProblem.category, tags: routed.understanding.tags }
    : identifyCanonicalProblem(routed.understanding, profile);
  const rawMatches = relevance.status === "out_of_scope" ? [] : retrieveMemory(routed.understanding, knowledgeItems);
  const matches = withPreDiscriminationLessonMatches(ticket, routed.understanding, rawMatches, knowledgeItems, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(routed.understanding, match.item, ticket));
  const selected = compatible.length > 0 ? selectPreferredMatch(ticket, compatible) : null;
  return {
    category: routed.understanding.category,
    canonical: canonical.title,
    language: detectLanguage(entry.message).language,
    memoryId: selected?.match.item.id ?? null,
    memoryTitle: selected?.match.item.canonicalProblemTitle ?? selected?.match.item.title ?? null,
    lessonId: selected?.lessonMatch?.lesson.id ?? null,
    relevance: relevance.status
  };
}

async function main() {
  const profile = await persistence.getOrganizationProfile(ORG);
  const knowledgeItems = await persistence.loadKnowledge(ORG);
  const parsed = parseBulkUploadFile(path.basename(FIXTURE), fs.readFileSync(FIXTURE, "utf8"));
  const aiAdapter = {
    config: { mode: "disabled" },
    provider: { label: "Disabled", mode: "disabled" }
  };
  const bulk = await analyzeBulkEntries({ entries: parsed.entries, organizationProfile: profile, knowledgeItems, aiAdapter });
  const bulkByEntry = new Map();
  const unclusteredEntryIds = new Set(bulk.unclustered.items.map((item) => item.entry.id));
  for (const cluster of bulk.clusters) for (const item of cluster.items) bulkByEntry.set(item.entry.id, item);
  for (const item of bulk.unclustered.items) bulkByEntry.set(item.entry.id, item);
  const rows = parsed.entries.map((entry, index) => {
    const bulkItem = bulkByEntry.get(entry.id);
    const single = singleResult(entry, profile, knowledgeItems);
    return {
      index: index + 1,
      entryId: entry.id,
      expectedCategory: Math.floor(index / 10) + 1,
      bulk: {
        category: bulkItem?.understanding.category ?? null,
        canonical: bulkItem?.canonicalProblem.title ?? null,
        memoryId: bulkItem?.existingMatch?.item.id ?? null,
        memoryTitle: bulkItem?.existingMatch?.item.canonicalProblemTitle ?? bulkItem?.existingMatch?.item.title ?? null,
        lessonId: bulkItem?.retrievedLessonId ?? null,
        cluster: unclusteredEntryIds.has(entry.id) ? "unclustered" : (bulkItem?.existingMatch ? "existing" : "new"),
        language: detectLanguage(entry.message).language
      },
      single,
      parity: {
        classification: bulkItem?.understanding.category === single.category,
        canonical: bulkItem?.canonicalProblem.title === single.canonical,
        memory: (bulkItem?.existingMatch?.item.id ?? null) === single.memoryId,
        lesson: (bulkItem?.retrievedLessonId ?? null) === single.lessonId,
        language: detectLanguage(entry.message).language === single.language
      }
    };
  });
  const summary = {
    fixtureRows: rows.length,
    bulkClusters: bulk.clusters.length,
    bulkUnclustered: bulk.unclustered.count,
    categoryParity: rows.filter((row) => row.parity.classification).length,
    canonicalParity: rows.filter((row) => row.parity.canonical).length,
    memoryParity: rows.filter((row) => row.parity.memory).length,
    lessonParity: rows.filter((row) => row.parity.lesson).length,
    languageParity: rows.filter((row) => row.parity.language).length,
    bulkMemoryHits: rows.filter((row) => row.bulk.memoryId).length,
    singleMemoryHits: rows.filter((row) => row.single.memoryId).length,
    bulkLessonHits: rows.filter((row) => row.bulk.lessonId).length,
    mismatches: rows.filter((row) => !row.parity.classification || !row.parity.canonical || !row.parity.memory)
  };
  console.log(JSON.stringify({ summary, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
