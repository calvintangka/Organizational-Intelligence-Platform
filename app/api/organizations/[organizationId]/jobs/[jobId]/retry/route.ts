import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";
import { jobContext, safeJob } from "@/lib/server/jobs/http";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";

export const POST = withOrganizationRoute<{ organizationId: string; jobId: string }>("worker.retry", async ({ request, organizationId, params, user }) => {
  const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/jobs/[jobId]/retry", organizationId, actorUserId: user.id }, [
    { policy: "job.retry.organization", dimensions: [{ type: "organization", value: organizationId }] }
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);
  const job = await durableJobRepository.retry(jobContext(organizationId, user, randomUUID()), params.jobId);
  return NextResponse.json({ data: safeJob(job) });
});
