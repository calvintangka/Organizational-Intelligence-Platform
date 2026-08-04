import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { retryConnectorInboundEvent } from "@/lib/server/connectors/connectorService";

export const dynamic = "force-dynamic";
export const POST = withOrganizationRoute<{ organizationId: string; installationId: string; eventId: string }>(async ({ organizationId, params, user }) => {
  try { return NextResponse.json({ data: await retryConnectorInboundEvent(organizationId, params.installationId, params.eventId, user) }); }
  catch (error) { return connectorErrorResponse(error); }
});
