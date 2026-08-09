import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  TicketWriteError,
  type TicketRecord,
  type TicketRecordClassification,
  type TicketRecordMemoryMatch,
  type TicketWorkflowCommand
} from "@/types";

/**
 * RSS-1.2S3 — server-owned ticket workflow transitions.
 *
 * A client never writes status, actor, resolution mode, resolution, review
 * state, memory references, or trust state directly. Instead it proposes a
 * bounded command; this service validates the transition against the current
 * workflow state, computes every authoritative field from the authenticated
 * session, the organization, and the server clock, persists the result, and
 * writes a durable transition-audit row.
 */

const STATUSES = ["open", "in_review", "resolved", "rejected", "discarded"] as const;
type Status = (typeof STATUSES)[number];

interface CurrentRow {
  ticketId: string;
  status: string;
  classification: unknown;
  memoryMatch: unknown;
  resolution: unknown;
  reflection: unknown;
  validationRecordIds: unknown;
  labels: unknown;
  actorId: string | null;
  rawMessage: string;
  subject: string | null;
  createdAt: Date;
  bulkUploadKey: string | null;
  bulkEntryId: string | null;
  bulkClusterId: string | null;
  intakeMode: string | null;
  draftSource: string | null;
  resolutionMode: string | null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function requireStatus(value: string): Status {
  if ((STATUSES as readonly string[]).includes(value)) return value as Status;
  return "open";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validateLanguage(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(value.trim())) {
    throw new TicketWriteError("INVALID_TRANSITION", "A valid BCP-47 language code is required.", 400);
  }
  return value.trim();
}

function validateClassification(value: unknown): TicketRecordClassification {
  const record = asRecord(value);
  const category = record.category;
  const intent = record.intent;
  const canonicalProblem = record.canonicalProblem;
  const confidence = record.confidence;
  if (typeof category !== "string" || typeof intent !== "string" || typeof confidence !== "string") {
    throw new TicketWriteError("INVALID_TRANSITION", "Analysis classification requires category, intent, and confidence.", 400);
  }
  if (record.classifiedBy !== "deterministic" && record.classifiedBy !== "llm_fallback") {
    throw new TicketWriteError("INVALID_TRANSITION", "Analysis classification requires a valid classifiedBy source.", 400);
  }
  return {
    category,
    intent,
    canonicalProblem: typeof canonicalProblem === "string" ? canonicalProblem : null,
    classifiedBy: record.classifiedBy,
    confidence,
    inquiryType: record.inquiryType as TicketRecordClassification["inquiryType"],
    businessIntent: typeof record.businessIntent === "string" ? record.businessIntent : undefined,
    securityDetected: typeof record.securityDetected === "boolean" ? record.securityDetected : undefined,
    securitySeverity: record.securitySeverity as TicketRecordClassification["securitySeverity"],
    securityReasons: Array.isArray(record.securityReasons) ? record.securityReasons.filter((item): item is string => typeof item === "string") : undefined,
    escalationRequired: typeof record.escalationRequired === "boolean" ? record.escalationRequired : undefined,
    language: typeof record.language === "object" && record.language !== null
      ? record.language as TicketRecordClassification["language"]
      : undefined
  };
}

async function validateMemoryMatchReference(organizationId: string, memoryMatch: TicketRecordMemoryMatch | null): Promise<TicketRecordMemoryMatch | null> {
  if (!memoryMatch) return null;
  const knowledgeId = memoryMatch.knowledgeId ?? null;
  if (knowledgeId) {
    const knowledge = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId } });
    if (!knowledge || knowledge.organizationId !== organizationId) {
      throw new TicketWriteError("INVALID_TRANSITION_REFERENCE", "The referenced knowledge item does not belong to this organization.", 400);
    }
  }
  return memoryMatch;
}

async function validateValidationReferences(organizationId: string, validationRecordIds: string[]): Promise<void> {
  if (validationRecordIds.length === 0) return;
  const rows = await prisma.validationRecord.findMany({ where: { id: { in: validationRecordIds } }, select: { id: true, organizationId: true } });
  const byId = new Map(rows.map((row) => [row.id, row.organizationId]));
  for (const id of validationRecordIds) {
    if (byId.get(id) !== organizationId) {
      throw new TicketWriteError("INVALID_TRANSITION_REFERENCE", "A referenced validation record does not belong to this organization.", 400);
    }
  }
}

async function validateKnowledgeReference(organizationId: string, knowledgeId: string | null): Promise<void> {
  if (!knowledgeId) return;
  const knowledge = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId } });
  if (!knowledge || knowledge.organizationId !== organizationId) {
    throw new TicketWriteError("INVALID_TRANSITION_REFERENCE", "The referenced knowledge item does not belong to this organization.", 400);
  }
}

