import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  TicketWriteError,
  type TicketRecord,
  type TicketRecordClassification,
  type TicketRecordMemoryMatch,
  type TicketMessage,
  type TicketResolutionEvidence,
  type TicketResolutionEvidenceType,
  type TicketRecordStatus,
  type TicketWorkflowCommand,
  type ReflectionDecision,
  type LessonDraft
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

const STATUSES = ["open", "in_review", "waiting_for_customer", "resolved", "rejected", "discarded"] as const;
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

function validatePreparedReflection(value: ReflectionDecision): ReflectionDecision {
  if (!value || typeof value !== "object") {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection decision is required.", 400);
  }
  if (!(["create_new", "merge_existing", "create_version", "trust_update_only"] as const).includes(value.action)) {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection action is invalid.", 400);
  }
  if (typeof value.rationale !== "string" || !value.rationale.trim()) {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection rationale is required.", 400);
  }
  if (!(typeof value.estimatedTrustDelta === "number" && Number.isFinite(value.estimatedTrustDelta))) {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection trust estimate is invalid.", 400);
  }
  if (!(value.trustImpact === "increase" || value.trustImpact === "decrease" || value.trustImpact === "reset_partial" || value.trustImpact === "none")) {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection trust impact is invalid.", 400);
  }
  return value;
}

function draftRevision(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function validateReflectionLessonDraft(value: unknown): LessonDraft | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection lesson draft must be an object.", 400);
  }
  const record = value as Record<string, unknown>;
  if (record.mode !== "new" && record.mode !== "matches_existing" && record.mode !== "improves_existing") {
    throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection lesson type is invalid.", 400);
  }
  const fields = ["rootCause", "solution", "customerResponse"] as const;
  for (const field of fields) {
    if (record[field] !== undefined && (typeof record[field] !== "string" || record[field].length > 20_000)) {
      throw new TicketWriteError("INVALID_TRANSITION", `The prepared Reflection ${field} is invalid.`, 400);
    }
  }
  if (!Array.isArray(record.signals) || record.signals.length > 50 || record.signals.some((item) => typeof item !== "string" || !item.trim() || item.length > 500)) {
    throw new TicketWriteError("INVALID_TRANSITION", "Prepared Reflection lesson signals are invalid.", 400);
  }
  const existingLessonId = record.existingLessonId;
  if (existingLessonId !== undefined && existingLessonId !== null && (typeof existingLessonId !== "string" || !existingLessonId.trim())) {
    throw new TicketWriteError("INVALID_TRANSITION", "The prepared Reflection lesson reference is invalid.", 400);
  }
  return {
    mode: record.mode,
    rootCause: typeof record.rootCause === "string" ? record.rootCause.trim() : "",
    solution: typeof record.solution === "string" ? record.solution.trim() : "",
    customerResponse: typeof record.customerResponse === "string" ? record.customerResponse.trim() : "",
    signals: (record.signals as string[]).map((item) => item.trim().toLowerCase()),
    ...(typeof existingLessonId === "string" && existingLessonId.trim() ? { existingLessonId: existingLessonId.trim() } : {})
  };
}

function messageContent(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TicketWriteError("INVALID_TRANSITION", "A non-empty conversation message is required.", 400);
  }
  const content = value.trim();
  if (content.length > 20_000) {
    throw new TicketWriteError("INVALID_TRANSITION", "Conversation messages must not exceed 20,000 characters.", 400);
  }
  return content;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
    throw new TicketWriteError("INVALID_TRANSITION", "A bounded message idempotency key is required.", 400);
  }
  return value.trim();
}

function validateEvidenceType(value: unknown): TicketResolutionEvidenceType {
  if (value === "customer_confirmation" || value === "agent_verification" || value === "manual_verified_resolution") return value;
  throw new TicketWriteError("INVALID_TRANSITION", "A supported resolution evidence type is required.", 400);
}

