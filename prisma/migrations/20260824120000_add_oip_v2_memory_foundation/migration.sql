-- OIP-V2-FIX-001: domain-neutral source/evidence, outcome, and challenge foundation.
-- Additive only. Existing Support evidence, knowledge, validation, memory-change,
-- trust, and provenance rows are retained; nullable adapters are linked lazily
-- by the server transaction path.

CREATE TYPE "KnowledgeReuseOutcomeClassification" AS ENUM ('SUCCESS', 'CORRECTION_REQUIRED', 'FAILURE');
CREATE TYPE "KnowledgeChallengeState" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "KnowledgeChallengeDisposition" AS ENUM ('REVALIDATED', 'SCOPE_UPDATED', 'DEPRECATED');

ALTER TABLE "knowledge_items"
    ADD COLUMN "governanceState" TEXT NOT NULL DEFAULT 'trusted';

ALTER TABLE "ticket_records"
    ADD COLUMN "sourceId" TEXT;

ALTER TABLE "ticket_resolution_evidence"
    ADD COLUMN "evidenceRecordId" TEXT;

CREATE TABLE "organizational_sources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceObjectType" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6),
    "capturedAt" TIMESTAMPTZ(6),
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizational_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceRole" TEXT NOT NULL,
    "actorId" TEXT,
    "occurredAt" TIMESTAMPTZ(6),
    "content" TEXT,
    "reference" TEXT,
    "state" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memory_evidence_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "knowledgeVersionId" TEXT,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_evidence_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_reuse_outcomes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "knowledgeVersionId" TEXT,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reuseMode" TEXT,
    "classification" "KnowledgeReuseOutcomeClassification" NOT NULL,
    "requiredEdits" BOOLEAN NOT NULL DEFAULT false,
    "trustAction" TEXT,
    "trustDelta" INTEGER,
    "trustEvidenceId" TEXT,
    "knowledgeRevision" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_reuse_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_challenges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "knowledgeVersionId" TEXT,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "state" "KnowledgeChallengeState" NOT NULL DEFAULT 'OPEN',
    "disposition" "KnowledgeChallengeDisposition",
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "decisionRationale" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_challenge_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "disposition" "KnowledgeChallengeDisposition" NOT NULL,
    "actorId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "resultingRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_challenge_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_items_organizationId_id_key"
    ON "knowledge_items"("organizationId", "id");
CREATE UNIQUE INDEX "ticket_records_sourceId_key"
    ON "ticket_records"("sourceId");
CREATE UNIQUE INDEX "ticket_records_organizationId_sourceId_key"
    ON "ticket_records"("organizationId", "sourceId");
CREATE UNIQUE INDEX "ticket_resolution_evidence_evidenceRecordId_key"
    ON "ticket_resolution_evidence"("evidenceRecordId");
CREATE UNIQUE INDEX "ticket_resolution_evidence_organizationId_evidenceRecordId_key"
    ON "ticket_resolution_evidence"("organizationId", "evidenceRecordId");

CREATE UNIQUE INDEX "org_sources_system_object_key"
    ON "organizational_sources"("organizationId", "sourceSystem", "sourceObjectType", "sourceObjectId");
CREATE UNIQUE INDEX "organizational_sources_organizationId_id_key"
    ON "organizational_sources"("organizationId", "id");
CREATE INDEX "org_sources_kind_created_idx"
    ON "organizational_sources"("organizationId", "sourceKind", "createdAt");
CREATE INDEX "org_sources_system_object_idx"
    ON "organizational_sources"("organizationId", "sourceSystem", "sourceObjectId");

CREATE UNIQUE INDEX "evidence_records_organizationId_sourceId_idempotencyKey_key"
    ON "evidence_records"("organizationId", "sourceId", "idempotencyKey");
CREATE UNIQUE INDEX "evidence_records_organizationId_id_key"
    ON "evidence_records"("organizationId", "id");
CREATE INDEX "evidence_records_organizationId_sourceId_createdAt_idx"
    ON "evidence_records"("organizationId", "sourceId", "createdAt");
CREATE INDEX "evidence_records_organizationId_evidenceType_createdAt_idx"
    ON "evidence_records"("organizationId", "evidenceType", "createdAt");

CREATE UNIQUE INDEX "memory_links_item_evidence_role_key"
    ON "memory_evidence_links"("organizationId", "knowledgeItemId", "evidenceId", "relationship");
CREATE UNIQUE INDEX "memory_evidence_links_organizationId_id_key"
    ON "memory_evidence_links"("organizationId", "id");
