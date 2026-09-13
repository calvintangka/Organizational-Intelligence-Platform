import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { assertExecutionPackageAccess, receiveExecutionResult } from "@/lib/server/executionPackageService";

type Params = { organizationId: string; packageId: string };

export const POST = withOrganizationRoute<Params>("execution.session.submit", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON execution result is required." } }, { status: 400 });
  await assertExecutionPackageAccess({ organizationId, packageId: params.packageId, userId: user.id, capability: "execution.session.submit" });
  const result = await receiveExecutionResult({ organizationId, packageId: params.packageId, executorType: memoryString(body.executorType ?? "external_executor", "executorType", 120), resultPayload: body.result, resultReference: typeof body.resultReference === "string" ? body.resultReference : null, externalCorrelationId: typeof body.externalCorrelationId === "string" ? body.externalCorrelationId : null, idempotencyKey: memoryString(body.idempotencyKey ?? randomUUID(), "idempotencyKey", 240) });
  return NextResponse.json({ data: result }, { status: 201 });
});
