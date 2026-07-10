export interface Metrics {
  ticketsProcessed: number;
  knowledgeItemsCreated: number;
  knowledgeItemsReused: number;
  estimatedTimeSavedMinutes: number;
  humanApprovedResponses: number;
  repeatedIssuesDetected: number;
  memoryRetrievals: number;
  outOfScopeDismissals: number;
  clarificationRequests: number;
  autoResolutions: number;
  canonicalProblemsTouched: number;
  knowledgeVersionsCreated: number;
  mergedTickets: number;
  duplicatePreventions: number;
  emergingPatternsDetected: number;
  aiCalls: number;
  aiSuccesses: number;
  aiFailures: number;
  aiFallbacks: number;
}

/**
 * Organization-level metrics. Unlike session Metrics, these PERSIST across
 * sessions in localStorage and accumulate over the organization's lifetime.
 */
export interface OrgMetrics {
  lifetimeTickets: number;
  knowledgeReused: number;
  autoResolutions: number;
  humanResolutions: number;
  totalResolutionTimeSec: number; // accumulator used to derive average
  resolutionsCount: number; // denominator for average resolution time
  memoryGrowthToday: number;
  memoryGrowthDate: string; // ISO date (yyyy-mm-dd) the growth counter applies to
  lastUpdatedAt: string;
  mergedTickets?: number;
  duplicatePreventions?: number;
  knowledgeVersions?: number;
  emergingPatternsDetected?: number;
  promotedPatterns?: number;
  aiCalls?: number;
  aiSuccesses?: number;
  aiFailures?: number;
  aiFallbacks?: number;
  aiAgreementSamples?: number;
  aiAgreementTotal?: number;
  humanAcceptedAISuggestions?: number;
  organizationId?: string;
}
