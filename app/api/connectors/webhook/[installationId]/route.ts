import { NextResponse } from "next/server";
import { connectorErrorResponse } from "@/lib/server/connectors/http";
import { receiveWebhook } from "@/lib/server/connectors/connectorService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ installationId: string }> }) {
  try {
    const { installationId } = await context.params;
    const data = await receiveWebhook(installationId, { rawBody: await request.text(), headers: request.headers });
    return NextResponse.json({ data }, { status: data.duplicate ? 200 : 202 });
  } catch (error) { return connectorErrorResponse(error); }
}
