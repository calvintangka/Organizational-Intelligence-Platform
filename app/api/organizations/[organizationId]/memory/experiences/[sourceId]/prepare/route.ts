import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { requireSourceDomainCapability } from "@/lib/server/domainAuthorization";
import { prepareOrganizationalLearning } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };

export const POST = withOrganizationRoute<Params>("memory.learning.prepare", async ({ request, organizationId, params, user }) => {
  await requireSourceDomainCapability({ organizationId, sourceId: params.sourceId, capability: "memory.learning.prepare", request, resource: "organizational-learning:prepare" });
  return NextResponse.json({ data: await prepareOrganizationalLearning(organizationId, params.sourceId, user.id) }, { status: 201 });
});
