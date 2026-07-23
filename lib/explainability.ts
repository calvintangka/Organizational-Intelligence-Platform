import type { KnowledgeMatch, MatchExplainability, SuggestedResponse, Ticket } from "@/types";
import { findMatchingLesson, isStrongLessonEvidence } from "@/lib/drafting";
import { relevanceStrengthForScore } from "@/lib/relevanceLabels";

export function buildMatchExplainability(
  match: KnowledgeMatch | null,
  ticket: Ticket | null | undefined,
  response: SuggestedResponse | null | undefined
): MatchExplainability {
  if (!match) {
    return {
      relevance: "None",
      lessonEvidence: "None",
      authorized: false,
      decision: "No compatible Organizational Memory used",
      evidence: [],
      reason: "No compatible Organizational Memory was selected for this ticket."
    };
  }

  const lessonMatch = ticket ? findMatchingLesson(ticket, match.item) : null;
  const semanticLessonAuthorized = response?.draftMode === "lesson_grounded";
  const authorized = !!response
    && response.source !== "no_template"
    && response.basedOnKnowledgeIds.includes(match.item.id);
  const strongLessonEvidence = semanticLessonAuthorized || isStrongLessonEvidence(lessonMatch);
  const evidence: string[] = [];

  if (match.matchedCategory) evidence.push("Correct problem category");
  if (match.relevanceEvidence?.conceptMatches.length) {
    evidence.push("Problem-specific semantic evidence");
  }
  if (match.relevanceEvidence?.phrasePoints) evidence.push("Canonical phrase matched");
  if (match.matchedTags?.length) evidence.push(`Shared tags: ${match.matchedTags.slice(0, 3).join(", ")}`);
  if (match.matchedKeywords?.length) evidence.push(`Ticket terms support the canonical: ${match.matchedKeywords.slice(0, 3).join(", ")}`);
  if (lessonMatch && strongLessonEvidence) {
    evidence.push(`Validated lesson evidence: ${lessonMatch.matchedSignals.slice(0, 3).join(", ")}`);
  } else if (semanticLessonAuthorized) {
    evidence.push("Validated lesson authorized by high-confidence semantic compatibility");
  }
  if (authorized) evidence.push("Selected canonical ranked first among authorized candidates");

  const relevance = authorized && semanticLessonAuthorized
    ? "Strong"
    : relevanceStrengthForScore(match.matchScore);
  const lessonEvidence = strongLessonEvidence ? "Strong" : lessonMatch ? "Weak" : "None";
  const decision = authorized
    ? "Grounded Organizational Memory authorized"
    : "Not authorized for grounded reuse";

  return {
    relevance,
    lessonEvidence,
    authorized,
    decision,
    evidence,
    reason: authorized
      ? "The selected knowledge passed the existing deterministic authorization gates."
      : "Relevant knowledge was found, but the current-ticket evidence was not strong enough to authorize grounded reuse."
  };
}
