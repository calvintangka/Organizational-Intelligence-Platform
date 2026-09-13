import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { assertExecutionPackageAccess, getExecutionSession, reviewExecutionSession } from "@/lib/server/executionPackageService";

type Params = { organizationId: string; sessionId: string };
const DECISIONS = new Set(["ACCEPTED", "CORRECTED", "REJECTED", "UNRESOLVED"]);
const CLASSIFICATIONS = new Set(["REINFORCEMENT", "CORRECTION", "CHALLENGE", "NEW_LESSON", "SCOPE_CHANGE", "UNRESOLVED"]);

export const POST = withOrganizationRoute<Params>("execution.review", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON execution review is required." } }, { status: 400 });
  const decision = memoryString(body.decision, "decision", 40).toUpperCase();
  const outcomeClassification = memoryString(body.outcomeClassification, "outcomeClassification", 40).toUpperCase();
  if (!DECISIONS.has(decision) || !CLASSIFICATIONS.has(outcomeClassification)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Unsupported execution review decision or outcome classification." } }, { status: 400 });
  const session = await getExecutionSession(organizationId, params.sessionId);
  await assertExecutionPackageAccess({ organizationId, packageId: session.packageId, userId: user.id, capability: "execution.review" });
  const result = await reviewExecutionSession({ organizationId, sessionId: params.sessionId, reviewerId: user.id, decision: decision as "ACCEPTED" | "CORRECTED" | "REJECTED" | "UNRESOLVED", outcomeClassification: outcomeClassification as "REINFORCEMENT" | "CORRECTION" | "CHALLENGE" | "NEW_LESSON" | "SCOPE_CHANGE" | "UNRESOLVED", notes: memoryString(body.notes, "notes", 8000), correction: body.correction, idempotencyKey: memoryString(body.idempotencyKey ?? randomUUID(), "idempotencyKey", 240) });
  return NextResponse.json({ data: result });
});