/** Builds the authoritative next row for a command, validating the transition. */
async function computeNextState(input: {
  organizationId: string;
  current: CurrentRow;
  command: TicketWorkflowCommand;
}): Promise<{ status: Status; classification: unknown; memoryMatch: unknown; resolution: unknown; reflection: unknown; validationRecordIds: unknown; resolutionMode: string | null; labels: unknown; bulkClusterId: string | null }> {
  const { organizationId, current, command } = input;
  const status = requireStatus(current.status);
  const base = {
    status,
    classification: current.classification,
    memoryMatch: current.memoryMatch,
    resolution: current.resolution,
    reflection: current.reflection,
    validationRecordIds: current.validationRecordIds,
    resolutionMode: current.resolutionMode,
    labels: current.labels,
    bulkClusterId: current.bulkClusterId
  };

  switch (command.kind) {
    case "attach_analysis": {
      if (status !== "open" && status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "Analysis can only be attached to an open or in-review ticket.", 409);
      }
      const classification = validateClassification(command.classification);
      const memoryMatch = await validateMemoryMatchReference(organizationId, command.memoryMatch);
      return { ...base, status: "in_review", classification, memoryMatch, bulkClusterId: typeof command.bulkClusterId === "string" && command.bulkClusterId.trim() ? command.bulkClusterId.trim() : null };
    }
    case "language": {
      if (status !== "open" && status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "Language review is only valid for an open or in-review ticket.", 409);
      }
      const language = validateLanguage(command.language);
      const previous = asRecord(current.classification);
      const previousLanguage = previous.language && typeof previous.language === "object" ? previous.language as Record<string, unknown> : {};
      const classification: TicketRecordClassification = {
        category: typeof previous.category === "string" ? previous.category : "Uncategorized",
        intent: typeof previous.intent === "string" ? previous.intent : "unspecified",
        canonicalProblem: typeof previous.canonicalProblem === "string" ? previous.canonicalProblem : null,
        classifiedBy: previous.classifiedBy === "llm_fallback" ? "llm_fallback" : "deterministic",
        confidence: typeof previous.confidence === "string" ? previous.confidence : "medium",
        language: {
          detected: language,
          confidence: 1,
          method: "reviewer",
          ...(typeof previousLanguage.responseLanguage === "string" ? { responseLanguage: previousLanguage.responseLanguage } : {}),
          reviewerOverride: true
        }
      };
      return { ...base, classification };
    }
    case "approve": {
      if (status !== "open" && status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "A response can only be approved for an open or in-review ticket.", 409);
      }
      const finalResponse = typeof command.finalResponse === "string" ? command.finalResponse.trim() : "";
      if (!finalResponse) {
        throw new TicketWriteError("INVALID_TRANSITION", "A final response is required to approve a ticket.", 400);
      }
      const now = new Date().toISOString();
      return {
        ...base,
        status: "resolved",
        resolutionMode: "human",
        resolution: {
          finalResponse,
          humanEdited: command.humanEdited === true,
          editDistanceNote: null,
          resolvedAt: now
        }
      };
    }
    case "discard": {
      if (status === "resolved" || status === "discarded" || status === "rejected") {
        throw new TicketWriteError("INVALID_TRANSITION", "A resolved, discarded, or rejected ticket cannot be discarded.", 409);
      }
      return { ...base, status: "discarded" };
    }
    case "reinstate": {
      if (status !== "discarded") {
        throw new TicketWriteError("INVALID_TRANSITION", "Only a discarded ticket can be reinstated.", 409);
      }
      return { ...base, status: "open" };
    }
    case "commit": {
      if (status !== "open" && status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "A governed commit is only valid for an open or in-review ticket.", 409);
      }
      const validationRecordIds = Array.isArray(command.validationRecordIds)
        ? command.validationRecordIds.filter((item): item is string => typeof item === "string")
        : [];
      await validateValidationReferences(organizationId, validationRecordIds);
      await validateKnowledgeReference(organizationId, command.knowledgeId);
      const classification = command.classification ? validateClassification(command.classification) : base.classification;
      const memoryMatch = command.memoryMatch !== undefined
        ? await validateMemoryMatchReference(organizationId, command.memoryMatch)
        : base.memoryMatch;
      const now = new Date().toISOString();
      return {
        ...base,
        classification,
        memoryMatch,
        status: "resolved",
        resolutionMode: command.automatic === true ? "automatic" : "human",
        resolution: {
          finalResponse: typeof command.finalResponse === "string" && command.finalResponse.trim() ? command.finalResponse.trim() : null,
          humanEdited: command.automatic !== true,
          editDistanceNote: null,
          resolvedAt: now
        },
        reflection: {
          decision: typeof command.action === "string" ? command.action : null,
          lessonCreatedId: command.lessonCreatedId ?? null,
          lessonReinforcedId: command.lessonReinforcedId ?? null,
          knowledgeChanged: command.knowledgeChanged ?? (command.knowledgeId ?? null)
        },
        validationRecordIds: validationRecordIds
      };
    }
    default:
      throw new TicketWriteError("INVALID_TRANSITION", "The requested transition is not supported.", 400);
  }
}

