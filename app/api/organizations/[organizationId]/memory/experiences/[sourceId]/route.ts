import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadSource } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };

/** Read one durable organizational Source for active-work recovery. */
export const GET = withOrganizationRoute<Params>("memory.evidence.read", async ({ organizationId, params }) => {
  return NextResponse.json({ data: await loadSource(organizationId, params.sourceId) });
});
