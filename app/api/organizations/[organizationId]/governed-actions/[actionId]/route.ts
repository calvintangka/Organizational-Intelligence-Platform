import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getGovernedAction } from "@/lib/server/actions/actionService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<{ organizationId: string; actionId: string }>("operations.read", async ({ organizationId, params }) => {
  return NextResponse.json({ data: await getGovernedAction(organizationId, params.actionId) });
});
