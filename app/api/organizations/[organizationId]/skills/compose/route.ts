import { NextResponse } from "next/server";

import { listAccessibleDomainIds } from "@/lib/server/domainAuthorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { composeOrganizationalSkills } from "@/lib/server/skillService";
import { prisma } from "@/lib/server/prisma";

export const POST = withOrganizationRoute("skill.compose", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!Array.isArray(body?.skillVersionIds)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "skillVersionIds must be an array." } }, { status: 400 });
  const ids = body.skillVersionIds.filter((value): value is string => typeof value === "string");
  const rows = await prisma.organizationalSkillVersion.findMany({ where: { organizationId, id: { in: ids } }, select: { skill: { select: { domainId: true } } } });
  const accessible = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "skill.compose" });
  if (rows.some((row) => !accessible.includes(row.skill.domainId))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "One or more selected Skills are not available." } }, { status: 403 });
  const result = await composeOrganizationalSkills({ organizationId, skillVersionIds: ids, requestedTask: memoryString(body.requestedTask, "requestedTask", 4000) });
  return NextResponse.json({ data: result });
});
