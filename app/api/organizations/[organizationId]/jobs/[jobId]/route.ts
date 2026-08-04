import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";
import { jobContext, safeJob } from "@/lib/server/jobs/http";

export const GET = withOrganizationRoute<{ organizationId: string; jobId: string }>(async ({ organizationId, params, user }) => {
  const job = await durableJobRepository.get(jobContext(organizationId, user, randomUUID()), params.jobId);
  return NextResponse.json({ data: safeJob(job) });
});
