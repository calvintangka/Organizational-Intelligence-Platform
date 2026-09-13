import { NextResponse } from "next/server";

import { queryOrganizationalMemory } from "@/lib/knowledgeQuery";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOrganizationProfile, loadKnowledge } from "@/lib/server/persistenceService";
import { listAccessibleDomainIds, requireDomainCapability } from "@/lib/server/domainAuthorization";
import { ensureDefaultOrganizationDomains, resolveOrganizationDomain } from "@/lib/server/domainService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PRODUCT-001: observational Knowledge retrieval. This route deliberately
 * loads organization-scoped state and only runs pure classification/retrieval;
 * it never creates a Ticket, Source, Evidence, Outcome, or Memory change.
 */
export const POST = withOrganizationRoute("knowledge.read", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Describe the situation you want to check." } }, { status: 400 });
  }
  if (query.length > 4000) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Keep the situation under 4,000 characters." } }, { status: 400 });
  }

  await ensureDefaultOrganizationDomains(organizationId);
  const requestedDomain = new URL(request.url).searchParams.get("domainId") ?? (typeof body?.domainId === "string" ? body.domainId : null);
  const domain = requestedDomain ? await resolveOrganizationDomain(organizationId, requestedDomain) : null;
  const accessibleDomainIds = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "knowledge.read" });
  if (domain) {
    if (!accessibleDomainIds.includes(domain.id)) return NextResponse.json({ data: { query, state: "no_match", matches: [] } }, { status: 200 });
    await requireDomainCapability({ organizationId, domainId: domain.id, capability: "knowledge.read", request, resource: `memory:query:${domain.id}` });
  }
  const [organizationProfile, allKnowledgeItems] = await Promise.all([
    getOrganizationProfile(organizationId),
    loadKnowledge(organizationId)
  ]);
  const knowledgeItems = allKnowledgeItems.filter((item) => domain ? item.domainId === domain.id : !item.domainId || accessibleDomainIds.includes(item.domainId));
  return NextResponse.json({ data: queryOrganizationalMemory(query, organizationProfile, knowledgeItems) }, { status: 200 });
});
