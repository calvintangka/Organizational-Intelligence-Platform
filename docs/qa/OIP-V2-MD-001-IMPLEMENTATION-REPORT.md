# OIP-V2-MD-001 Implementation Report

Status: **Implemented and targeted-verified**

## Scope

MD-001 extends the existing Organizational Memory foundation into a shared, Domain-aware platform. The implementation preserves the dirty worktree and existing Support behavior. It does not add an OrganizationalExperience table, SkillComposition table, ExecutionOutcome table, agent runtime, MCP runtime, vector store, ERP connector, or autonomous executor.

## Delivered architecture

`Organizational Experience → OrganizationalSource → EvidenceRecord → KnowledgeCandidate → human validation → KnowledgeItem / Organizational Memory → Ask or governed Skill → immutable ExecutionPackage → external result intake → human review → Source/Evidence → existing outcome, candidate, or challenge path`

Delivered persistence:

- `OrganizationDomain` and `OrganizationDomainCapabilityGrant` with eleven idempotent default Domains.
- Nullable generic `domainId`, `scope`, and Source identity fields on existing Source, Memory, and Candidate records; legacy Support `sourceTicketId` values are preserved.
- `OrganizationalSkill`, `OrganizationalSkillVersion`, and `SkillMemoryLink`.
- `ExecutionPackage` with immutable payload, stable digest, redaction, policy, scope, risk, and correlation metadata.
- `ExecutionSession` for bounded external result intake and one human review.

Delivered services and routes:

- Domain registry and Domain grants.
- Generic organizational experience intake, Evidence, preparation, validation, and inspectable provenance.
- Permission-aware deterministic Memory retrieval and `POST /api/organizations/{organizationId}/ask` source-of-truth routing.
- Draft → Ready for Review → Validated → Suspended/Revoked Skill governance.
- Deterministic Skill composition with input conflict rejection, capability union, permission/scope intersection, maximum risk, strictest policy, and restricted-Domain human review.
- Package export and session intake with no credential/token export.
- Human review bridge to execution Source/Evidence plus existing reuse outcome, correction candidate, and challenge services. Original Memory is not rewritten by review.
- Minimal Ask and Skills UI surfaces using the existing OIP workspace patterns, with Source, Evidence, Memory, policy, package, and review boundaries visible.

## Verification evidence

The targeted service probe passed all requested named assertions:

`MULTI_DEPARTMENT_EXPERIENCE`, `FINANCE_MEMORY`, `ASK_MEMORY_QUERY`, `ASK_NO_MATCH`, `CURRENT_DATA_ROUTING_FAILS_SAFE`, `SKILL_CREATE`, `SKILL_SEARCH`, `SKILL_MEMORY_LINK`, `SKILL_COMPOSITION`, `STRICTEST_POLICY_WINS`, `EXECUTION_PACKAGE`, `EXECUTION_REVIEW`, `OUTCOME_TO_EVIDENCE`, `NO_AUTOMATIC_MEMORY_REWRITE`, `TENANT_ISOLATION`, `HUMAN_AUTHORITY`, and `ACCOUNTANT_END_TO_END_SCENARIO`.

The authenticated HTTP probe passed Domain authorization, experience idempotency, Ask provenance, Skill lifecycle, safe current-data failure, and cross-tenant Source rejection.

Required checks passed:

- `npx tsc --noEmit`
- `npx prisma validate`
- `npx prisma migrate status` — 30 migrations applied and up to date locally
- `git diff --check` — no whitespace errors; Git reported only existing line-ending warnings
- `npm run build` — run after the final implementation changes

Migration safety evidence:

- `prisma migrate deploy` applied the two additive MD-001 migrations locally.
- `MIGRATION_SQL_ROLLBACK_TEST=PASS` validated the migration SQL inside a transaction before deployment.
- `prisma migrate dev --create-only` could not run because the local database role cannot create a shadow database; this is an environment limitation, not a production down-migration.

Rendered review inspected the public OIP surface in the local browser. The product-specific Source → Evidence → Memory → validation language remains visible and the new workspace surfaces reuse the existing component patterns. Full authenticated visual rehearsal remains outside targeted release certification.

## Explicit boundaries

No live company-data provider, external tool execution, agent runtime, MCP infrastructure, autonomous side effect, broad connector, or exhaustive deployment-readiness certification is included.
