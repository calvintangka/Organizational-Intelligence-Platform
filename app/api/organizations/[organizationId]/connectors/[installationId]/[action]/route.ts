import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { rotateConnectorSecret, setConnectorStatus, testConnectorInstallation } from "@/lib/server/connectors/connectorService";

export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute<{ organizationId: string; installationId: string; action: string }>(async ({ request, organizationId, params, user }) => {
  try {
    if (params.action === "test") return NextResponse.json({ data: await testConnectorInstallation(organizationId, params.installationId) });
    if (["activate", "pause", "disable", "revoke"].includes(params.action)) {
      const status = params.action === "pause" ? "paused" : params.action === "disable" ? "disabled" : params.action === "revoke" ? "revoked" : "active";
      return NextResponse.json({ data: await setConnectorStatus(organizationId, params.installationId, status) });
    }
    if (params.action === "rotate-secret") {
      const body = await request.json() as { signingSecret?: unknown };
      if (typeof body.signingSecret !== "string") return NextResponse.json({ error: { code: "INVALID_CONFIGURATION", message: "signingSecret is required." } }, { status: 400 });
      return NextResponse.json({ data: await rotateConnectorSecret(organizationId, params.installationId, user, body.signingSecret) });
    }
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown connector action." } }, { status: 404 });
  } catch (error) { return connectorErrorResponse(error); }
});
