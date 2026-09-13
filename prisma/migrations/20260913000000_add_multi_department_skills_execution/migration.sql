-- OIP-V2-MD-001: additive multi-department Memory, Skill governance, and
-- external execution handoff foundation. Historical Support data remains
-- intact; new generic identity is nullable for compatibility.

CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sensitivity" TEXT NOT NULL DEFAULT 'internal',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_items"
    ADD COLUMN "domainId" TEXT,
    ADD COLUMN "primarySourceId" TEXT,
    ADD COLUMN "scope" JSONB,
    ALTER COLUMN "sourceTicketId" DROP NOT NULL;

ALTER TABLE "organizational_sources"
    ADD COLUMN "domainId" TEXT,
    ADD COLUMN "scope" JSONB;

ALTER TABLE "knowledge_candidates"
    ADD COLUMN "domainId" TEXT,
    ADD COLUMN "sourceId" TEXT;

CREATE TABLE "organization_domain_capability_grants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_domain_capability_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizational_skills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER,
    "createdBy" TEXT NOT NULL,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organizational_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizational_skill_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "executionPolicy" TEXT NOT NULL,
    "humanReviewPolicy" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizational_skill_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_memory_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "knowledgeVersionId" TEXT,
    "knowledgeRevision" INTEGER NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_memory_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution_packages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedTask" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "packageVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "policy" JSONB NOT NULL,
    "scope" JSONB NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "execution_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "executorType" TEXT NOT NULL,
    "externalCorrelationId" TEXT,
    "resultPayload" JSONB,
    "resultReference" TEXT,
    "resultDigest" TEXT,
    "reviewedBy" TEXT,
    "reviewDecision" TEXT,
    "reviewNotes" TEXT,
    "correctionPayload" JSONB,
    "outcomeClassification" TEXT,
    "outcomeSourceId" TEXT,
    "outcomeEvidenceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "execution_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_domains_organizationId_id_key"
    ON "organization_domains"("organizationId", "id");
CREATE UNIQUE INDEX "organization_domains_organizationId_key_key"
    ON "organization_domains"("organizationId", "key");
CREATE INDEX "organization_domains_organizationId_status_idx"
    ON "organization_domains"("organizationId", "status");

CREATE UNIQUE INDEX "organization_domain_capability_grants_organizationId_domain_key"
    ON "organization_domain_capability_grants"("organizationId", "domainId", "roleId", "capabilityKey");
CREATE INDEX "organization_domain_capability_grants_organizationId_domain_idx"
    ON "organization_domain_capability_grants"("organizationId", "domainId", "capabilityKey");

CREATE UNIQUE INDEX "organizational_skills_organizationId_id_key"
    ON "organizational_skills"("organizationId", "id");
CREATE UNIQUE INDEX "organizational_skills_organizationId_key_key"
    ON "organizational_skills"("organizationId", "key");
CREATE INDEX "organizational_skills_organizationId_domainId_status_idx"
    ON "organizational_skills"("organizationId", "domainId", "status");

CREATE UNIQUE INDEX "organizational_skill_versions_organizationId_id_key"
    ON "organizational_skill_versions"("organizationId", "id");
CREATE UNIQUE INDEX "organizational_skill_versions_organizationId_skillId_version_key"
    ON "organizational_skill_versions"("organizationId", "skillId", "version");
CREATE UNIQUE INDEX "organizational_skill_versions_organizationId_fingerprint_key"
    ON "organizational_skill_versions"("organizationId", "fingerprint");
CREATE INDEX "organizational_skill_versions_organizationId_skillId_status_idx"
    ON "organizational_skill_versions"("organizationId", "skillId", "status");

CREATE UNIQUE INDEX "skill_memory_links_organizationId_skillVersionId_knowledgeItemId_knowledgeRevision_relationship_key"
    ON "skill_memory_links"("organizationId", "skillVersionId", "knowledgeItemId", "knowledgeRevision", "relationship");
CREATE INDEX "skill_memory_links_organizationId_skillVersionId_idx"
    ON "skill_memory_links"("organizationId", "skillVersionId");
CREATE INDEX "skill_memory_links_organizationId_knowledgeItemId_idx"
    ON "skill_memory_links"("organizationId", "knowledgeItemId");

