CREATE TYPE "TicketResolutionEvidenceType" AS ENUM ('customer_confirmation', 'agent_verification', 'manual_verified_resolution');

CREATE TABLE "ticket_resolution_evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "TicketResolutionEvidenceType" NOT NULL,
    "sourceMessageId" TEXT,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,

    CONSTRAINT "ticket_resolution_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_resolution_evidence_organizationId_ticketId_idempotencyKey_key"
    ON "ticket_resolution_evidence"("organizationId", "ticketId", "idempotencyKey");
CREATE INDEX "ticket_resolution_evidence_organizationId_ticketId_createdAt_idx"
    ON "ticket_resolution_evidence"("organizationId", "ticketId", "createdAt");
CREATE INDEX "ticket_resolution_evidence_organizationId_sourceMessageId_idx"
    ON "ticket_resolution_evidence"("organizationId", "sourceMessageId");

ALTER TABLE "ticket_resolution_evidence"
    ADD CONSTRAINT "ticket_resolution_evidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_resolution_evidence"
    ADD CONSTRAINT "ticket_resolution_evidence_organizationId_ticketId_fkey"
    FOREIGN KEY ("organizationId", "ticketId") REFERENCES "ticket_records"("organizationId", "ticketId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_resolution_evidence"
    ADD CONSTRAINT "ticket_resolution_evidence_sourceMessageId_fkey"
    FOREIGN KEY ("sourceMessageId") REFERENCES "ticket_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
