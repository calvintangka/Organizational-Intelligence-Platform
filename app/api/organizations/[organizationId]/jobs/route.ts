import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";
import { digestJobInput, isJobType } from "@/lib/application/jobs/types";
import { jobContext, safeJob } from "@/lib/server/jobs/http";

function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value.trim() : fallback; }

export const GET = withOrganizationRoute(async ({ request, organizationId, user }) => {
  const url = new URL(request.url);
  const status = text(url.searchParams.get("status"));
  const context = jobContext(organizationId, user, randomUUID());
  const jobs = await durableJobRepository.list(context, { ...(status ? { status: status as never } : {}), limit: Number(url.searchParams.get("limit") ?? 50) });
  return NextResponse.json({ data: jobs.map(safeJob) });
});

export const POST = withOrganizationRoute(async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const type = body?.type;
  if (!isJobType(type)) return NextResponse.json({ error: { code: "INVALID_JOB", message: "A supported durable job type is required." } }, { status: 400 });
  if (type !== "ticket.process" && type !== "bulk.analyze") return NextResponse.json({ error: { code: "JOB_HANDLER_UNAVAILABLE", message: `${type} is not enabled in this rollout.` } }, { status: 409 });
  const rawInput = body?.input;
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return NextResponse.json({ error: { code: "INVALID_JOB", message: "Job input must be an object." } }, { status: 400 });
  const input = type === "ticket.process" ? { ticketInput: rawInput as Record<string, unknown> } : rawInput as Record<string, unknown>;
  if (type === "bulk.analyze" && (!Array.isArray(input.entries) || typeof input.uploadKey !== "string")) {
    return NextResponse.json({ error: { code: "INVALID_JOB", message: "Bulk jobs require uploadKey and parsed entries." } }, { status: 400 });
  }
  const requestId = text(body?.requestId, randomUUID());
  const correlationId = text(body?.correlationId, requestId);
  const context = jobContext(organizationId, user, requestId, correlationId);
  const result = await durableJobRepository.enqueue({ context, type, version: Number(body?.version ?? 1), input, inputDigest: digestJobInput(input), idempotencyKey: text(body?.idempotencyKey, randomUUID()), priority: Number(body?.priority ?? 100), maxAttempts: Number(body?.maxAttempts ?? 3) });
  return NextResponse.json({ data: { jobId: result.job.id, replayed: result.replayed, job: safeJob(result.job) } }, { status: result.replayed ? 200 : 202 });
});
