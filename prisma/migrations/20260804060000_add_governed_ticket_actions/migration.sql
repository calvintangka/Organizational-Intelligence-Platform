-- TODO-019: additive governed action ledger and organization label policy.
ALTER TABLE "ticket_records" ADD COLUMN "labels" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE "organization_action_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "allowedLabels" JSONB NOT NULL,
    "disabledLabels" JSONB NOT NULL,
    "maximumLabelsPerTicket" INTEGER NOT NULL DEFAULT 10,
    "duplicateBehavior" TEXT NOT NULL DEFAULT 'idempotent_success',
    "updatedByActorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_action_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "governed_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionVersion" INTEGER NOT NULL DEFAULT 1,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "reversibility" TEXT NOT NULL,
    "proposedPayload" JSONB NOT NULL,
    "proposedPayloadDigest" TEXT NOT NULL,
    "preparedByActorId" TEXT,
    "preparedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "preparationReason" TEXT NOT NULL,
    "requiredCapabilities" JSONB NOT NULL,
    "policyDecision" JSONB NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvedByActorId" TEXT,
    "approvedAt" TIMESTAMPTZ(6),
    "approvalDecision" TEXT,
    "approvalComment" TEXT,
    "executionJobId" TEXT,
    "executionAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "executedByActorId" TEXT,
    "executedByWorkerId" TEXT,
    "executedAt" TIMESTAMPTZ(6),
    "externalEffectId" TEXT,
    "result" JSONB,
    "reversalActionId" TEXT,
    "reversedAt" TIMESTAMPTZ(6),
    "failureClass" TEXT,
    "failureMessage" TEXT,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "governed_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "action_ledger_entries" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "workerId" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "safeReason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "action_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_action_policies_organizationId_key" ON "organization_action_policies"("organizationId");
CREATE INDEX "governed_actions_organizationId_status_createdAt_idx" ON "governed_actions"("organizationId", "status", "createdAt");
CREATE INDEX "governed_actions_organizationId_targetType_targetId_status_idx" ON "governed_actions"("organizationId", "targetType", "targetId", "status");
CREATE UNIQUE INDEX "governed_actions_organizationId_idempotencyKey_key" ON "governed_actions"("organizationId", "idempotencyKey");
CREATE INDEX "action_ledger_entries_organizationId_createdAt_idx" ON "action_ledger_entries"("organizationId", "createdAt");
CREATE INDEX "action_ledger_entries_organizationId_actionId_createdAt_idx" ON "action_ledger_entries"("organizationId", "actionId", "createdAt");

ALTER TABLE "organization_action_policies" ADD CONSTRAINT "organization_action_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "governed_actions" ADD CONSTRAINT "governed_actions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_ledger_entries" ADD CONSTRAINT "action_ledger_entries_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "governed_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_ledger_entries" ADD CONSTRAINT "action_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "organization_action_policies" ("id", "organizationId", "allowedLabels", "disabledLabels", "updatedAt")
SELECT 'action-policy-' || md5(id), id,
       '["password-reset", "billing", "activation", "delivery-delay", "business-inquiry", "requires-review"]'::jsonb,
       '[]'::jsonb,
       CURRENT_TIMESTAMP
FROM "organizations"
ON CONFLICT ("organizationId") DO NOTHING;
