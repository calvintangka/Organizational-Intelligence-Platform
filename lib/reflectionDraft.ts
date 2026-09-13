import type { LessonDraft, ReflectionCommitInput, ReflectionDecision } from "@/types";

/**
 * Problem names are reviewer-authored only for Reflection decisions that
 * explicitly require a new canonical problem name. Other decisions may carry
 * a suggested display title, but that title is not reusable draft content.
 */
export function initialReflectionProblemName(
  decision: ReflectionDecision,
  initialDraft?: ReflectionCommitInput
): string {
  if (!decision.problemNameRequired) return "";
  return initialDraft?.problemName ?? decision.suggestedProblemName ?? "";
}

export function submittedReflectionProblemName(
  decision: ReflectionDecision,
  value: string
): string | undefined {
  if (!decision.problemNameRequired) return undefined;
  return value.trim() || undefined;
}

/** An authored lesson must never be silently discarded as a generic promotion. */
export function hasReflectionLessonContent(draft: Pick<LessonDraft, "rootCause" | "solution" | "customerResponse" | "signals">): boolean {
  return Boolean(
    draft.rootCause.trim()
    || draft.solution.trim()
    || draft.customerResponse.trim()
    || draft.signals.some((signal) => signal.trim())
  );
}

/** Optional lesson authoring is all-or-nothing at the human validation boundary. */
export function isCompleteReflectionLesson(draft: Pick<LessonDraft, "rootCause" | "solution" | "customerResponse" | "signals">): boolean {
  return Boolean(
    draft.rootCause.trim()
    && draft.solution.trim()
    && draft.customerResponse.trim()
    && draft.signals.some((signal) => signal.trim())
  );
}

export type ReflectionLessonState = "BLANK" | "PARTIAL" | "COMPLETE";

/** Presentation state must never change the semantic state of authored lesson content. */
export function classifyReflectionLesson(
  draft: Pick<LessonDraft, "rootCause" | "solution" | "customerResponse" | "signals">
): ReflectionLessonState {
  if (!hasReflectionLessonContent(draft)) return "BLANK";
  return isCompleteReflectionLesson(draft) ? "COMPLETE" : "PARTIAL";
}

/** Stable equality for coalescing autosave snapshots in the UI. */
export function reflectionDraftFingerprint(input: ReflectionCommitInput): string {
  return JSON.stringify({
    problemName: input.problemName?.trim() || undefined,
    lessonDraft: input.lessonDraft
      ? {
          mode: input.lessonDraft.mode,
          rootCause: input.lessonDraft.rootCause.trim(),
          solution: input.lessonDraft.solution.trim(),
          customerResponse: input.lessonDraft.customerResponse.trim(),
          signals: input.lessonDraft.signals.map((signal) => signal.trim().toLowerCase()),
          existingLessonId: input.lessonDraft.existingLessonId
        }
      : undefined
  });
}
