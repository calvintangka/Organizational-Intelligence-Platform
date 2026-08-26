import "server-only";

import { Prisma } from "@/generated/prisma/client";

export type MemoryFoundationErrorCode =
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "RESOURCE_NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "REVISION_CONFLICT";

export class MemoryFoundationError extends Error {
  readonly name = "MemoryFoundationError";

  constructor(
    public readonly code: MemoryFoundationErrorCode,
    message: string,
    public readonly status: number = code === "INVALID_REQUEST" ? 400 : code === "RESOURCE_NOT_FOUND" ? 404 : 409
  ) {
    super(message);
  }
}

export interface SourceInput {
  sourceKind: string;
  sourceSystem: string;
  sourceObjectType: string;
  sourceObjectId: string;
  occurredAt?: Date | null;
  capturedAt?: Date | null;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface EvidenceInput {
  evidenceType: string;
  evidenceRole: string;
  actorId?: string | null;
  occurredAt?: Date | null;
  content?: string | null;
  reference?: string | null;
  state?: string;
  metadata?: Prisma.InputJsonValue | null;
  idempotencyKey: string;
}

export function memoryString(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MemoryFoundationError("INVALID_REQUEST", `${field} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > max) throw new MemoryFoundationError("INVALID_REQUEST", `${field} is too long.`);
  return normalized;
}

export function optionalMemoryString(value: unknown, field: string, max = 500): string | null {
  if (value === undefined || value === null || value === "") return null;
  return memoryString(value, field, max);
}

export function parseMemoryDate(value: unknown, field: string, required = false): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new MemoryFoundationError("INVALID_REQUEST", `${field} must be a valid ISO timestamp.`);
    return null;
  }
  if (typeof value !== "string") throw new MemoryFoundationError("INVALID_REQUEST", `${field} must be a valid ISO timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MemoryFoundationError("INVALID_REQUEST", `${field} must be a valid ISO timestamp.`);
  return parsed;
}

export function assertOrganizationId(organizationId: string): string {
  return memoryString(organizationId, "organizationId", 128);
}

/**
 * Canonical identity for a domain-neutral learning candidate prepared from a
 * single organizational Source. Preparation and validation must share this
 * contract so a candidate cannot be replayed against another Source.
 */
export function getNeutralCandidateId(sourceId: string): string {
  return `neutral-candidate-${memoryString(sourceId, "sourceId", 160)}`;
}

export function assertUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export async function ensureSourceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceInput: SourceInput
): Promise<any> {
  const sourceKind = memoryString(sourceInput.sourceKind, "sourceKind", 80);
  const sourceSystem = memoryString(sourceInput.sourceSystem, "sourceSystem", 120);
  const sourceObjectType = memoryString(sourceInput.sourceObjectType, "sourceObjectType", 120);
  const sourceObjectId = memoryString(sourceInput.sourceObjectId, "sourceObjectId", 300);
  return tx.organizationalSource.upsert({
    where: {
      organizationId_sourceSystem_sourceObjectType_sourceObjectId: {
        organizationId,
        sourceSystem,
        sourceObjectType,
        sourceObjectId
      }
    },
    create: {
      organizationId,
      sourceKind,
      sourceSystem,
      sourceObjectType,
      sourceObjectId,
      occurredAt: sourceInput.occurredAt ?? null,
      capturedAt: sourceInput.capturedAt ?? new Date(),
      actorId: sourceInput.actorId ?? null,
      metadata: sourceInput.metadata ?? undefined
    },
    update: {
      occurredAt: sourceInput.occurredAt ?? undefined,
      actorId: sourceInput.actorId ?? undefined,
      metadata: sourceInput.metadata ?? undefined
    }
  });
}

export async function ensureEvidenceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceId: string,
  evidenceInput: EvidenceInput
): Promise<any> {
  const idempotencyKey = memoryString(evidenceInput.idempotencyKey, "evidence.idempotencyKey", 240);
  return tx.evidenceRecord.upsert({
    where: {
      organizationId_sourceId_idempotencyKey: {
        organizationId,
        sourceId: memoryString(sourceId, "sourceId", 160),
        idempotencyKey
      }
    },
    create: {
      organizationId,
      sourceId,
      evidenceType: memoryString(evidenceInput.evidenceType, "evidenceType", 100),
      evidenceRole: memoryString(evidenceInput.evidenceRole, "evidenceRole", 100),
      actorId: evidenceInput.actorId ?? null,
      occurredAt: evidenceInput.occurredAt ?? null,
      content: evidenceInput.content ?? null,
      reference: evidenceInput.reference ?? null,
      state: evidenceInput.state ?? "active",
      metadata: evidenceInput.metadata ?? undefined,
      idempotencyKey
    },
    update: {}
  });
}

export async function ensureSourceAndEvidenceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceInput: SourceInput,
  evidenceInput: EvidenceInput
): Promise<{ source: any; evidence: any }> {
  const source = await ensureSourceTx(tx, organizationId, sourceInput);
  const evidence = await ensureEvidenceTx(tx, organizationId, source.id, evidenceInput);

  return { source, evidence };
}

export interface SupportEvidenceLink {
  sourceId: string;
  evidenceIds: string[];
}

/**
 * Adapts existing TicketRecord/TicketResolutionEvidence rows into the neutral
 * source/evidence tables without deleting or rewriting the Support records.
 */
export async function ensureSupportSourceAndEvidenceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ticketIds: string[],
  actorId: string
): Promise<Map<string, SupportEvidenceLink>> {
  const ids = [...new Set(ticketIds.filter((id) => typeof id === "string" && id.trim().length > 0))];
  if (ids.length === 0) return new Map();

  const tickets = await tx.ticketRecord.findMany({
    where: { organizationId, ticketId: { in: ids } },
    select: { id: true, ticketId: true, sourceId: true }
  });
  if (tickets.length !== ids.length) {
    throw new MemoryFoundationError("CONFLICT", "A Support source reference was not found in this organization.");
  }

  const evidenceRows = await tx.ticketResolutionEvidence.findMany({
    where: { organizationId, ticketId: { in: ids } },
    orderBy: { createdAt: "asc" }
  });
  const evidenceByTicket = new Map<string, string[]>();
  const result = new Map<string, SupportEvidenceLink>();

  for (const ticket of tickets) {
    const adapted = await ensureSourceAndEvidenceTx(
      tx,
      organizationId,
      {
        sourceKind: "support_ticket",
        sourceSystem: "oip.support",
        sourceObjectType: "ticket",
        sourceObjectId: ticket.ticketId,
        actorId
      },
      {
        evidenceType: "support_source",
        evidenceRole: "source_context",
        actorId,
        content: `Support ticket ${ticket.ticketId}`,
        idempotencyKey: `support-source-context:${ticket.ticketId}`
      }
    );
    // The source-context evidence is not resolution proof, but it gives every
    // adapted Support source a stable neutral evidence identity.
    const evidenceIds = [adapted.evidence.id];
    const resolutionRows = evidenceRows.filter((row) => row.ticketId === ticket.ticketId);
    for (const row of resolutionRows) {
      const resolution = await ensureSourceAndEvidenceTx(
        tx,
        organizationId,
        {
          sourceKind: "support_ticket",
          sourceSystem: "oip.support",
          sourceObjectType: "ticket",
          sourceObjectId: ticket.ticketId,
          actorId: row.actorId
        },
        {
          evidenceType: row.type,
          evidenceRole: "resolution",
          actorId: row.actorId,
          occurredAt: row.createdAt,
          content: row.note,
          reference: row.sourceMessageId,
          idempotencyKey: `ticket-resolution-evidence:${row.id}`
        }
      );
      evidenceIds.push(resolution.evidence.id);
      if (row.evidenceRecordId !== resolution.evidence.id) {
        await tx.ticketResolutionEvidence.update({
          where: { id: row.id },
          data: { evidenceRecordId: resolution.evidence.id }
        });
      }
    }
    const source = await tx.organizationalSource.findUniqueOrThrow({ where: { id: adapted.source.id } });
    if (ticket.sourceId !== source.id) {
      await tx.ticketRecord.update({ where: { id: ticket.id }, data: { sourceId: source.id } });
    }
    evidenceByTicket.set(ticket.ticketId, evidenceIds);
    result.set(ticket.ticketId, { sourceId: source.id, evidenceIds });
  }

  return result;
}
