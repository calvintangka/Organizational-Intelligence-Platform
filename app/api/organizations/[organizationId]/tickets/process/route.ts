import { NextResponse } from "next/server";

import { processTicket, ProcessTicketError } from "@/lib/application/tickets/processTicket";
import { createAIAdapter } from "@/lib/ai/adapter";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { createServerJobPersistenceSession } from "@/lib/server/jobs/serverPersistenceAdapter";
import { jobContext } from "@/lib/server/jobs/http";
import { requestIdentity } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RSS-1.2S3 — interactive ticket processing runs on the SERVER.
 *
 * The client submits only the ticket's facts (description, subject, customer
 * name). The server loads the organization profile and knowledge, derives every
 * authoritative field (actor, organization, status, timestamps, classification,
 * memory references, workflow state) through the same deterministic pipeline
 * the durable worker uses, and persists server-owned records. The client never
 * constructs or writes authoritative ticket state.
 */
export const POST = withOrganizationRoute("ticket.submit", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "description is required." } }, { status: 400 });
  }
  const { requestId, correlationId } = requestIdentity(request);
  const idempotencyKey = typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : undefined;
  const context = jobContext(organizationId, user, requestId, correlationId);
  const persistence = createServerJobPersistenceSession(context);
  const ai = createAIAdapter();
  try {
    const profile = await persistence.loadOrganizationProfile();
    const knowledgeItems = await persistence.loadKnowledge();
    const result = await processTicket(
      {
        organizationId,
        actorContext: user,
        authority: "server",
        requestId,
        idempotencyKey,
        ticketInput: {
          description,
          customerName: typeof body?.customerName === "string" && body.customerName.trim() ? body.customerName.trim() : "Customer",
          intakeMode: "single",
          ...(typeof body?.subject === "string" && body.subject.trim() ? { subject: body.subject.trim() } : {})
        },
        organizationProfile: profile,
        processingOptions: { knowledgeItems, aiAdapter: ai }
      },
      { persistence, ai }
    );
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof ProcessTicketError) {
      return NextResponse.json(
        { error: { code: "TICKET_PROCESSING_FAILED", message: error.failure.safeMessage, persistedTicket: error.failure.persistedTicket ?? null } },
        { status: 500 }
      );
    }
    throw error;
  }
});
