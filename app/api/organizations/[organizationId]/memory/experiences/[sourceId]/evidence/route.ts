import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString, optionalMemoryString, parseMemoryDate } from "@/lib/server/organizationalMemoryPrimitives";
import { addOrganizationalEvidence } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };
const EVIDENCE_TYPES = new Set(["observation", "investigation", "system_result", "action_taken", "confirmation", "outcome", "reference"]);

export const POST = withOrganizationRoute<Params>("memory.evidence.create", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON evidence payload is required." } }, { status: 400 });
  const evidenceType = memoryString(body.evidenceType, "evidenceType", 100);
  if (!EVIDENCE_TYPES.has(evidenceType)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "evidenceType is not supported." } }, { status: 400 });
  const idempotencyKey = memoryString(body.idempotencyKey, "idempotencyKey", 240);
  const content = memoryString(body.content, "content", 8000);
  const evidence = await addOrganizationalEvidence(organizationId, params.sourceId, {
    evidenceType,
    evidenceRole: evidenceType,
    actorId: user.id,
    occurredAt: parseMemoryDate(body.occurredAt, "occurredAt") ?? new Date(),
    content,
    reference: optionalMemoryString(body.reference, "reference", 500),
    idempotencyKey
  });
  return NextResponse.json({ data: evidence }, { status: 201 });
});

export const GET = withOrganizationRoute<Params>("memory.evidence.read", async ({ organizationId, params }) => {
  const { listOrganizationalSourceEvidence } = await import("@/lib/server/organizationalMemoryService");
  return NextResponse.json({ data: await listOrganizationalSourceEvidence(organizationId, params.sourceId) });
});
