import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("organization.audit.read", async ({ organizationId, request }) => {
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") ?? 100), 1), 500);
  const data = await prisma.authorizationDecisionAudit.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: Number.isFinite(limit) ? limit : 100,
    select: { id: true, actorUserId: true, roleKey: true, capabilityKey: true, resource: true, decision: true, reason: true, requestId: true, correlationId: true, createdAt: true }
  });
  return NextResponse.json({ data });
});
