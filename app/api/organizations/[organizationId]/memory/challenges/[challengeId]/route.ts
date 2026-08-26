import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/server/authorization";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { reviewKnowledgeChallenge } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; challengeId: string };

export const PATCH = withOrganizationRoute<Params>("memory.challenge.review", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON challenge review payload is required." } }, { status: 400 });
  if (!Number.isInteger(body.expectedKnowledgeRevision)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "expectedKnowledgeRevision must be an integer." } }, { status: 400 });
  if (body.disposition === "SCOPE_UPDATED") {
    await requireCapability(organizationId, "memory.challenge.scope", { request, resource: `knowledge_challenge:${params.challengeId}:scope` });
  }
  if (body.disposition === "DEPRECATED") {
    await requireCapability(organizationId, "memory.challenge.deprecate", { request, resource: `knowledge_challenge:${params.challengeId}:deprecate` });
  }
  const result = await reviewKnowledgeChallenge({
    organizationId,
    challengeId: memoryString(params.challengeId, "challengeId", 160),
    disposition: body.disposition as "REVALIDATED" | "SCOPE_UPDATED" | "DEPRECATED",
    actorId: user.id,
    rationale: memoryString(body.rationale, "rationale", 4000),
    expectedKnowledgeRevision: body.expectedKnowledgeRevision as number,
    scopePatch: body.scopePatch
  });
  return NextResponse.json({ data: result });
});