export interface TicketWorkflowInput {
  organizationId: string;
  actorId: string;
  ticketId: string;
  command: TicketWorkflowCommand;
  requestId: string;
  correlationId: string;
  source: string;
}

export async function applyTicketWorkflowCommand(input: TicketWorkflowInput): Promise<TicketRecord> {
  const current = await prisma.ticketRecord.findUnique({
    where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } }
  });
  if (!current) {
    throw new TicketWriteError("TICKET_NOT_FOUND", "The ticket was not found in this organization.", 404);
  }
  const row: CurrentRow = {
    ticketId: current.ticketId,
    status: current.status,
    classification: current.classification,
    memoryMatch: current.memoryMatch,
    resolution: current.resolution,
    reflection: current.reflection,
    validationRecordIds: current.validationRecordIds,
    labels: current.labels,
    actorId: current.actorId,
    rawMessage: current.rawMessage,
    subject: current.subject,
    createdAt: current.createdAt,
    bulkUploadKey: current.bulkUploadKey,
    bulkEntryId: current.bulkEntryId,
    bulkClusterId: current.bulkClusterId,
    intakeMode: current.intakeMode,
    draftSource: current.draftSource,
    resolutionMode: current.resolutionMode
  };
  const next = await computeNextState({ organizationId: input.organizationId, current: row, command: input.command });
  const previousStatus = row.status;

  await prisma.$transaction(async (tx) => {
    await tx.ticketRecord.update({
      where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } },
      data: {
        status: next.status,
        classification: next.classification === null ? Prisma.DbNull : json(next.classification),
        memoryMatch: next.memoryMatch === null ? Prisma.DbNull : json(next.memoryMatch),
        resolution: json(next.resolution),
        reflection: json(next.reflection),
        validationRecordIds: json(next.validationRecordIds),
        resolutionMode: next.resolutionMode === "human" || next.resolutionMode === "automatic" ? next.resolutionMode : null,
        ...(next.bulkClusterId !== undefined ? { bulkClusterId: next.bulkClusterId } : {}),
        ...(next.labels !== undefined ? { labels: json(next.labels) } : {})
      }
    });
    await tx.ticketTransitionAudit.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        action: input.command.kind,
        actorId: input.actorId,
        previousStatus,
        newStatus: next.status,
        summary: json({
          resolutionMode: next.resolutionMode,
          validationRecordIds: next.validationRecordIds,
          requestId: input.requestId,
          correlationId: input.correlationId
        }),
        source: input.source,
        requestId: input.requestId,
        correlationId: input.correlationId
      }
    });
  });

  return {
    ticketId: input.ticketId,
    orgId: input.organizationId,
    actorId: current.actorId ?? input.actorId,
    createdAt: current.createdAt.toISOString(),
    rawMessage: current.rawMessage,
    subject: current.subject,
    bulkUploadKey: current.bulkUploadKey,
    bulkEntryId: current.bulkEntryId,
    bulkClusterId: current.bulkClusterId,
    intakeMode: current.intakeMode as TicketRecord["intakeMode"],
    classification: next.classification === null ? null : asRecord(next.classification) as unknown as TicketRecordClassification,
    memoryMatch: next.memoryMatch === null ? null : asRecord(next.memoryMatch) as unknown as TicketRecordMemoryMatch,
    draftSource: current.draftSource as TicketRecord["draftSource"],
    resolution: asRecord(next.resolution) as unknown as TicketRecord["resolution"],
    reflection: asRecord(next.reflection) as unknown as TicketRecord["reflection"],
    validationRecordIds: Array.isArray(next.validationRecordIds) ? next.validationRecordIds.map(String) : [],
    labels: Array.isArray(next.labels) ? next.labels.map(String) : [],
    status: next.status,
    resolutionMode: next.resolutionMode === "human" || next.resolutionMode === "automatic" ? next.resolutionMode : null
  };
}
