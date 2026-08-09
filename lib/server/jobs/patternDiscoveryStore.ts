import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { PersistenceContext } from "@/lib/persistence/context";
import { digestJobInput } from "@/lib/application/jobs/types";
import { patternDiscoveryIdempotencyKey, type PatternDiscoveryJobInput, type PatternDiscoveryJobResult } from "@/lib/application/jobs/patternTypes";
import { detectEmergingPattern, hasSpecificCanonicalMatch, upsertEmergingPattern } from "@/lib/patternDiscovery";
import type { EmergingPattern } from "@/types/patterns";
import type { KnowledgeItem, Ticket } from "@/types";
import type { Understanding } from "@/types/oip";
import { prisma } from "@/lib/server/prisma";
import { recomputeAuthoritativeOrgMetricsTx } from "@/lib/server/persistenceService";

export class PatternDiscoveryError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "TENANT_MISMATCH" | "ALGORITHM_FAILURE" | "DATABASE_TRANSIENT", message: string, public readonly retryable = false) {
    super(message);
    this.name = "PatternDiscoveryError";
  }
}

export interface DiscoverPatternRequest {
  context: PersistenceContext;
  jobId: string;
  attemptNumber: number;
  input: PatternDiscoveryJobInput;
  knowledgeItems: KnowledgeItem[];
}

export interface DiscoverPatternResponse {
  result: PatternDiscoveryJobResult;
  replayed: boolean;
}

