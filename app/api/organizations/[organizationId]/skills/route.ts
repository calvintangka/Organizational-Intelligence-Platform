import { NextResponse } from "next/server";

import { listAccessibleDomainIds, requireDomainCapability } from "@/lib/server/domainAuthorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { createOrganizationalSkill, listOrganizationalSkills } from "@/lib/server/skillService";
import { ensureDefaultOrganizationDomains, resolveOrganizationDomain } from "@/lib/server/domainService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("skill.read", async ({ request, organizationId, user }) => {
  await ensureDefaultOrganizationDomains(organizationId);
  const params = new URL(request.url).searchParams;
  const requestedDomain = params.get("domainId") ?? undefined;
  const accessibleDomainIds = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "skill.read" });
  let domainId: string | undefined;
  if (requestedDomain) {
    const domain = await resolveOrganizationDomain(organizationId, requestedDomain);
    if (!accessibleDomainIds.includes(domain.id)) return NextResponse.json({ data: [] });
    domainId = domain.id;
  }
  return NextResponse.json({ data: await listOrganizationalSkills({ organizationId, query: params.get("query") ?? undefined, domainId, domainIds: domainId ? undefined : accessibleDomainIds, status: params.get("status") ?? undefined }) });
});

export const POST = withOrganizationRoute("skill.create", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON Skill payload is required." } }, { status: 400 });
  const domain = await resolveOrganizationDomain(organizationId, memoryString(body.domainId, "domainId", 160));
  await requireDomainCapability({ organizationId, domainId: domain.id, capability: "skill.create", request, resource: "skill:create" });
  const skill = await createOrganizationalSkill({ organizationId, domainId: domain.id, key: memoryString(body.key, "key", 120), name: memoryString(body.name, "name", 180), description: memoryString(body.description, "description", 4000), definition: body.definition, riskLevel: body.riskLevel, executionPolicy: body.executionPolicy, humanReviewPolicy: body.humanReviewPolicy, scope: body.scope, memoryLinks: Array.isArray(body.memoryLinks) ? body.memoryLinks as Array<{ knowledgeItemId: string; knowledgeRevision?: number; knowledgeVersionId?: string | null; relationship?: string }> : [], createdBy: user.id });
  return NextResponse.json({ data: skill }, { status: 201 });
});
