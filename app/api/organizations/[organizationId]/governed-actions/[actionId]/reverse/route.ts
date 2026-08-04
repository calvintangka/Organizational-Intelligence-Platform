import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { reverseGovernedAction, GovernedActionError } from "@/lib/server/actions/actionService";

export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute<{ organizationId: string; actionId: string }>("operations.read", async ({ request, organizationId, params, user }) => {
  try {
    return NextResponse.json({ data: await reverseGovernedAction({ organizationId, actorId: user.id, actionId: params.actionId, preparationReason: "Authorized human requested reversal of the recorded label effect.", requestId: request.headers.get("x-request-id") ?? randomUUID(), correlationId: request.headers.get("x-correlation-id") ?? randomUUID(), idempotencyKey: `reversal:${params.actionId}` }) }, { status: 201 });
  } catch (error) {
    if (error instanceof GovernedActionError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "ACTION_ERROR", message: "The governed action reversal could not be prepared." } }, { status: 500 });
  }
});
