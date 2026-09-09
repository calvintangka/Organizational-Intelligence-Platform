import type { KnowledgeItem, KnowledgeMatch, OrganizationProfile, Ticket } from "@/types";
import { understandForProfile } from "@/lib/analyzer";
import { projectCurrentKnowledgeMatches } from "@/lib/currentMemoryProjection";
import { retrieveMemory } from "@/lib/memory";

export type KnowledgeQueryState = "relevant" | "weak" | "no_match";

export interface KnowledgeQueryResult {
  query: string;
  state: KnowledgeQueryState;
  matches: KnowledgeMatch[];
}

function queryUnderstanding(rawQuery: string, organizationProfile: OrganizationProfile) {
  const ticket: Ticket = {
    id: "knowledge-query",
    ticketId: "knowledge-query",
    customerName: "Knowledge query",
    subject: "",
    description: rawQuery,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
  const understanding = understandForProfile(ticket, organizationProfile);
  if (understanding.category !== "Uncategorized") return understanding;

  // Domain-neutral Memory records use OPERATIONAL_EVENT. When the classifier
  // cannot choose a support category, a small set of generic situation signals
  // gives the existing facet gate enough context to understand ordinary
  // organizational wording without supplying tags or a canonical title.
  // Require two independent signals so unrelated prose does not become a
  // broad Memory query. The category remains Uncategorized: this is query
  // interpretation, not a new global classifier category.
  const signalRules: Array<[RegExp, string]> = [
    [/\b(?:employee|employees|worker|workers|staff|coordinator|technician|user|person|people)\b/iu, "person"],
    [/\b(?:team|reassign(?:ed|ment)?|transfer(?:red)?|moved|assignment|role)\b/iu, "role-change"],
    [/\b(?:roster|queue|portal|workspace|dashboard|schedule|dispatch)\b/iu, "work-surface"],
    [/\b(?:access|accessible|permission|denied|missing|lost|cannot|can't|unable|disappeared)\b/iu, "access-change"],
    [/\b(?:sign\s*in|log\s*in|login|authenticate)\b/iu, "authentication"]
  ];
  const signals = signalRules.filter(([pattern]) => pattern.test(rawQuery)).map(([, signal]) => signal);
  if (signals.length < 2) return understanding;

  const derivedTerms = [
    signals.includes("authentication") ? "sign in authentication" : "",
    signals.includes("work-surface") ? "roster queue workspace" : "",
    signals.includes("role-change") ? "role assignment transfer" : "",
    signals.includes("access-change") ? "access denied permission" : ""
  ].filter(Boolean).join(" ");
  const enrichedRetrievalText = `${rawQuery} ${derivedTerms}`.trim();

  return {
    ...understanding,
    summary: "An organizational situation was checked against validated organizational Memory.",
    coreProblem: rawQuery,
    tags: [...understanding.tags, ...signals],
    detectedSignals: signals,
    retrievalText: enrichedRetrievalText,
    intentIsolation: understanding.intentIsolation
      ? { ...understanding.intentIsolation, retrievalText: enrichedRetrievalText }
      : understanding.intentIsolation
  };
}

/**
 * PRODUCT-001: turn one user-described situation into the existing bounded
 * retrieval path without creating a Ticket or any other persisted object.
 * The synthetic Ticket is an in-memory adapter only; it never crosses a
 * persistence boundary.
 */
export function queryOrganizationalMemory(
  rawQuery: string,
  organizationProfile: OrganizationProfile,
  knowledgeItems: KnowledgeItem[]
): KnowledgeQueryResult {
  const query = rawQuery.trim();
  const understanding = queryUnderstanding(query, organizationProfile);
  const matches = projectCurrentKnowledgeMatches(
    retrieveMemory(understanding, knowledgeItems),
    knowledgeItems
  ).slice(0, 5);
  const topScore = matches[0]?.matchScore ?? 0;

  return {
    query,
    // A domain-neutral Memory can be relevant without a support classifier
    // category. Scores at or above 40 have concrete retrieval evidence; the
    // presentation still keeps human judgment and scope review mandatory.
    state: matches.length === 0 ? "no_match" : topScore < 40 ? "weak" : "relevant",
    matches
  };
}
