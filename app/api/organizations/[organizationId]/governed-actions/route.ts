import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { prepareGovernedAction, GovernedActionError, listGovernedActions } from "@/lib/server/actions/actionService";
import { isGovernedActionType } from "@/lib/server/actions/registry";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

function actionError(error: unknown) {
  if (error instanceof GovernedActionError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return null;
}

export const GET = withOrganizationRoute("operations.read", async ({ request, organizationId }) => {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  return NextResponse.json({ data: await listGovernedActions(organizationId, Number.isFinite(limit) ? limit : 100) });
});

export const POST = withOrganizationRoute("operations.read", async ({ request, organizationId, user }) => {
  try {
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/governed-actions", organizationId, actorUserId: user.id }, [
      { policy: "action.prepare.user", dimensions: [{ type: "user", value: user.id }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const actionType = body?.actionType;
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!isGovernedActionType(actionType) || !ticketId || !label || !idempotencyKey) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "actionType, ticketId, label, and idempotencyKey are required." } }, { status: 400 });
    const requestId = typeof body?.requestId === "string" ? body.requestId : request.headers.get("x-request-id") ?? randomUUID();
    const correlationId = typeof body?.correlationId === "string" ? body.correlationId : request.headers.get("x-correlation-id") ?? requestId;
    const action = await prepareGovernedAction({ organizationId, actorId: user.id, actionType, ticketId, label, preparationReason: typeof body?.preparationReason === "string" ? body.preparationReason : "Deterministic ticket classification proposed an allowlisted label.", evidenceSummary: Array.isArray(body?.evidenceSummary) ? body.evidenceSummary.filter((item): item is string => typeof item === "string").slice(0, 10) : undefined, originalActionId: typeof body?.originalActionId === "string" ? body.originalActionId : undefined, requestId, correlationId, idempotencyKey });
    return NextResponse.json({ data: action }, { status: 201 });
  } catch (error) {
    return actionError(error) ?? NextResponse.json({ error: { code: "ACTION_ERROR", message: "The governed action could not be prepared." } }, { status: 500 });
  }
});
