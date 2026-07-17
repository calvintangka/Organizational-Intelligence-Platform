-- CreateTable
CREATE TABLE "trust_evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "sourceTicketId" TEXT NOT NULL,
    "trustEventType" TEXT NOT NULL,
    "validationRecordId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_evidence_organizationId_knowledgeItemId_idx" ON "trust_evidence"("organizationId", "knowledgeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "trust_evidence_org_item_ticket_event_key" ON "trust_evidence"("organizationId", "knowledgeItemId", "sourceTicketId", "trustEventType");

-- AddForeignKey
ALTER TABLE "trust_evidence" ADD CONSTRAINT "trust_evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
