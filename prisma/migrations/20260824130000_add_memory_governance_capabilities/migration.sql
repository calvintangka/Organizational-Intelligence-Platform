-- OIP-V2-FIX-001: extend the existing RBAC vocabulary without changing role
-- semantics outside the new memory governance actions.

INSERT INTO "rbac_capabilities" ("id", "key", "description") VALUES
('cap_memory_evidence_read', 'memory.evidence.read', 'Read domain-neutral memory sources, evidence, outcomes, and challenge history.'),
('cap_memory_outcome_record', 'memory.outcome.record', 'Record an explicit reusable memory outcome.'),
('cap_memory_challenge_open', 'memory.challenge.open', 'Open a human-governed memory challenge.'),
('cap_memory_challenge_review', 'memory.challenge.review', 'Review and disposition a memory challenge.'),
('cap_memory_challenge_scope', 'memory.challenge.scope', 'Apply a governed memory scope update.'),
('cap_memory_challenge_deprecate', 'memory.challenge.deprecate', 'Deprecate a memory through a governed challenge disposition.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT roles."id", capabilities."id"
FROM "rbac_roles" roles
JOIN "rbac_capabilities" capabilities ON capabilities."key" IN (
  'memory.evidence.read', 'memory.outcome.record', 'memory.challenge.open',
  'memory.challenge.review', 'memory.challenge.scope', 'memory.challenge.deprecate'
)
WHERE roles."key" IN ('owner', 'administrator', 'reviewer')
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT roles."id", capabilities."id"
FROM "rbac_roles" roles
JOIN "rbac_capabilities" capabilities ON capabilities."key" IN (
  'memory.evidence.read', 'memory.outcome.record', 'memory.challenge.open'
)
WHERE roles."key" = 'support_agent'
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;

INSERT INTO "rbac_role_capabilities" ("roleId", "capabilityId")
SELECT roles."id", capabilities."id"
FROM "rbac_roles" roles
JOIN "rbac_capabilities" capabilities ON capabilities."key" = 'memory.evidence.read'
WHERE roles."key" = 'viewer'
ON CONFLICT ("roleId", "capabilityId") DO NOTHING;
