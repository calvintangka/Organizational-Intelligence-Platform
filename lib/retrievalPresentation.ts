import type { KnowledgeMatch, SuggestedResponse } from "@/types";

export type RetrievalPresentationState =
  | "NO_CANDIDATE"
  | "WEAK_CANDIDATE"
  | "UNGROUNDED_CANDIDATE"
  | "SCOPE_INCOMPATIBLE"
  | "HUMAN_REVIEW_REQUIRED"
  | "GROUNDED_REUSABLE";

export function deriveRetrievalPresentationState(
  match: KnowledgeMatch | null,
  response?: SuggestedResponse | null
): RetrievalPresentationState {
  if (!match) return "NO_CANDIDATE";

  const compatibilityReason = `${match.compatibilityReason ?? ""} ${match.matchReason}`.toLowerCase();
  if (/scope|firmware|out of scope|operational condition conflicts|domain conflict/.test(compatibilityReason)) {
    return "SCOPE_INCOMPATIBLE";
  }

  const grounded = response?.source !== "no_template"
    && response?.basedOnKnowledgeIds.includes(match.item.id) === true;
  if (!grounded) {
    return match.matchScore < 55 ? "WEAK_CANDIDATE" : "UNGROUNDED_CANDIDATE";
  }

  if (match.item.governanceState === "challenged" || match.item.autoResponseEligible === false || (match.item.trustScore ?? 20) < 80) {
    return "HUMAN_REVIEW_REQUIRED";
  }
  return "GROUNDED_REUSABLE";
}

export function retrievalPresentationCopy(state: RetrievalPresentationState): { title: string; body: string } {
  switch (state) {
    case "NO_CANDIDATE":
      return { title: "No relevant organizational memory found", body: "No relevant organizational memory candidate was selected. This response is a safe starting point and must be reviewed before sending or learning." };
    case "WEAK_CANDIDATE":
      return { title: "A related memory was found, but the match is too weak for grounded reuse", body: "The candidate is related at a broad symptom level, but its compatibility is insufficient to authorize grounded reuse. Human review remains required." };
    case "UNGROUNDED_CANDIDATE":
      return { title: "A relevant memory was found, but it is not sufficiently grounded", body: "A candidate exists, but its evidence or lesson grounding is insufficient to authorize reuse. Human review remains required." };
    case "SCOPE_INCOMPATIBLE":
      return { title: "A related memory exists, but its validated scope does not cover this situation", body: "The candidate remains inspectable history, but the current situation is outside its validated applicability boundary." };
    case "HUMAN_REVIEW_REQUIRED":
      return { title: "Grounded memory found; human review is required", body: "This memory passed the grounding boundary, but its trust or governance state does not authorize unattended reuse." };
    case "GROUNDED_REUSABLE":
      return { title: "Grounded organizational memory available", body: "This candidate passed the existing compatibility and grounding gates and may be reused within its governed scope." };
  }
}
