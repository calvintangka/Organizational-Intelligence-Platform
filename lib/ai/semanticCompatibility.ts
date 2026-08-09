/**
 * TODO-009 Step 2 — semantic compatibility fallback for BUG-008.
 *
 * When the deterministic root-cause gate returns "unknown" (evidence merely
 * insufficient — NOT a contradiction or a known-family mismatch), this module
 * asks the existing AI discrimination layer whether the ticket describes the
 * same underlying problem as one of the item's validated lessons.
 *
 * Fail-closed by construction:
 * - never consulted when the deterministic decision is compatible/incompatible,
 * - never runs for Uncategorized/General tickets,
 * - lessons the ticket explicitly contradicts are never offered to the LLM,
 * - a provider failure aborts immediately with no authorization,
 * - only an explicit `isDistinctFromMatch: false` with explicit "high"
 *   confidence authorizes reuse (the provider normalizes malformed confidence
 *   to "medium", so malformed output can never authorize),
 * - the resulting authorization is re-verified inside drafting
 *   (authorizeSemanticLessonReuse) before any draft is produced.
 */
import type { AIProvider, AIProviderResult } from "@/lib/ai/types";
import type { KnowledgeItem, Lesson, MatchDiscriminationResult, Ticket } from "@/types";
import type { Understanding } from "@/types/oip";
import {
  assessCompatibilityDecision,
  findMatchingLesson,
  markSemanticLessonAuthorization,
  ticketContradictsLesson,
  type SemanticLessonAuthorization
} from "@/lib/drafting";

const MAX_LESSONS_EVALUATED = 6;

export interface SemanticCompatibilityEvaluation {
  authorization: SemanticLessonAuthorization | null;
  /** Every provider result produced, for AI metrics/diagnostics recording. */
  aiResults: Array<AIProviderResult<MatchDiscriminationResult>>;
  /** Why no authorization was produced (for logging); null when authorized. */
  declineReason: string | null;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

/** Order lessons most-plausible-first so the confirming call happens early. */
function rankLessonsByOverlap(lessons: Lesson[], ticketText: string): Lesson[] {
  const ticketTokens = tokenize(ticketText);
  return [...lessons]
    .map((lesson) => {
      const lessonTokens = tokenize(`${lesson.title ?? ""} ${lesson.rootCause} ${lesson.solution} ${lesson.signals.join(" ")}`);
      let overlap = 0;
      for (const token of lessonTokens) if (ticketTokens.has(token)) overlap += 1;
      return { lesson, overlap };
    })
    .sort((left, right) => right.overlap - left.overlap)
    .map((entry) => entry.lesson);
}

export async function evaluateSemanticLessonCompatibility(
  provider: AIProvider,
  ticket: Ticket,
  understanding: Understanding,
  item: KnowledgeItem
): Promise<SemanticCompatibilityEvaluation> {
  const none = (declineReason: string, aiResults: SemanticCompatibilityEvaluation["aiResults"] = []) =>
    ({ authorization: null, aiResults, declineReason });

  // Semantic fallback resolves ONLY the deterministic "unknown" state. A
  // compatible item does not need it; an incompatible item is a hard veto.
  if (understanding.category === "Uncategorized" || understanding.category === "General") {
    return none("Ticket category is unclassified; semantic fallback is not permitted.");
  }
  const decision = assessCompatibilityDecision(understanding, item, ticket);
  if (decision.state !== "unknown") {
    return none(`Deterministic decision is "${decision.state}"; semantic fallback only resolves "unknown".`);
  }

  // Semantic confirmation may resolve an ambiguous root cause, but it must
  // still start from a real lesson signal on the selected item. Without this
  // floor an AI response could authorize an arbitrary first lesson on a
  // merely category-compatible candidate that had no retrieval evidence.
  if (!findMatchingLesson(ticket, item)) {
    return none("No deterministic lesson signal exists on the selected candidate; semantic fallback is not permitted, failing closed.");
  }

  const candidates = rankLessonsByOverlap(
    (item.lessons ?? []).filter((lesson) => lesson.id && !ticketContradictsLesson(ticket, lesson)),
    `${ticket.subject} ${ticket.description}`
  ).slice(0, MAX_LESSONS_EVALUATED);
  if (candidates.length === 0) {
    return none("The knowledge item has no validated lessons eligible for semantic evaluation.");
  }

  const aiResults: SemanticCompatibilityEvaluation["aiResults"] = [];
  for (const lesson of candidates) {
    const result = await provider.discriminateMatch({
      ticket,
      matchedCanonicalTitle: lesson.title ?? item.canonicalProblemTitle ?? item.title,
      matchedProblemSummary: lesson.rootCause,
      matchedLesson: {
        title: lesson.title,
        rootCause: lesson.rootCause,
        signals: lesson.signals
      },
      deterministicUnderstanding: understanding
    });
    aiResults.push(result);

    if (!result.ok || !result.data) {
      // Provider chain exhausted (unavailable/timeout/malformed transport):
      // abort immediately and fail closed rather than retrying per lesson.
      return none(`AI discrimination unavailable (${result.error ?? "unknown error"}); failing closed.`, aiResults);
    }
    if (result.data.isDistinctFromMatch === false && result.data.confidence === "high") {
      return {
        authorization: markSemanticLessonAuthorization({
          itemId: item.id,
          lessonId: lesson.id,
          confidence: "high",
          reasoning: result.data.reasoning
        }),
        aiResults,
        declineReason: null
      };
    }
    // Distinct, low, or medium confidence (medium is also the malformed-output
    // default): not this lesson — try the next candidate.
  }

  return none("No validated lesson was confirmed as the same underlying problem with high confidence.", aiResults);
}
