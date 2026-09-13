import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { listAccessibleDomainIds } from "@/lib/server/domainAuthorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { prisma } from "@/lib/server/prisma";
import { createExecutionPackage, listExecutionPackages } from "@/lib/server/executionPackageService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("execution.package.read", async ({ organizationId, user }) => {
  const accessible = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "execution.package.read" });
  return NextResponse.json({ data: await listExecutionPackages({ organizationId, accessibleDomainIds: accessible }) });
});

export const POST = withOrganizationRoute("execution.package.create", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.skillVersionIds)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A package requires skillVersionIds and requestedTask." } }, { status: 400 });
  const ids = body.skillVersionIds.filter((value): value is string => typeof value === "string");
  const rows = await prisma.organizationalSkillVersion.findMany({ where: { organizationId, id: { in: ids } }, select: { skill: { select: { domainId: true } } } });
  const accessible = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "execution.package.create" });
  if (rows.length !== ids.length || rows.some((row) => !accessible.includes(row.skill.domainId))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "One or more selected Skills are not available." } }, { status: 403 });
  const packageView = await createExecutionPackage({ organizationId, requestedTask: memoryString(body.requestedTask, "requestedTask", 4000), skillVersionIds: ids, createdBy: user.id, requestId: request.headers.get("x-request-id") ?? randomUUID(), correlationId: request.headers.get("x-correlation-id") ?? randomUUID(), idempotencyKey: memoryString(body.idempotencyKey ?? randomUUID(), "idempotencyKey", 240) });
  return NextResponse.json({ data: packageView }, { status: 201 });
});
