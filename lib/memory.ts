import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch } from "@/types";
import { withCanonicalProblemDefaults } from "@/lib/canonicalProblemEngine";

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function retrieveMemory(
  understanding: Understanding,
  knowledgeItems: KnowledgeItem[],
  sessionCreatedIds: Set<string> = new Set()
): KnowledgeMatch[] {
  const analysisKeywords = new Set(
    tokenize(`${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")}`)
  );

  const mapped = knowledgeItems
    .map((rawItem) => {
      const item = withCanonicalProblemDefaults(rawItem);
      const categoryMatch = item.category.toLowerCase() === understanding.category.toLowerCase();
      const matchedTags = item.tags.filter((tag) => understanding.tags.includes(tag));
      const itemKeywords = tokenize(
        `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.internalGuidance ?? ""} ${item.customerResponseTemplate ?? ""}`
      );
      const matchedKeywords = itemKeywords.filter((kw) => analysisKeywords.has(kw));
      const isSessionCreated = sessionCreatedIds.has(item.id);
      const reuseBoost = Math.min(item.timesReused * 2, 8);
      // Trusted, mature knowledge surfaces above brand-new candidates of equal similarity.
      const trustBoost = Math.min(Math.round((item.trustScore ?? 0) * 0.1), 10);

      const matchScore =
        (categoryMatch ? 55 : 0) +
        Math.min(matchedTags.length * 10, 30) +
        Math.min(matchedKeywords.length * 3, 12) +
        (isSessionCreated ? 8 : 0) +
        reuseBoost +
        trustBoost;

      const reasonParts = [
        categoryMatch ? `category match: "${item.category}"` : "",
        matchedTags.length > 0 ? `shared tags: ${matchedTags.join(", ")}` : "",
        matchedKeywords.length > 0 ? `keyword overlap: ${matchedKeywords.slice(0, 4).join(", ")}` : "",
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

  return [...byId.values()].sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * "Better" means: higher similarity, then higher trust, then more usage
 * (timesSeen / timesReused), then most recently used or updated.
 */
function isBetterMatch(candidate: KnowledgeMatch, current: KnowledgeMatch): boolean {
  if (candidate.matchScore !== current.matchScore) return candidate.matchScore > current.matchScore;

  const ct = candidate.item.trustScore ?? 0;
  const rt = current.item.trustScore ?? 0;
  if (ct !== rt) return ct > rt;

  const cUse = (candidate.item.timesSeen ?? 0) + (candidate.item.timesReused ?? 0);
  const rUse = (current.item.timesSeen ?? 0) + (current.item.timesReused ?? 0);
  if (cUse !== rUse) return cUse > rUse;

  const cTime = new Date(candidate.item.lastUsedAt ?? candidate.item.lastUpdated ?? 0).getTime();
  const rTime = new Date(current.item.lastUsedAt ?? current.item.lastUpdated ?? 0).getTime();
  return cTime > rTime;
}
