import type { SuggestedResponse } from "@/types";

/**
 * Keep response copy aligned with the authoritative grounding identifiers.
 * Provider usage alone is not evidence that organizational memory was used.
 * The organization profile is the one intentional grounding path that does
 * not carry a KnowledgeItem id.
 */
export function reconcileGroundingForPresentation(response: SuggestedResponse | null): SuggestedResponse | null {
  if (!response) return null;

  const hasAuthorizedGrounding =
    response.basedOnKnowledgeIds.length > 0 || response.groundingLabel === "organization profile";

  if ((response.draftMode === "memory_grounded" || response.draftMode === "lesson_grounded") && !hasAuthorizedGrounding) {
    return {
      ...response,
      draftMode: "cold_start",
      groundingLabel: "no organizational knowledge"
    };
  }

  return response;
}
