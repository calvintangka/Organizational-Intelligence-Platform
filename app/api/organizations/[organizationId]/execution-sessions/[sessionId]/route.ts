import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { assertExecutionPackageAccess, getExecutionSession } from "@/lib/server/executionPackageService";

type Params = { organizationId: string; sessionId: string };

export const GET = withOrganizationRoute<Params>("execution.session.read", async ({ organizationId, params, user }) => {
  const session = await getExecutionSession(organizationId, params.sessionId);
  await assertExecutionPackageAccess({ organizationId, packageId: session.packageId, userId: user.id, capability: "execution.session.read" });
  return NextResponse.json({ data: session });
});