CREATE UNIQUE INDEX "execution_packages_organizationId_id_key"
    ON "execution_packages"("organizationId", "id");
CREATE UNIQUE INDEX "execution_packages_organizationId_idempotencyKey_key"
    ON "execution_packages"("organizationId", "idempotencyKey");
CREATE INDEX "execution_packages_organizationId_status_createdAt_idx"
    ON "execution_packages"("organizationId", "status", "createdAt");

CREATE UNIQUE INDEX "execution_sessions_organizationId_id_key"
    ON "execution_sessions"("organizationId", "id");
CREATE UNIQUE INDEX "execution_sessions_organizationId_packageId_key"
    ON "execution_sessions"("organizationId", "packageId");
CREATE UNIQUE INDEX "execution_sessions_organizationId_idempotencyKey_key"
    ON "execution_sessions"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "execution_sessions_organizationId_outcomeSourceId_key"
    ON "execution_sessions"("organizationId", "outcomeSourceId");
CREATE UNIQUE INDEX "execution_sessions_organizationId_outcomeEvidenceId_key"
    ON "execution_sessions"("organizationId", "outcomeEvidenceId");
CREATE INDEX "execution_sessions_organizationId_status_createdAt_idx"
    ON "execution_sessions"("organizationId", "status", "createdAt");

CREATE INDEX "knowledge_items_organizationId_domainId_lifecycleState_idx"
    ON "knowledge_items"("organizationId", "domainId", "lifecycleState");
CREATE INDEX "organizational_sources_organizationId_domainId_createdAt_idx"
    ON "organizational_sources"("organizationId", "domainId", "createdAt");
CREATE INDEX "knowledge_candidates_organizationId_domainId_status_idx"
    ON "knowledge_candidates"("organizationId", "domainId", "status");

-- Idempotent organization bootstrap. IDs are deterministic so a retry or a
-- later deployment cannot create duplicate Domains.
INSERT INTO "organization_domains" ("id", "organizationId", "key", "label", "description", "status", "sensitivity", "createdAt", "updatedAt")
SELECT 'domain-' || o."id" || '-' || d."key", o."id", d."key", d."label",
       'Shared OIP ' || d."label" || ' organizational learning domain.', 'active', d."sensitivity", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (VALUES
  ('customer-support', 'Customer Support', 'internal'),
  ('it-service-management', 'IT Service Management', 'internal'),
  ('finance', 'Finance', 'restricted'),
  ('accounting', 'Accounting', 'restricted'),
  ('operations', 'Operations', 'internal'),
  ('hr', 'Human Resources', 'restricted'),
  ('legal', 'Legal', 'restricted'),
  ('sales', 'Sales', 'internal'),
  ('engineering', 'Engineering', 'internal'),
  ('management', 'Management', 'restricted'),
  ('general', 'General', 'internal')
) AS d("key", "label", "sensitivity")
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- Preserve an unambiguous principal Source when existing provenance makes it
-- possible. Support ticket identity remains in sourceTicketId for compatibility.
UPDATE "knowledge_items" k
SET "primarySourceId" = source_map."sourceId"
FROM (
  SELECT l."organizationId", l."knowledgeItemId", MIN(e."sourceId") AS "sourceId"
  FROM "memory_evidence_links" l
  JOIN "evidence_records" e
    ON e."organizationId" = l."organizationId" AND e."id" = l."evidenceId"
  GROUP BY l."organizationId", l."knowledgeItemId"
  HAVING COUNT(DISTINCT e."sourceId") = 1
) source_map
WHERE k."organizationId" = source_map."organizationId"
  AND k."id" = source_map."knowledgeItemId"
  AND k."primarySourceId" IS NULL;

UPDATE "knowledge_items" k
SET "primarySourceId" = s."id"
FROM "organizational_sources" s
WHERE k."organizationId" = s."organizationId"
  AND k."primarySourceId" IS NULL
  AND (
    s."id" = k."sourceTicketId"
    OR (s."sourceSystem" = 'oip.support' AND s."sourceObjectType" = 'ticket' AND s."sourceObjectId" = k."sourceTicketId")
  );

