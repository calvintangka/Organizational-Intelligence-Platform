-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "KnowledgeLifecycleState" AS ENUM ('active', 'candidate', 'deprecated');

-- CreateEnum
CREATE TYPE "KnowledgeCandidateLifecycle" AS ENUM ('proposed', 'validated', 'rejected');

-- CreateEnum
CREATE TYPE "ValidationDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "TicketRecordLifecycle" AS ENUM ('open', 'in_review', 'resolved', 'rejected', 'discarded');

-- CreateEnum
CREATE TYPE "EmergingPatternLifecycle" AS ENUM ('monitoring', 'suggested', 'promoted', 'dismissed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "canonicalProblemId" TEXT,
    "canonicalProblemTitle" TEXT,
    "lifecycleState" "KnowledgeLifecycleState" NOT NULL DEFAULT 'active',
    "sourceTicketId" TEXT NOT NULL,
    "timesReused" INTEGER NOT NULL DEFAULT 0,
    "timesSeen" INTEGER,
    "successfulResolutions" INTEGER,
    "failedResolutions" INTEGER,
    "successRate" DOUBLE PRECISION,
    "trustScore" INTEGER,
    "autoResponseEligible" BOOLEAN,
    "humanReviewCount" INTEGER,
    "automaticResolutionCount" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "approvedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(6),
    "lastValidatedAt" TIMESTAMPTZ(6),
    "lastUpdatedAt" TIMESTAMPTZ(6),
    "lastValidated" TIMESTAMPTZ(6),
    "content" JSONB NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_candidates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relatedKnowledgeId" TEXT,
    "sourceTicketIds" JSONB NOT NULL,
    "proposedAction" TEXT NOT NULL,
    "proposedContent" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "KnowledgeCandidateLifecycle" NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "knowledgeItemId" TEXT,
    "knowledgeVersionId" TEXT,
    "decision" "ValidationDecision" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "roleExercised" TEXT NOT NULL,
    "rationale" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "validation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_change_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "validationRecordId" TEXT NOT NULL,
    "actorId" TEXT,
    "changeType" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memory_change_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "subject" TEXT,
    "status" "TicketRecordLifecycle" NOT NULL DEFAULT 'open',
    "draftSource" TEXT,
    "classification" JSONB,
    "memoryMatch" JSONB,
    "resolution" JSONB NOT NULL,
    "reflection" JSONB NOT NULL,
    "validationRecordIds" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ticket_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emerging_patterns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "EmergingPatternLifecycle" NOT NULL DEFAULT 'monitoring',
    "tags" JSONB NOT NULL,
    "keywords" JSONB NOT NULL,
    "exampleTickets" JSONB NOT NULL,
    "timesSeen" INTEGER NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "suggestedCanonicalProblem" BOOLEAN NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emerging_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_metrics" (
    "organizationId" TEXT NOT NULL,
    "lifetimeTickets" INTEGER NOT NULL,
    "knowledgeReused" INTEGER NOT NULL,
    "autoResolutions" INTEGER NOT NULL,
    "humanResolutions" INTEGER NOT NULL,
    "totalResolutionTimeSec" INTEGER NOT NULL,
    "resolutionsCount" INTEGER NOT NULL,
    "memoryGrowthToday" INTEGER NOT NULL,
    "memoryGrowthDate" TEXT NOT NULL,
    "mergedTickets" INTEGER,
    "duplicatePreventions" INTEGER,
    "knowledgeVersions" INTEGER,
    "emergingPatternsDetected" INTEGER,
    "promotedPatterns" INTEGER,
    "aiCalls" INTEGER,
    "aiSuccesses" INTEGER,
    "aiFailures" INTEGER,
    "aiFallbacks" INTEGER,
    "aiAgreementSamples" INTEGER,
    "aiAgreementTotal" INTEGER,
    "humanAcceptedAISuggestions" INTEGER,
    "lastUpdatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "org_metrics_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "intelligence_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "event" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "intelligence_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_sequences" (
    "organizationId" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ticket_sequences_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "knowledge_items_organizationId_idx" ON "knowledge_items"("organizationId");

-- CreateIndex
CREATE INDEX "knowledge_items_organizationId_category_idx" ON "knowledge_items"("organizationId", "category");

-- CreateIndex
CREATE INDEX "knowledge_items_organizationId_canonicalProblemId_idx" ON "knowledge_items"("organizationId", "canonicalProblemId");

-- CreateIndex
CREATE INDEX "knowledge_candidates_organizationId_idx" ON "knowledge_candidates"("organizationId");

-- CreateIndex
CREATE INDEX "knowledge_candidates_organizationId_status_idx" ON "knowledge_candidates"("organizationId", "status");

-- CreateIndex
CREATE INDEX "knowledge_candidates_organizationId_relatedKnowledgeId_idx" ON "knowledge_candidates"("organizationId", "relatedKnowledgeId");

-- CreateIndex
CREATE INDEX "validation_records_organizationId_idx" ON "validation_records"("organizationId");

-- CreateIndex
CREATE INDEX "validation_records_organizationId_candidateId_idx" ON "validation_records"("organizationId", "candidateId");

-- CreateIndex
CREATE INDEX "validation_records_organizationId_knowledgeItemId_idx" ON "validation_records"("organizationId", "knowledgeItemId");

-- CreateIndex
CREATE INDEX "validation_records_organizationId_timestamp_idx" ON "validation_records"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "memory_change_records_organizationId_idx" ON "memory_change_records"("organizationId");

-- CreateIndex
CREATE INDEX "memory_change_records_organizationId_knowledgeItemId_idx" ON "memory_change_records"("organizationId", "knowledgeItemId");

-- CreateIndex
CREATE INDEX "memory_change_records_organizationId_validationRecordId_idx" ON "memory_change_records"("organizationId", "validationRecordId");

-- CreateIndex
CREATE INDEX "memory_change_records_organizationId_timestamp_idx" ON "memory_change_records"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "ticket_records_organizationId_idx" ON "ticket_records"("organizationId");

-- CreateIndex
CREATE INDEX "ticket_records_organizationId_status_idx" ON "ticket_records"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ticket_records_organizationId_createdAt_idx" ON "ticket_records"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_records_organizationId_ticketId_key" ON "ticket_records"("organizationId", "ticketId");

-- CreateIndex
CREATE INDEX "emerging_patterns_organizationId_idx" ON "emerging_patterns"("organizationId");

-- CreateIndex
CREATE INDEX "emerging_patterns_organizationId_status_idx" ON "emerging_patterns"("organizationId", "status");

-- CreateIndex
CREATE INDEX "emerging_patterns_organizationId_category_idx" ON "emerging_patterns"("organizationId", "category");

-- CreateIndex
CREATE INDEX "emerging_patterns_organizationId_lastSeenAt_idx" ON "emerging_patterns"("organizationId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "intelligence_log_organizationId_idx" ON "intelligence_log"("organizationId");

-- CreateIndex
CREATE INDEX "intelligence_log_organizationId_timestamp_idx" ON "intelligence_log"("organizationId", "timestamp");

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidates" ADD CONSTRAINT "knowledge_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_change_records" ADD CONSTRAINT "memory_change_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_records" ADD CONSTRAINT "ticket_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emerging_patterns" ADD CONSTRAINT "emerging_patterns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_metrics" ADD CONSTRAINT "org_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_log" ADD CONSTRAINT "intelligence_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sequences" ADD CONSTRAINT "ticket_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

