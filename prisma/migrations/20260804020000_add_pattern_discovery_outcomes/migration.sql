CREATE TABLE "pattern_discovery_outcomes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceTicketId" TEXT,
    "sourceJobId" TEXT,
    "patternId" TEXT,
    "action" TEXT NOT NULL,
    "patternFound" BOOLEAN NOT NULL,
    "created" BOOLEAN NOT NULL,
    "strengthened" BOOLEAN NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "matchedTicketCount" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "auditSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pattern_discovery_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pattern_discovery_evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "evidenceDigest" TEXT NOT NULL,
    "safeSummary" TEXT NOT NULL,
    "language" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_discovery_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pattern_discovery_outcomes_jobId_key" ON "pattern_discovery_outcomes"("jobId");
CREATE UNIQUE INDEX "pattern_discovery_outcomes_organizationId_idempotencyKey_key" ON "pattern_discovery_outcomes"("organizationId", "idempotencyKey");
CREATE INDEX "pattern_discovery_outcomes_organizationId_sourceTicketId_idx" ON "pattern_discovery_outcomes"("organizationId", "sourceTicketId");
CREATE INDEX "pattern_discovery_outcomes_organizationId_patternId_idx" ON "pattern_discovery_outcomes"("organizationId", "patternId");

CREATE UNIQUE INDEX "pattern_discovery_evidence_organizationId_patternId_ticketId_key" ON "pattern_discovery_evidence"("organizationId", "patternId", "ticketId");
CREATE INDEX "pattern_discovery_evidence_organizationId_ticketId_idx" ON "pattern_discovery_evidence"("organizationId", "ticketId");

ALTER TABLE "pattern_discovery_outcomes" ADD CONSTRAINT "pattern_discovery_outcomes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pattern_discovery_outcomes" ADD CONSTRAINT "pattern_discovery_outcomes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "durable_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pattern_discovery_outcomes" ADD CONSTRAINT "pattern_discovery_outcomes_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "emerging_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pattern_discovery_evidence" ADD CONSTRAINT "pattern_discovery_evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pattern_discovery_evidence" ADD CONSTRAINT "pattern_discovery_evidence_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "emerging_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
