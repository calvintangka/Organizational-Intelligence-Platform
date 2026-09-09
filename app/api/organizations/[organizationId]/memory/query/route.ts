import { NextResponse } from "next/server";

import { queryOrganizationalMemory } from "@/lib/knowledgeQuery";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOrganizationProfile, loadKnowledge } from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PRODUCT-001: observational Knowledge retrieval. This route deliberately
 * loads organization-scoped state and only runs pure classification/retrieval;
 * it never creates a Ticket, Source, Evidence, Outcome, or Memory change.
 */
export const POST = withOrganizationRoute("knowledge.read", async ({ request, organizationId }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Describe the situation you want to check." } }, { status: 400 });
  }
  if (query.length > 4000) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Keep the situation under 4,000 characters." } }, { status: 400 });
  }

  const [organizationProfile, knowledgeItems] = await Promise.all([
    getOrganizationProfile(organizationId),
    loadKnowledge(organizationId)
  ]);
  return NextResponse.json({ data: queryOrganizationalMemory(query, organizationProfile, knowledgeItems) }, { status: 200 });
});
