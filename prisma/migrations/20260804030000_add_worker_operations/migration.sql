CREATE TABLE "durable_worker_heartbeats" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastHeartbeatAt" TIMESTAMPTZ(6) NOT NULL,
    "lastPollAt" TIMESTAMPTZ(6),
    "currentJobId" TEXT,
    "currentLeaseExpiresAt" TIMESTAMPTZ(6),
    "processedJobs" INTEGER NOT NULL DEFAULT 0,
    "succeededJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "cancelledJobs" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "lastErrorSafe" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "durable_worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "durable_worker_heartbeats_workerId_key" ON "durable_worker_heartbeats"("workerId");
CREATE INDEX "durable_worker_heartbeats_status_lastHeartbeatAt_idx" ON "durable_worker_heartbeats"("status", "lastHeartbeatAt");
