import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadTicketResolutionEvidence } from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<{ organizationId: string; ticketId: string }>("ticket.read", async ({ organizationId, params }) => {
  const evidence = await loadTicketResolutionEvidence(organizationId, params.ticketId);
  return NextResponse.json({ data: evidence });
});
