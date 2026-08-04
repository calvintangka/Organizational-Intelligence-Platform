import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOperationJobDetail } from "@/lib/server/operations/operationsService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<{ organizationId: string; jobId: string }>(async ({ organizationId, params, user }) => {
  const data = await getOperationJobDetail(organizationId, user.id, params.jobId);
  return NextResponse.json({ data });
});
