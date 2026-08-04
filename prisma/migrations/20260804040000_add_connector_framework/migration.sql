-- Generated from the Prisma schema diff after `migrate dev --create-only`
-- could not create a shadow database with the local development role.
-- This additive migration introduces the reviewed TODO-076 connector boundary.
CREATE TABLE "connector_installations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "adapterVersion" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "configuration" JSONB NOT NULL,
    "capabilities" JSONB NOT NULL,
    "externalAccountId" TEXT,
    "externalWorkspaceId" TEXT,
    "activeCredentialId" TEXT,
    "cursor" JSONB,
    "lastSyncAt" TIMESTAMPTZ(6),
    "lastSuccessAt" TIMESTAMPTZ(6),
    "lastFailureAt" TIMESTAMPTZ(6),
    "lastFailureSafe" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "connector_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_credentials" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "encryptedMaterial" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'local-v1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "rotatedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_inbound_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorInstallationId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT,
    "payloadDigest" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTimestamp" TIMESTAMPTZ(6),
    "normalizedAt" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "jobId" TEXT,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "safeMetadata" JSONB NOT NULL,
    "normalizedSignal" JSONB,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "connector_inbound_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_object_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorInstallationId" TEXT NOT NULL,
    "externalObjectType" TEXT NOT NULL,
    "externalObjectId" TEXT NOT NULL,
    "oipResourceType" TEXT NOT NULL,
    "oipResourceId" TEXT NOT NULL,
    "externalVersion" TEXT,
    "lastExternalUpdatedAt" TIMESTAMPTZ(6),
    "lastOipUpdatedAt" TIMESTAMPTZ(6),
    "syncState" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "external_object_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "connector_installations_organizationId_status_createdAt_idx" ON "connector_installations"("organizationId", "status", "createdAt");
CREATE INDEX "connector_installations_connectorType_status_idx" ON "connector_installations"("connectorType", "status");
CREATE INDEX "connector_credentials_installationId_status_createdAt_idx" ON "connector_credentials"("installationId", "status", "createdAt");
CREATE UNIQUE INDEX "connector_inbound_events_jobId_key" ON "connector_inbound_events"("jobId");
CREATE INDEX "connector_inbound_events_organizationId_status_receivedAt_idx" ON "connector_inbound_events"("organizationId", "status", "receivedAt");
CREATE INDEX "connector_inbound_events_connectorInstallationId_receivedAt_idx" ON "connector_inbound_events"("connectorInstallationId", "receivedAt");
CREATE UNIQUE INDEX "connector_inbound_events_connectorInstallationId_externalEv_key" ON "connector_inbound_events"("connectorInstallationId", "externalEventId", "eventType");
CREATE INDEX "external_object_mappings_organizationId_oipResourceType_oip_idx" ON "external_object_mappings"("organizationId", "oipResourceType", "oipResourceId");
CREATE UNIQUE INDEX "external_object_mappings_connectorInstallationId_externalOb_key" ON "external_object_mappings"("connectorInstallationId", "externalObjectType", "externalObjectId");

ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_activeCredentialId_fkey" FOREIGN KEY ("activeCredentialId") REFERENCES "connector_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "connector_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_inbound_events" ADD CONSTRAINT "connector_inbound_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_inbound_events" ADD CONSTRAINT "connector_inbound_events_connectorInstallationId_fkey" FOREIGN KEY ("connectorInstallationId") REFERENCES "connector_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_inbound_events" ADD CONSTRAINT "connector_inbound_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "durable_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_object_mappings" ADD CONSTRAINT "external_object_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_object_mappings" ADD CONSTRAINT "external_object_mappings_connectorInstallationId_fkey" FOREIGN KEY ("connectorInstallationId") REFERENCES "connector_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
