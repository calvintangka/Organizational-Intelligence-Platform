import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireOrganizationId } from "@/lib/organizationId";
import type { PersistenceContext } from "@/lib/persistence/context";
import {
  initialJobProgress,
  isJobStatus,
  isJobType,
  type ClaimedJob,
  type DurableJobRecord,
  type EnqueueJobRequest,
  type EnqueueJobResult,
  type JobAttemptRecord,
  type JobError,
  type JobAttemptDiagnostics,
  type JobListOptions,
  type JobProgress,
  type JobRepository,
  JobRepositoryError
} from "@/lib/application/jobs/types";

const DEFAULT_LEASE_MS = 30_000;
const MAX_LIST_LIMIT = 100;

function json(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function iso(value: Date | null | undefined): string | undefined {
  return value?.toISOString();
}

function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function classifyDatabaseError(error: unknown): JobRepositoryError {
  if (error instanceof JobRepositoryError) return error;
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message?.toLowerCase() ?? "";
  if (["P1001", "P1002", "P1017", "P2024"].includes(candidate?.code ?? "") || message.includes("connection") || message.includes("timeout")) {
    return new JobRepositoryError("DATABASE_TRANSIENT", "The durable job database is temporarily unavailable.", true, 503);
  }
  return new JobRepositoryError("JOB_CONFLICT", "The durable job operation could not be completed.", false, 409);
}

function mapAttempt(row: {
  id: string;
  jobId: string;
  attemptNumber: number;
  workerId: string;
  startedAt: Date;
  heartbeatAt: Date | null;
  finishedAt: Date | null;
  outcome: string;
  errorClass: string | null;
  retryable: boolean | null;
  provider: string | null;
  durationMs: number | null;
  safeDiagnostics: Prisma.JsonValue | null;
}): JobAttemptRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    attemptNumber: row.attemptNumber,
    workerId: row.workerId,
    startedAt: row.startedAt.toISOString(),
    heartbeatAt: iso(row.heartbeatAt),
    finishedAt: iso(row.finishedAt),
    outcome: row.outcome,
    errorClass: row.errorClass as JobAttemptRecord["errorClass"],
    retryable: row.retryable ?? undefined,
    provider: row.provider ?? undefined,
    durationMs: row.durationMs ?? undefined,
    safeDiagnostics: row.safeDiagnostics && typeof row.safeDiagnostics === "object" && !Array.isArray(row.safeDiagnostics)
      ? row.safeDiagnostics as Record<string, unknown>
      : undefined
  };
}

