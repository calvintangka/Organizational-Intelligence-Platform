import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { listMemoryEvidence } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; knowledgeItemId: string };

export const GET = withOrganizationRoute<Params>("memory.evidence.read", async ({ organizationId, params }) => {
  return NextResponse.json({ data: await listMemoryEvidence(organizationId, memoryString(params.knowledgeItemId, "knowledgeItemId", 160)) });
});
