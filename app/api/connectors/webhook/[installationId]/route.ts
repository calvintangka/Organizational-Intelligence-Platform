import { NextResponse } from "next/server";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { receiveWebhook } from "@/lib/server/connectors/connectorService";
import { enforceRateLimit, rateLimitResponse, requestIdentity } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ installationId: string }> }) {
  try {
    const { installationId } = await context.params;
    // Per-source inbound flood protection (installation-scoped, signature
    // verification below still applies to every event).
    const { requestId, correlationId } = requestIdentity(request);
    const decision = await enforceRateLimit("connector.inbound.source", [{ type: "source", value: installationId }], {
      route: "/api/connectors/webhook/[installationId]",
      requestId,
      correlationId
    });
    if (!decision.allowed) return rateLimitResponse(decision);
    const data = await receiveWebhook(installationId, { rawBody: await request.text(), headers: request.headers });
    return NextResponse.json({ data }, { status: data.duplicate ? 200 : 202 });
  } catch (error) { return connectorErrorResponse(error); }
}
