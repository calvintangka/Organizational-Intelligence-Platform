import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString, parseMemoryDate } from "@/lib/server/organizationalMemoryPrimitives";
import { createOrganizationalSource } from "@/lib/server/organizationalMemoryService";

const SOURCE_KINDS = new Set(["OPERATIONAL_EVENT", "INCIDENT", "DECISION", "PROCESS_LEARNING", "OTHER"]);

export const POST = withOrganizationRoute("memory.source.create", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON organizational experience payload is required." } }, { status: 400 });
  const sourceKind = memoryString(body.sourceKind, "sourceKind", 80);
  if (!SOURCE_KINDS.has(sourceKind)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "sourceKind must be OPERATIONAL_EVENT, INCIDENT, DECISION, PROCESS_LEARNING, or OTHER." } }, { status: 400 });
  const idempotencyKey = memoryString(body.idempotencyKey, "idempotencyKey", 240);
  const title = memoryString(body.title, "title", 300);
  const description = memoryString(body.description, "description", 8000);
  const occurredAt = parseMemoryDate(body.occurredAt, "occurredAt", true);
  const metadata = {
    title,
    description,
    ...(typeof body.location === "string" && body.location.trim() ? { location: body.location.trim().slice(0, 300) } : {}),
    ...(typeof body.context === "string" && body.context.trim() ? { context: body.context.trim().slice(0, 1000) } : {}),
    idempotencyKey
  };
  const source = await createOrganizationalSource({
    organizationId,
    sourceKind,
    sourceObjectId: `experience:${idempotencyKey}`,
    occurredAt: occurredAt!,
    actorId: user.id,
    metadata,
    idempotencyKey
  });
  return NextResponse.json({ data: source }, { status: 201 });
});
