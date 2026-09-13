import "server-only";

import { queryOrganizationalMemory, type KnowledgeQueryResult } from "@/lib/knowledgeQuery";
import { listAccessibleDomainIds } from "@/lib/server/domainAuthorization";
import { ensureDefaultOrganizationDomains, resolveOrganizationDomain } from "@/lib/server/domainService";
import { getOrganizationProfile, loadKnowledge } from "@/lib/server/persistenceService";
import { loadOrganizationalMemoryInspection } from "@/lib/server/organizationalMemoryService";
import { MemoryFoundationError, memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import type { AskResult, AskSource, KnowledgeItem, OrganizationDomain } from "@/types";

function routeQuery(query: string, requestedSource: AskSource): AskResult["source"] {
  if (requestedSource === "memory") return "ORGANIZATIONAL_MEMORY";
  if (requestedSource === "current_data") return "CURRENT_COMPANY_DATA";
  if (requestedSource === "combined") return "COMBINED";
  const current = /\b(?:today|current|right now|latest|balance|revenue|total|amount|how much|what is the .* (?:value|status)|this month's actual)\b/i.test(query);
  const action = /\b(?:prepare|create|generate|draft|produce|apply|using|based on)\b/i.test(query);
  const procedural = /\b(?:how does|how do|why do|what did we learn|procedure|process|should .* know|have we encountered)\b/i.test(query);
  if (current && action) return "COMBINED";
  if (current) return "CURRENT_COMPANY_DATA";
  if (procedural || action) return "ORGANIZATIONAL_MEMORY";
  return "AMBIGUOUS";
}

function memoryAnswer(result: KnowledgeQueryResult): string | null {
  const item = result.matches[0]?.item;
  if (!item) return null;
  return item.canonicalLearning?.lesson || item.approvedAnswer || item.internalGuidance || null;
}

function filterKnowledge(items: KnowledgeItem[], domainId: string | null, accessibleDomainIds: string[]): KnowledgeItem[] {
  if (domainId) return items.filter((item) => item.domainId === domainId);
  return items.filter((item) => !item.domainId || accessibleDomainIds.includes(item.domainId));
}

export async function askOrganization(input: {
  organizationId: string;
  userId: string;
  query: string;
  domainIdOrKey?: string;
  requestedSource?: AskSource;
}): Promise<AskResult> {
  const query = memoryString(input.query, "query", 4000);
  const requestedSource = input.requestedSource ?? "auto";
  const source = routeQuery(query, requestedSource);
  if (source === "AMBIGUOUS") {
    return { state: "clarification_required", source, query, answer: null, memoryResult: null, memoryContext: null, currentData: null, warnings: ["Specify whether you want learned organizational Memory or a current company value."], routingExplanation: "The request does not contain enough evidence to choose a source of truth." };
  }

  await ensureDefaultOrganizationDomains(input.organizationId);
  let domain: OrganizationDomain | null = null;
  if (input.domainIdOrKey) domain = await resolveOrganizationDomain(input.organizationId, input.domainIdOrKey);
  const accessibleDomainIds = await listAccessibleDomainIds({ organizationId: input.organizationId, userId: input.userId, capability: "ask.query" });
  if (domain && !accessibleDomainIds.includes(domain.id)) {
    throw new MemoryFoundationError("FORBIDDEN", "The requested organizational Domain is not available.", 403);
  }

  if (source === "CURRENT_COMPANY_DATA") {
    return {
      state: "current_data_unavailable",
      source,
      query,
      answer: null,
      memoryResult: null,
      memoryContext: null,
      currentData: null,
      warnings: ["No authorized current company-data provider is connected for this request. Historical Memory is not used as a current fact."],
      routingExplanation: "The request asks for a current company fact, so it was routed to the Company Data Provider boundary. No provider is implemented for this release."
    };
  }

  const [profile, allItems] = await Promise.all([getOrganizationProfile(input.organizationId), loadKnowledge(input.organizationId)]);
  const items = filterKnowledge(allItems, domain?.id ?? null, accessibleDomainIds);
  const memoryResult = queryOrganizationalMemory(query, profile, items);
  const answer = memoryAnswer(memoryResult);
  const topMemoryId = memoryResult.matches[0]?.item.id;
  const memoryContext = topMemoryId
    ? await loadOrganizationalMemoryInspection(input.organizationId, topMemoryId).catch(() => null)
    : null;
  if (source === "COMBINED") {
    return {
      state: "current_data_unavailable",
      source,
      query,
      answer,
      memoryResult,
      memoryContext,
      currentData: null,
      warnings: ["The learned organizational procedure is available, but current company data is unavailable because no authorized provider is connected. This is not a complete combined answer."],
      routingExplanation: "The request requires both learned procedure and current company data; only the Memory portion could be retrieved."
    };
  }
  return {
    state: memoryResult.state === "relevant" ? "memory_answer" : memoryResult.state === "weak" ? "memory_weak_match" : "memory_no_match",
    source: "ORGANIZATIONAL_MEMORY",
    query,
    answer,
    memoryResult,
    memoryContext,
    currentData: null,
    warnings: memoryResult.state === "weak" ? ["This Memory match is weak and should be reviewed before relying on it."] : [],
    routingExplanation: "The request was checked against validated Organizational Memory. Retrieval is evidence-aware and does not create or change Memory."
  };
}
