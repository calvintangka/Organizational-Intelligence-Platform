import type { DurableJobRecord } from "@/lib/application/jobs/types";
import type { TicketInput } from "@/lib/application/tickets/processTicket";
import type { BulkAnalysisResult, BulkUploadEntry } from "@/types";

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
export async function getJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}`)).data; }
export async function cancelJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" })).data; }
export async function retryJob(organizationId: string, jobId: string): Promise<DurableJobRecord> { return (await call<{ data: DurableJobRecord }>(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" })).data; }
export function bulkResult(job: DurableJobRecord): BulkAnalysisResult {
  const result = (job.result as { analysis?: unknown } | undefined)?.analysis;
  if (!result || typeof result !== "object") throw new Error("The completed bulk job did not contain an analysis result.");
  return result as BulkAnalysisResult;
}
