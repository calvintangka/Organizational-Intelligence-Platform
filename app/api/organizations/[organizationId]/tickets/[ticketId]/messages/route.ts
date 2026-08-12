import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { loadTicketMessages } from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<{ organizationId: string; ticketId: string }>("ticket.read", async ({ organizationId, params }) => {
  const messages = await loadTicketMessages(organizationId, params.ticketId);
  return NextResponse.json({ data: messages });
});
