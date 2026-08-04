import type { AuthenticatedUser } from "@/lib/auth";
import { createPersistenceContext, type PersistenceContext } from "@/lib/persistence/context";
import type { DurableJobRecord } from "@/lib/application/jobs/types";

export function jobContext(organizationId: string, user: AuthenticatedUser, requestId: string, correlationId?: string): PersistenceContext {
  return createPersistenceContext({ organizationId, actorContext: user, authority: "server", requestId, correlationId });
}

export function safeJob(job: DurableJobRecord): Record<string, unknown> {
  return {
    id: job.id, organizationId: job.organizationId, actorId: job.actorId, type: job.type, version: job.version,
    status: job.status, priority: job.priority, authority: job.authority, inputDigest: job.inputDigest,
    idempotencyKey: job.idempotencyKey, correlationId: job.correlationId, requestId: job.requestId,
    progress: job.progress, progressMessage: job.progressMessage, result: job.result, resultDigest: job.resultDigest,
    error: job.error, retryable: job.retryable, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt, cancellationRequestedAt: job.cancellationRequestedAt, cancelledAt: job.cancelledAt,
    startedAt: job.startedAt, completedAt: job.completedAt, failedAt: job.failedAt, deadLetteredAt: job.deadLetteredAt,
    createdAt: job.createdAt, updatedAt: job.updatedAt
  };
}
