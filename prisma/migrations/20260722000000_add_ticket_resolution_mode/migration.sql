-- CreateEnum
CREATE TYPE "TicketResolutionMode" AS ENUM ('human', 'automatic');

-- AlterTable
ALTER TABLE "ticket_records" ADD COLUMN "resolutionMode" "TicketResolutionMode";
