export type PatternDiscoveryTriggerType = "ticket_follow_up" | "manual";

export interface PatternDiscoverJobInput {
  organizationId: string;
  actorId?: string;
  sourceTicketId?: string;
  sourceJobId?: string;
  canonicalProblemId?: string;
  understandingSummary: string;
  detectedSignals: string[];
  tags: string[];
  category: string;
  language?: string;
  relevantTicketIds?: string[];
  triggerType: PatternDiscoveryTriggerType;
  timeWindow?: { from?: string; to?: string };
}

export interface PatternDiscoveryJobResult {
  patternFound: boolean;
  patternId?: string;
  action: "created" | "strengthened" | "merged" | "no_pattern" | "rejected";
  created: boolean;
  strengthened: boolean;
  evidenceCount: number;
  matchedTicketCount: number;
  confidence?: number;
  reason: string;
  followUpRequired: boolean;
  auditSummary: {
    organizationId: string;
    sourceTicketId?: string;
    sourceJobId?: string;
    triggerType: PatternDiscoveryTriggerType;
    correlationId: string;
    workerAttempt?: number;
    replayed: boolean;
    durationMs?: number;
  };
  cancelledAfterCommit?: boolean;
}

export type PatternDiscoveryJobInput = PatternDiscoverJobInput;

export function patternDiscoveryIdempotencyKey(organizationId: string, sourceTicketId: string, triggerType: PatternDiscoveryTriggerType = "ticket_follow_up"): string {
  return `pattern:${organizationId}:${triggerType}:${sourceTicketId}:v1`;
}

export function buildPatternDiscoveryInput(input: {
  organizationId: string;
  actorId?: string;
  sourceTicketId: string;
  sourceJobId?: string;
  understandingSummary: string;
  detectedSignals: string[];
  tags: string[];
  category: string;
  language?: string;
  triggerType?: PatternDiscoveryTriggerType;
}): PatternDiscoverJobInput {
  return {
    organizationId: input.organizationId,
    actorId: input.actorId,
    sourceTicketId: input.sourceTicketId,
    sourceJobId: input.sourceJobId,
    understandingSummary: input.understandingSummary.trim().slice(0, 240),
    detectedSignals: [...new Set(input.detectedSignals.map((value) => value.trim()).filter(Boolean))].slice(0, 24),
    tags: [...new Set(input.tags.map((value) => value.trim()).filter(Boolean))].slice(0, 24),
    category: input.category.trim().slice(0, 120),
    language: input.language?.trim().slice(0, 32),
    triggerType: input.triggerType ?? "ticket_follow_up"
  };
}

export function isPatternDiscoverJobInput(value: unknown): value is PatternDiscoverJobInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<PatternDiscoverJobInput>;
  return typeof input.organizationId === "string"
    && typeof input.understandingSummary === "string"
    && input.understandingSummary.trim().length > 0
    && Array.isArray(input.detectedSignals) && input.detectedSignals.every((value) => typeof value === "string")
    && Array.isArray(input.tags) && input.tags.every((value) => typeof value === "string")
    && typeof input.category === "string" && input.category.trim().length > 0
    && (input.triggerType === "ticket_follow_up" || input.triggerType === "manual")
    && (!input.sourceTicketId || typeof input.sourceTicketId === "string");
}
