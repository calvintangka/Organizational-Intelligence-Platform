import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { listConnectorEvents } from "@/lib/server/connectors/connectorService";

export const dynamic = "force-dynamic";
export const GET = withOrganizationRoute<{ organizationId: string; installationId: string }>(async ({ organizationId, params }) => {
  try { return NextResponse.json({ data: await listConnectorEvents(organizationId, params.installationId) }); }
  catch (error) { return connectorErrorResponse(error); }
});
