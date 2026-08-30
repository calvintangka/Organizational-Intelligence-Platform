import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { validateOrganizationalLearning } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };

export const POST = withOrganizationRoute<Params>("knowledge.promote", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON validation payload is required." } }, { status: 400 });
  const result = await validateOrganizationalLearning({
    organizationId,
    sourceId: params.sourceId,
    candidateId: memoryString(body.candidateId, "candidateId", 160),
    actorId: user.id,
    actorName: user.name,
    rationale: memoryString(body.rationale, "rationale", 4000),
    idempotencyKey: memoryString(body.idempotencyKey, "idempotencyKey", 240)
  });
  return NextResponse.json({ data: result }, { status: 200 });
});
