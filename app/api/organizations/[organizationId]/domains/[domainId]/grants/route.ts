import { NextResponse } from "next/server";

import { requireDomainCapability } from "@/lib/server/domainAuthorization";
import { grantDomainCapability, loadOrganizationDomain } from "@/lib/server/domainService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { isCapabilityKey, ROLE_KEYS } from "@/lib/server/rbac/definitions";
import { prisma } from "@/lib/server/prisma";

type Params = { organizationId: string; domainId: string };

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<Params>("domain.manage", async ({ request, organizationId, params }) => {
  await requireDomainCapability({ organizationId, domainId: params.domainId, capability: "domain.manage", request, resource: `domain:${params.domainId}:grants` });
  const rows = await prisma.organizationDomainCapabilityGrant.findMany({
    where: { organizationId, domainId: params.domainId },
    include: { role: { select: { id: true, key: true, label: true } } },
    orderBy: [{ roleId: "asc" }, { capabilityKey: "asc" }]
  });
  return NextResponse.json({ data: rows });
});

export const POST = withOrganizationRoute<Params>("domain.manage", async ({ request, organizationId, params }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON Domain grant payload is required." } }, { status: 400 });
  await requireDomainCapability({ organizationId, domainId: params.domainId, capability: "domain.manage", request, resource: `domain:${params.domainId}:grants` });
  await loadOrganizationDomain(organizationId, params.domainId);
  const roleKey = typeof body.roleKey === "string" ? body.roleKey.trim().toLowerCase() : "";
  const capabilityKey = typeof body.capabilityKey === "string" ? body.capabilityKey.trim() : "";
  if (!(ROLE_KEYS as readonly string[]).includes(roleKey) || !isCapabilityKey(capabilityKey)) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "roleKey or capabilityKey is not recognized." } }, { status: 400 });
  }
  const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
  if (!role) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The requested role is not available." } }, { status: 400 });
  await grantDomainCapability({ organizationId, domainId: params.domainId, roleId: role.id, capabilityKey });
  return NextResponse.json({ data: { organizationId, domainId: params.domainId, roleKey, capabilityKey } }, { status: 201 });
});
