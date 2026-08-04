import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { PersistenceContext } from "@/lib/persistence/context";
import { JobRepositoryError } from "@/lib/application/jobs/types";
import { prisma } from "@/lib/server/prisma";

export interface PreparedReflectionRecord {
  id: string;
  organizationId: string;
  jobId: string;
  ticketId: string;
  actorId?: string;
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  inputDigest: string;
  status: string;
  ticket: unknown;
  understanding: unknown;
  reviewedResponse: string;
  reflection: unknown;
  warnings: string[];
  reasons: string[];
  generationMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SavePreparedReflectionRequest {
  context: PersistenceContext;
  jobId: string;
  ticketId: string;
  inputDigest: string;
  idempotencyKey: string;
  ticket: unknown;
  understanding: unknown;
  reviewedResponse: string;
  reflection: unknown;
  warnings: string[];
  reasons: string[];
  generationMetadata: Record<string, unknown>;
}

function json(value: unknown): Prisma.InputJsonValue { return (value ?? {}) as Prisma.InputJsonValue; }
function map(row: any): PreparedReflectionRecord {
  return {
    id: row.id, organizationId: row.organizationId, jobId: row.jobId, ticketId: row.ticketId,
    actorId: row.actorId ?? undefined, requestId: row.requestId, correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey, inputDigest: row.inputDigest, status: row.status,
    ticket: row.ticket, understanding: row.understanding, reviewedResponse: row.reviewedResponse,
    reflection: row.reflection, warnings: Array.isArray(row.warnings) ? row.warnings as string[] : [],
    reasons: Array.isArray(row.reasons) ? row.reasons as string[] : [], generationMetadata: row.generationMetadata,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
  };
}

export class PreparedReflectionStore {
  async save(request: SavePreparedReflectionRequest): Promise<{ record: PreparedReflectionRecord; replayed: boolean }> {
    const organizationId = request.context.organizationId;
    const job = await prisma.durableJob.findUnique({ where: { id: request.jobId }, select: { organizationId: true } });
    if (!job || job.organizationId !== organizationId) throw new JobRepositoryError("AUTHORITY_MISMATCH", "The reflection job does not belong to this organization.", false, 403);
    const existing = await prisma.preparedReflection.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: request.idempotencyKey } } });
    if (existing) {
      if (existing.inputDigest !== request.inputDigest) throw new JobRepositoryError("IDEMPOTENCY_CONFLICT", "This reflection idempotency key is already bound to different input.", false, 409);
      return { record: map(existing), replayed: true };
    }
    const row = await prisma.preparedReflection.create({
      data: {
        organizationId, jobId: request.jobId, ticketId: request.ticketId, actorId: request.context.actorContext.id ?? null,
        requestId: request.context.requestId, correlationId: request.context.correlationId, idempotencyKey: request.idempotencyKey,
        inputDigest: request.inputDigest, status: "prepared", ticket: json(request.ticket), understanding: json(request.understanding),
        reviewedResponse: request.reviewedResponse, reflection: json(request.reflection), warnings: json(request.warnings),
        reasons: json(request.reasons), generationMetadata: json(request.generationMetadata)
      }
    });
    return { record: map(row), replayed: false };
  }

  async get(context: PersistenceContext, id: string): Promise<PreparedReflectionRecord> {
    const row = await prisma.preparedReflection.findUnique({ where: { id } });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The prepared reflection was not found.", false, 404);
    if (row.organizationId !== context.organizationId) throw new JobRepositoryError("AUTHORITY_MISMATCH", "The prepared reflection does not belong to this organization.", false, 403);
    return map(row);
  }
}

export const preparedReflectionStore = new PreparedReflectionStore();