function mapJob(row: {
  id: string;
  organizationId: string;
  actorId: string | null;
  type: string;
  version: number;
  status: string;
  priority: number;
  authority: string;
  input: Prisma.JsonValue;
  inputDigest: string;
  idempotencyKey: string;
  correlationId: string;
  requestId: string;
  progress: Prisma.JsonValue;
  progressMessage: string | null;
  result: Prisma.JsonValue | null;
  resultDigest: string | null;
  error: Prisma.JsonValue | null;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  cancellationRequestedAt: Date | null;
  cancelledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DurableJobRecord {
  if (!isJobType(row.type) || !isJobStatus(row.status) || (row.authority !== "local" && row.authority !== "server")) {
    throw new JobRepositoryError("INVALID_JOB", "The durable job contains an unsupported type, status, or authority.");
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorId: row.actorId ?? undefined,
    type: row.type,
    version: row.version,
    status: row.status,
    priority: row.priority,
    authority: row.authority,
    input: row.input as Record<string, unknown>,
    inputDigest: row.inputDigest,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
    requestId: row.requestId,
    progress: row.progress as unknown as JobProgress,
    progressMessage: row.progressMessage ?? undefined,
    result: row.result ?? undefined,
    resultDigest: row.resultDigest ?? undefined,
    error: row.error as unknown as JobError | undefined,
    retryable: row.retryable,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: iso(row.nextAttemptAt),
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: iso(row.leaseExpiresAt),
    cancellationRequestedAt: iso(row.cancellationRequestedAt),
    cancelledAt: iso(row.cancelledAt),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    failedAt: iso(row.failedAt),
    deadLetteredAt: iso(row.deadLetteredAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function assertContextOrganization(context: PersistenceContext, organizationId: string): void {
  if (context.organizationId !== organizationId) {
    throw new JobRepositoryError("AUTHORITY_MISMATCH", "The job does not belong to the requested organization.", false, 403);
  }
}

export class PrismaJobRepository implements JobRepository {
  async enqueue(request: EnqueueJobRequest): Promise<EnqueueJobResult> {
    const organizationId = requireOrganizationId(request.context.organizationId, "Durable job organization");
    if (!isJobType(request.type) || !Number.isInteger(request.version) || request.version < 1) {
      throw new JobRepositoryError("INVALID_JOB", "The durable job type and version are invalid.");
    }
    const idempotencyKey = request.idempotencyKey.trim();
    if (!idempotencyKey || !request.inputDigest.trim()) {
      throw new JobRepositoryError("INVALID_JOB", "A durable job requires an idempotency key and input digest.");
    }
    const now = new Date();
    const data = {
      organizationId,
      actorId: request.context.actorContext.id ?? null,
      type: request.type,
      version: request.version,
      status: "queued",
      priority: Math.max(0, Math.min(1000, Math.round(request.priority ?? 100))),
      authority: request.context.authority,
      input: json(request.input),
      inputDigest: request.inputDigest,
      idempotencyKey,
      correlationId: request.context.correlationId,
      requestId: request.context.requestId,
      progress: json(initialJobProgress(now.toISOString())),
      retryable: false,
      attemptCount: 0,
      maxAttempts: Math.max(1, Math.min(10, Math.round(request.maxAttempts ?? 3))),
      createdAt: now
    };
    try {
      const row = await prisma.durableJob.create({ data });
      return { job: mapJob(row), replayed: false };
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "P2002") throw classifyDatabaseError(error);
      const existing = await prisma.durableJob.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } }
      });
      if (!existing) throw classifyDatabaseError(error);
      const existingJob = mapJob(existing);
      if (existingJob.type !== request.type || existingJob.version !== request.version || existingJob.inputDigest !== request.inputDigest) {
        throw new JobRepositoryError("IDEMPOTENCY_CONFLICT", "This organization idempotency key is already bound to a different job input.", false, 409);
      }
      return { job: existingJob, replayed: true };
    }
  }

  async get(context: PersistenceContext, jobId: string): Promise<DurableJobRecord> {
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } }).catch((error) => { throw classifyDatabaseError(error); });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The requested durable job was not found.", false, 404);
    assertContextOrganization(context, row.organizationId);
    if (row.authority !== context.authority) throw new JobRepositoryError("AUTHORITY_MISMATCH", "The durable job authority does not match the operation context.", false, 409);
    return mapJob(row);
  }

  async getForWorker(jobId: string): Promise<DurableJobRecord | null> {
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } }).catch((error) => { throw classifyDatabaseError(error); });
    return row ? mapJob(row) : null;
  }

  async claimNext(workerId: string, options: { leaseMs?: number; now?: Date } = {}): Promise<ClaimedJob | null> {
    const now = options.now ?? new Date();
    const leaseMs = Math.max(5_000, options.leaseMs ?? DEFAULT_LEASE_MS);
    const candidates = await prisma.durableJob.findMany({
      where: {
        OR: [
          { status: "queued", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }], leaseOwner: null },
          { status: "retry_scheduled", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }], leaseOwner: null },
          { status: { in: ["leased", "running"] }, leaseExpiresAt: { lte: now } }
        ]
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: 100
    }).catch((error) => { throw classifyDatabaseError(error); });

    for (const candidate of candidates) {
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const updated = await prisma.durableJob.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          OR: [{ leaseOwner: null }, { leaseExpiresAt: { lte: now } }]
        },
        data: {
          status: "running",
          leaseOwner: workerId,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
          startedAt: candidate.startedAt ?? now,
          progressMessage: "Worker claimed job"
        }
      }).catch((error) => { throw classifyDatabaseError(error); });
      if (updated.count !== 1) continue;

      const row = await prisma.durableJob.findUnique({ where: { id: candidate.id } });
      if (!row) continue;
      const attempt = await prisma.durableJobAttempt.create({
        data: {
          jobId: row.id,
          attemptNumber: row.attemptCount,
          workerId,
          startedAt: now,
          heartbeatAt: now,
          outcome: "running"
        }
      });
      return { job: mapJob(row), attempt: mapAttempt(attempt) };
    }
    return null;
  }

  async renewLease(jobId: string, workerId: string, leaseMs = DEFAULT_LEASE_MS): Promise<DurableJobRecord> {
    const now = new Date();
    const updated = await prisma.durableJob.updateMany({
      where: { id: jobId, leaseOwner: workerId, status: { in: ["leased", "running", "cancellation_requested"] } },
      data: { leaseExpiresAt: new Date(now.getTime() + Math.max(5_000, leaseMs)) }
    });
    if (updated.count !== 1) throw new JobRepositoryError("LEASE_LOST", "The worker lease is no longer valid.", true, 409);
    await prisma.durableJobAttempt.updateMany({ where: { jobId, workerId, finishedAt: null }, data: { heartbeatAt: now } });
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The durable job was not found.", false, 404);
    return mapJob(row);
  }

  async recordProgress(jobId: string, workerId: string, progress: JobProgress): Promise<DurableJobRecord> {
    const updated = await prisma.durableJob.updateMany({
      where: { id: jobId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: { progress: json(progress), progressMessage: progress.message ?? null }
    });
    if (updated.count !== 1) {
      const current = await this.getForWorker(jobId);
      if (current?.status === "cancellation_requested") throw new JobRepositoryError("CANCELLATION_CONFLICT", "Cancellation was requested for this job.", false, 409);
      throw new JobRepositoryError("LEASE_LOST", "The worker lease is no longer valid.", true, 409);
    }
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The durable job was not found.", false, 404);
    return mapJob(row);
  }

  async complete(jobId: string, workerId: string, result: unknown, resultDigest?: string, diagnostics?: JobAttemptDiagnostics): Promise<DurableJobRecord> {
    const now = new Date();
    const current = await prisma.durableJob.findUnique({ where: { id: jobId }, select: { progress: true } });
    if (!current) throw new JobRepositoryError("JOB_NOT_FOUND", "The durable job was not found.", false, 404);
    const currentProgress = current.progress && typeof current.progress === "object" && !Array.isArray(current.progress)
      ? current.progress as { total?: unknown }
      : {};
    const total = typeof currentProgress.total === "number" && currentProgress.total > 0 ? currentProgress.total : 1;
    const updated = await prisma.durableJob.updateMany({
      where: { id: jobId, leaseOwner: workerId, status: { in: ["leased", "running", "cancellation_requested"] } },
      data: {
        status: "succeeded",
        result: nullableJson(result),
        resultDigest: resultDigest ?? null,
        retryable: false,
        progress: json({ stage: "succeeded", completed: total, total, percent: 100, updatedAt: now.toISOString() }),
        progressMessage: "Completed",
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now
      }
    });
    if (updated.count !== 1) throw new JobRepositoryError("LEASE_LOST", "The worker could not complete the job because its lease was lost.", true, 409);
    await prisma.durableJobAttempt.updateMany({ where: { jobId, workerId, finishedAt: null }, data: { finishedAt: now, heartbeatAt: now, outcome: "succeeded", provider: diagnostics?.provider, durationMs: diagnostics?.durationMs, safeDiagnostics: diagnostics?.safeDiagnostics as Prisma.InputJsonValue | undefined } });
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The durable job was not found.", false, 404);
    return mapJob(row);
  }

  async fail(jobId: string, workerId: string, error: JobError, diagnostics?: JobAttemptDiagnostics): Promise<DurableJobRecord> {
    const current = await this.getForWorker(jobId);
    if (!current || current.leaseOwner !== workerId) throw new JobRepositoryError("LEASE_LOST", "The worker lease is no longer valid.", true, 409);
    const now = new Date();
    const cancelled = error.errorClass === "cancelled";
    const exhausted = !error.retryable || current.attemptCount >= current.maxAttempts;
    const retryAt = new Date(now.getTime() + Math.min(15 * 60_000, 500 * (2 ** Math.max(0, current.attemptCount - 1))) + Math.floor(Math.random() * 250));
    const status = cancelled ? "cancelled" : exhausted ? (error.retryable ? "dead_lettered" : "failed") : "retry_scheduled";
    const updated = await prisma.durableJob.updateMany({
      where: { id: jobId, leaseOwner: workerId, status: { in: ["leased", "running", "cancellation_requested"] } },
      data: {
        status,
        error: json(error),
        retryable: error.retryable,
        nextAttemptAt: exhausted ? null : retryAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        failedAt: cancelled ? null : exhausted ? now : null,
        deadLetteredAt: status === "dead_lettered" ? now : null,
        cancelledAt: cancelled ? now : null,
        progressMessage: error.safeMessage
      }
    });
    if (updated.count !== 1) throw new JobRepositoryError("LEASE_LOST", "The worker could not record the failure because its lease was lost.", true, 409);
    await prisma.durableJobAttempt.updateMany({
      where: { jobId, workerId, finishedAt: null },
      data: { finishedAt: now, heartbeatAt: now, outcome: status, errorClass: error.errorClass, retryable: error.retryable, provider: diagnostics?.provider, durationMs: diagnostics?.durationMs, safeDiagnostics: diagnostics?.safeDiagnostics as Prisma.InputJsonValue | undefined }
    });
    const row = await prisma.durableJob.findUnique({ where: { id: jobId } });
    if (!row) throw new JobRepositoryError("JOB_NOT_FOUND", "The durable job was not found.", false, 404);
    return mapJob(row);
  }

  async requestCancellation(context: PersistenceContext, jobId: string): Promise<DurableJobRecord> {
    const current = await this.get(context, jobId);
    if (["succeeded", "failed", "cancelled", "dead_lettered"].includes(current.status)) {
      throw new JobRepositoryError("CANCELLATION_CONFLICT", "A completed durable job cannot be cancelled.", false, 409);
    }
    const now = new Date();
    const immediatelyCancelled = current.status === "queued" || current.status === "retry_scheduled";
    const updated = await prisma.durableJob.update({
      where: { id: jobId },
      data: immediatelyCancelled
        ? { status: "cancelled", cancellationRequestedAt: now, cancelledAt: now, retryable: false, progressMessage: "Cancelled before execution" }
        : { status: "cancellation_requested", cancellationRequestedAt: now, progressMessage: "Cancellation requested" }
    });
    return mapJob(updated);
  }

  async retry(context: PersistenceContext, jobId: string): Promise<DurableJobRecord> {
    const current = await this.get(context, jobId);
    if (current.status !== "failed" && current.status !== "dead_lettered") {
      throw new JobRepositoryError("JOB_CONFLICT", "Only failed or dead-lettered jobs can be retried.", false, 409);
    }
    const updated = await prisma.durableJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        error: Prisma.DbNull,
        retryable: false,
        nextAttemptAt: null,
        failedAt: null,
        deadLetteredAt: null,
        cancelledAt: null,
        cancellationRequestedAt: null,
        progress: json(initialJobProgress()),
        progressMessage: "Requeued by operator"
      }
    });
    return mapJob(updated);
  }

  async releaseExpiredLeases(now = new Date()): Promise<number> {
    const jobs = await prisma.durableJob.findMany({ where: { status: { in: ["leased", "running"] }, leaseExpiresAt: { lte: now } }, select: { id: true, leaseOwner: true } });
    let released = 0;
    for (const job of jobs) {
      const updated = await prisma.durableJob.updateMany({
        where: { id: job.id, status: { in: ["leased", "running"] }, leaseExpiresAt: { lte: now } },
        data: {
          status: "retry_scheduled",
          retryable: true,
          nextAttemptAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          error: json({ errorClass: "database_transient", safeMessage: "The previous worker lease expired before completion.", retryable: true }),
          progressMessage: "Recovered after worker lease expiry"
        }
      });
      if (updated.count === 1) {
        released += 1;
        await prisma.durableJobAttempt.updateMany({ where: { jobId: job.id, finishedAt: null }, data: { finishedAt: now, heartbeatAt: now, outcome: "lease_expired", errorClass: "database_transient", retryable: true } });
      }
    }
    return released;
  }

  async list(context: PersistenceContext, options: JobListOptions = {}): Promise<DurableJobRecord[]> {
    const rows = await prisma.durableJob.findMany({
      where: { organizationId: context.organizationId, ...(options.status ? { status: options.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(MAX_LIST_LIMIT, options.limit ?? 50))
    });
    return rows.map(mapJob);
  }

  async listAttempts(context: PersistenceContext, jobId: string): Promise<JobAttemptRecord[]> {
    await this.get(context, jobId);
    const rows = await prisma.durableJobAttempt.findMany({ where: { jobId }, orderBy: { attemptNumber: "asc" } });
    return rows.map(mapAttempt);
  }
}

export const durableJobRepository = new PrismaJobRepository();
