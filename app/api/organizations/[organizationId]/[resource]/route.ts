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
  saveTicketRecords,
  toSafePersistenceError,
  validateOrganizationId
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResourceRouteContext {
  params: Promise<{ organizationId: string; resource: string }>;
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

export async function GET(_request: Request, context: ResourceRouteContext) {
  try {
    const { organizationId, resource } = await context.params;
    validateOrganizationId(organizationId);
    const handler = resourceHandlers[resource];
    if (!handler) {
      return NextResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "The requested organization resource was not found." } },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: await handler(organizationId) }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const resourceWriters: Record<string, (organizationId: string, payload: any) => Promise<void>> = {
  knowledge: saveKnowledge,
  "knowledge-candidates": saveKnowledgeCandidates,
  metrics: saveOrgMetrics,
  "intelligence-log": saveIntelligenceLog,
  "emerging-patterns": saveEmergingPatterns,
  tickets: saveTicketRecords
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Audit records are append-only and can only be written through the
// transactional validation commit endpoint, never by snapshot saves.
const APPEND_ONLY_RESOURCES = new Set(["validation-records", "memory-change-records"]);

export async function PUT(request: Request, context: ResourceRouteContext) {
  try {
    const { organizationId, resource } = await context.params;
    validateOrganizationId(organizationId);
    if (APPEND_ONLY_RESOURCES.has(resource)) {
      return NextResponse.json(
        { error: { code: "APPEND_ONLY_RESOURCE", message: "Audit records can only be written through the validation commit operation." } },
        { status: 405 }
      );
    }
    const writer = resourceWriters[resource];
    if (!writer) {
      return NextResponse.json(
        { error: { code: "RESOURCE_NOT_FOUND", message: "The requested organization resource was not found." } },
        { status: 404 }
      );
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
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
