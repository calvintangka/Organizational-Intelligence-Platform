import "server-only";

import { randomUUID } from "node:crypto";
import { createAIAdapter, readAIConfig } from "@/lib/ai/adapter";
import { BulkAnalysisCancelledError } from "@/lib/bulkUpload";
import { ProcessTicketError } from "@/lib/application/tickets/processTicket";
import { PatternDiscoveryError } from "@/lib/server/jobs/patternDiscoveryStore";
import { digestJobInput, type JobError, type JobRepository, type DurableJobRecord } from "@/lib/application/jobs/types";
import { createDefaultJobHandlerRegistry, type JobHandlerRegistry } from "@/lib/application/jobs/registry";
import { createPersistenceContext } from "@/lib/persistence/context";
import { createServerJobPersistenceSession } from "@/lib/server/jobs/serverPersistenceAdapter";
import { prisma } from "@/lib/server/prisma";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";
import { GovernedActionError } from "@/lib/server/actions/actionService";

const WORKER_VERSION = process.env.OIP_VERSION ?? process.env.npm_package_version ?? "dev";

export interface AsyncJobWorkerOptions {
  repository?: JobRepository;
  registry?: JobHandlerRegistry;
  workerId?: string;
  concurrency?: number;
  leaseMs?: number;
  pollMs?: number;
  drainTimeoutMs?: number;
}

export interface AsyncJobWorkerHealth {
  workerId: string;
  running: boolean;
  stopping: boolean;
  ready: boolean;
  activeJobs: number;
  capacity: number;
  lastPollAt?: string;
  lastError?: string;
}

function classify(error: unknown): JobError {
  if (error instanceof GovernedActionError) return { errorClass: error.code === "AUTHORIZATION_REVOKED" ? "unauthorized" : error.code === "POLICY_DENIED" ? "conflict" : "application_invariant", safeMessage: error.message, retryable: error.retryable };
  if (error instanceof BulkAnalysisCancelledError) return { errorClass: "cancelled", safeMessage: error.message, retryable: false };
  if (error instanceof PatternDiscoveryError) {
    return {
      errorClass: error.code === "INVALID_INPUT" ? "invalid_input" : error.code === "TENANT_MISMATCH" ? "tenant_mismatch" : error.code === "DATABASE_TRANSIENT" ? "database_transient" : "application_invariant",
      safeMessage: error.message,
      retryable: error.retryable
    };
  }
  if (error instanceof ProcessTicketError) {
    const failure = error.failure;
    const errorClass: JobError["errorClass"] = failure.errorClass === "authorization_mismatch" ? "tenant_mismatch"
      : failure.errorClass === "persistence_conflict" || failure.errorClass === "idempotency_conflict" ? "conflict"
      : failure.errorClass === "persistence_failure" ? "database_transient"
      : failure.errorClass === "transient_infrastructure_failure" ? "provider_unavailable"
      : failure.errorClass === "cancelled" ? "cancelled"
      : failure.errorClass === "provider_timeout" ? "provider_timeout"
      : failure.errorClass === "provider_unavailable" ? "provider_unavailable"
      : failure.errorClass === "provider_malformed_output" ? "provider_malformed_output"
      : failure.errorClass === "invalid_input" ? "invalid_input"
      : "permanent_failure";
    return { errorClass, safeMessage: failure.safeMessage, retryable: errorClass === "cancelled" ? false : failure.retryable };
  }
  if (error instanceof Error && /abort|cancel/i.test(error.message)) return { errorClass: "cancelled", safeMessage: "The job was cancelled.", retryable: false };
  return { errorClass: "unknown", safeMessage: error instanceof Error ? "The worker could not complete the job." : "The worker encountered an unknown failure.", retryable: true };
}

export class AsyncJobWorker {
  readonly workerId: string;
  readonly concurrency: number;
  readonly leaseMs: number;
  readonly pollMs: number;
  private readonly drainTimeoutMs: number;
  private readonly repository: JobRepository;
  private readonly registry: JobHandlerRegistry;
  private readonly active = new Set<Promise<void>>();
  private loopPromise: Promise<void> | null = null;
  private stopping = false;
  private running = false;
  private lastPollAt?: string;
  private lastError?: string;
  private readonly startedAt = new Date();

  constructor(options: AsyncJobWorkerOptions = {}) {
    this.workerId = options.workerId ?? `worker-${randomUUID()}`;
    this.concurrency = Math.max(1, Math.min(32, options.concurrency ?? Number(process.env.OIP_JOB_WORKER_CONCURRENCY ?? 2)));
    this.leaseMs = Math.max(5_000, options.leaseMs ?? 30_000);
    this.pollMs = Math.max(100, options.pollMs ?? 1_000);
    this.drainTimeoutMs = Math.max(1_000, options.drainTimeoutMs ?? 30_000);
    this.repository = options.repository ?? durableJobRepository;
    this.registry = options.registry ?? createDefaultJobHandlerRegistry();
  }

  health(): AsyncJobWorkerHealth {
    return { workerId: this.workerId, running: this.running, stopping: this.stopping, ready: this.running && !this.stopping && !this.lastError, activeJobs: this.active.size, capacity: this.concurrency, lastPollAt: this.lastPollAt, lastError: this.lastError };
  }

