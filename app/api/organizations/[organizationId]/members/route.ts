import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { listOrganizationMembers } from "@/lib/server/rbac/roleService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("organization.members.read", async ({ organizationId }) => {
  return NextResponse.json({ data: await listOrganizationMembers(organizationId) });
});
