import { NextResponse } from "next/server";
import {
  loadEmergingPatterns,
  loadIntelligenceLog,
  loadKnowledge,
  loadKnowledgeCandidates,
  loadMemoryChangeRecords,
  loadOrgMetrics,
  loadTicketRecords,
  loadTicketSequence,
  loadValidationRecords,
  saveEmergingPatterns,
  saveIntelligenceLog,
  saveKnowledge,
  saveKnowledgeCandidates,
  saveOrgMetrics,
  saveClientTicketRecords
} from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { requireCapability } from "@/lib/server/authorization";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";
import { TicketWriteError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResourceRouteParams {
  organizationId: string;
  resource: string;
}

const resourceHandlers: Record<string, (organizationId: string) => Promise<unknown>> = {
  knowledge: loadKnowledge,
  "knowledge-candidates": loadKnowledgeCandidates,
  "validation-records": loadValidationRecords,
  "memory-change-records": loadMemoryChangeRecords,
  metrics: loadOrgMetrics,
  "intelligence-log": loadIntelligenceLog,
  "emerging-patterns": loadEmergingPatterns,
  tickets: loadTicketRecords,
  "ticket-sequence": loadTicketSequence
};

export const GET = withOrganizationRoute<ResourceRouteParams>(async ({ request, organizationId, params }) => {
  const handler = resourceHandlers[params.resource];
  if (!handler) {
    return NextResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "The requested organization resource was not found." } },
      { status: 404 }
    );
  }
  const capability = params.resource === "metrics" ? "metrics.read"
    : ["validation-records", "memory-change-records", "intelligence-log"].includes(params.resource) ? "organization.audit.read"
    : params.resource === "ticket-sequence" || params.resource === "tickets" ? "ticket.read"
    : "knowledge.read";
  await requireCapability(organizationId, capability, { request, resource: `organization_resource:${params.resource}` });
  return NextResponse.json({ data: await handler(organizationId) }, { status: 200 });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const resourceWriters: Record<string, (organizationId: string, payload: any) => Promise<void>> = {
  knowledge: saveKnowledge,
  "knowledge-candidates": saveKnowledgeCandidates,
  metrics: saveOrgMetrics,
  "intelligence-log": saveIntelligenceLog,
  "emerging-patterns": saveEmergingPatterns
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Audit records are append-only and can only be written through the
// transactional validation commit endpoint, never by snapshot saves.
const APPEND_ONLY_RESOURCES = new Set(["validation-records", "memory-change-records"]);

export const PUT = withOrganizationRoute<ResourceRouteParams>(async ({ request, organizationId, params, user }) => {
  const { resource } = params;
  if (APPEND_ONLY_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: { code: "APPEND_ONLY_RESOURCE", message: "Audit records can only be written through the validation commit operation." } },
      { status: 405 }
    );
  }
  if (resource === "tickets") {
    // RSS-1.2S3: the tickets writer is the strict server-owned client boundary.
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/[resource]?resource=tickets", organizationId, actorUserId: user.id }, [
      { policy: "ticket.submit.user", dimensions: [{ type: "user", value: user.id }] },
      { policy: "ticket.submit.organization", dimensions: [{ type: "organization", value: organizationId }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } }, { status: 400 });
    }
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The ticket payload must be an array of client-owned ticket records." } }, { status: 400 });
    }
    try {
      await saveClientTicketRecords(organizationId, user.id, body);
    } catch (error) {
      if (error instanceof TicketWriteError) {
        return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      throw error;
    }
    return NextResponse.json({ data: { saved: true } }, { status: 200 });
  }
  const writer = resourceWriters[resource];
  if (!writer) {
    return NextResponse.json(
      { error: { code: "RESOURCE_NOT_FOUND", message: "The requested organization resource was not found." } },
      { status: 404 }
    );
  }
  const capability = resource === "knowledge-candidates" ? "knowledge.promote"
    : resource === "knowledge" ? "knowledge.version.create"
    : resource === "metrics" ? "metrics.read"
    : "organization.profile.update";
  await requireCapability(organizationId, capability, { request, resource: `organization_resource_write:${resource}` });
  if (resource === "metrics") {
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/[resource]?resource=metrics", organizationId, actorUserId: user.id }, [
      { policy: "admin.mutate.user", dimensions: [{ type: "user", value: user.id }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  await writer(organizationId, body);
  return NextResponse.json({ data: { saved: true } }, { status: 200 });
});
