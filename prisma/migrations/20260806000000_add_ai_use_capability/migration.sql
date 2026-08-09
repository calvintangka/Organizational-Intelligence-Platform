-- RSS-1.2S1: dedicated AI proxy capability.
-- Introduces `ai.use`, the capability required before any AI proxy endpoint may
-- read provider configuration, access credentials, or contact an upstream AI
-- provider. It is granted to the working and administrative roles (Owner,
-- Administrator, Reviewer, Operator, Support Agent) and intentionally withheld
-- from Viewer, whose read-only contract never invokes paid AI providers.
INSERT INTO "rbac_capabilities" ("id", "key", "description") VALUES
('cap_ai_use', 'ai.use', 'Invoke paid AI providers through the OIP AI proxy.');

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_owner', "id" FROM "rbac_capabilities" WHERE "key" = 'ai.use';
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_administrator', "id" FROM "rbac_capabilities" WHERE "key" = 'ai.use';
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_reviewer', "id" FROM "rbac_capabilities" WHERE "key" = 'ai.use';
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_operator', "id" FROM "rbac_capabilities" WHERE "key" = 'ai.use';
INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT 'role_support_agent', "id" FROM "rbac_capabilities" WHERE "key" = 'ai.use';
