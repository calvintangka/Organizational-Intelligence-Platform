import type { Ticket } from "@/types";
import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch } from "@/types";
import {
  findMatchingLesson,
  isCompatibleForDrafting,
  isStrongLessonEvidence,
  type LessonMatchResult
} from "@/lib/drafting";

/**
 * Production lesson-selection glue (TODO-023).
 *
 * These functions decide WHICH candidate KnowledgeMatch (and which of its
 * validated lessons) drives drafting, on top of the per-lesson gates owned by
 * lib/drafting.ts. They were previously defined inside app/page.tsx and copied
 * verbatim into the BUG-008 retrieval probe; this module is now the single
 * authoritative implementation used by both the app and the regression probes.
 *
 * Everything here is pure: explicit inputs, explicit outputs, no React state.
 */

export interface MatchWithLesson {
  match: KnowledgeMatch;
  lessonMatch: LessonMatchResult | null;
}

// TODO-009 Step 3: strength requires multi-token signal evidence — see
// isStrongLessonEvidence in lib/drafting.ts. Generic one-word overlaps
// ("webhook", "integration") never count as a strong lesson match.
export function isStrongLessonMatch(lessonMatch: LessonMatchResult | null | undefined): lessonMatch is LessonMatchResult {
  return isStrongLessonEvidence(lessonMatch);
}

export function buildDiscriminationLessonPayload(lessonMatch: LessonMatchResult) {
  return {
    title: lessonMatch.lesson.title,
    rootCause: lessonMatch.lesson.rootCause,
    signals: lessonMatch.matchedSignals,
    customerResponse: lessonMatch.lesson.customerResponse
  };
}

export function selectPreferredMatch(ticket: Ticket, matches: KnowledgeMatch[]): MatchWithLesson | null {
  if (matches.length === 0) return null;

  const annotated = matches.map((match) => ({
    match,
    lessonMatch: findMatchingLesson(ticket, match.item)
  }));
  const lessonBacked = annotated.filter((entry) => isStrongLessonMatch(entry.lessonMatch));
  const pool = lessonBacked.length > 0 ? lessonBacked : annotated;
  const topScore = Math.max(...pool.map((entry) => entry.match.matchScore));
  const relevantCluster = pool.filter((entry) => entry.match.matchScore >= topScore - 10);

  // TODO-029 relevance order: lesson signal count, multi-token specificity,
  // ticket-evidence coverage, canonical retrieval strength, stable item id.
  // Trust is confidence in the winner and must never participate here.
  return relevantCluster.reduce((best, current) => {
    const bestLessonScore = best.lessonMatch?.score ?? 0;
    const currentLessonScore = current.lessonMatch?.score ?? 0;
    if (currentLessonScore !== bestLessonScore) return currentLessonScore > bestLessonScore ? current : best;

    const bestMultiToken = best.lessonMatch?.multiTokenMatches ?? 0;
    const currentMultiToken = current.lessonMatch?.multiTokenMatches ?? 0;
    if (currentMultiToken !== bestMultiToken) return currentMultiToken > bestMultiToken ? current : best;

    const bestCoverage = best.lessonMatch?.ticketEvidenceCoverage ?? 0;
    const currentCoverage = current.lessonMatch?.ticketEvidenceCoverage ?? 0;
    if (currentCoverage !== bestCoverage) return currentCoverage > bestCoverage ? current : best;

    if (current.match.matchScore !== best.match.matchScore) return current.match.matchScore > best.match.matchScore ? current : best;
    return current.match.item.id.localeCompare(best.match.item.id) < 0 ? current : best;
  }, relevantCluster[0]);
}

function normalizeLessonSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function isLessonSearchCandidate(
  ticket: Ticket,
  understanding: Understanding,
  item: KnowledgeItem,
  canonicalProblemTitle: string
): boolean {
  if (!item.lessons?.length) return false;
  if (!isCompatibleForDrafting(understanding, item, ticket)) return false;

  const targetTokens = new Set(normalizeLessonSearchText(`${canonicalProblemTitle} ${understanding.category}`));
  const itemTokens = normalizeLessonSearchText(
    `${item.canonicalProblemTitle ?? ""} ${item.title} ${item.category} ${item.tags.join(" ")}`
  );
  return itemTokens.some((token) => targetTokens.has(token));
}

export function withPreDiscriminationLessonMatches(
  ticket: Ticket,
  understanding: Understanding,
  matches: KnowledgeMatch[],
  items: KnowledgeItem[],
  canonicalProblemTitle: string
): KnowledgeMatch[] {
  const lessonMatches = items
    .filter((item) => isLessonSearchCandidate(ticket, understanding, item, canonicalProblemTitle))
    .map((item) => ({ item, lessonMatch: findMatchingLesson(ticket, item) }))
    .filter((entry): entry is { item: KnowledgeItem; lessonMatch: LessonMatchResult } => isStrongLessonMatch(entry.lessonMatch));

  if (lessonMatches.length === 0) return matches;

  // The pre-discrimination winner uses the same intrinsic lesson evidence and
  // stable identity fallback as the final selector; trust is deliberately absent.
  const best = lessonMatches.reduce((winner, current) => {
    if (current.lessonMatch.score !== winner.lessonMatch.score) {
      return current.lessonMatch.score > winner.lessonMatch.score ? current : winner;
    }
    if (current.lessonMatch.multiTokenMatches !== winner.lessonMatch.multiTokenMatches) {
      return current.lessonMatch.multiTokenMatches > winner.lessonMatch.multiTokenMatches ? current : winner;
    }
    if (current.lessonMatch.ticketEvidenceCoverage !== winner.lessonMatch.ticketEvidenceCoverage) {
      return current.lessonMatch.ticketEvidenceCoverage > winner.lessonMatch.ticketEvidenceCoverage ? current : winner;
    }
    return current.item.id.localeCompare(winner.item.id) < 0 ? current : winner;
  }, lessonMatches[0]);

  const existing = matches.find((match) => match.item.id === best.item.id);
  const lessonLabel = best.lessonMatch.lesson.title ?? best.lessonMatch.lesson.rootCause;
  const lessonBackedMatch: KnowledgeMatch = {
    item: best.item,
    matchScore: Math.max(existing?.matchScore ?? 0, 95),
    matchReason: `Validated lesson match - "${lessonLabel}" matched before AI discrimination via signals: ${best.lessonMatch.matchedSignals.join(", ")}.`,
    matchedTags: existing?.matchedTags ?? [],
    matchedKeywords: best.lessonMatch.matchedSignals.slice(0, 4),
    matchedCategory: best.item.category
  };

  return moveMatchToFront(
    [lessonBackedMatch, ...matches.filter((match) => match.item.id !== best.item.id)],
    best.item.id
  );
}

export function moveMatchToFront(matches: KnowledgeMatch[], matchId?: string): KnowledgeMatch[] {
  if (!matchId) return matches;
  return [
    ...matches.filter((match) => match.item.id === matchId),
    ...matches.filter((match) => match.item.id !== matchId)
  ];
}

export function stripRejectedMatch(matches: KnowledgeMatch[], matchId?: string): KnowledgeMatch[] {
  if (!matchId) return matches;
  return matches.filter((match) => match.item.id !== matchId);
}
