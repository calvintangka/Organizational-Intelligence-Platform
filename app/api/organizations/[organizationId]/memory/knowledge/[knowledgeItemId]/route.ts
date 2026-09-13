import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadOrganizationalMemoryInspection } from "@/lib/server/organizationalMemoryService";
import { requireKnowledgeDomainCapability } from "@/lib/server/domainAuthorization";

type Params = { organizationId: string; knowledgeItemId: string };

export const GET = withOrganizationRoute<Params>("knowledge.read", async ({ request, organizationId, params }) => {
  await requireKnowledgeDomainCapability({ organizationId, knowledgeItemId: params.knowledgeItemId, capability: "knowledge.read", request, resource: `memory:${params.knowledgeItemId}` });
  return NextResponse.json({ data: await loadOrganizationalMemoryInspection(organizationId, params.knowledgeItemId) });
});
