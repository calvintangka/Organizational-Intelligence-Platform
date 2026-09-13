import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { assertExecutionPackageAccess } from "@/lib/server/executionPackageService";

type Params = { organizationId: string; packageId: string };

export const GET = withOrganizationRoute<Params>("execution.package.read", async ({ organizationId, params, user }) => {
  return NextResponse.json({ data: await assertExecutionPackageAccess({ organizationId, packageId: params.packageId, userId: user.id, capability: "execution.package.read" }) });
});
