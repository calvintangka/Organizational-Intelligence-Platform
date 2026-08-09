import { NextResponse } from "next/server";

import { prepareBulkTicketRecords } from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";
import type { BulkTicketSeed } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute("ticket.bulk_prepare", async ({ request, organizationId }) => {
  const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/tickets/bulk-prepare", organizationId }, [
    { policy: "ticket.bulk.organization", dimensions: [{ type: "organization", value: organizationId }] }
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: { seeds?: unknown };
  try {
    body = await request.json() as { seeds?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  const seeds = Array.isArray(body.seeds) ? body.seeds as BulkTicketSeed[] : null;
  if (!seeds) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "seeds must be an array." } },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { data: await prepareBulkTicketRecords(organizationId, seeds) },
    { status: 200 }
  );
});
