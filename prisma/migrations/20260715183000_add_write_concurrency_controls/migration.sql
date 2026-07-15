-- DropIndex
DROP INDEX "memory_change_records_organizationId_validationRecordId_idx";

-- DropIndex
DROP INDEX "validation_records_organizationId_candidateId_idx";

-- AlterTable
ALTER TABLE "knowledge_items" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "memory_change_records_organizationId_validationRecordId_key" ON "memory_change_records"("organizationId", "validationRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "validation_records_organizationId_candidateId_key" ON "validation_records"("organizationId", "candidateId");
