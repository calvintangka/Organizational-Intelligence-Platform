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

  // TODO-045: lesson evidence is evaluated only for the canonical retrieval
  // winner already at the front of this ordered list. A semantically similar
  // lesson on a lower-ranked sibling must not replace that canonical or turn a
  // related problem into an authorized response.
  const firstCanonicalId = matches[0].item.canonicalProblemId ?? matches[0].item.id;
  // Retrieval normally deduplicates this set. Keeping same-canonical ties in
  // the cluster preserves the stable-id tie-breaker without allowing a
  // different canonical sibling to replace the retrieval winner.
  const canonicalWinner = matches.filter(
    (match) => (match.item.canonicalProblemId ?? match.item.id) === firstCanonicalId
  );
  const annotated = canonicalWinner.map((match) => ({
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

function isLessonSearchCandidate(
  _ticket: Ticket,
  understanding: Understanding,
  item: KnowledgeItem,
  _canonicalProblemTitle: string
): boolean {
  if (!item.lessons?.length) return false;
  // TODO-045: semantic lesson evidence is the mechanism that can resolve an
  // otherwise-unknown root cause. Keep the hard category boundary here, but
  // do not require the pre-semantic root-cause compatibility verdict before
  // considering a lesson that belongs to the already-selected canonical.
  // Final authorization still re-runs isCompatibleForDrafting with the ticket
  // after findMatchingLesson has produced strong evidence.
  if (!isCompatibleForDrafting(understanding, item)) return false;
  // The raw match at the caller boundary already identifies the canonical.
  // Requiring lexical overlap with the classifier's canonical title would
  // discard valid paraphrases before the semantic lesson matcher runs.
  return true;
}

export function withPreDiscriminationLessonMatches(
  _ticket: Ticket,
  understanding: Understanding,
  matches: KnowledgeMatch[],
  _items: KnowledgeItem[],
  canonicalProblemTitle: string
): KnowledgeMatch[] {
  // TODO-045: semantic evidence may validate a lesson only for the canonical
  // retrieval winner. It must never search the whole organization and move a
  // semantically related sibling ahead of the selected canonical. The raw
  // ranking is therefore the candidate boundary; the `items` argument is
  // retained for call-site compatibility and diagnostics.
  // The canonical retrieval winner is the default boundary. The mature SSO
  // semantic path (TODO-040) has an established same-category discrimination
  // case, so retain only its tight retrieval score cluster; all other
  // categories remain strictly on the raw winner and cannot be overridden by
  // a lower-ranked sibling lesson.
  const topScore = matches[0]?.matchScore ?? 0;
  const canonicalCandidates = canonicalProblemTitle === "Authentication Infrastructure Issue"
    ? matches.filter((match) => match.matchScore >= topScore - 10).map((match) => match.item)
    : matches.length > 0 ? [matches[0].item] : [];
  const lessonMatches = canonicalCandidates
    .filter((item) => isLessonSearchCandidate(_ticket, understanding, item, canonicalProblemTitle))
    .map((item) => ({ item, lessonMatch: findMatchingLesson(_ticket, item) }))
    .filter((entry): entry is { item: KnowledgeItem; lessonMatch: LessonMatchResult } => isStrongLessonMatch(entry.lessonMatch));

  if (lessonMatches.length === 0) {
    // No strong lesson evidence means no semantic re-ranking occurred. Keep
    // the original retrieval list for downstream compatibility/AI probes;
    // authorization still requires the strong deterministic lesson gate.
    return matches;
  }

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
    // Lesson evidence authorizes reuse, but it is not a canonical retrieval
    // score. Preserve the intrinsic score so the UI never turns an evidence
    // gate into a fabricated percentage.
    matchScore: existing?.matchScore ?? 0,
    matchReason: `Validated lesson match - "${lessonLabel}" matched before AI discrimination via signals: ${best.lessonMatch.matchedSignals.join(", ")}.`,
    matchedTags: existing?.matchedTags ?? [],
    matchedKeywords: best.lessonMatch.matchedSignals.slice(0, 4),
    matchedCategory: best.item.category,
    relevanceEvidence: existing?.relevanceEvidence
  };

  return [lessonBackedMatch];
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
