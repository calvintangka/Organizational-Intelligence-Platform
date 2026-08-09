-- RSS-1.2S3: server-owned ticket write contract.
-- Durable evidence of server-owned ticket workflow transitions. Free-form
-- columns (no foreign keys) so transition evidence survives actor/ticket
-- removal, matching the append-only audit posture of rate-limit denials.
CREATE TABLE "ticket_transition_audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "summary" JSONB,
    "source" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_transition_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_transition_audits_organizationId_createdAt_idx" ON "ticket_transition_audits"("organizationId", "createdAt");
CREATE INDEX "ticket_transition_audits_ticketId_createdAt_idx" ON "ticket_transition_audits"("ticketId", "createdAt");
