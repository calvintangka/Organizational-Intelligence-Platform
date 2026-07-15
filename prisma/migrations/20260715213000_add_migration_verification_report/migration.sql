ALTER TABLE "migration_import_batches"
ADD COLUMN "verificationReport" JSONB,
ADD COLUMN "verificationError" TEXT;
