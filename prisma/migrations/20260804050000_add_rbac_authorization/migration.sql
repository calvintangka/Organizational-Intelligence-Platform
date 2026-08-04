-- TODO-078: durable organization-scoped roles, capabilities, assignments, and
-- decision audit records. Existing membership rows are backfilled additively.
CREATE TABLE "rbac_roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rbac_roles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rbac_capabilities" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rbac_capabilities_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rbac_role_capabilities" (
    "roleId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    CONSTRAINT "rbac_role_capabilities_pkey" PRIMARY KEY ("roleId", "capabilityId")
);
CREATE TABLE "organization_role_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_role_assignments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "authorization_decision_audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "roleKey" TEXT,
    "capabilityKey" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "authorization_decision_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rbac_roles_key_key" ON "rbac_roles"("key");
CREATE UNIQUE INDEX "rbac_capabilities_key_key" ON "rbac_capabilities"("key");
CREATE INDEX "rbac_role_capabilities_capabilityId_idx" ON "rbac_role_capabilities"("capabilityId");
CREATE UNIQUE INDEX "organization_role_assignments_organizationId_userId_key" ON "organization_role_assignments"("organizationId", "userId");
CREATE UNIQUE INDEX "organization_role_assignments_userId_organizationId_key" ON "organization_role_assignments"("userId", "organizationId");
CREATE INDEX "organization_role_assignments_organizationId_roleId_idx" ON "organization_role_assignments"("organizationId", "roleId");
CREATE INDEX "organization_role_assignments_userId_idx" ON "organization_role_assignments"("userId");
CREATE INDEX "authorization_decision_audits_organizationId_createdAt_idx" ON "authorization_decision_audits"("organizationId", "createdAt");
CREATE INDEX "authorization_decision_audits_organizationId_capabilityKey__idx" ON "authorization_decision_audits"("organizationId", "capabilityKey", "decision", "createdAt");
CREATE INDEX "authorization_decision_audits_actorUserId_createdAt_idx" ON "authorization_decision_audits"("actorUserId", "createdAt");

