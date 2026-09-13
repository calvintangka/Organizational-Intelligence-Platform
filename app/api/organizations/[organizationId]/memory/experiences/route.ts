import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { requireDomainCapability } from "@/lib/server/domainAuthorization";
import { resolveOrganizationDomain } from "@/lib/server/domainService";
import { memoryString, parseMemoryDate } from "@/lib/server/organizationalMemoryPrimitives";
import { createOrganizationalSource } from "@/lib/server/organizationalMemoryService";

const SOURCE_KINDS = new Set(["EXPERIENCE", "OPERATIONAL_EVENT", "INCIDENT", "DECISION", "PROCESS_LEARNING", "EXECUTION_OUTCOME", "OTHER"]);

export const POST = withOrganizationRoute("memory.source.create", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A JSON organizational experience payload is required." } }, { status: 400 });
  const sourceKind = memoryString(body.sourceKind, "sourceKind", 80);
  if (!SOURCE_KINDS.has(sourceKind)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "sourceKind must be EXPERIENCE, OPERATIONAL_EVENT, INCIDENT, DECISION, PROCESS_LEARNING, EXECUTION_OUTCOME, or OTHER." } }, { status: 400 });
  const idempotencyKey = memoryString(body.idempotencyKey, "idempotencyKey", 240);
  const title = memoryString(body.title, "title", 300);
  const description = memoryString(body.description, "description", 8000);
  const occurredAt = parseMemoryDate(body.occurredAt, "occurredAt", true);
  const domainReference = typeof body.domainId === "string" && body.domainId.trim() ? body.domainId.trim() : null;
  const scope = body.scope && typeof body.scope === "object" && !Array.isArray(body.scope) ? body.scope : null;
  // Preserve the pre-MD-001 domain-neutral compatibility route used by the
  // existing Support/OIP probes. New generic EXPERIENCE writes must provide a
  // Domain; legacy operational events remain unscoped so their historical
  // retrieval and provenance identity do not change.
  const legacyDomainNeutral = !domainReference && sourceKind === "OPERATIONAL_EVENT";
  if (!domainReference && !legacyDomainNeutral) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "domainId is required for a new organizational experience." } }, { status: 400 });
  const domain = domainReference ? await resolveOrganizationDomain(organizationId, domainReference) : null;
  if (domain) await requireDomainCapability({ organizationId, domainId: domain.id, capability: "memory.source.create", request, resource: "organizational-source:create" });
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
    domainId: domain?.id ?? null,
    scope,
    idempotencyKey
  });
  return NextResponse.json({ data: source }, { status: 201 });
});
