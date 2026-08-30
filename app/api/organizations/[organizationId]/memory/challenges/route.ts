import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { memoryString, optionalMemoryString, parseMemoryDate } from "@/lib/server/organizationalMemoryPrimitives";
import { listKnowledgeChallenges, openKnowledgeChallenge } from "@/lib/server/organizationalMemoryService";

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function parseSource(value: unknown): Record<string, unknown> {
  const source = objectValue(value, "source");
  return {
    sourceKind: memoryString(source.sourceKind, "source.sourceKind", 80),
    sourceSystem: memoryString(source.sourceSystem, "source.sourceSystem", 120),
    sourceObjectType: memoryString(source.sourceObjectType, "source.sourceObjectType", 120),
    sourceObjectId: memoryString(source.sourceObjectId, "source.sourceObjectId", 300),
    occurredAt: parseMemoryDate(source.occurredAt, "source.occurredAt"),
    capturedAt: parseMemoryDate(source.capturedAt, "source.capturedAt"),
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : undefined
  };
}

function parseEvidence(value: unknown, defaultKey: string): Record<string, unknown> {
  const evidence = objectValue(value, "evidence");
  return {
    evidenceType: memoryString(evidence.evidenceType, "evidence.evidenceType", 100),
    evidenceRole: memoryString(evidence.evidenceRole, "evidence.evidenceRole", 100),
    occurredAt: parseMemoryDate(evidence.occurredAt, "evidence.occurredAt"),
    content: optionalMemoryString(evidence.content, "evidence.content", 4000),
    reference: optionalMemoryString(evidence.reference, "evidence.reference", 500),
    idempotencyKey: optionalMemoryString(evidence.idempotencyKey, "evidence.idempotencyKey", 240) ?? `challenge-evidence:${defaultKey}`
  };
}

export const GET = withOrganizationRoute("memory.evidence.read", async ({ request, organizationId }) => {
  const knowledgeItemId = new URL(request.url).searchParams.get("knowledgeItemId") ?? undefined;
  return NextResponse.json({ data: await listKnowledgeChallenges(organizationId, knowledgeItemId) });
});

export const POST = withOrganizationRoute("memory.challenge.open", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON challenge payload is required." } }, { status: 400 });
  const idempotencyKey = memoryString(body.idempotencyKey, "idempotencyKey", 240);
  if (!Number.isInteger(body.expectedKnowledgeRevision)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "expectedKnowledgeRevision must be an integer." } }, { status: 400 });
  const result = await openKnowledgeChallenge({
    organizationId,
    knowledgeItemId: memoryString(body.knowledgeItemId, "knowledgeItemId", 160),
    knowledgeVersionId: optionalMemoryString(body.knowledgeVersionId, "knowledgeVersionId", 160),
    source: parseSource(body.source) as never,
    evidence: parseEvidence(body.evidence, idempotencyKey) as never,
    actorId: user.id,
    rationale: memoryString(body.rationale, "rationale", 4000),
    expectedKnowledgeRevision: body.expectedKnowledgeRevision as number,
    idempotencyKey
  });
  return NextResponse.json({ data: result }, { status: 201 });
});
