-- AlterTable
ALTER TABLE "users" ADD COLUMN "activeOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "users_activeOrganizationId_idx" ON "users"("activeOrganizationId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_activeOrganizationId_fkey" FOREIGN KEY ("activeOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
