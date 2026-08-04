import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { DurableJobRecord, JobAttemptRecord, JobStatus, JobType } from "@/lib/application/jobs/types";

const OFFLINE_AFTER_MS = 45_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type JobRow = DurableJobRecord & { attempts?: JobAttemptRecord[] };

export interface SafeOperationJob {
  id: string;
  organizationId: string;
  type: JobType;
  version: number;
  status: JobStatus;
  priority: number;
  inputDigest: string;
  resultDigest?: string;
  correlationId: string;
  requestId: string;
  progress: DurableJobRecord["progress"];
  progressMessage?: string;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  workerId?: string;
  errorClass?: string;
  safeErrorMessage?: string;
  nextAttemptAt?: string;
  leaseExpiresAt?: string;
  cancellationRequestedAt?: string;
  cancelledAt?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  deadLetteredAt?: string;
  createdAt: string;
  updatedAt: string;
  resultSummary?: Record<string, unknown>;
}

export interface SafeAttempt {
  id: string;
  attemptNumber: number;
  workerId: string;
  startedAt: string;
  finishedAt?: string;
  outcome: string;
  errorClass?: string;
  retryable?: boolean;
  provider?: string;
  durationMs?: number;
  safeDiagnostics?: Record<string, unknown>;
}

export interface OperationsSnapshot {
  generatedAt: string;
  organizationId: string;
  accessibleOrganizationCount: number;
  overview: {
    workersOnline: number;
    workersOffline: number;
    queuedJobs: number;
    runningJobs: number;
    retryingJobs: number;
    succeededJobs: number;
    failedJobs: number;
    cancelledJobs: number;
    deadLetterJobs: number;
    totalJobs: number;
    longestRunningJob: SafeOperationJob | null;
  };
  workers: Array<Record<string, unknown>>;
  queues: Array<Record<string, unknown>>;
  jobs: SafeOperationJob[];
  organizations: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  performance: Record<string, unknown>;
  failures: Array<Record<string, unknown>>;
  deadLetters: SafeOperationJob[];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resultSummary(job: DurableJobRecord): Record<string, unknown> | undefined {
  const result = job.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as Record<string, unknown>;
  if (job.type === "bulk.analyze") {
    const analysis = record.analysis && typeof record.analysis === "object" ? record.analysis as Record<string, unknown> : {};
    const clusters = Array.isArray(analysis.clusters) ? analysis.clusters.length : undefined;
    const unclustered = analysis.unclustered && typeof analysis.unclustered === "object" ? analysis.unclustered as Record<string, unknown> : {};
    return { clusterCount: clusters, unclusteredCount: Array.isArray(unclustered.items) ? unclustered.items.length : undefined, preparedCount: asNumber(record.preparedCount) };
  }
  if (job.type === "reflection.generate") {
    const validation = record.validation && typeof record.validation === "object" ? record.validation as Record<string, unknown> : {};
    return { promotionRequired: record.promotionRequired === true, validationAccepted: validation.accepted === true, warningCount: Array.isArray(record.warnings) ? record.warnings.length : undefined, reasonCount: Array.isArray(record.reasons) ? record.reasons.length : undefined };
  }
  if (job.type === "pattern.discover") {
    return { action: record.action, patternFound: record.patternFound === true, evidenceCount: asNumber(record.evidenceCount), matchedTicketCount: asNumber(record.matchedTicketCount), confidence: asNumber(record.confidence) };
  }
  return { processed: record.processed === true, replayed: record.replayed === true };
}

export function safeOperationJob(job: DurableJobRecord, attempts: JobAttemptRecord[] = []): SafeOperationJob {
  const latest = [...attempts].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  return {
    id: job.id,
    organizationId: job.organizationId,
    type: job.type,
    version: job.version,
    status: job.status,
    priority: job.priority,
    inputDigest: job.inputDigest,
    resultDigest: job.resultDigest,
    correlationId: job.correlationId,
    requestId: job.requestId,
    progress: job.progress,
    progressMessage: job.progressMessage,
    retryable: job.retryable,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    workerId: latest?.workerId ?? job.leaseOwner,
    errorClass: job.error?.errorClass,
    safeErrorMessage: job.error?.safeMessage,
    nextAttemptAt: job.nextAttemptAt,
    leaseExpiresAt: job.leaseExpiresAt,
    cancellationRequestedAt: job.cancellationRequestedAt,
    cancelledAt: job.cancelledAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    deadLetteredAt: job.deadLetteredAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultSummary: resultSummary(job)
  };
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

async function accessibleOrganizations(userId: string) {
  return prisma.organizationMembership.findMany({ where: { userId }, select: { organizationId: true, organization: { select: { id: true, name: true } } }, orderBy: { organizationId: "asc" } });
}

async function loadJobs(organizationIds: string[], limit: number): Promise<JobRow[]> {
  const rows = await prisma.durableJob.findMany({ where: { organizationId: { in: organizationIds } }, orderBy: { createdAt: "desc" }, take: Math.min(MAX_LIMIT, Math.max(DEFAULT_LIMIT, limit)) });
  const attempts = await prisma.durableJobAttempt.findMany({ where: { jobId: { in: rows.map((row) => row.id) } }, orderBy: { attemptNumber: "asc" } });
  const attemptsByJob = new Map<string, JobAttemptRecord[]>();
  for (const attempt of attempts) {
    const list = attemptsByJob.get(attempt.jobId) ?? [];
    list.push({ id: attempt.id, jobId: attempt.jobId, attemptNumber: attempt.attemptNumber, workerId: attempt.workerId, startedAt: attempt.startedAt.toISOString(), heartbeatAt: attempt.heartbeatAt?.toISOString(), finishedAt: attempt.finishedAt?.toISOString(), outcome: attempt.outcome, errorClass: attempt.errorClass as JobAttemptRecord["errorClass"], retryable: attempt.retryable ?? undefined, provider: attempt.provider ?? undefined, durationMs: attempt.durationMs ?? undefined, safeDiagnostics: attempt.safeDiagnostics && typeof attempt.safeDiagnostics === "object" && !Array.isArray(attempt.safeDiagnostics) ? attempt.safeDiagnostics as Record<string, unknown> : undefined });
    attemptsByJob.set(attempt.jobId, list);
  }
  return rows.map((row) => ({ ...row as unknown as DurableJobRecord, attempts: attemptsByJob.get(row.id) ?? [] }));
}

export async function getOperationsSnapshot(organizationId: string, userId: string, options: { limit?: number; status?: string; type?: string; worker?: string; search?: string; provider?: string; retryable?: boolean; errorClass?: string; from?: string; to?: string; requestId?: string; correlationId?: string } = {}): Promise<OperationsSnapshot> {
  const memberships = await accessibleOrganizations(userId);
  const organizationIds = memberships.map((membership) => membership.organizationId);
  if (!organizationIds.includes(organizationId)) throw new Error("The requested organization is not available to this operator.");
  const rows = await loadJobs(organizationIds, options.limit ?? DEFAULT_LIMIT);
  const from = options.from ? new Date(options.from).getTime() : undefined;
  const to = options.to ? new Date(options.to).getTime() : undefined;
  const visibleRows = rows.filter((row) => (!options.status || row.status === options.status) && (!options.type || row.type === options.type) && (!options.worker || row.attempts?.some((attempt) => attempt.workerId === options.worker)) && (!options.provider || row.attempts?.some((attempt) => attempt.provider === options.provider)) && (options.retryable === undefined || row.retryable === options.retryable) && (!options.errorClass || row.error?.errorClass === options.errorClass) && (!options.requestId || row.requestId === options.requestId) && (!options.correlationId || row.correlationId === options.correlationId) && (from === undefined || new Date(row.createdAt).getTime() >= from) && (to === undefined || new Date(row.createdAt).getTime() <= to) && (!options.search || [row.id, row.correlationId, row.requestId, row.inputDigest, row.type].some((value) => value.toLowerCase().includes(options.search!.toLowerCase()))));
  const jobs = visibleRows.map((row) => safeOperationJob(row, row.attempts));
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const workers = await prisma.durableWorkerHeartbeat.findMany({ orderBy: { lastHeartbeatAt: "desc" }, take: 100 });
  const now = Date.now();
  const safeWorkers = workers.map((worker) => ({ workerId: worker.workerId, status: worker.status === "running" && now - worker.lastHeartbeatAt.getTime() <= OFFLINE_AFTER_MS ? "online" : worker.status === "stopped" ? "stopped" : "offline", version: worker.version, startedAt: worker.startedAt.toISOString(), lastHeartbeatAt: worker.lastHeartbeatAt.toISOString(), lastPollAt: worker.lastPollAt?.toISOString(), currentJobId: worker.currentJobId, currentLeaseExpiresAt: worker.currentLeaseExpiresAt?.toISOString(), processedJobs: worker.processedJobs, succeededJobs: worker.succeededJobs, failedJobs: worker.failedJobs, cancelledJobs: worker.cancelledJobs, retryCount: worker.retryCount, concurrency: worker.concurrency, lastErrorSafe: worker.lastErrorSafe }));
  const queueRows = [...new Set(rows.map((row) => row.type))].map((type) => ({ type, queued: rows.filter((row) => row.type === type && row.status === "queued").length, running: rows.filter((row) => row.type === type && ["leased", "running", "cancellation_requested"].includes(row.status)).length, retrying: rows.filter((row) => row.type === type && row.status === "retry_scheduled").length, deadLettered: rows.filter((row) => row.type === type && row.status === "dead_lettered").length }));
  const allAttempts = rows.flatMap((row) => row.attempts ?? []);
  const runtimes = allAttempts.map((attempt) => attempt.durationMs).filter((value): value is number => typeof value === "number" && value >= 0);
  const queueWaits = rows.flatMap((row) => (row.attempts ?? []).map((attempt) => Math.max(0, new Date(attempt.startedAt).getTime() - new Date(row.createdAt).getTime())));
  const providers = [...new Set(allAttempts.map((attempt) => attempt.provider).filter(Boolean))].map((provider) => {
    const samples = allAttempts.filter((attempt) => attempt.provider === provider);
    const latencies = samples.map((sample) => sample.durationMs).filter((value): value is number => typeof value === "number" && value >= 0);
    return { provider, sampleCount: samples.length, successCount: samples.filter((sample) => sample.outcome === "succeeded").length, failureCount: samples.filter((sample) => sample.outcome !== "succeeded").length, averageJobDurationMs: average(latencies), p95JobDurationMs: percentile(latencies, 0.95), providerRequestMetrics: "unavailable", measured: true };
  });
  const failures = [...new Set(rows.map((row) => row.error?.errorClass).filter(Boolean))].map((errorClass) => ({ errorClass, count: rows.filter((row) => row.error?.errorClass === errorClass).length, retryableCount: rows.filter((row) => row.error?.errorClass === errorClass && row.retryable).length }));
  const organizations = memberships.map((membership) => ({ organizationId: membership.organization.id, name: membership.organization.name, jobCount: rows.filter((row) => row.organizationId === membership.organizationId).length, activeJobs: rows.filter((row) => row.organizationId === membership.organizationId && ["queued", "leased", "running", "retry_scheduled", "cancellation_requested"].includes(row.status)).length }));
  const longest = rows.filter((row) => ["leased", "running", "cancellation_requested"].includes(row.status)).sort((left, right) => new Date(left.startedAt ?? left.createdAt).getTime() - new Date(right.startedAt ?? right.createdAt).getTime())[0];
  return {
    generatedAt: new Date().toISOString(), organizationId, accessibleOrganizationCount: memberships.length,
    overview: { workersOnline: safeWorkers.filter((worker) => worker.status === "online").length, workersOffline: safeWorkers.filter((worker) => worker.status !== "online").length, queuedJobs: counts.get("queued") ?? 0, runningJobs: (counts.get("running") ?? 0) + (counts.get("leased") ?? 0) + (counts.get("cancellation_requested") ?? 0), retryingJobs: counts.get("retry_scheduled") ?? 0, succeededJobs: counts.get("succeeded") ?? 0, failedJobs: counts.get("failed") ?? 0, cancelledJobs: counts.get("cancelled") ?? 0, deadLetterJobs: counts.get("dead_lettered") ?? 0, totalJobs: rows.length, longestRunningJob: longest ? safeOperationJob(longest, longest.attempts) : null },
    workers: safeWorkers,
    queues: queueRows,
    jobs,
    organizations,
    providers,
    performance: { queueWait: { sampleCount: queueWaits.length, averageMs: average(queueWaits), p95Ms: percentile(queueWaits, 0.95) }, runtime: { sampleCount: runtimes.length, averageMs: average(runtimes), p95Ms: percentile(runtimes, 0.95) }, stageBreakdown: [], source: "durable job attempts" },
    failures,
    deadLetters: rows.filter((row) => row.status === "dead_lettered").map((row) => safeOperationJob(row, row.attempts))
  };
}

export async function getOperationJobDetail(organizationId: string, userId: string, jobId: string) {
  const snapshot = await getOperationsSnapshot(organizationId, userId, { limit: MAX_LIMIT });
  const job = snapshot.jobs.find((item) => item.id === jobId && item.organizationId === organizationId);
  if (!job) throw new Error("The requested operations job was not found.");
  const attempts = await prisma.durableJobAttempt.findMany({ where: { jobId }, orderBy: { attemptNumber: "asc" } });
  return { ...job, attempts: attempts.map((attempt) => ({ id: attempt.id, attemptNumber: attempt.attemptNumber, workerId: attempt.workerId, startedAt: attempt.startedAt.toISOString(), finishedAt: attempt.finishedAt?.toISOString(), outcome: attempt.outcome, errorClass: attempt.errorClass, retryable: attempt.retryable, provider: attempt.provider, durationMs: attempt.durationMs, safeDiagnostics: attempt.safeDiagnostics && typeof attempt.safeDiagnostics === "object" && !Array.isArray(attempt.safeDiagnostics) ? attempt.safeDiagnostics : undefined })) };
}
