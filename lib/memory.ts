import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch } from "@/types";
import { withCanonicalProblemDefaults } from "@/lib/canonicalProblemEngine";

const RETRIEVAL_STOPWORDS = new Set([
  "and", "are", "for", "from", "has", "have", "into", "not", "that", "the", "their", "this", "was", "were", "with"
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !RETRIEVAL_STOPWORDS.has(token));
}

export function retrieveMemory(
  understanding: Understanding,
  knowledgeItems: KnowledgeItem[],
  sessionCreatedIds: Set<string> = new Set()
): KnowledgeMatch[] {
  const analysisTokens = tokenize(
    `${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")}`
  );
  const analysisKeywords = new Set(analysisTokens);
  const normalizedAnalysis = analysisTokens.join(" ");

  const mapped = knowledgeItems
    .map((rawItem) => {
      const item = withCanonicalProblemDefaults(rawItem);
      const categoryMatch = item.category.toLowerCase() === understanding.category.toLowerCase();
      const matchedTags = item.tags.filter((tag) => understanding.tags.includes(tag));
      const itemKeywords = [...new Set(tokenize(
        `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.internalGuidance ?? ""} ${item.customerResponseTemplate ?? ""}`
      ))];
      const matchedKeywords = itemKeywords.filter((kw) => analysisKeywords.has(kw));
      const canonicalTitleTokens = tokenize(item.canonicalProblemTitle ?? item.title);
      const canonicalPhrase = canonicalTitleTokens.join(" ");
      const exactCanonicalPhrase = canonicalTitleTokens.length >= 2 && normalizedAnalysis.includes(canonicalPhrase);
      const isSessionCreated = sessionCreatedIds.has(item.id);
      const reuseBoost = Math.min(item.timesReused * 2, 8);

      const matchScore =
        (categoryMatch ? 55 : 0) +
        Math.min(matchedTags.length * 10, 30) +
        Math.min(matchedKeywords.length * 3, 12) +
        (exactCanonicalPhrase ? 20 : 0) +
        (isSessionCreated ? 8 : 0) +
        reuseBoost;

      const reasonParts = [
        categoryMatch ? `category match: "${item.category}"` : "",
        matchedTags.length > 0 ? `shared tags: ${matchedTags.join(", ")}` : "",
        matchedKeywords.length > 0 ? `keyword overlap: ${matchedKeywords.slice(0, 4).join(", ")}` : "",
        exactCanonicalPhrase ? `exact canonical phrase: "${item.canonicalProblemTitle ?? item.title}"` : "",
        isSessionCreated ? "newly created in this session" : "",
        typeof item.trustScore === "number" ? `trust ${item.trustScore}/100` : "",
        item.timesSeen ? `examples seen: ${item.timesSeen}` : "",
        item.knowledgeVersions?.length ? `knowledge versions: ${item.knowledgeVersions.length}` : "",
        item.timesReused > 0 ? `validated and reused ${item.timesReused}x before` : ""
      ].filter(Boolean);

      const matchReason =
        reasonParts.length > 0
          ? `Recall candidate — ${reasonParts.join("; ")}. Similarity does not confirm accuracy; human review required.`
          : "No strong match found.";

      return {
        item,
        matchScore: Math.min(matchScore, 100),
        matchReason,
        matchedTags,
        matchedKeywords: matchedKeywords.slice(0, 4),
        matchedCategory: categoryMatch ? item.category : null
      };
    })
    .filter((match) => match.matchScore > 0);

  // Deduplicate by canonical problem id — the same canonical problem must never
  // appear twice in retrieval. When duplicates exist, keep the better candidate.
  const byId = new Map<string, KnowledgeMatch>();
  for (const match of mapped) {
    const existing = byId.get(match.item.id);
    if (!existing || isBetterMatch(match, existing)) {
      byId.set(match.item.id, match);
    }
  }

  return [...byId.values()].sort((a, b) =>
    b.matchScore - a.matchScore || a.item.id.localeCompare(b.item.id)
  );
}

/**
 * "Better" means: higher intrinsic similarity, then more usage
 * (timesSeen / timesReused), then most recently used or updated. Trust remains
 * confidence metadata and is intentionally excluded from relevance (TODO-029).
 */
function isBetterMatch(candidate: KnowledgeMatch, current: KnowledgeMatch): boolean {
  if (candidate.matchScore !== current.matchScore) return candidate.matchScore > current.matchScore;

  const cUse = (candidate.item.timesSeen ?? 0) + (candidate.item.timesReused ?? 0);
  const rUse = (current.item.timesSeen ?? 0) + (current.item.timesReused ?? 0);
  if (cUse !== rUse) return cUse > rUse;

  const cTime = new Date(candidate.item.lastUsedAt ?? candidate.item.lastUpdated ?? 0).getTime();
  const rTime = new Date(current.item.lastUsedAt ?? current.item.lastUpdated ?? 0).getTime();
  return cTime > rTime;
}
