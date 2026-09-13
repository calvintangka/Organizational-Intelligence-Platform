import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { requireSourceDomainCapability } from "@/lib/server/domainAuthorization";
import { loadSource } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };

/** Read one durable organizational Source for active-work recovery. */
export const GET = withOrganizationRoute<Params>("memory.evidence.read", async ({ request, organizationId, params }) => {
  await requireSourceDomainCapability({ organizationId, sourceId: params.sourceId, capability: "memory.evidence.read", request, resource: "organizational-source:read" });
  return NextResponse.json({ data: await loadSource(organizationId, params.sourceId) });
});
