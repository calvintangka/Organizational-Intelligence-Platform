import { NextResponse } from "next/server";

import { requireDomainCapability } from "@/lib/server/domainAuthorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { getOrganizationalSkill, transitionOrganizationalSkill } from "@/lib/server/skillService";

type Params = { organizationId: string; skillId: string };

const CAPABILITY_BY_STATUS: Record<string, string> = { READY_FOR_REVIEW: "skill.submit", VALIDATED: "skill.validate", SUSPENDED: "skill.suspend", REVOKED: "skill.revoke" };

export const POST = withOrganizationRoute<Params>("skill.read", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const status = memoryString(body?.status, "status", 40).toUpperCase();
  const capability = CAPABILITY_BY_STATUS[status];
  if (!capability) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "status must be READY_FOR_REVIEW, VALIDATED, SUSPENDED, or REVOKED." } }, { status: 400 });
  const skill = await getOrganizationalSkill(organizationId, params.skillId);
  await requireDomainCapability({ organizationId, domainId: skill.domainId, capability, request, resource: `skill:${skill.id}:${status.toLowerCase()}` });
  return NextResponse.json({ data: await transitionOrganizationalSkill({ organizationId, skillId: skill.id, status, actorId: user.id }) });
});
