import "server-only";

import { randomUUID } from "node:crypto";
import { createAIAdapter, readAIConfig } from "@/lib/ai/adapter";
import { ProcessTicketError } from "@/lib/application/tickets/processTicket";
import { digestJobInput, type JobError, type JobRepository, type DurableJobRecord } from "@/lib/application/jobs/types";
import { createDefaultJobHandlerRegistry, type JobHandlerRegistry } from "@/lib/application/jobs/registry";
import { createPersistenceContext } from "@/lib/persistence/context";
import { createServerJobPersistenceSession } from "@/lib/server/jobs/serverPersistenceAdapter";
import { prisma } from "@/lib/server/prisma";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";

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
    this.loopPromise = this.loop().finally(() => { this.running = false; this.loopPromise = null; });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const deadline = Date.now() + this.drainTimeoutMs;
    while (this.active.size && Date.now() < deadline) await Promise.race([...this.active, new Promise((resolve) => setTimeout(resolve, 100))]);
    if (this.loopPromise) await this.loopPromise;
  }

  async runOnce(): Promise<void> {
    this.lastPollAt = new Date().toISOString();
    await this.repository.releaseExpiredLeases();
    while (!this.stopping && this.active.size < this.concurrency) {
      const claimed = await this.repository.claimNext(this.workerId, { leaseMs: this.leaseMs });
      if (!claimed) break;
      const task = this.execute(claimed.job);
      this.active.add(task);
      void task.finally(() => this.active.delete(task));
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try { await this.runOnce(); this.lastError = undefined; }
      catch (error) { this.lastError = error instanceof Error ? error.message : "Worker polling failed"; }
      if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    await Promise.allSettled([...this.active]);
  }

  private async execute(job: DurableJobRecord): Promise<void> {
    const controller = new AbortController();
    const heartbeat = setInterval(async () => {
      try {
        const current = await this.repository.renewLease(job.id, this.workerId, this.leaseMs);
        if (current.status === "cancellation_requested") controller.abort();
      } catch { controller.abort(); }
    }, Math.max(1_000, Math.floor(this.leaseMs / 3)));
    try {
      const actor = job.actorId ? await prisma.user.findUnique({ where: { id: job.actorId }, select: { id: true, name: true, email: true } }) : null;
      const context = createPersistenceContext({ organizationId: job.organizationId, actorContext: actor ?? { id: job.actorId }, authority: job.authority, requestId: job.requestId, correlationId: job.correlationId, idempotencyKey: job.idempotencyKey });
      const persistence = createServerJobPersistenceSession(context);
      const handler = this.registry.get(job.type);
      if (!handler) throw new Error(`No durable handler is registered for ${job.type}.`);
      const result = await handler({ job, persistence, ai: createAIAdapter(readAIConfig()), signal: controller.signal, reportProgress: async (progress) => {
        await this.repository.recordProgress(job.id, this.workerId, { ...progress, updatedAt: new Date().toISOString() });
      } });
      await this.repository.complete(job.id, this.workerId, result, digestJobInput(result));
    } catch (error) {
      try { await this.repository.fail(job.id, this.workerId, classify(error)); } catch (failure) { if (!(failure instanceof Error && /lease/i.test(failure.message))) throw failure; }
    } finally { clearInterval(heartbeat); }
  }
}
