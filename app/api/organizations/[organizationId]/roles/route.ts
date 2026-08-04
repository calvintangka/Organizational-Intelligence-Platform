import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { listRoles } from "@/lib/server/rbac/roleService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("organization.members.read", async () => {
  return NextResponse.json({ data: await listRoles() });
});
