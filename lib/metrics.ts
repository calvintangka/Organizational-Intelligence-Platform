import type { Metrics } from "@/types";

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

export const staticDemoMetrics = defaultMetrics;