function json(value: unknown): Prisma.InputJsonValue { return (value ?? {}) as Prisma.InputJsonValue; }

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function mapPattern(row: any): EmergingPattern {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: stringArray(row.tags),
    keywords: stringArray(row.keywords),
    exampleTickets: Array.isArray(row.exampleTickets) ? row.exampleTickets : [],
    timesSeen: row.timesSeen,
    confidenceScore: row.confidenceScore,
    suggestedCanonicalProblem: row.suggestedCanonicalProblem,
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString()
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function deterministicPatternId(input: PatternDiscoveryJobInput, organizationId: string): string {
  const identity = input.canonicalProblemId?.trim()
    || `${normalize(input.category)}|${[...input.tags].map(normalize).sort().join(",")}|${[...input.detectedSignals].map(normalize).sort().join(",")}`;
  return `pattern-${stableHash(`${organizationId}|${identity}`)}`;
}

function safeText(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/\b(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*[^\s,.;]+/gi, "$1: [redacted]")
    .replace(/\b(?:ticket|case|incident)[\s#:-]*[A-Z0-9][A-Z0-9-]{3,}/gi, "[redacted-ticket]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return sanitized || fallback;
}

function safeSignalSummary(input: PatternDiscoveryJobInput): string {
  const category = safeText(input.category, "General");
  const signals = input.detectedSignals.map((signal) => safeText(signal, "signal")).filter(Boolean).slice(0, 4);
  return `Validated ${category} organizational signal${signals.length ? `: ${signals.join(", ")}` : ""}`.slice(0, 240);
}

function safePatternTitle(input: PatternDiscoveryJobInput): string {
  const category = safeText(input.category, "General");
  const signal = safeText(input.detectedSignals[0] ?? input.tags[0] ?? "support", "support");
  return `${category} ${signal} pattern`.slice(0, 80);
}

function safeExamples(pattern: EmergingPattern, ticketId: string, summary: string, createdAt: string): EmergingPattern["exampleTickets"] {
  const examples = [...(pattern.exampleTickets ?? [])].map((example) => ({
    ticketId: String(example.ticketId),
    customerName: "Anonymized evidence",
    originalIssue: safeText(summary, "Validated organizational signal"),
    createdAt: String(example.createdAt ?? createdAt)
  }));
  if (!examples.some((example) => example.ticketId === ticketId)) {
    examples.push({ ticketId, customerName: "Anonymized evidence", originalIssue: safeText(summary, "Validated organizational signal"), createdAt });
  }
  return examples;
}

function toTicket(row: { ticketId: string; rawMessage: string; subject: string | null; createdAt: Date }): Ticket {
  return {
    id: `ticket-${row.ticketId}`,
    ticketId: row.ticketId,
    customerName: "Anonymized customer",
    subject: row.subject?.trim() || row.rawMessage.slice(0, 80),
    description: row.rawMessage,
    category: "General",
    status: "new",
    createdAt: row.createdAt.toISOString()
  };
}

function toUnderstanding(input: PatternDiscoveryJobInput): Understanding {
  return {
    ticketId: input.sourceTicketId ?? "pattern-discovery",
    summary: safeText(input.understandingSummary, "Repeated organizational support signal"),
    coreProblem: safeText(input.understandingSummary, "Repeated organizational support signal"),
    category: input.category.trim(),
    urgency: "low",
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    detectedSignals: [...new Set(input.detectedSignals.map((signal) => signal.trim()).filter(Boolean))],
    extractedFields: { senderName: null, senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] }
  };
}

function patternData(pattern: EmergingPattern) {
  return {
    title: safeText(pattern.title, "Emerging organizational pattern"),
    summary: safeText(pattern.summary, "Validated organizational signal"),
    category: safeText(pattern.category, "General"),
    tags: json(pattern.tags),
    keywords: json(pattern.keywords),
    exampleTickets: json(pattern.exampleTickets),
    timesSeen: pattern.timesSeen,
    confidenceScore: pattern.confidenceScore,
    suggestedCanonicalProblem: pattern.suggestedCanonicalProblem,
    status: pattern.status,
    firstSeenAt: new Date(pattern.firstSeenAt),
    lastSeenAt: new Date(pattern.lastSeenAt)
  };
}

function resultFromOutcome(row: any, context: PersistenceContext, attemptNumber: number): PatternDiscoveryJobResult {
  const audit = (row.auditSummary && typeof row.auditSummary === "object" && !Array.isArray(row.auditSummary)) ? row.auditSummary as Record<string, unknown> : {};
  return {
    patternFound: row.patternFound,
    patternId: row.patternId ?? undefined,
    action: row.action,
    created: row.created,
    strengthened: row.strengthened,
    evidenceCount: row.evidenceCount,
    matchedTicketCount: row.matchedTicketCount,
    confidence: row.confidence ?? undefined,
    reason: row.reason,
    followUpRequired: false,
    auditSummary: {
      organizationId: context.organizationId,
      sourceTicketId: row.sourceTicketId ?? undefined,
      sourceJobId: row.sourceJobId ?? undefined,
      triggerType: audit.triggerType === "manual" ? "manual" : "ticket_follow_up",
      correlationId: context.correlationId,
      workerAttempt: attemptNumber,
      replayed: true,
      durationMs: typeof audit.durationMs === "number" ? audit.durationMs : undefined
    }
  };
}

export class PatternDiscoveryStore {
  async discover(request: DiscoverPatternRequest): Promise<DiscoverPatternResponse> {
    if (request.input.organizationId !== request.context.organizationId) throw new PatternDiscoveryError("TENANT_MISMATCH", "Pattern discovery organization scope does not match the worker context.");
    const startedAt = Date.now();
    try {
      const response = await prisma.$transaction(async (tx) => {
        const outcomeKey = request.input.sourceTicketId ? patternDiscoveryIdempotencyKey(request.context.organizationId, request.input.sourceTicketId, request.input.triggerType) : request.context.idempotencyKey ?? request.jobId;
        await recomputeAuthoritativeOrgMetricsTx(tx, request.context.organizationId);
        const existingOutcome = await tx.patternDiscoveryOutcome.findUnique({ where: { organizationId_idempotencyKey: { organizationId: request.context.organizationId, idempotencyKey: outcomeKey } } });
        if (existingOutcome) return { result: resultFromOutcome(existingOutcome, request.context, request.attemptNumber), replayed: true };
        if (request.input.triggerType === "ticket_follow_up" && !request.input.sourceTicketId) throw new PatternDiscoveryError("INVALID_INPUT", "A ticket follow-up requires a source ticket ID.");

        const source = request.input.sourceTicketId
          ? await tx.ticketRecord.findFirst({ where: { organizationId: request.context.organizationId, ticketId: request.input.sourceTicketId }, select: { ticketId: true, rawMessage: true, subject: true, createdAt: true } })
          : null;
        if (request.input.sourceTicketId && !source) throw new PatternDiscoveryError("INVALID_INPUT", "The pattern source ticket is not present in the organization scope.");

        const input = request.input;
        const baseAudit = { organizationId: request.context.organizationId, sourceTicketId: input.sourceTicketId, sourceJobId: input.sourceJobId, triggerType: input.triggerType, correlationId: request.context.correlationId, workerAttempt: request.attemptNumber };
        const writeOutcome = async (data: { patternId?: string; action: string; patternFound: boolean; created: boolean; strengthened: boolean; evidenceCount: number; matchedTicketCount: number; confidence?: number; reason: string }) => {
          const auditSummary = { ...baseAudit, durationMs: Date.now() - startedAt };
          const outcome = await tx.patternDiscoveryOutcome.create({ data: { organizationId: request.context.organizationId, jobId: request.jobId, idempotencyKey: outcomeKey, sourceTicketId: input.sourceTicketId ?? null, sourceJobId: input.sourceJobId ?? null, patternId: data.patternId ?? null, action: data.action, patternFound: data.patternFound, created: data.created, strengthened: data.strengthened, evidenceCount: data.evidenceCount, matchedTicketCount: data.matchedTicketCount, confidence: data.confidence ?? null, reason: data.reason, auditSummary: json(auditSummary) } });
          await tx.intelligenceLog.upsert({ where: { id: `pattern-discovery-${request.jobId}` }, create: { id: `pattern-discovery-${request.jobId}`, organizationId: request.context.organizationId, timestamp: new Date(), event: `Pattern discovery ${data.action}`, detail: data.patternId ? `Pattern ${data.patternId}; evidence ${data.evidenceCount}` : data.reason }, update: {} });
          await recomputeAuthoritativeOrgMetricsTx(tx, request.context.organizationId);
          return { result: { patternFound: data.patternFound, patternId: data.patternId, action: data.action as PatternDiscoveryJobResult["action"], created: data.created, strengthened: data.strengthened, evidenceCount: data.evidenceCount, matchedTicketCount: data.matchedTicketCount, confidence: data.confidence, reason: data.reason, followUpRequired: false, auditSummary: { ...baseAudit, replayed: false, durationMs: Date.now() - startedAt } }, replayed: false };
        };

        if (!source) return writeOutcome({ action: "no_pattern", patternFound: false, created: false, strengthened: false, evidenceCount: 0, matchedTicketCount: 0, reason: "No source ticket was provided for this pattern scan." });
        const ticket = toTicket(source);
        const understanding = toUnderstanding(input);
        if (hasSpecificCanonicalMatch(understanding, request.knowledgeItems)) return writeOutcome({ action: "no_pattern", patternFound: false, created: false, strengthened: false, evidenceCount: 0, matchedTicketCount: 0, reason: "The source ticket has a specific canonical organizational-memory match." });
        const patterns = (await tx.emergingPattern.findMany({ where: { organizationId: request.context.organizationId }, orderBy: { lastSeenAt: "asc" } })).map(mapPattern);
        const deterministicId = deterministicPatternId(input, request.context.organizationId);
        const identityMatch = patterns.find((pattern) => pattern.id === deterministicId && pattern.status !== "promoted" && pattern.status !== "dismissed");
        const detected = identityMatch ? { pattern: identityMatch, isNew: false } : detectEmergingPattern(ticket, understanding, patterns);
        if (!detected) return writeOutcome({ action: "no_pattern", patternFound: false, created: false, strengthened: false, evidenceCount: 0, matchedTicketCount: 0, reason: "The pattern detector found no actionable repeated signal." });
        const existingEvidence = await tx.patternDiscoveryEvidence.findUnique({ where: { organizationId_patternId_ticketId: { organizationId: request.context.organizationId, patternId: detected.isNew ? deterministicId : detected.pattern.id, ticketId: source.ticketId } } });
        if (existingEvidence) {
          const evidenceCount = await tx.patternDiscoveryEvidence.count({ where: { organizationId: request.context.organizationId, patternId: detected.pattern.id } });
          return writeOutcome({ patternId: detected.pattern.id, action: "merged", patternFound: true, created: false, strengthened: false, evidenceCount, matchedTicketCount: detected.pattern.timesSeen, confidence: detected.pattern.confidenceScore, reason: "This ticket is already linked to the pattern; duplicate evidence was prevented." });
        }
        const candidate = detected.isNew ? { ...detected.pattern, id: deterministicId } : detected.pattern;
        const updated = detected.isNew
          ? { ...candidate, organizationId: request.context.organizationId, title: safePatternTitle(input), summary: safeSignalSummary(input), exampleTickets: safeExamples(candidate, source.ticketId, safeSignalSummary(input), source.createdAt.toISOString()) }
          : { ...upsertEmergingPattern(patterns, ticket, understanding, detected.pattern).find((pattern) => pattern.id === detected.pattern.id)!, organizationId: request.context.organizationId, exampleTickets: safeExamples(upsertEmergingPattern(patterns, ticket, understanding, detected.pattern).find((pattern) => pattern.id === detected.pattern.id)!, source.ticketId, safeSignalSummary(input), source.createdAt.toISOString()) };
        const data = patternData(updated);
        await tx.emergingPattern.upsert({ where: { id: updated.id }, create: { id: updated.id, organizationId: request.context.organizationId, ...data }, update: data });
        await tx.patternDiscoveryEvidence.create({ data: { organizationId: request.context.organizationId, patternId: updated.id, ticketId: source.ticketId, evidenceDigest: digestJobInput({ ticketId: source.ticketId, summary: input.understandingSummary, category: input.category, tags: input.tags }), safeSummary: safeSignalSummary(input), language: input.language ?? null } });
        await recomputeAuthoritativeOrgMetricsTx(tx, request.context.organizationId);
        const evidenceCount = await tx.patternDiscoveryEvidence.count({ where: { organizationId: request.context.organizationId, patternId: updated.id } });
        const action: PatternDiscoveryJobResult["action"] = detected.isNew ? "created" : "strengthened";
        return writeOutcome({ patternId: updated.id, action, patternFound: true, created: detected.isNew, strengthened: !detected.isNew, evidenceCount, matchedTicketCount: updated.timesSeen, confidence: updated.confidenceScore, reason: detected.isNew ? "A new emerging pattern was created from the source signal." : "An existing emerging pattern was strengthened with new evidence." });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return response;
    } catch (error) {
      if (error instanceof PatternDiscoveryError) throw error;
      const candidate = error as { code?: string; message?: string } | null;
      if (["P1001", "P1002", "P1017", "P2024", "P2034"].includes(candidate?.code ?? "") || candidate?.message?.toLowerCase().includes("serialization") || candidate?.message?.toLowerCase().includes("deadlock")) {
        throw new PatternDiscoveryError("DATABASE_TRANSIENT", "Pattern discovery storage is temporarily unavailable; retry is safe.", true);
      }
      throw new PatternDiscoveryError("ALGORITHM_FAILURE", "Pattern discovery could not safely complete.", true);
    }
  }
}

export const patternDiscoveryStore = new PatternDiscoveryStore();
