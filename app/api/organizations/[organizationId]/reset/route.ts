import { NextResponse } from "next/server";
import { resetOrganizationData } from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transactionally clear this organization's owned data (knowledge, candidates,
 * audit records, patterns, log, tickets, metrics, ticket sequence) without
 * deleting the organization itself. Other organizations are never touched.
 */
export const POST = withOrganizationRoute(async ({ organizationId }) => {
  await resetOrganizationData(organizationId);
  return NextResponse.json({ data: { reset: true } }, { status: 200 });
});
