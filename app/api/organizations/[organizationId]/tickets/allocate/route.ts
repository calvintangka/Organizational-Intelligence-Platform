import { NextResponse } from "next/server";
import { allocateTicketIds } from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atomically allocate one or more organization-scoped ticket IDs from the
 * database-backed TicketSequence. Success is only reported after the counter
 * increment has committed; a failed allocation claims no IDs.
 */
export const POST = withOrganizationRoute(async ({ request, organizationId }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  const count = (body as { count?: unknown } | null)?.count;
  if (!Number.isInteger(count) || (count as number) < 1) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "count must be a positive integer." } },
      { status: 400 }
    );
  }
  const ticketIds = await allocateTicketIds(organizationId, count as number);
  return NextResponse.json({ data: { ticketIds } }, { status: 200 });
});