function evidenceNote(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TicketWriteError("INVALID_TRANSITION", "A concise resolution evidence note is required.", 400);
  }
  const note = value.trim();
  if (note.length > 2_000) throw new TicketWriteError("INVALID_TRANSITION", "Resolution evidence notes must not exceed 2,000 characters.", 400);
  return note;
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

async function requireResolutionEvidence(organizationId: string, ticketId: string): Promise<string[]> {
  const evidence = await prisma.ticketResolutionEvidence.findMany({
    where: { organizationId, ticketId },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  if (evidence.length === 0) {
    throw new TicketWriteError("RESOLUTION_EVIDENCE_REQUIRED", "Resolution evidence is required before this case can be resolved or validated.", 409);
  }
  return evidence.map((item) => item.id);
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
    case "save_draft": {
      if (status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "A draft can only be saved for an in-review ticket.", 409);
      }
      if (!Number.isInteger(command.expectedDraftRevision) || command.expectedDraftRevision < 0) {
        throw new TicketWriteError("INVALID_TRANSITION", "A valid expected draft revision is required.", 400);
      }
      const currentResolution = asRecord(current.resolution);
      const currentDraftRevision = draftRevision(currentResolution.draftRevision);
      if (command.expectedDraftRevision !== currentDraftRevision) {
        throw new TicketWriteError("REVISION_CONFLICT", "This draft was updated elsewhere. Reload the latest draft before saving again.", 409);
      }
      const finalResponse = command.finalResponse.trim();
      return {
        ...base,
        resolution: {
          finalResponse: finalResponse || null,
          humanEdited: command.humanEdited === true,
          editDistanceNote: typeof currentResolution.editDistanceNote === "string" ? currentResolution.editDistanceNote : null,
          resolvedAt: null,
          draftRevision: currentDraftRevision + 1
        }
      };
    }
    case "prepare_reflection": {
      const currentReflection = asRecord(current.reflection);
      const hasPreparedDecision = currentReflection.preparedDecision !== null
        && currentReflection.preparedDecision !== undefined;
      if (hasPreparedDecision) {
        throw new TicketWriteError("INVALID_TRANSITION", "A Reflection is already prepared for this case.", 409);
      }
      const resolvedWithEvidence = status === "resolved";
      if (!resolvedWithEvidence && status !== "in_review" && status !== "waiting_for_customer") {
        throw new TicketWriteError("INVALID_TRANSITION", "A Reflection can only be prepared for an active review case or an evidence-resolved case.", 409);
      }
      const preparedDecision = validatePreparedReflection(command.reflection);
      const evidenceIds = resolvedWithEvidence ? await requireResolutionEvidence(organizationId, current.ticketId) : undefined;
      return {
        ...base,
        reflection: {
          ...currentReflection,
          preparedDecision,
          draftRevision: draftRevision(currentReflection.draftRevision),
          validationEligible: resolvedWithEvidence ? true : false,
          validationEligibilityReason: resolvedWithEvidence ? null : "Resolution evidence is required before validation.",
          ...(evidenceIds ? { evidenceIds } : {})
        }
      };
    }
    case "save_reflection_draft": {
      if (status !== "resolved") {
        throw new TicketWriteError("INVALID_TRANSITION", "A prepared Reflection draft can only be saved for an evidence-resolved case.", 409);
      }
      const currentReflection = asRecord(current.reflection);
      if (!currentReflection.preparedDecision) {
        throw new TicketWriteError("INVALID_TRANSITION", "Prepare the Reflection before saving its authored lesson.", 409);
      }
      if (currentReflection.validationEligible !== true) {
        throw new TicketWriteError("INVALID_TRANSITION", "This Reflection is not eligible for human validation.", 409);
      }
      if (!Number.isInteger(command.expectedDraftRevision) || command.expectedDraftRevision < 0) {
        throw new TicketWriteError("INVALID_TRANSITION", "A valid expected Reflection draft revision is required.", 400);
      }
      const currentDraftRevision = draftRevision(currentReflection.draftRevision);
      if (command.expectedDraftRevision !== currentDraftRevision) {
        throw new TicketWriteError("REVISION_CONFLICT", "This Reflection draft was updated elsewhere. Reload the latest draft before saving again.", 409);
      }
      const lessonDraft = validateReflectionLessonDraft(command.lessonDraft);
      const problemName = typeof command.problemName === "string" && command.problemName.trim()
        ? command.problemName.trim().slice(0, 500)
        : null;
      return {
        ...base,
        reflection: {
          ...currentReflection,
          preparedLessonDraft: lessonDraft,
          preparedProblemName: problemName,
          draftRevision: currentDraftRevision + 1
        }
      };
    }
    case "approve": {
      if (status !== "open" && status !== "in_review") {
        throw new TicketWriteError("INVALID_TRANSITION", "A response can only be approved for an open or in-review ticket.", 409);
      }
      const finalResponse = typeof command.finalResponse === "string" ? command.finalResponse.trim() : "";
      if (!finalResponse) {
        throw new TicketWriteError("INVALID_TRANSITION", "A final response is required to approve a ticket.", 400);
      }
      const evidenceIds = await requireResolutionEvidence(organizationId, current.ticketId);
      const now = new Date().toISOString();
      return {
        ...base,
        status: "resolved",
        resolutionMode: "human",
        resolution: {
          finalResponse,
          humanEdited: command.humanEdited === true,
          editDistanceNote: null,
          resolvedAt: now,
          resolvedBy: null,
          evidenceIds
        },
        reflection: {
          ...asRecord(current.reflection),
          validationEligible: true,
          validationEligibilityReason: null,
          evidenceIds
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
      if (status !== "open" && status !== "in_review" && status !== "resolved") {
        throw new TicketWriteError("INVALID_TRANSITION", "A governed commit is only valid for an open, in-review, or evidence-resolved ticket.", 409);
      }
      const validationRecordIds = Array.isArray(command.validationRecordIds)
        ? command.validationRecordIds.filter((item): item is string => typeof item === "string")
        : [];
      await validateValidationReferences(organizationId, validationRecordIds);
      await validateKnowledgeReference(organizationId, command.knowledgeId);
      const evidenceIds = await requireResolutionEvidence(organizationId, current.ticketId);
      const classification = command.classification ? validateClassification(command.classification) : base.classification;
      const memoryMatch = command.memoryMatch !== undefined
        ? await validateMemoryMatchReference(organizationId, command.memoryMatch)
        : base.memoryMatch;
      const now = new Date().toISOString();
      const currentResolution = asRecord(current.resolution);
      const resolution = status === "resolved"
        ? {
            ...currentResolution,
            evidenceIds
          }
        : {
            finalResponse: typeof command.finalResponse === "string" && command.finalResponse.trim() ? command.finalResponse.trim() : null,
            humanEdited: command.automatic !== true,
            editDistanceNote: null,
            resolvedAt: now,
            resolvedBy: null,
            evidenceIds
          };
      return {
        ...base,
        classification,
        memoryMatch,
        status: "resolved",
        resolutionMode: status === "resolved" ? base.resolutionMode : command.automatic === true ? "automatic" : "human",
        resolution,
        reflection: {
          decision: typeof command.action === "string" ? command.action : null,
          lessonCreatedId: command.lessonCreatedId ?? null,
          lessonReinforcedId: command.lessonReinforcedId ?? null,
          knowledgeChanged: command.knowledgeChanged ?? (command.knowledgeId ?? null),
          validationEligible: true,
          validationEligibilityReason: null,
          evidenceIds
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

function mapWorkflowRecord(row: {
  ticketId: string;
  organizationId: string;
  actorId: string | null;
  createdAt: Date;
  rawMessage: string;
  subject: string | null;
  bulkUploadKey: string | null;
  bulkEntryId: string | null;
  bulkClusterId: string | null;
  intakeMode: string | null;
  classification: unknown;
  memoryMatch: unknown;
  draftSource: string | null;
  resolution: unknown;
  reflection: unknown;
  validationRecordIds: unknown;
  labels: unknown;
  status: string;
  resolutionMode: string | null;
}, messages: TicketMessage[], resolutionEvidence: TicketResolutionEvidence[] = []): TicketRecord {
  const status = requireStatus(row.status) as TicketRecordStatus;
  return {
    ticketId: row.ticketId,
    orgId: row.organizationId,
    actorId: row.actorId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    rawMessage: row.rawMessage,
    subject: row.subject,
    bulkUploadKey: row.bulkUploadKey,
    bulkEntryId: row.bulkEntryId,
    bulkClusterId: row.bulkClusterId,
    intakeMode: row.intakeMode === "bulk" ? "bulk" : row.intakeMode === "single" ? "single" : undefined,
    classification: row.classification === null ? null : asRecord(row.classification) as unknown as TicketRecordClassification,
    memoryMatch: row.memoryMatch === null ? null : asRecord(row.memoryMatch) as unknown as TicketRecordMemoryMatch,
    draftSource: row.draftSource as TicketRecord["draftSource"],
    resolution: asRecord(row.resolution) as unknown as TicketRecord["resolution"],
    reflection: asRecord(row.reflection) as unknown as TicketRecord["reflection"],
    validationRecordIds: Array.isArray(row.validationRecordIds) ? row.validationRecordIds.map(String) : [],
    labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
    status,
    resolutionMode: row.resolutionMode === "human" || row.resolutionMode === "automatic" ? row.resolutionMode : null,
    messages,
    resolutionEvidence,
  };
}

async function applyConversationCommand(input: TicketWorkflowInput, initial: CurrentRow): Promise<TicketRecord> {
  const command = input.command.kind === "append_customer_message" || input.command.kind === "send_agent_message"
    ? input.command
    : null;
  if (!command) throw new TicketWriteError("INVALID_TRANSITION", "The requested transition is not supported.", 400);
  const content = messageContent(command.kind === "append_customer_message" ? command.content : command.finalResponse);
  const key = idempotencyKey(command.idempotencyKey);
  const direction = command.kind === "append_customer_message" ? "customer" : "agent";

  const result = await prisma.$transaction(async (tx) => {
    // Serialize append operations for this case. The unique sequence constraint
    // remains a second line of defense for unexpected database races.
    await tx.$queryRaw(Prisma.sql`SELECT "ticketId" FROM "ticket_records" WHERE "organizationId" = ${input.organizationId} AND "ticketId" = ${input.ticketId} FOR UPDATE`);
    const current = await tx.ticketRecord.findUnique({
      where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } }
    });
    if (!current) throw new TicketWriteError("TICKET_NOT_FOUND", "The ticket was not found in this organization.", 404);
    const currentStatus = requireStatus(current.status);
    const existing = await tx.ticketMessage.findUnique({
      where: { organizationId_ticketId_idempotencyKey: { organizationId: input.organizationId, ticketId: input.ticketId, idempotencyKey: key } }
    });
    if (existing) {
      if (existing.direction !== direction || existing.content !== content) {
        throw new TicketWriteError("INVALID_TRANSITION", "The idempotency key is already bound to a different message.", 409);
      }
      return;
    }
    if (command.kind === "append_customer_message" && currentStatus !== "waiting_for_customer" && currentStatus !== "in_review" && currentStatus !== "resolved") {
      throw new TicketWriteError("INVALID_TRANSITION", "A customer follow-up can only append to a case that is waiting, in review, or resolved.", 409);
    }
    if (command.kind === "send_agent_message" && currentStatus !== "in_review") {
      throw new TicketWriteError("INVALID_TRANSITION", "An agent response can only be sent for an in-review case.", 409);
    }

    if (command.kind === "send_agent_message") {
      if (!Number.isInteger(command.expectedDraftRevision) || command.expectedDraftRevision < 0) {
        throw new TicketWriteError("INVALID_TRANSITION", "A valid expected draft revision is required.", 400);
      }
      const currentRevision = draftRevision(asRecord(current.resolution).draftRevision);
      if (command.expectedDraftRevision !== currentRevision) {
        throw new TicketWriteError("REVISION_CONFLICT", "This draft was updated elsewhere. Reload the latest draft before sending it.", 409);
      }
    }

    const maximum = await tx.ticketMessage.aggregate({
      where: { organizationId: input.organizationId, ticketId: input.ticketId },
      _max: { sequence: true }
    });
    const sequence = (maximum._max.sequence ?? 0) + 1;
    const messageId = `ticket-message-${input.ticketId}-${sequence}`;
    await tx.ticketMessage.create({
      data: {
        id: messageId,
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        sequence,
        direction,
        content,
        actorId: input.actorId,
        idempotencyKey: key,
      }
    });

    const currentResolution = asRecord(current.resolution);
    const nextResolution = {
      finalResponse: null,
      humanEdited: false,
      editDistanceNote: typeof currentResolution.editDistanceNote === "string" ? currentResolution.editDistanceNote : null,
      resolvedAt: null,
      draftRevision: 0,
    };
    const currentReflection = asRecord(current.reflection);
    const nextStatus = command.kind === "append_customer_message" ? "in_review" : "waiting_for_customer";
    await tx.ticketRecord.update({
      where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } },
      data: {
        status: nextStatus,
        resolution: json(nextResolution),
        resolutionMode: null,
        reflection: command.kind === "append_customer_message"
          ? json({
              ...currentReflection,
              validationEligible: false,
              validationEligibilityReason: "A new customer message requires fresh resolution evidence.",
              evidenceIds: [],
            })
          : undefined,
      }
    });
    await tx.ticketTransitionAudit.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        action: command.kind,
        actorId: input.actorId,
        previousStatus: current.status,
        newStatus: nextStatus,
        summary: json({ sequence, messageId, direction, requestId: input.requestId, correlationId: input.correlationId }),
        source: input.source,
        requestId: input.requestId,
        correlationId: input.correlationId,
      }
    });
  });
  void result;

  const saved = await prisma.ticketRecord.findUnique({
    where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } }
  });
  if (!saved) throw new TicketWriteError("TICKET_NOT_FOUND", "The ticket was not found in this organization.", 404);
  const [messages, evidence] = await prisma.$transaction([
    prisma.ticketMessage.findMany({
      where: { organizationId: input.organizationId, ticketId: input.ticketId },
      orderBy: { sequence: "asc" }
    }),
    prisma.ticketResolutionEvidence.findMany({
      where: { organizationId: input.organizationId, ticketId: input.ticketId },
      orderBy: { createdAt: "asc" }
    })
  ]);
  return mapWorkflowRecord(saved, messages.map((message) => ({
    id: message.id,
    orgId: message.organizationId,
    ticketId: message.ticketId,
    sequence: message.sequence,
    direction: message.direction,
    content: message.content,
    actorId: message.actorId,
    createdAt: message.createdAt.toISOString(),
    idempotencyKey: message.idempotencyKey,
  })), evidence.map((item) => ({
    id: item.id,
    orgId: item.organizationId,
    ticketId: item.ticketId,
    type: item.type,
    sourceMessageId: item.sourceMessageId,
    actorId: item.actorId,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    idempotencyKey: item.idempotencyKey,
  })));
}

