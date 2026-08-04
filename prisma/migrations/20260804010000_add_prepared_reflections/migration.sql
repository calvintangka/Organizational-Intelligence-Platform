CREATE TABLE "prepared_reflections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "ticket" JSONB NOT NULL,
    "understanding" JSONB NOT NULL,
    "reviewedResponse" TEXT NOT NULL,
    "reflection" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "generationMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prepared_reflections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prepared_reflections_jobId_key" ON "prepared_reflections"("jobId");
CREATE UNIQUE INDEX "prepared_reflections_organizationId_idempotencyKey_key" ON "prepared_reflections"("organizationId", "idempotencyKey");
CREATE INDEX "prepared_reflections_organizationId_ticketId_createdAt_idx" ON "prepared_reflections"("organizationId", "ticketId", "createdAt");

ALTER TABLE "prepared_reflections" ADD CONSTRAINT "prepared_reflections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prepared_reflections" ADD CONSTRAINT "prepared_reflections_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "durable_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
