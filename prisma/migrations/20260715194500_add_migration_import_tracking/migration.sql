-- CreateEnum
CREATE TYPE "MigrationImportBatchStatus" AS ENUM ('pending', 'validating', 'ready', 'importing', 'partial', 'conflict', 'imported', 'verifying', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "MigrationImportResourceType" AS ENUM ('knowledge', 'knowledgeCandidates', 'validationRecords', 'memoryChangeRecords', 'orgMetrics', 'intelligenceLog', 'emergingPatterns', 'ticketRecords', 'ticketSequence');

-- CreateEnum
CREATE TYPE "MigrationImportResourceStatus" AS ENUM ('pending', 'validating', 'importing', 'imported', 'conflict', 'failed', 'verified');

-- CreateEnum
CREATE TYPE "MigrationImportConflictType" AS ENUM ('same_id_different_content', 'cross_organization_ownership_mismatch', 'duplicate_candidate_validation', 'duplicate_validation_memory_relationship', 'ticket_id_collision', 'lesson_id_content_conflict', 'knowledge_version_id_conflict', 'unresolved_historical_reference', 'digest_mismatch', 'malformed_source_record');

-- CreateEnum
CREATE TYPE "MigrationImportConflictStatus" AS ENUM ('open', 'resolved_source', 'resolved_target', 'resolved_manual', 'ignored');

-- CreateTable
CREATE TABLE "migration_import_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "resourcePayloadDigest" TEXT NOT NULL,
    "metadataDigest" TEXT,
    "sourceOrganizationId" TEXT NOT NULL,
    "sourcePersistenceMode" TEXT NOT NULL,
    "sourceSchemaVersion" TEXT NOT NULL,
    "exportedAt" TIMESTAMPTZ(6) NOT NULL,
    "counts" JSONB NOT NULL,
    "resourceDigests" JSONB NOT NULL,
    "status" "MigrationImportBatchStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "verificationCompletedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "migration_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_import_resources" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "resourceType" "MigrationImportResourceType" NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedIdenticalCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "sourceDigest" TEXT NOT NULL,
    "targetDigest" TEXT,
    "status" "MigrationImportResourceStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "migration_import_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_import_conflicts" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceType" "MigrationImportResourceType" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "conflictType" "MigrationImportConflictType" NOT NULL,
    "sourceDigest" TEXT,
    "targetDigest" TEXT,
    "sourceSnapshot" JSONB,
    "targetSnapshot" JSONB,
    "reason" TEXT NOT NULL,
    "status" "MigrationImportConflictStatus" NOT NULL DEFAULT 'open',
    "detectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "migration_import_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_import_batches_organizationId_status_idx" ON "migration_import_batches"("organizationId", "status");

-- CreateIndex
CREATE INDEX "migration_import_batches_resourcePayloadDigest_idx" ON "migration_import_batches"("resourcePayloadDigest");

-- CreateIndex
CREATE UNIQUE INDEX "migration_import_batches_organizationId_resourcePayloadDige_key" ON "migration_import_batches"("organizationId", "resourcePayloadDigest");

-- CreateIndex
CREATE INDEX "migration_import_resources_batchId_status_idx" ON "migration_import_resources"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "migration_import_resources_batchId_resourceType_key" ON "migration_import_resources"("batchId", "resourceType");

-- CreateIndex
CREATE INDEX "migration_import_conflicts_organizationId_status_idx" ON "migration_import_conflicts"("organizationId", "status");

-- CreateIndex
CREATE INDEX "migration_import_conflicts_batchId_status_idx" ON "migration_import_conflicts"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "migration_import_conflicts_batchId_fingerprint_key" ON "migration_import_conflicts"("batchId", "fingerprint");

-- AddForeignKey
ALTER TABLE "migration_import_batches" ADD CONSTRAINT "migration_import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_import_resources" ADD CONSTRAINT "migration_import_resources_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "migration_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_import_conflicts" ADD CONSTRAINT "migration_import_conflicts_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "migration_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_import_conflicts" ADD CONSTRAINT "migration_import_conflicts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
