-- OIP-V2-MD-001 compatibility completion: existing Support roles retain
-- access to backfilled customer-support/general records through the new
-- Domain grant boundary. Restricted Domains remain fail-closed.

INSERT INTO "organization_domain_capability_grants" ("id", "organizationId", "domainId", "roleId", "capabilityKey")
SELECT 'grant-' || o."id" || '-' || d."key" || '-' || r."key" || '-' || c."key",
       o."id", d."id", r."id", c."key"
FROM "organizations" o
JOIN "organization_domains" d ON d."organizationId" = o."id" AND d."key" IN ('customer-support', 'general')
JOIN "rbac_roles" r ON r."key" IN ('reviewer', 'operator', 'support_agent', 'viewer')
JOIN "rbac_capabilities" c ON c."key" IN (
  'knowledge.read', 'memory.evidence.read', 'domain.read', 'ask.query',
  'skill.read', 'skill.compose', 'execution.package.read', 'execution.session.read'
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
  'memory.challenge.scope', 'memory.challenge.deprecate',
  'knowledge.promote', 'knowledge.version.create', 'knowledge.trust.update'
)
ON CONFLICT ("organizationId", "domainId", "roleId", "capabilityKey") DO NOTHING;
