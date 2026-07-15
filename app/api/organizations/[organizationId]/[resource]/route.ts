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
