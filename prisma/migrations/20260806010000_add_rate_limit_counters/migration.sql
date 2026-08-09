-- RSS-1.2S2: rate limiting abuse protection.
-- Atomic per-window counters shared across application instances through
-- PostgreSQL. The composite primary key enables `INSERT ... ON CONFLICT DO
-- UPDATE` as the atomic increment primitive. `dimensionKey` is a keyed digest
-- (HMAC-SHA256 with RATE_LIMIT_HASH_SECRET), so raw accounts, network
-- addresses, user ids, and organization ids are never stored.
CREATE TABLE "rate_limit_counters" (
    "policyKey" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("policyKey", "dimensionKey", "windowStart")
);

CREATE INDEX "rate_limit_counters_policyKey_updatedAt_idx" ON "rate_limit_counters"("policyKey", "updatedAt");

-- Durable record of rate-limit DENIAL decisions only. Free-form columns (no
-- foreign keys) so defense logging never depends on an organization or user
-- still existing.
CREATE TABLE "rate_limit_events" (
    "id" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "dimensionClass" TEXT,
    "actorUserId" TEXT,
    "organizationId" TEXT,
    "limitValue" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(6),
    "retryAfterSeconds" INTEGER,
    "reason" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_limit_events_createdAt_idx" ON "rate_limit_events"("createdAt");
CREATE INDEX "rate_limit_events_policyKey_createdAt_idx" ON "rate_limit_events"("policyKey", "createdAt");
