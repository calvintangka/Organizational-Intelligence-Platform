import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { approveGovernedAction, GovernedActionError } from "@/lib/server/actions/actionService";

export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute<{ organizationId: string; actionId: string }>("operations.read", async ({ request, organizationId, params, user }) => {
  try {
    const body = await request.json().catch(() => null) as { decision?: unknown; comment?: unknown } | null;
    const decision = body?.decision === "rejected" ? "rejected" : body?.decision === "approved" ? "approved" : null;
    if (!decision) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "decision must be approved or rejected." } }, { status: 400 });
    return NextResponse.json({ data: await approveGovernedAction({ organizationId, actorId: user.id, actionId: params.actionId, decision, comment: typeof body?.comment === "string" ? body.comment : undefined, requestId: request.headers.get("x-request-id") ?? randomUUID(), correlationId: request.headers.get("x-correlation-id") ?? request.headers.get("x-request-id") ?? randomUUID(), idempotencyKey: `approval:${params.actionId}:${decision}` }) });
  } catch (error) {
    if (error instanceof GovernedActionError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "ACTION_ERROR", message: "The governed action decision could not be recorded." } }, { status: 500 });
  }
});
