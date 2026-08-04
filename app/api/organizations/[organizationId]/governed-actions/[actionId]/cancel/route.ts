import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { cancelGovernedAction, GovernedActionError } from "@/lib/server/actions/actionService";

export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute<{ organizationId: string; actionId: string }>("operations.read", async ({ request, organizationId, params, user }) => {
  try {
    return NextResponse.json({ data: await cancelGovernedAction({ organizationId, actorId: user.id, actionId: params.actionId, requestId: request.headers.get("x-request-id") ?? randomUUID(), correlationId: request.headers.get("x-correlation-id") ?? randomUUID(), idempotencyKey: `cancel:${params.actionId}` }) });
  } catch (error) {
    if (error instanceof GovernedActionError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "ACTION_ERROR", message: "The governed action could not be cancelled." } }, { status: 500 });
  }
});
