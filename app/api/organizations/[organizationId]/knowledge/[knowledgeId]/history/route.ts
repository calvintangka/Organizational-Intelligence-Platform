import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadKnowledgeHistory } from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KnowledgeHistoryRouteParams {
  organizationId: string;
  knowledgeId: string;
}

export const GET = withOrganizationRoute<KnowledgeHistoryRouteParams>(async ({ organizationId, params }) => {
  return NextResponse.json(
    { data: await loadKnowledgeHistory(organizationId, params.knowledgeId) },
    { status: 200 }
  );
});
