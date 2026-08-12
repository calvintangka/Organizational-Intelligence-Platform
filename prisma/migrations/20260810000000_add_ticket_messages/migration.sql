CREATE TYPE "TicketMessageDirection" AS ENUM ('customer', 'agent');

CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "direction" "TicketMessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_messages_organizationId_ticketId_sequence_key"
    ON "ticket_messages"("organizationId", "ticketId", "sequence");
CREATE UNIQUE INDEX "ticket_messages_organizationId_ticketId_idempotencyKey_key"
    ON "ticket_messages"("organizationId", "ticketId", "idempotencyKey");
CREATE INDEX "ticket_messages_organizationId_ticketId_sequence_idx"
    ON "ticket_messages"("organizationId", "ticketId", "sequence");

ALTER TABLE "ticket_messages"
    ADD CONSTRAINT "ticket_messages_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_messages"
    ADD CONSTRAINT "ticket_messages_organizationId_ticketId_fkey"
    FOREIGN KEY ("organizationId", "ticketId") REFERENCES "ticket_records"("organizationId", "ticketId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "TicketRecordLifecycle" ADD VALUE 'waiting_for_customer';
