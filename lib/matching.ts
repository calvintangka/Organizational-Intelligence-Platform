import type { AIAnalysis, KnowledgeItem, KnowledgeMatch } from "@/types";

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function findSimilarKnowledge(
  analysis: AIAnalysis,
  knowledgeItems: KnowledgeItem[]
): KnowledgeMatch[] {
  const analysisKeywords = new Set(tokenize(`${analysis.summary} ${analysis.coreProblem} ${analysis.category}`));

  return knowledgeItems
    .map((item) => {
      const categoryMatch = item.category.toLowerCase() === analysis.category.toLowerCase();
      const overlappingTags = item.tags.filter((tag) => analysis.suggestedTags.includes(tag));
      const itemKeywords = tokenize(`${item.title} ${item.problem} ${item.approvedAnswer}`);
      const overlappingKeywords = itemKeywords.filter((keyword) => analysisKeywords.has(keyword));
      const isCreatedFromCurrentTicket = item.sourceTicketId === analysis.ticketId;
      const matchScore =
        (categoryMatch ? 55 : 0) +
        Math.min(overlappingTags.length * 10, 30) +
        Math.min(overlappingKeywords.length * 3, 15) +
        (isCreatedFromCurrentTicket ? 10 : 0);

      const reasons = [
        categoryMatch ? `category "${item.category}"` : "",
        overlappingTags.length > 0 ? `tags: ${overlappingTags.join(", ")}` : "",
        overlappingKeywords.length > 0 ? `keywords: ${overlappingKeywords.slice(0, 4).join(", ")}` : "",
        isCreatedFromCurrentTicket ? "created from the first approved ticket" : ""
      ].filter(Boolean);

      return {
        item,
        matchScore: Math.min(matchScore, 100),
        matchReason: reasons.length > 0 ? `Matched ${reasons.join("; ")}.` : "No strong match found."
      };
    })
    .filter((match) => match.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

export const findSeedKnowledgeMatches = findSimilarKnowledge;
