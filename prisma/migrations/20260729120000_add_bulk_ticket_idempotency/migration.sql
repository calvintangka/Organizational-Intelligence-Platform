ALTER TABLE "ticket_records"
ADD COLUMN "bulkUploadKey" TEXT,
ADD COLUMN "bulkEntryId" TEXT,
ADD COLUMN "bulkClusterId" TEXT,
ADD COLUMN "intakeMode" TEXT;

CREATE UNIQUE INDEX "ticket_records_organizationId_bulkUploadKey_bulkEntryId_key"
ON "ticket_records"("organizationId", "bulkUploadKey", "bulkEntryId");