async function applyResolutionEvidenceCommand(input: TicketWorkflowInput): Promise<TicketRecord> {
  const command = input.command.kind === "attach_resolution_evidence" || input.command.kind === "resolve_with_evidence"
    ? input.command
    : null;
  if (!command) throw new TicketWriteError("INVALID_TRANSITION", "The requested transition is not supported.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "ticketId" FROM "ticket_records" WHERE "organizationId" = ${input.organizationId} AND "ticketId" = ${input.ticketId} FOR UPDATE`);
    const current = await tx.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } } });
    if (!current) throw new TicketWriteError("TICKET_NOT_FOUND", "The ticket was not found in this organization.", 404);
    const currentStatus = requireStatus(current.status);

    if (command.kind === "attach_resolution_evidence") {
      const evidenceType = validateEvidenceType(command.evidenceType);
      const note = evidenceNote(command.note);
      const key = idempotencyKey(command.idempotencyKey);
      const existing = await tx.ticketResolutionEvidence.findUnique({
        where: { organizationId_ticketId_idempotencyKey: { organizationId: input.organizationId, ticketId: input.ticketId, idempotencyKey: key } }
      });
      if (existing) {
        if (existing.type !== evidenceType || existing.note !== note || existing.sourceMessageId !== (command.sourceMessageId ?? null)) {
          throw new TicketWriteError("INVALID_TRANSITION", "The evidence idempotency key is already bound to different evidence.", 409);
        }
        return;
      }
      if (currentStatus === "resolved" || currentStatus === "rejected" || currentStatus === "discarded") {
        throw new TicketWriteError("INVALID_TRANSITION", "Resolution evidence can only be attached to an unresolved case.", 409);
      }
      const sourceMessageId = command.sourceMessageId?.trim() || null;
      if (evidenceType === "customer_confirmation" && !sourceMessageId) {
        throw new TicketWriteError("INVALID_TRANSITION", "Customer confirmation evidence must reference a customer message.", 400);
      }
      if (sourceMessageId) {
        const source = await tx.ticketMessage.findUnique({ where: { id: sourceMessageId } });
        if (!source || source.organizationId !== input.organizationId || source.ticketId !== input.ticketId) {
          throw new TicketWriteError("INVALID_TRANSITION_REFERENCE", "The evidence source message does not belong to this case.", 400);
        }
        if (evidenceType === "customer_confirmation" && source.direction !== "customer") {
          throw new TicketWriteError("INVALID_TRANSITION", "Customer confirmation evidence must reference a customer message.", 400);
        }
      }
      const evidenceId = `resolution-evidence-${randomUUID()}`;
      await tx.ticketResolutionEvidence.create({
        data: {
          id: evidenceId,
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          type: evidenceType,
          sourceMessageId,
          actorId: input.actorId,
          note,
          idempotencyKey: key,
        }
      });
      const currentReflection = asRecord(current.reflection);
      await tx.ticketRecord.update({
        where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } },
        data: {
          reflection: json({
            ...currentReflection,
            validationEligible: false,
            validationEligibilityReason: "Evidence is recorded. Resolve the case before validating its Reflection.",
            evidenceIds: [...new Set([...(Array.isArray(currentReflection.evidenceIds) ? currentReflection.evidenceIds.map(String) : []), evidenceId])],
          })
        }
      });
      await tx.ticketTransitionAudit.create({
        data: {
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          action: "attach_resolution_evidence",
          actorId: input.actorId,
          previousStatus: current.status,
          newStatus: current.status,
          summary: json({ evidenceId, evidenceType, sourceMessageId, requestId: input.requestId, correlationId: input.correlationId }),
          source: input.source,
          requestId: input.requestId,
          correlationId: input.correlationId,
        }
      });
      return;
    }

    if (currentStatus !== "in_review" && currentStatus !== "waiting_for_customer") {
      throw new TicketWriteError("INVALID_TRANSITION", "Only an actionable case can be resolved with evidence.", 409);
    }
    const evidence = await tx.ticketResolutionEvidence.findUnique({ where: { id: command.evidenceId } });
    if (!evidence || evidence.organizationId !== input.organizationId || evidence.ticketId !== input.ticketId) {
      throw new TicketWriteError("INVALID_TRANSITION_REFERENCE", "The resolution evidence does not belong to this case.", 400);
    }
    const allEvidence = await tx.ticketResolutionEvidence.findMany({
      where: { organizationId: input.organizationId, ticketId: input.ticketId },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    const latestAgent = await tx.ticketMessage.findFirst({
      where: { organizationId: input.organizationId, ticketId: input.ticketId, direction: "agent" },
      orderBy: { sequence: "desc" },
      select: { content: true }
    });
    const now = new Date().toISOString();
    const currentResolution = asRecord(current.resolution);
    const currentReflection = asRecord(current.reflection);
    await tx.ticketRecord.update({
      where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } },
      data: {
        status: "resolved",
        resolutionMode: "human",
        resolution: json({
          finalResponse: latestAgent?.content ?? (typeof currentResolution.finalResponse === "string" ? currentResolution.finalResponse : null),
          humanEdited: true,
          editDistanceNote: typeof currentResolution.editDistanceNote === "string" ? currentResolution.editDistanceNote : null,
          resolvedAt: now,
          resolvedBy: input.actorId,
          evidenceIds: allEvidence.map((item) => item.id),
        }),
        reflection: json({
          ...currentReflection,
          validationEligible: true,
          validationEligibilityReason: null,
          evidenceIds: allEvidence.map((item) => item.id),
        })
      }
    });
    await tx.ticketTransitionAudit.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        action: "resolve_with_evidence",
        actorId: input.actorId,
        previousStatus: current.status,
        newStatus: "resolved",
        summary: json({ evidenceId: evidence.id, evidenceType: evidence.type, evidenceIds: allEvidence.map((item) => item.id), resolvedBy: input.actorId, resolvedAt: now, requestId: input.requestId, correlationId: input.correlationId }),
        source: input.source,
        requestId: input.requestId,
        correlationId: input.correlationId,
      }
    });
  });

  const saved = await prisma.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: input.ticketId } } });
  if (!saved) throw new TicketWriteError("TICKET_NOT_FOUND", "The ticket was not found in this organization.", 404);
  const [messages, evidence] = await prisma.$transaction([
    prisma.ticketMessage.findMany({ where: { organizationId: input.organizationId, ticketId: input.ticketId }, orderBy: { sequence: "asc" } }),
    prisma.ticketResolutionEvidence.findMany({ where: { organizationId: input.organizationId, ticketId: input.ticketId }, orderBy: { createdAt: "asc" } })
  ]);
  return mapWorkflowRecord(saved, messages.map((message) => ({
    id: message.id, orgId: message.organizationId, ticketId: message.ticketId, sequence: message.sequence,
    direction: message.direction, content: message.content, actorId: message.actorId,
    createdAt: message.createdAt.toISOString(), idempotencyKey: message.idempotencyKey,
  })), evidence.map((item) => ({
    id: item.id, orgId: item.organizationId, ticketId: item.ticketId, type: item.type,
    sourceMessageId: item.sourceMessageId, actorId: item.actorId, note: item.note,
    createdAt: item.createdAt.toISOString(), idempotencyKey: item.idempotencyKey,
  })));
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
  if (input.command.kind === "append_customer_message" || input.command.kind === "send_agent_message") {
    return applyConversationCommand(input, row);
  }
  if (input.command.kind === "attach_resolution_evidence" || input.command.kind === "resolve_with_evidence") {
    return applyResolutionEvidenceCommand(input);
  }
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

  const messages = await prisma.ticketMessage.findMany({
    where: { organizationId: input.organizationId, ticketId: input.ticketId },
    orderBy: { sequence: "asc" }
  });
  const evidence = await prisma.ticketResolutionEvidence.findMany({
    where: { organizationId: input.organizationId, ticketId: input.ticketId },
    orderBy: { createdAt: "asc" }
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
    ,messages: messages.map((message) => ({
      id: message.id,
      orgId: message.organizationId,
      ticketId: message.ticketId,
      sequence: message.sequence,
      direction: message.direction,
      content: message.content,
      actorId: message.actorId,
      createdAt: message.createdAt.toISOString(),
      idempotencyKey: message.idempotencyKey,
    })),
    resolutionEvidence: evidence.map((item) => ({
      id: item.id,
      orgId: item.organizationId,
      ticketId: item.ticketId,
      type: item.type,
      sourceMessageId: item.sourceMessageId,
      actorId: item.actorId,
      note: item.note,
      createdAt: item.createdAt.toISOString(),
      idempotencyKey: item.idempotencyKey,
    }))
  };
}