CREATE INDEX "memory_links_item_created_idx"
    ON "memory_evidence_links"("organizationId", "knowledgeItemId", "createdAt");
CREATE INDEX "memory_evidence_links_organizationId_evidenceId_idx"
    ON "memory_evidence_links"("organizationId", "evidenceId");

CREATE UNIQUE INDEX "knowledge_reuse_outcomes_organizationId_idempotencyKey_key"
    ON "knowledge_reuse_outcomes"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "knowledge_reuse_outcomes_organizationId_id_key"
    ON "knowledge_reuse_outcomes"("organizationId", "id");
CREATE INDEX "knowledge_outcomes_item_created_idx"
    ON "knowledge_reuse_outcomes"("organizationId", "knowledgeItemId", "createdAt");
CREATE INDEX "knowledge_reuse_outcomes_organizationId_sourceId_createdAt_idx"
    ON "knowledge_reuse_outcomes"("organizationId", "sourceId", "createdAt");
CREATE INDEX "knowledge_reuse_outcomes_organizationId_evidenceId_idx"
    ON "knowledge_reuse_outcomes"("organizationId", "evidenceId");

CREATE UNIQUE INDEX "knowledge_challenges_organizationId_idempotencyKey_key"
    ON "knowledge_challenges"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "knowledge_challenges_organizationId_id_key"
    ON "knowledge_challenges"("organizationId", "id");
CREATE INDEX "knowledge_challenges_item_state_created_idx"
    ON "knowledge_challenges"("organizationId", "knowledgeItemId", "state", "createdAt");
CREATE INDEX "knowledge_challenges_organizationId_sourceId_createdAt_idx"
    ON "knowledge_challenges"("organizationId", "sourceId", "createdAt");

CREATE UNIQUE INDEX "knowledge_challenge_decisions_challengeId_key"
    ON "knowledge_challenge_decisions"("challengeId");
CREATE UNIQUE INDEX "knowledge_challenge_decisions_organizationId_challengeId_key"
    ON "knowledge_challenge_decisions"("organizationId", "challengeId");
CREATE INDEX "challenge_decisions_item_created_idx"
    ON "knowledge_challenge_decisions"("organizationId", "knowledgeItemId", "createdAt");

ALTER TABLE "organizational_sources"
    ADD CONSTRAINT "organizational_sources_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidence_records"
    ADD CONSTRAINT "evidence_records_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "evidence_records_organizationId_sourceId_fkey"
    FOREIGN KEY ("organizationId", "sourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "memory_evidence_links"
    ADD CONSTRAINT "memory_evidence_links_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "memory_evidence_links_organizationId_knowledgeItemId_fkey"
    FOREIGN KEY ("organizationId", "knowledgeItemId") REFERENCES "knowledge_items"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "memory_evidence_links_organizationId_evidenceId_fkey"
    FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "evidence_records"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_reuse_outcomes"
    ADD CONSTRAINT "knowledge_reuse_outcomes_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_reuse_outcomes_organizationId_knowledgeItemId_fkey"
    FOREIGN KEY ("organizationId", "knowledgeItemId") REFERENCES "knowledge_items"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_reuse_outcomes_organizationId_sourceId_fkey"
    FOREIGN KEY ("organizationId", "sourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_reuse_outcomes_organizationId_evidenceId_fkey"
    FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "evidence_records"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_challenges"
    ADD CONSTRAINT "knowledge_challenges_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_challenges_organizationId_knowledgeItemId_fkey"
    FOREIGN KEY ("organizationId", "knowledgeItemId") REFERENCES "knowledge_items"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_challenges_organizationId_sourceId_fkey"
    FOREIGN KEY ("organizationId", "sourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_challenges_organizationId_evidenceId_fkey"
    FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "evidence_records"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_challenge_decisions"
    ADD CONSTRAINT "knowledge_challenge_decisions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "knowledge_challenge_decisions_organizationId_challengeId_fkey"
    FOREIGN KEY ("organizationId", "challengeId") REFERENCES "knowledge_challenges"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_records"
    ADD CONSTRAINT "ticket_records_organizationId_sourceId_fkey"
    FOREIGN KEY ("organizationId", "sourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_resolution_evidence"
    ADD CONSTRAINT "ticket_resolution_evidence_organizationId_evidenceRecordId_fkey"
    FOREIGN KEY ("organizationId", "evidenceRecordId") REFERENCES "evidence_records"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
