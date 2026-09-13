import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { listMemoryEvidence } from "@/lib/server/organizationalMemoryService";
import { requireKnowledgeDomainCapability } from "@/lib/server/domainAuthorization";

type Params = { organizationId: string; knowledgeItemId: string };

export const GET = withOrganizationRoute<Params>("memory.evidence.read", async ({ request, organizationId, params }) => {
  await requireKnowledgeDomainCapability({ organizationId, knowledgeItemId: params.knowledgeItemId, capability: "memory.evidence.read", request, resource: `memory:${params.knowledgeItemId}:evidence` });
  return NextResponse.json({ data: await listMemoryEvidence(organizationId, memoryString(params.knowledgeItemId, "knowledgeItemId", 160)) });
});
