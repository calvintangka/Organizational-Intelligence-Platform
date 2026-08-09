import "server-only";

import {
  TICKET_AUTHORITY_FIELDS,
  TicketWriteError,
  type ClientTicketRecord,
  type TicketRecord
} from "@/types";

/**
 * RSS-1.2S3 — the strict client ticket write boundary.
 *
 * The compatibility PUT and the generic resource writer accept only these
 * client-owned fields. Any server-owned field (status, actorId, resolutionMode,
 * resolution, reflection, classification, memoryMatch, validationRecordIds,
 * labels, draftSource, createdAt, processing metadata, intakeMode,
 * bulkClusterId) is rejected with `AUTHORITY_FIELD_REJECTED` — never silently
 * ignored, never overwriting server-owned state. The organization identifier
 * must match the authenticated organization.
 */
export function validateClientTicketRecord(input: unknown, organizationId: string): ClientTicketRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TicketWriteError("INVALID_TRANSITION", "Each ticket write must be an object.", 400);
  }
  const record = input as Record<string, unknown>;

  if (typeof record.ticketId !== "string" || !record.ticketId.trim()) {
    throw new TicketWriteError("INVALID_TRANSITION", "ticketId is required.", 400);
  }
  if (record.orgId !== organizationId) {
    throw new TicketWriteError("CROSS_ORGANIZATION_REJECTED", "The ticket organization does not match the authenticated organization.", 403);
  }
  for (const field of TICKET_AUTHORITY_FIELDS) {
    if (field in record) {
      throw new TicketWriteError("AUTHORITY_FIELD_REJECTED", `The server-owned field "${field}" cannot be set by a client.`, 400);
    }
  }
  const rawMessage = typeof record.rawMessage === "string" ? record.rawMessage : "";
  if (!rawMessage.trim()) {
    throw new TicketWriteError("INVALID_TRANSITION", "rawMessage is required.", 400);
  }
  return {
    ticketId: record.ticketId.trim(),
    orgId: organizationId,
    rawMessage,
    subject: typeof record.subject === "string" ? record.subject : null,
    bulkUploadKey: typeof record.bulkUploadKey === "string" ? record.bulkUploadKey : null,
    bulkEntryId: typeof record.bulkEntryId === "string" ? record.bulkEntryId : null
  };
}

/** Server-computed authoritative ticket for a client proposal. */
export function buildAuthoritativeClientTicketRecord(
  clean: ClientTicketRecord,
  organizationId: string,
  actorId: string
): TicketRecord {
  const now = new Date().toISOString();
  return {
    ticketId: clean.ticketId,
    orgId: organizationId,
    actorId,
    createdAt: now,
    bulkUploadKey: clean.bulkUploadKey ?? null,
    bulkEntryId: clean.bulkEntryId ?? null,
    intakeMode: clean.bulkUploadKey ? "bulk" : "single",
    rawMessage: clean.rawMessage,
    subject: clean.subject,
    classification: null,
    memoryMatch: null,
    draftSource: null,
    resolution: { finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: null },
    reflection: { decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null },
    validationRecordIds: [],
    labels: [],
    status: "open",
    resolutionMode: null
  };
}
