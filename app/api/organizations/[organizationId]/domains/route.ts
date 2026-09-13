import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { createOrganizationDomain, listOrganizationDomains } from "@/lib/server/domainService";
import { listAccessibleDomainIds } from "@/lib/server/domainAuthorization";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("domain.read", async ({ organizationId, user }) => {
  const domains = await listOrganizationDomains(organizationId);
  const accessible = await listAccessibleDomainIds({ organizationId, userId: user.id, capability: "domain.read" });
  return NextResponse.json({ data: domains.filter((domain) => accessible.includes(domain.id)) });
});

export const POST = withOrganizationRoute("domain.manage", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON domain payload is required." } }, { status: 400 });
  const domain = await createOrganizationDomain({
    organizationId,
    key: memoryString(body.key, "key", 120),
    label: memoryString(body.label, "label", 180),
    description: typeof body.description === "string" ? body.description : null,
    sensitivity: body.sensitivity === "restricted" ? "restricted" : "internal",
    createdBy: user.id
  });
  return NextResponse.json({ data: domain }, { status: 201 });
});