UPDATE "organizational_sources" s
SET "domainId" = d."id"
FROM "organization_domains" d
WHERE d."organizationId" = s."organizationId"
  AND d."key" = CASE
    WHEN LOWER(s."sourceSystem") LIKE '%support%' OR LOWER(s."sourceObjectType") = 'ticket' THEN 'customer-support'
    ELSE 'general'
  END;

UPDATE "knowledge_items" k
SET "domainId" = COALESCE(
  (SELECT s."domainId" FROM "organizational_sources" s
   WHERE s."organizationId" = k."organizationId" AND s."id" = k."primarySourceId"),
  fallback."id"
)
FROM "organization_domains" fallback
WHERE fallback."organizationId" = k."organizationId"
  AND fallback."key" = CASE
    WHEN k."sourceTicketId" IS NOT NULL AND k."sourceTicketId" NOT LIKE 'knowledge_pack:%' THEN 'customer-support'
    ELSE 'general'
  END;

UPDATE "knowledge_candidates" c
SET "sourceId" = s."id", "domainId" = s."domainId"
FROM "organizational_sources" s
WHERE c."organizationId" = s."organizationId"
  AND c."sourceId" IS NULL
  AND s."id" = c."id";

UPDATE "knowledge_candidates" c
SET "domainId" = COALESCE(
  (SELECT k."domainId" FROM "knowledge_items" k
   WHERE k."organizationId" = c."organizationId" AND k."id" = c."relatedKnowledgeId"),
  d."id"
)
FROM "organization_domains" d
WHERE d."organizationId" = c."organizationId"
  AND d."key" = 'general'
  AND c."domainId" IS NULL;