  start(): void {
    if (this.loopPromise) return;
    this.running = true;
    this.stopping = false;
    void this.persistHeartbeat({ status: "running", lastErrorSafe: null });
    this.loopPromise = this.loop().finally(() => { this.running = false; this.loopPromise = null; });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const deadline = Date.now() + this.drainTimeoutMs;
    while (this.active.size && Date.now() < deadline) await Promise.race([...this.active, new Promise((resolve) => setTimeout(resolve, 100))]);
    if (this.loopPromise) await this.loopPromise;
    await this.persistHeartbeat({ status: "stopped", currentJobId: null, currentLeaseExpiresAt: null });
  }

  async runOnce(): Promise<void> {
    this.lastPollAt = new Date().toISOString();
    await this.persistHeartbeat({ status: this.stopping ? "stopping" : "running", lastPollAt: new Date(), lastErrorSafe: null });
    await this.repository.releaseExpiredLeases();
    while (!this.stopping && this.active.size < this.concurrency) {
      const claimed = await this.repository.claimNext(this.workerId, { leaseMs: this.leaseMs });
      if (!claimed) break;
      await this.persistHeartbeat({ currentJobId: claimed.job.id, currentLeaseExpiresAt: claimed.job.leaseExpiresAt ? new Date(claimed.job.leaseExpiresAt) : null });
      const task = this.execute(claimed.job);
      this.active.add(task);
      void task.finally(() => this.active.delete(task));
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try { await this.runOnce(); this.lastError = undefined; }
      catch (error) { this.lastError = error instanceof Error ? "Worker polling failed" : "Worker polling failed"; await this.persistHeartbeat({ status: "error", lastErrorSafe: this.lastError }); }
      if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    await Promise.allSettled([...this.active]);
  }

  private async execute(job: DurableJobRecord): Promise<void> {
    const executionStartedAt = Date.now();
    const aiConfig = readAIConfig();
    const provider = aiConfig.mode;
    const controller = new AbortController();
    const heartbeat = setInterval(async () => {
      try {
        const current = await this.repository.renewLease(job.id, this.workerId, this.leaseMs);
        if (current.status === "cancellation_requested") controller.abort();
      } catch { controller.abort(); }
    }, Math.max(1_000, Math.floor(this.leaseMs / 3)));
    try {
      const actor = job.actorId ? await prisma.user.findUnique({ where: { id: job.actorId }, select: { id: true, name: true, email: true } }) : null;
      const actorContext = actor ?? { id: job.actorId ?? undefined, name: "Durable Worker", email: undefined };
      const context = createPersistenceContext({ organizationId: job.organizationId, actorContext: actor ?? { id: job.actorId }, authority: job.authority, requestId: job.requestId, correlationId: job.correlationId, idempotencyKey: job.idempotencyKey });
      const persistence = createServerJobPersistenceSession(context);
      const handler = this.registry.get(job.type);
      if (!handler) throw new Error(`No durable handler is registered for ${job.type}.`);
      const result = await handler({ job, actor: actorContext, persistence, ai: createAIAdapter(aiConfig), signal: controller.signal, reportProgress: async (progress) => {
        await this.repository.recordProgress(job.id, this.workerId, { ...progress, updatedAt: new Date().toISOString() });
      } });
      await this.repository.complete(job.id, this.workerId, result, digestJobInput(result), { provider, durationMs: Date.now() - executionStartedAt, safeDiagnostics: { jobType: job.type } });
      await this.persistHeartbeat({ processedJobs: { increment: 1 }, succeededJobs: { increment: 1 }, currentJobId: null, currentLeaseExpiresAt: null, lastHeartbeatAt: new Date(), lastErrorSafe: null });
    } catch (error) {
      try {
        const classified = classify(error);
        const failed = await this.repository.fail(job.id, this.workerId, classified, { provider, durationMs: Date.now() - executionStartedAt, safeDiagnostics: { jobType: job.type } });
        await this.persistHeartbeat({ processedJobs: { increment: 1 }, failedJobs: { increment: failed.status === "cancelled" ? 0 : 1 }, cancelledJobs: { increment: failed.status === "cancelled" ? 1 : 0 }, retryCount: { increment: failed.status === "retry_scheduled" || failed.status === "dead_lettered" ? 1 : 0 }, currentJobId: null, currentLeaseExpiresAt: null, lastHeartbeatAt: new Date(), lastErrorSafe: null });
      } catch (failure) { if (!(failure instanceof Error && /lease/i.test(failure.message))) throw failure; }
    } finally { clearInterval(heartbeat); await this.persistHeartbeat({ currentJobId: null, currentLeaseExpiresAt: null, lastHeartbeatAt: new Date() }); }
  }

  private async persistHeartbeat(update: Record<string, unknown>): Promise<void> {
    const now = new Date();
    const create = {
      workerId: this.workerId,
      status: "running",
      version: WORKER_VERSION,
      startedAt: this.startedAt,
      lastHeartbeatAt: now,
      lastPollAt: this.lastPollAt ? new Date(this.lastPollAt) : null,
      concurrency: this.concurrency,
      ...update
    } as Parameters<typeof prisma.durableWorkerHeartbeat.upsert>[0]["create"];
    await prisma.durableWorkerHeartbeat.upsert({
      where: { workerId: this.workerId },
      create,
      update: { ...update, lastHeartbeatAt: update.lastHeartbeatAt ?? now }
    });
  }
}
