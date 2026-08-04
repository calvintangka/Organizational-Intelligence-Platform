import type { PersistenceContext } from "@/lib/persistence/context";

export const JOB_STATUSES = [
  "queued",
  "leased",
  "running",
  "retry_scheduled",
  "succeeded",
  "failed",
  "cancellation_requested",
  "cancelled",
  "dead_lettered"
] as const;

export type JobStatus = typeof JOB_STATUSES[number];
export type JobType = "ticket.process" | "bulk.analyze" | "pattern.discover" | "reflection.generate";

export const JOB_TYPES = ["ticket.process", "bulk.analyze", "pattern.discover", "reflection.generate"] as const satisfies readonly JobType[];

export type JobErrorClass =
  | "invalid_input"
  | "unauthorized"
  | "tenant_mismatch"
  | "conflict"
  | "cancelled"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_malformed_output"
  | "database_transient"
  | "database_conflict"
  | "application_invariant"
  | "permanent_failure"
  | "unknown";

export interface JobProgress {
  stage: string;
  completed: number;
  total?: number;
  percent: number;
  message?: string;
  updatedAt: string;
}

export interface JobError {
  errorClass: JobErrorClass;
  safeMessage: string;
  retryable: boolean;
  operatorMessage?: string;
  code?: string;
}

export interface DurableJobRecord {
  id: string;
  organizationId: string;
  actorId?: string;
  type: JobType;
  version: number;
  status: JobStatus;
  priority: number;
  authority: "local" | "server";
  input: Record<string, unknown>;
  inputDigest: string;
  idempotencyKey: string;
  correlationId: string;
  requestId: string;
  progress: JobProgress;
  progressMessage?: string;
  result?: unknown;
  resultDigest?: string;
  error?: JobError;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  cancellationRequestedAt?: string;
  cancelledAt?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  deadLetteredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobAttemptRecord {
  id: string;
  jobId: string;
  attemptNumber: number;
  workerId: string;
  startedAt: string;
  heartbeatAt?: string;
  finishedAt?: string;
  outcome: string;
  errorClass?: JobErrorClass;
  retryable?: boolean;
  provider?: string;
  durationMs?: number;
  safeDiagnostics?: Record<string, unknown>;
}

export interface EnqueueJobRequest {
  context: PersistenceContext;
  type: JobType;
  version: number;
  input: Record<string, unknown>;
  inputDigest: string;
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
}

export interface EnqueueJobResult {
  job: DurableJobRecord;
  replayed: boolean;
}

export interface ClaimedJob {
  job: DurableJobRecord;
  attempt: JobAttemptRecord;
}

export interface JobListOptions {
  status?: JobStatus;
  limit?: number;
}

export interface JobRepository {
  enqueue(request: EnqueueJobRequest): Promise<EnqueueJobResult>;
  get(context: PersistenceContext, jobId: string): Promise<DurableJobRecord>;
  getForWorker(jobId: string): Promise<DurableJobRecord | null>;
  claimNext(workerId: string, options?: { leaseMs?: number; now?: Date }): Promise<ClaimedJob | null>;
  renewLease(jobId: string, workerId: string, leaseMs?: number): Promise<DurableJobRecord>;
  recordProgress(jobId: string, workerId: string, progress: JobProgress): Promise<DurableJobRecord>;
  complete(jobId: string, workerId: string, result: unknown, resultDigest?: string): Promise<DurableJobRecord>;
  fail(jobId: string, workerId: string, error: JobError): Promise<DurableJobRecord>;
  requestCancellation(context: PersistenceContext, jobId: string): Promise<DurableJobRecord>;
  retry(context: PersistenceContext, jobId: string): Promise<DurableJobRecord>;
  releaseExpiredLeases(now?: Date): Promise<number>;
  list(context: PersistenceContext, options?: JobListOptions): Promise<DurableJobRecord[]>;
  listAttempts(context: PersistenceContext, jobId: string): Promise<JobAttemptRecord[]>;
}

export type JobRepositoryErrorCode =
  | "INVALID_JOB"
  | "JOB_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "JOB_CONFLICT"
  | "LEASE_LOST"
  | "CANCELLATION_CONFLICT"
  | "AUTHORITY_MISMATCH"
  | "DATABASE_TRANSIENT";

export class JobRepositoryError extends Error {
  constructor(
    public readonly code: JobRepositoryErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status = code === "JOB_NOT_FOUND" ? 404 : code === "IDEMPOTENCY_CONFLICT" || code === "JOB_CONFLICT" || code === "CANCELLATION_CONFLICT" ? 409 : 400
  ) {
    super(message);
    this.name = "JobRepositoryError";
  }
}

export function stableJobJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJobJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJobJson(record[key])}`).join(",")}}`;
}

export function digestJobInput(value: unknown): string {
  const input = stableJobJson(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function initialJobProgress(now = new Date().toISOString()): JobProgress {
  return { stage: "queued", completed: 0, total: 1, percent: 0, updatedAt: now };
}

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isJobType(value: unknown): value is JobType {
  return typeof value === "string" && (JOB_TYPES as readonly string[]).includes(value);
}
