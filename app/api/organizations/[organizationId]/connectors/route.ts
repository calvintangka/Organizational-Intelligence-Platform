import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { createConnectorInstallation, listConnectorInstallations } from "@/lib/server/connectors/connectorService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("connector.read", async ({ organizationId }) => {
  try { return NextResponse.json({ data: await listConnectorInstallations(organizationId) }); }
  catch (error) { return connectorErrorResponse(error); }
});

export const POST = withOrganizationRoute("connector.install", async ({ request, organizationId, user }) => {
  try {
    const body = await request.json() as { connectorType?: unknown; name?: unknown; configuration?: unknown; signingSecret?: unknown };
    if (typeof body.connectorType !== "string" || typeof body.name !== "string" || typeof body.signingSecret !== "string") return NextResponse.json({ error: { code: "INVALID_CONFIGURATION", message: "connectorType, name, and signingSecret are required." } }, { status: 400 });
    const installation = await createConnectorInstallation({ organizationId, user, connectorType: body.connectorType, name: body.name, configuration: body.configuration, signingSecret: body.signingSecret });
    return NextResponse.json({ data: { installation, webhookPath: `/api/connectors/webhook/${installation.id}` } }, { status: 201 });
  } catch (error) { return connectorErrorResponse(error); }
});