-- New global capability rows are additive and idempotent.
INSERT INTO "rbac_capabilities" ("id", "key", "description") VALUES
  ('cap_domain_read', 'domain.read', 'Read organization Domains visible to the member.'),
  ('cap_domain_manage', 'domain.manage', 'Create and manage organization Domains and grants.'),
  ('cap_ask_query', 'ask.query', 'Ask the organization through governed source-of-truth routing.'),
  ('cap_skill_read', 'skill.read', 'Read governed organizational Skills.'),
  ('cap_skill_create', 'skill.create', 'Create a governed organizational Skill.'),
  ('cap_skill_edit', 'skill.edit', 'Create a new draft version of a Skill.'),
  ('cap_skill_submit', 'skill.submit', 'Submit a Skill version for human review.'),
  ('cap_skill_validate', 'skill.validate', 'Validate a Skill version for executable discovery.'),
  ('cap_skill_suspend', 'skill.suspend', 'Suspend a governed Skill.'),
  ('cap_skill_revoke', 'skill.revoke', 'Revoke a governed Skill.'),
  ('cap_skill_compose', 'skill.compose', 'Compose authorized validated Skill versions.'),
  ('cap_execution_package_create', 'execution.package.create', 'Create an immutable external execution package.'),
  ('cap_execution_package_read', 'execution.package.read', 'Read governed execution packages.'),
  ('cap_execution_package_export', 'execution.package.export', 'Export a redacted execution package.'),
  ('cap_execution_session_submit', 'execution.session.submit', 'Submit an external execution result.'),
  ('cap_execution_session_read', 'execution.session.read', 'Read an execution session.'),
  ('cap_execution_review', 'execution.review', 'Review an external execution result and record learning evidence.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT r."id", c."id"
FROM "rbac_roles" r
JOIN "rbac_capabilities" c ON c."key" IN (
  'domain.read', 'ask.query', 'skill.read', 'skill.compose',
  'execution.package.read', 'execution.session.read'
)
WHERE r."key" IN ('owner', 'administrator', 'reviewer', 'operator', 'support_agent', 'viewer')
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT r."id", c."id"
FROM "rbac_roles" r
JOIN "rbac_capabilities" c ON c."key" IN (
  'domain.manage', 'skill.create', 'skill.edit', 'skill.submit', 'skill.validate',
  'skill.suspend', 'skill.revoke', 'skill.compose',
  'execution.package.create', 'execution.package.export', 'execution.session.submit', 'execution.review'
)
WHERE r."key" IN ('owner', 'administrator', 'reviewer')
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;

-- Compatibility grants preserve existing Support/neutral flows while keeping
-- restricted Domains fail-closed for non-admin roles.
INSERT INTO "organization_domain_capability_grants" ("id", "organizationId", "domainId", "roleId", "capabilityKey")
SELECT 'grant-' || o."id" || '-' || d."key" || '-' || r."key" || '-' || c."key",
       o."id", d."id", r."id", c."key"
FROM "organizations" o
JOIN "organization_domains" d ON d."organizationId" = o."id" AND d."key" IN ('customer-support', 'general')
JOIN "rbac_roles" r ON r."key" IN ('reviewer', 'operator', 'support_agent', 'viewer')
JOIN "rbac_capabilities" c ON c."key" IN (
  'domain.read', 'ask.query', 'skill.read', 'skill.compose',
  'execution.package.read', 'execution.session.read', 'memory.evidence.read'
)
ON CONFLICT ("organizationId", "domainId", "roleId", "capabilityKey") DO NOTHING;

INSERT INTO "organization_domain_capability_grants" ("id", "organizationId", "domainId", "roleId", "capabilityKey")
SELECT 'grant-' || o."id" || '-' || d."key" || '-' || r."key" || '-' || c."key",
       o."id", d."id", r."id", c."key"
FROM "organizations" o
JOIN "organization_domains" d ON d."organizationId" = o."id" AND d."key" IN ('customer-support', 'general')
JOIN "rbac_roles" r ON r."key" IN ('reviewer', 'support_agent')
JOIN "rbac_capabilities" c ON c."key" IN (
  'memory.source.create', 'memory.evidence.create', 'memory.learning.prepare',
  'memory.outcome.record', 'memory.challenge.open', 'memory.challenge.review',
  'memory.challenge.scope', 'memory.challenge.deprecate'
)
ON CONFLICT ("organizationId", "domainId", "roleId", "capabilityKey") DO NOTHING;

ALTER TABLE "organization_domains"
  ADD CONSTRAINT "organization_domains_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_domain_capability_grants"
  ADD CONSTRAINT "organization_domain_capability_grants_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_domain_capability_grants_organizationId_domainId_fkey"
  FOREIGN KEY ("organizationId", "domainId") REFERENCES "organization_domains"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_domain_capability_grants_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_organizationId_domainId_fkey"
  FOREIGN KEY ("organizationId", "domainId") REFERENCES "organization_domains"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_items_organizationId_primarySourceId_fkey"
  FOREIGN KEY ("organizationId", "primarySourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizational_sources"
  ADD CONSTRAINT "organizational_sources_organizationId_domainId_fkey"
  FOREIGN KEY ("organizationId", "domainId") REFERENCES "organization_domains"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_candidates"
  ADD CONSTRAINT "knowledge_candidates_organizationId_domainId_fkey"
  FOREIGN KEY ("organizationId", "domainId") REFERENCES "organization_domains"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_candidates_organizationId_sourceId_fkey"
  FOREIGN KEY ("organizationId", "sourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizational_skills"
  ADD CONSTRAINT "organizational_skills_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organizational_skills_organizationId_domainId_fkey"
  FOREIGN KEY ("organizationId", "domainId") REFERENCES "organization_domains"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizational_skill_versions"
  ADD CONSTRAINT "organizational_skill_versions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organizational_skill_versions_organizationId_skillId_fkey"
  FOREIGN KEY ("organizationId", "skillId") REFERENCES "organizational_skills"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_memory_links"
  ADD CONSTRAINT "skill_memory_links_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "skill_memory_links_organizationId_skillVersionId_fkey"
  FOREIGN KEY ("organizationId", "skillVersionId") REFERENCES "organizational_skill_versions"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "skill_memory_links_organizationId_knowledgeItemId_fkey"
  FOREIGN KEY ("organizationId", "knowledgeItemId") REFERENCES "knowledge_items"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "execution_packages"
  ADD CONSTRAINT "execution_packages_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "execution_sessions"
  ADD CONSTRAINT "execution_sessions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "execution_sessions_organizationId_packageId_fkey"
  FOREIGN KEY ("organizationId", "packageId") REFERENCES "execution_packages"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "execution_sessions_organizationId_outcomeSourceId_fkey"
  FOREIGN KEY ("organizationId", "outcomeSourceId") REFERENCES "organizational_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "execution_sessions_organizationId_outcomeEvidenceId_fkey"
  FOREIGN KEY ("organizationId", "outcomeEvidenceId") REFERENCES "evidence_records"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
