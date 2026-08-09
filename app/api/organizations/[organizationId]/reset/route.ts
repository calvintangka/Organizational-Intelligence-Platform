import { NextResponse } from "next/server";
import { resetOrganizationData } from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transactionally clear this organization's owned data (knowledge, candidates,
 * audit records, patterns, log, tickets, metrics, ticket sequence) without
 * deleting the organization itself. Other organizations are never touched.
 */
export const POST = withOrganizationRoute("organization.reset", async ({ request, organizationId, user }) => {
  const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/reset", organizationId, actorUserId: user.id }, [
    { policy: "admin.mutate.user", dimensions: [{ type: "user", value: user.id }] }
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);
  await resetOrganizationData(organizationId);
  return NextResponse.json({ data: { reset: true } }, { status: 200 });
});
