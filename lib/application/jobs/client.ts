import type { DurableJobRecord } from "@/lib/application/jobs/types";
import type { TicketInput } from "@/lib/application/tickets/processTicket";
import type { BulkAnalysisResult, BulkUploadEntry } from "@/types";
import type { ReflectionDecision, Ticket, Understanding } from "@/types";
import type { PatternDiscoverJobInput, PatternDiscoveryJobResult } from "@/lib/application/jobs/patternTypes";

export interface JobApiResponse { data: { jobId?: string; replayed?: boolean; job: DurableJobRecord } }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "The durable job request failed.");
  return payload as T;
}

export function enqueueTicketJob(organizationId: string, input: TicketInput, options: { idempotencyKey?: string; correlationId?: string } = {}): Promise<JobApiResponse> {
  return call<JobApiResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs`, { method: "POST", body: JSON.stringify({ type: "ticket.process", input, ...options }) });
}
export function enqueueBulkJob(organizationId: string, uploadKey: string, entries: BulkUploadEntry[], options: { idempotencyKey?: string; correlationId?: string } = {}): Promise<JobApiResponse> {
  return call<JobApiResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs`, { method: "POST", body: JSON.stringify({ type: "bulk.analyze", input: { uploadKey, entries }, idempotencyKey: options.idempotencyKey ?? uploadKey, correlationId: options.correlationId }) });
}
export interface ReflectionJobInput {
  ticket: Ticket;
  understanding: Understanding;
  reviewedResponse: string;
  existingMatch?: unknown;
  selectedDraft?: unknown;
  languageContext?: { responseLanguage?: string; internalLanguage?: string };
}
export function enqueueReflectionJob(organizationId: string, input: ReflectionJobInput, options: { idempotencyKey: string; correlationId?: string }): Promise<JobApiResponse> {
  return call<JobApiResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs`, { method: "POST", body: JSON.stringify({ type: "reflection.generate", input, idempotencyKey: options.idempotencyKey, correlationId: options.correlationId }) });
}
export function enqueuePatternDiscoveryJob(organizationId: string, input: PatternDiscoverJobInput, options: { idempotencyKey: string; correlationId?: string }): Promise<JobApiResponse> {
  return call<JobApiResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs`, { method: "POST", body: JSON.stringify({ type: "pattern.discover", input, idempotencyKey: options.idempotencyKey, correlationId: options.correlationId }) });
}
export async function getJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}`)).data; }
export async function cancelJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" })).data; }
export async function retryJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" })).data; }
export function bulkResult(job: DurableJobRecord): BulkAnalysisResult {
  const result = (job.result as { analysis?: unknown } | undefined)?.analysis;
  if (!result || typeof result !== "object") throw new Error("The completed bulk job did not contain an analysis result.");
  return result as BulkAnalysisResult;
}
export function reflectionResult(job: DurableJobRecord): { preparedReflection: { id: string }; reflection: ReflectionDecision; validation: { accepted: boolean; warnings: string[]; reasons: string[] }; promotionRequired: true } {
  const result = job.result as { preparedReflection?: { id: string }; reflection?: ReflectionDecision; validation?: { accepted: boolean; warnings: string[]; reasons: string[] }; promotionRequired?: true } | undefined;
  if (!result?.preparedReflection || !result.reflection || !result.validation || result.promotionRequired !== true) throw new Error("The completed reflection job did not contain a prepared human-review result.");
  return result as { preparedReflection: { id: string }; reflection: ReflectionDecision; validation: { accepted: boolean; warnings: string[]; reasons: string[] }; promotionRequired: true };
}
export function patternDiscoveryResult(job: DurableJobRecord): PatternDiscoveryJobResult {
  const result = job.result as PatternDiscoveryJobResult | undefined;
  if (!result || typeof result !== "object" || typeof result.action !== "string" || typeof result.patternFound !== "boolean") throw new Error("The completed pattern job did not contain an auditable pattern result.");
  return result;
}
