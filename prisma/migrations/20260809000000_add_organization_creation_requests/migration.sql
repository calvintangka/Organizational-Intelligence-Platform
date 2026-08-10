-- RSS-2.2: durable per-creator idempotency records for atomic organization
-- provisioning. The organization and request row are committed together.
CREATE TABLE "organization_creation_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_creation_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_creation_requests_organizationId_key" ON "organization_creation_requests"("organizationId");
CREATE UNIQUE INDEX "organization_creation_requests_userId_idempotencyKey_key" ON "organization_creation_requests"("userId", "idempotencyKey");
CREATE INDEX "organization_creation_requests_organizationId_idx" ON "organization_creation_requests"("organizationId");

ALTER TABLE "organization_creation_requests"
  ADD CONSTRAINT "organization_creation_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_creation_requests"
  ADD CONSTRAINT "organization_creation_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
