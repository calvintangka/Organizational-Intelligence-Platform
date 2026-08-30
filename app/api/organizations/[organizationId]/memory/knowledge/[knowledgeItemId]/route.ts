import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadOrganizationalMemoryInspection } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; knowledgeItemId: string };

export const GET = withOrganizationRoute<Params>("knowledge.read", async ({ organizationId, params }) => {
  return NextResponse.json({ data: await loadOrganizationalMemoryInspection(organizationId, params.knowledgeItemId) });
});
