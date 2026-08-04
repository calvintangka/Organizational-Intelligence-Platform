CREATE TABLE "durable_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "authority" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "progress" JSONB NOT NULL,
    "progressMessage" TEXT,
    "result" JSONB,
    "resultDigest" TEXT,
    "error" JSONB,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(6) WITH TIME ZONE,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(6) WITH TIME ZONE,
    "cancellationRequestedAt" TIMESTAMP(6) WITH TIME ZONE,
    "cancelledAt" TIMESTAMP(6) WITH TIME ZONE,
    "startedAt" TIMESTAMP(6) WITH TIME ZONE,
    "completedAt" TIMESTAMP(6) WITH TIME ZONE,
    "failedAt" TIMESTAMP(6) WITH TIME ZONE,
    "deadLetteredAt" TIMESTAMP(6) WITH TIME ZONE,
    "createdAt" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "durable_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "durable_job_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    "heartbeatAt" TIMESTAMP(6) WITH TIME ZONE,
    "finishedAt" TIMESTAMP(6) WITH TIME ZONE,
    "outcome" TEXT NOT NULL,
    "errorClass" TEXT,
    "retryable" BOOLEAN,
    "provider" TEXT,
    "durationMs" INTEGER,
    "safeDiagnostics" JSONB,

    CONSTRAINT "durable_job_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "durable_jobs_organizationId_idempotencyKey_key"
ON "durable_jobs"("organizationId", "idempotencyKey");

CREATE INDEX "durable_jobs_status_nextAttemptAt_priority_createdAt_idx"
ON "durable_jobs"("status", "nextAttemptAt", "priority", "createdAt");

CREATE INDEX "durable_jobs_organizationId_status_createdAt_idx"
ON "durable_jobs"("organizationId", "status", "createdAt");

CREATE INDEX "durable_jobs_leaseOwner_leaseExpiresAt_idx"
ON "durable_jobs"("leaseOwner", "leaseExpiresAt");

CREATE UNIQUE INDEX "durable_job_attempts_jobId_attemptNumber_key"
ON "durable_job_attempts"("jobId", "attemptNumber");

CREATE INDEX "durable_job_attempts_jobId_startedAt_idx"
ON "durable_job_attempts"("jobId", "startedAt");

ALTER TABLE "durable_jobs"
ADD CONSTRAINT "durable_jobs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "durable_job_attempts"
ADD CONSTRAINT "durable_job_attempts_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "durable_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
