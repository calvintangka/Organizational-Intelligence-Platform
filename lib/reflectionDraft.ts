import type { ReflectionCommitInput, ReflectionDecision } from "@/types";

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
