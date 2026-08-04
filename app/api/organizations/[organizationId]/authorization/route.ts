import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { authorizationService } from "@/lib/server/rbac/authorizationService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("organization.read", async ({ organizationId, user }) => {
  const authorization = await authorizationService.listCapabilities(user.id, organizationId);
  return NextResponse.json({ data: authorization });
});
