import type { Metrics, TicketRecord } from "@/types";

/**
 * TODO-026: independently reconstruct the automatic-vs-human resolution split
 * from primary TicketRecord rows (not materialized OrgMetrics). A completed
 * resolution is a resolved/rejected ticket with a resolvedAt timestamp. A null
 * `resolutionMode` is reported as `unknownMode` — an unauditable historical row
 * — and is NEVER silently counted as human.
 */
export interface ResolutionModeCounts {
  completed: number;
  automatic: number;
  human: number;
  unknownMode: number;
}

export function deriveResolutionModeCounts(tickets: TicketRecord[]): ResolutionModeCounts {
  const completed = tickets.filter(
    (ticket) => (ticket.status === "resolved" || ticket.status === "rejected") && Boolean(ticket.resolution?.resolvedAt)
  );
  let automatic = 0;
  let human = 0;
  let unknownMode = 0;
  for (const ticket of completed) {
    if (ticket.resolutionMode === "automatic") automatic += 1;
    else if (ticket.resolutionMode === "human") human += 1;
    else unknownMode += 1;
  }
  return { completed: completed.length, automatic, human, unknownMode };
}

export const defaultMetrics: Metrics = {
  ticketsProcessed: 0,
  knowledgeItemsCreated: 0,
  knowledgeItemsReused: 0,
  estimatedTimeSavedMinutes: 0,
  humanApprovedResponses: 0,
  repeatedIssuesDetected: 0,
  memoryRetrievals: 0,
  outOfScopeDismissals: 0,
  clarificationRequests: 0,
  autoResolutions: 0,
  canonicalProblemsTouched: 0,
  knowledgeVersionsCreated: 0,
  mergedTickets: 0,
  duplicatePreventions: 0,
  emergingPatternsDetected: 0,
  aiCalls: 0,
  aiSuccesses: 0,
  aiFailures: 0,
  aiFallbacks: 0
};
