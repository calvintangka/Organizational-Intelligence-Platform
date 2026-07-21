import type { KnowledgeCandidate, KnowledgeItem, OrgMetrics } from "@/types";
import type { SimulatedPattern, SimulatedTicketRecord } from "@/lib/developerDemo/types";

interface MetricInputs {
  organizationId: string;
  historyEnd: string;
  tickets: SimulatedTicketRecord[];
  knowledgeItems: KnowledgeItem[];
  candidates: KnowledgeCandidate[];
  patterns: SimulatedPattern[];
}

export function deriveDeveloperDemoMetrics(input: MetricInputs): OrgMetrics {
  const knowledgeById = new Map(input.knowledgeItems.map((item) => [item.id, item]));
  const completed = input.tickets.filter((ticket) =>
    (ticket.status === "resolved" || ticket.status === "rejected") && ticket.resolution.resolvedAt
  );
  const mergedTicketIds = new Set(
    input.candidates
      .filter((candidate) => candidate.proposedAction === "merge_existing" && candidate.rationale.startsWith("Canonical support merge"))
      .flatMap((candidate) => candidate.sourceTicketIds)
  );
  const totalResolutionTimeSec = completed.reduce((total, ticket) => {
    const resolvedAt = ticket.resolution.resolvedAt;
    if (!resolvedAt) return total;
    return total + Math.max(0, Math.round((new Date(resolvedAt).getTime() - new Date(ticket.createdAt).getTime()) / 1000));
  }, 0);
  const knowledgeReused = input.tickets.filter((ticket) => {
    if (ticket.status !== "resolved" || !ticket.memoryMatch?.knowledgeId) return false;
    const knowledge = knowledgeById.get(ticket.memoryMatch.knowledgeId);
    return Boolean(knowledge && ticket.ticketId !== knowledge.sourceTicketId && ticket.createdAt >= knowledge.createdAt);
  }).length;
  const lastUpdatedAt = completed.reduce(
    (latest, ticket) => ticket.resolution.resolvedAt && ticket.resolution.resolvedAt > latest ? ticket.resolution.resolvedAt : latest,
    input.knowledgeItems.reduce((latest, item) => (item.lastUpdated ?? item.createdAt) > latest ? (item.lastUpdated ?? item.createdAt) : latest, "0000-01-01T00:00:00.000Z")
  );

  return {
    organizationId: input.organizationId,
    lifetimeTickets: input.tickets.length,
    knowledgeReused,
    autoResolutions: completed.filter((ticket) => ticket.status === "resolved" && ticket.resolutionMode === "automatic").length,
    humanResolutions: completed.filter((ticket) => ticket.resolutionMode === "human").length,
    totalResolutionTimeSec,
    resolutionsCount: completed.length,
    memoryGrowthToday: input.knowledgeItems.filter((item) => item.createdAt.slice(0, 10) === input.historyEnd.slice(0, 10)).length,
    memoryGrowthDate: input.historyEnd.slice(0, 10),
    lastUpdatedAt,
    mergedTickets: mergedTicketIds.size,
    duplicatePreventions: mergedTicketIds.size,
    knowledgeVersions: input.knowledgeItems.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0),
    emergingPatternsDetected: input.patterns.length,
    promotedPatterns: input.patterns.length,
    aiCalls: 0,
    aiSuccesses: 0,
    aiFailures: 0,
    aiFallbacks: 0,
    aiAgreementSamples: 0,
    aiAgreementTotal: 0,
    humanAcceptedAISuggestions: 0
  };
}
