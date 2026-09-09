export type OrganizationalExperienceEditorIntent = "idle" | "new" | "resume";

export interface DraftHydrationGuardInput {
  requestOrganizationId: string;
  activeOrganizationId: string;
  requestGeneration: number;
  activeGeneration: number;
  intent: OrganizationalExperienceEditorIntent;
}

/**
 * A saved-draft response may update the editor only while it still belongs to
 * the active organization/session and the user has not explicitly started a
 * new experience. This keeps resume recovery deterministic without timing
 * assumptions.
 */
export function canApplyDraftHydration(input: DraftHydrationGuardInput): boolean {
  return input.requestOrganizationId === input.activeOrganizationId
    && input.requestGeneration === input.activeGeneration
    && input.intent !== "new";
}
