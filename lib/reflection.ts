import type { DraftGroundingMode, Lesson, ReflectionDecision } from "@/types";
import type { Understanding } from "@/types/oip";
import type { CanonicalProblemMatch } from "@/lib/canonicalProblemEngine";

const STOP_WORDS = new Set([
  "that", "with", "this", "from", "have", "will", "been", "your", "their",
  "what", "when", "into", "they", "also", "more", "some", "were", "then",
  "just", "over", "only", "such", "both", "each", "most", "very", "well",
  "even", "much", "back", "still", "here", "there", "after", "before",
  "other", "which", "these", "those", "where", "while", "about", "would",
  "could", "should", "shall", "might", "please", "thank", "hello", "dear"
]);

function meaningfulWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\b\w{4,}\b/g) ?? []).filter((w) => !STOP_WORDS.has(w)));
}

function wordOverlapPct(a: string, b: string): number {
  const aWords = meaningfulWords(a);
  const bWords = meaningfulWords(b);
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let shared = 0;
  for (const w of aWords) {
    if (bWords.has(w)) shared++;
  }
  return Math.round((shared / Math.min(aWords.size, bWords.size)) * 100);
}

export function generateReflection(
  und: Understanding,
  reviewedResponse: string,
  existingMatch: CanonicalProblemMatch | null,
  groundingSource?: {
    draftMode?: DraftGroundingMode;
    matchedLesson?: Lesson | null;
  }
): ReflectionDecision {
  if (und.category === "Uncategorized" && !existingMatch) {
    return {
      isLearningEvent: true,
      action: "create_new",
      rationale: "No existing category matched this ticket with sufficient confidence. Human review must name the problem, author the first validated response, and capture the lesson that will teach the organization how to handle this issue next time.",
      problemNameRequired: true,
      trustImpact: "increase",
      estimatedTrustDelta: 0
    };
  }

  if (!existingMatch) {
    return {
      isLearningEvent: true,
      action: "create_new",
      rationale: `No existing knowledge covers "${und.category}" issues with these signals. This resolution creates the organization's first approved knowledge entry for this problem type.`,
      trustImpact: "increase",
      estimatedTrustDelta: 0
    };
  }

  const item = existingMatch.item;
  const similarity = existingMatch.similarity;
  const itemTitle = item.canonicalProblemTitle ?? item.title;
  const existingTemplate =
    groundingSource?.draftMode === "lesson_grounded" && groundingSource.matchedLesson?.customerResponse
      ? groundingSource.matchedLesson.customerResponse
      : item.customerResponseTemplate ?? item.approvedAnswer ?? "";
  const responseOverlap = wordOverlapPct(reviewedResponse, existingTemplate);

  if (similarity >= 80) {
    if (responseOverlap >= 70) {
      return {
        isLearningEvent: false,
        action: "trust_update_only",
        rationale: `This resolution closely matches the known solution "${itemTitle}" (${similarity}% similarity) and the approved response aligns well with the stored answer (${responseOverlap}% word overlap). The organization already handles this correctly - trust increases through confirmation, no new knowledge entry needed.`,
        existingItemId: item.id,
        existingItemTitle: itemTitle,
        existingItemSimilarity: similarity,
        trustImpact: "increase",
        estimatedTrustDelta: 5
      };
    }

    return {
      isLearningEvent: true,
      action: "create_version",
      rationale: `This ticket matches the known solution "${itemTitle}" (${similarity}% similarity), but the human-approved response differs meaningfully from the stored answer (${responseOverlap}% word overlap). The organization has learned a better approach - a new version is recorded to preserve this improvement.`,
      existingItemId: item.id,
      existingItemTitle: itemTitle,
      existingItemSimilarity: similarity,
      versionReason: `Human reviewer provided a ${responseOverlap < 40 ? "substantially" : "meaningfully"} different response (${responseOverlap}% overlap with existing template).`,
      trustImpact: responseOverlap < 30 ? "reset_partial" : "increase",
      estimatedTrustDelta: responseOverlap < 30 ? -8 : 3
    };
  }

  if (responseOverlap < 40) {
    return {
      isLearningEvent: true,
      action: "create_version",
      rationale: `This ticket partially matches "${itemTitle}" (${similarity}% similarity), but the human-approved response differs substantially from the stored template (${responseOverlap}% word overlap - more than 60% of the text changed). This level of divergence suggests the organization has found a better resolution approach worth preserving as a new version.`,
      existingItemId: item.id,
      existingItemTitle: itemTitle,
      existingItemSimilarity: similarity,
      versionReason: `Human reviewer provided a substantially different response (${responseOverlap}% overlap with existing template - heavy edit threshold triggered).`,
      trustImpact: responseOverlap < 20 ? "reset_partial" : "increase",
      estimatedTrustDelta: responseOverlap < 20 ? -5 : 2
    };
  }

  return {
    isLearningEvent: true,
    action: "merge_existing",
    rationale: `This ticket partially matches the known solution "${itemTitle}" (${similarity}% similarity). Adding it as supporting evidence confirms the pattern holds in more situations, without creating a separate version.`,
    existingItemId: item.id,
    existingItemTitle: itemTitle,
    existingItemSimilarity: similarity,
    trustImpact: "increase",
    estimatedTrustDelta: 3
  };
}