ALTER TABLE "rbac_role_capabilities" ADD CONSTRAINT "rbac_role_capabilities_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rbac_role_capabilities" ADD CONSTRAINT "rbac_role_capabilities_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "rbac_capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments" ADD CONSTRAINT "organization_role_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments" ADD CONSTRAINT "organization_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments" ADD CONSTRAINT "organization_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments" ADD CONSTRAINT "organization_role_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments" ADD CONSTRAINT "organization_role_assignments_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "organization_memberships"("userId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authorization_decision_audits" ADD CONSTRAINT "authorization_decision_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authorization_decision_audits" ADD CONSTRAINT "authorization_decision_audits_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "rbac_roles" ("id", "key", "label", "description", "updatedAt") VALUES
('role_owner', 'owner', 'Owner', 'Full organization authority, including ownership and security administration.', CURRENT_TIMESTAMP),
('role_administrator', 'administrator', 'Administrator', 'Manages organization configuration, members, connectors, workers, and operational controls.', CURRENT_TIMESTAMP),
('role_reviewer', 'reviewer', 'Reviewer', 'Reviews tickets, reflections, and proposed organizational memory changes.', CURRENT_TIMESTAMP),
('role_operator', 'operator', 'Operator', 'Operates connectors, workers, and operational monitoring without memory approval authority.', CURRENT_TIMESTAMP),
('role_support_agent', 'support_agent', 'Support Agent', 'Works tickets and submits operational knowledge for review.', CURRENT_TIMESTAMP),
('role_viewer', 'viewer', 'Viewer', 'Read-only access to organization work and operational status.', CURRENT_TIMESTAMP);

INSERT INTO "rbac_capabilities" ("id", "key", "description") VALUES
('cap_organization_read', 'organization.read', 'Read organization-scoped data.'),
('cap_organization_profile_update', 'organization.profile.update', 'Update organization profile and settings.'),
('cap_organization_delete', 'organization.delete', 'Delete an organization and its owned data.'),
('cap_organization_reset', 'organization.reset', 'Reset organization-owned operational data.'),
('cap_organization_members_read', 'organization.members.read', 'Read organization members and roles.'),
('cap_organization_members_manage', 'organization.members.manage', 'Invite, remove, and assign organization roles.'),
('cap_organization_settings_manage', 'organization.settings.manage', 'Manage organization settings.'),
('cap_organization_ownership_transfer', 'organization.ownership.transfer', 'Transfer organization ownership.'),
('cap_organization_audit_read', 'organization.audit.read', 'Read authorization and operational audit records.'),
('cap_ticket_read', 'ticket.read', 'Read organization tickets.'),
('cap_ticket_submit', 'ticket.submit', 'Submit or update tickets.'),
('cap_ticket_review', 'ticket.review', 'Review ticket processing and validation results.'),
('cap_ticket_allocate', 'ticket.allocate', 'Allocate ticket processing work.'),
('cap_ticket_bulk_prepare', 'ticket.bulk_prepare', 'Prepare bulk ticket analysis.'),
('cap_knowledge_read', 'knowledge.read', 'Read organizational memory.'),
('cap_knowledge_promote', 'knowledge.promote', 'Promote reviewed knowledge into organizational memory.'),
('cap_knowledge_version_create', 'knowledge.version.create', 'Create a new knowledge version.'),
('cap_knowledge_trust_update', 'knowledge.trust.update', 'Update knowledge trust evidence.'),
('cap_reflection_read', 'reflection.read', 'Read reflection records.'),
('cap_reflection_generate', 'reflection.generate', 'Generate reflection proposals.'),
('cap_reflection_approve', 'reflection.approve', 'Approve reflection and memory promotion proposals.'),
('cap_worker_read', 'worker.read', 'Read durable worker state.'),
('cap_worker_retry', 'worker.retry', 'Retry durable worker jobs.'),
('cap_worker_cancel', 'worker.cancel', 'Cancel durable worker jobs.'),
('cap_worker_pause', 'worker.pause', 'Pause or resume worker processing.'),
('cap_connector_read', 'connector.read', 'Read connector installations.'),
('cap_connector_install', 'connector.install', 'Install a connector.'),
('cap_connector_activate', 'connector.activate', 'Activate a connector.'),
('cap_connector_pause', 'connector.pause', 'Pause or disable a connector.'),
('cap_connector_delete', 'connector.delete', 'Delete a connector.'),
('cap_connector_rotate_credentials', 'connector.rotate_credentials', 'Rotate connector credentials.'),
('cap_connector_inspect', 'connector.inspect', 'Inspect connector events and health.'),
('cap_connector_retry', 'connector.retry', 'Retry connector events.'),
('cap_operations_read', 'operations.read', 'Read operations and worker dashboard data.'),
('cap_metrics_read', 'metrics.read', 'Read organization metrics.'),
('cap_migration_import', 'migration.import', 'Import organization data.'),
('cap_migration_verify', 'migration.verify', 'Verify imported organization data.'),
('cap_persistence_authority_manage', 'persistence.authority.manage', 'Manage persistence authority and cutover.'),
('cap_action_prepare', 'action.prepare', 'Prepare a governed autonomous action proposal.'),
('cap_action_approve', 'action.approve', 'Approve a governed autonomous action proposal.'),
('cap_action_execute', 'action.execute', 'Execute a previously approved governed action.');

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_owner', "id" FROM "rbac_capabilities";
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_administrator', "id" FROM "rbac_capabilities" WHERE "key" <> 'organization.ownership.transfer';
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_reviewer', "id" FROM "rbac_capabilities" WHERE "key" IN ('organization.read','ticket.read','ticket.review','knowledge.read','knowledge.promote','knowledge.version.create','knowledge.trust.update','reflection.read','reflection.generate','reflection.approve','worker.read','connector.read','connector.inspect','operations.read','metrics.read','action.prepare','action.approve');
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_operator', "id" FROM "rbac_capabilities" WHERE "key" IN ('organization.read','ticket.read','worker.read','worker.retry','worker.cancel','worker.pause','connector.read','connector.inspect','connector.activate','connector.pause','connector.retry','operations.read','metrics.read','action.prepare');
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_support_agent', "id" FROM "rbac_capabilities" WHERE "key" IN ('organization.read','ticket.read','ticket.submit','ticket.review','ticket.bulk_prepare','knowledge.read','reflection.read','worker.read','connector.read','connector.inspect','operations.read');
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_viewer', "id" FROM "rbac_capabilities" WHERE "key" IN ('organization.read','ticket.read','knowledge.read','reflection.read','worker.read','connector.read','connector.inspect','operations.read','metrics.read');

INSERT INTO "organization_role_assignments" ("id", "organizationId", "userId", "roleId", "updatedAt")
SELECT 'rba_' || md5("organizationId" || ':' || "userId"), "organizationId", "userId",
       CASE lower("role") WHEN 'owner' THEN 'role_owner' ELSE 'role_administrator' END,
       CURRENT_TIMESTAMP
FROM "organization_memberships"
ON CONFLICT ("organizationId", "userId") DO NOTHING;
