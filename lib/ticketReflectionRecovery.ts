/**
 * NC-FIX-014 — resolved-ticket Reflection recovery availability.
 *
 * Pure, UI/state-level predicate shared by the ticket workspace resume guard
 * and the Cases detail resume action. It does not change the server-side
 * `prepare_reflection` transition; it restores a reachable UI path for a
 * resolved, evidence-eligible ticket whose Reflection has not yet been
 * prepared. The existing human-review "Approve & Continue to Reflection" step
 * remains the preparation trigger.
 */
export interface ReflectionRecoveryRecord {
  status: string;
  reflection?: {
    validationEligible?: boolean | null;
    preparedDecision?: unknown;
    decision?: unknown;
  } | null;
}

/** Active conversations remain resumable; resolved tickets resume only after evidence eligibility. */
export function ticketWorkflowResumable(record: ReflectionRecoveryRecord): boolean {
  if (record.status === "in_review" || record.status === "waiting_for_customer") return true;
  return record.status === "resolved" && record.reflection?.validationEligible === true;
}

/** The specific recovery state: resolved, eligible, but neither prepared nor decided. */
export function reflectionRecoveryNeeded(record: ReflectionRecoveryRecord): boolean {
  return record.status === "resolved"
    && record.reflection?.validationEligible === true
    && record.reflection?.preparedDecision == null
    && record.reflection?.decision == null;
}
