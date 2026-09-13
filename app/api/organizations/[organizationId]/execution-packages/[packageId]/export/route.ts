import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { assertExecutionPackageAccess } from "@/lib/server/executionPackageService";

type Params = { organizationId: string; packageId: string };

export const GET = withOrganizationRoute<Params>("execution.package.export", async ({ organizationId, params, user }) => {
  const packageView = await assertExecutionPackageAccess({ organizationId, packageId: params.packageId, userId: user.id, capability: "execution.package.export" });
  return NextResponse.json({ data: { ...packageView.payload, packageId: packageView.id, packageDigest: packageView.payloadDigest, packageVersion: packageView.packageVersion, policy: packageView.policy } });
});
