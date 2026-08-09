import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { applyTicketWorkflowCommand } from "@/lib/server/tickets/ticketWorkflow";
import { requestIdentity } from "@/lib/server/rateLimit";
import { TicketWriteError, type TicketRecordClassification, type TicketRecordMemoryMatch, type TicketWorkflowCommand } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCommand(body: unknown): TicketWorkflowCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TicketWriteError("INVALID_TRANSITION", "A transition command is required.", 400);
  }
  const record = body as Record<string, unknown>;
  switch (record.kind) {
    case "attach_analysis":
      return {
        kind: "attach_analysis",
        classification: (record.classification ?? null) as TicketRecordClassification | null,
        memoryMatch: (record.memoryMatch ?? null) as TicketRecordMemoryMatch | null,
        bulkClusterId: typeof record.bulkClusterId === "string" ? record.bulkClusterId : null
      };
    case "approve":
      return { kind: "approve", finalResponse: typeof record.finalResponse === "string" ? record.finalResponse : "", humanEdited: record.humanEdited === true };
    case "discard":
      return { kind: "discard" };
    case "reinstate":
      return { kind: "reinstate" };
    case "language":
      return { kind: "language", language: typeof record.language === "string" ? record.language : "" };
    case "commit":
      return {
        kind: "commit",
        validationRecordIds: Array.isArray(record.validationRecordIds) ? record.validationRecordIds.filter((item): item is string => typeof item === "string") : [],
        knowledgeId: typeof record.knowledgeId === "string" ? record.knowledgeId : null,
        action: typeof record.action === "string" ? record.action : "",
        lessonCreatedId: typeof record.lessonCreatedId === "string" ? record.lessonCreatedId : null,
        lessonReinforcedId: typeof record.lessonReinforcedId === "string" ? record.lessonReinforcedId : null,
        knowledgeChanged: typeof record.knowledgeChanged === "string" ? record.knowledgeChanged : null,
        finalResponse: typeof record.finalResponse === "string" ? record.finalResponse : undefined,
        automatic: record.automatic === true,
        classification: record.classification !== undefined ? (record.classification as TicketRecordClassification | null) : undefined,
        memoryMatch: record.memoryMatch !== undefined ? (record.memoryMatch as TicketRecordMemoryMatch | null) : undefined
      };
    default:
      throw new TicketWriteError("INVALID_TRANSITION", "The requested transition is not supported.", 400);
  }
}

export const POST = withOrganizationRoute<{ organizationId: string; ticketId: string }>("ticket.review", async ({ request, organizationId, params, user }) => {
  const body = await request.json().catch(() => null);
  try {
    const command = parseCommand(body);
    const { requestId, correlationId } = requestIdentity(request);
    const record = await applyTicketWorkflowCommand({
      organizationId,
      actorId: user.id,
      ticketId: params.ticketId,
      command,
      requestId,
      correlationId,
      source: "api"
    });
    return NextResponse.json({ data: record });
  } catch (error) {
    if (error instanceof TicketWriteError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }
});
