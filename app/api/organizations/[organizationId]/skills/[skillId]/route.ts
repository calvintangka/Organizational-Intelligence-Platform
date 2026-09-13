import { NextResponse } from "next/server";

import { requireDomainCapability } from "@/lib/server/domainAuthorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOrganizationalSkill, createSkillVersion } from "@/lib/server/skillService";

type Params = { organizationId: string; skillId: string };

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<Params>("skill.read", async ({ request, organizationId, params }) => {
  const skill = await getOrganizationalSkill(organizationId, params.skillId);
  await requireDomainCapability({ organizationId, domainId: skill.domainId, capability: "skill.read", request, resource: `skill:${skill.id}` });
  return NextResponse.json({ data: skill });
});

export const PATCH = withOrganizationRoute<Params>("skill.edit", async ({ request, organizationId, params, user }) => {
  const skill = await getOrganizationalSkill(organizationId, params.skillId);
  await requireDomainCapability({ organizationId, domainId: skill.domainId, capability: "skill.edit", request, resource: `skill:${skill.id}:edit` });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON Skill version payload is required." } }, { status: 400 });
  const next = await createSkillVersion({ organizationId, skillId: skill.id, definition: body.definition, riskLevel: body.riskLevel, executionPolicy: body.executionPolicy, humanReviewPolicy: body.humanReviewPolicy, scope: body.scope, memoryLinks: Array.isArray(body.memoryLinks) ? body.memoryLinks as Array<{ knowledgeItemId: string; knowledgeRevision?: number; knowledgeVersionId?: string | null; relationship?: string }> : [], createdBy: user.id });
  return NextResponse.json({ data: next });
});
