-- OIP-V2-FIX-002: authorize the neutral human-facing memory entry/preparation path.

INSERT INTO "rbac_capabilities" ("id", "key", "description") VALUES
('cap_memory_source_create', 'memory.source.create', 'Record a domain-neutral organizational experience source.'),
('cap_memory_evidence_create', 'memory.evidence.create', 'Attach evidence to a domain-neutral organizational source.'),
('cap_memory_learning_prepare', 'memory.learning.prepare', 'Prepare evidence-backed learning for human review.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT roles."id", capabilities."id"
FROM "rbac_roles" roles
JOIN "rbac_capabilities" capabilities ON capabilities."key" IN (
  'memory.source.create', 'memory.evidence.create', 'memory.learning.prepare'
)
WHERE roles."key" IN ('owner', 'administrator', 'reviewer', 'support_agent')
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;
