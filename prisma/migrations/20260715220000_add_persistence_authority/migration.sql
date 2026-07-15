-- CreateEnum
CREATE TYPE "PersistenceAuthority" AS ENUM ('local', 'server');

-- CreateTable
CREATE TABLE "organization_persistence_authority" (
    "organizationId" TEXT NOT NULL,
    "authority" "PersistenceAuthority" NOT NULL DEFAULT 'local',
    "previousAuthority" "PersistenceAuthority",
    "migrationBatchId" TEXT,
    "reason" TEXT,
    "cutoverAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_persistence_authority_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "organization_persistence_authority_authority_idx" ON "organization_persistence_authority"("authority");

-- CreateIndex
CREATE INDEX "organization_persistence_authority_migrationBatchId_idx" ON "organization_persistence_authority"("migrationBatchId");

-- AddForeignKey
ALTER TABLE "organization_persistence_authority" ADD CONSTRAINT "organization_persistence_authority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_persistence_authority" ADD CONSTRAINT "organization_persistence_authority_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
