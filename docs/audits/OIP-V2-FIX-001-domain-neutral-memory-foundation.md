# OIP-V2-FIX-001 — Domain-Neutral Memory Foundation Implementation Report

Implementation date: 2026-08-24  
Branch: `landing/option-c32-release-polish`  
Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`  
Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`  
Final verdict: `OIP_V2_FIX_001_IMPLEMENTED_AND_VERIFIED`

## 1. Executive Summary

The three authorized P0 foundations are implemented additively under the existing Support learning loop: organization-scoped neutral Sources and Evidence, explicit reusable Outcome events, and human-governed Challenge/Revalidation/SCOPE_UPDATED/DEPRECATED lifecycle. Existing Support resolution evidence remains authoritative and continues to gate Reflection and validation. The deterministic end-to-end probe and relevant regression probes passed; typecheck, schema validation, migration application, and the production build/lint gates are recorded in the verification matrix below.

## 2. Final Verdict

`OIP_V2_FIX_001_IMPLEMENTED_AND_VERIFIED`

The verdict is based on the completed migration, focused end-to-end proof, relevant regression coverage, preserved safety boundaries, and no unauthorized scope expansion. No commit, push, tag, deployment, or publication was performed.

## 3. Repository State Before

Before implementation, the branch was `landing/option-c32-release-polish` at `084f9ab46d6555e793df8b73b1abb085267a2a05`. The worktree was already dirty. Pre-existing modifications were the listed `docs/TODO-080-REPORT.md` and `docs/canon/*` files; pre-existing untracked material included the existing `docs/audits/*` reports and the NC-FIX/REL reports under `docs/reports/`. Those files were preserved and were not overwritten.

## 4. Starting Architecture

The verified starting loop was Support-specific but already governed: TicketRecord and TicketResolutionEvidence feed Reflection, ValidationRecord, KnowledgeItem/KnowledgeCandidate, MemoryChangeRecord, TrustEvidence, deterministic retrieval, grounding, explainability, optimistic concurrency, and protected-case checks. The OIP-V2-AUDIT-001 baseline scored Remember 4/5, Retrieve 3/5, Evolve 3/5, Trust 3/5, overall 3/5. The three gaps were the neutral Source/Evidence primitive, first-class reusable Outcome history, and human Challenge/Revalidation lifecycle.

## 5. Audit Baseline Reverification

The audit claims were checked directly in `prisma/schema.prisma`, `lib/server/persistenceService.ts`, `lib/trustEngine.ts`, `lib/memory.ts`, the validation/Support evidence path, Reflection commands, provenance, retrieval compatibility, explainability, jobs, and relevant probes. The implementation reused those authorities rather than replacing them. `TicketResolutionEvidence` remains required before Support Reflection/validation; Reflection remains preparation; retrieval remains separate from trust; `sourceTicketId` remains stable; revision checks remain strict; AI remains advisory.

## 6. Files Changed

Task-created or task-modified files, with purpose, symbols, safety role, and verification evidence:

| File | Purpose / key symbols | P0 and safety role | Evidence |
|---|---|---|---|
| `prisma/schema.prisma` | New enums and models: `OrganizationalSource`, `EvidenceRecord`, `MemoryEvidenceLink`, `KnowledgeReuseOutcome`, `KnowledgeChallenge`, `KnowledgeChallengeDecision`; `KnowledgeItem.governanceState`; Support bridge columns | Neutral persistence, history, tenant FKs, idempotency, challenge state | `prisma validate`, `prisma generate`, migration/probe |
| `prisma/migrations/20260824120000_add_oip_v2_memory_foundation/migration.sql` | Additive schema migration | Preserves existing rows and IDs; no destructive drop/recreate | Applied successfully after corrected local SQL and safety inspection |
| `prisma/migrations/20260824130000_add_memory_governance_capabilities/migration.sql` | Capability rows and role grants | Distinguishes evidence, outcome, open, review, scope, deprecate | Applied successfully; RBAC probe path exercised |
| `lib/server/organizationalMemoryPrimitives.ts` | `ensureSourceAndEvidenceTx`, `ensureSupportSourceAndEvidenceTx`, input validation, `MemoryFoundationError` | Domain-neutral ingestion and Support adaptation in one transaction | Typecheck and E2E Case A/B/C |
| `lib/server/organizationalMemoryService.ts` | `recordReuseOutcome`, `openKnowledgeChallenge`, `reviewKnowledgeChallenge`, evidence/source reads | Explicit commands, idempotency, revision checks, atomic governance | Typecheck and E2E probe |
| `types/organizationalMemory.ts` | Source/evidence/outcome/challenge contract types | Typed boundary for new commands and API responses | Typecheck |
| `types/knowledge.ts` | `KnowledgeItem.governanceState` | Exposes challenged/trusted state without changing existing provenance | Typecheck/regression probes |
| `types/index.ts` | Exports organizational-memory types | Shared typed API boundary | Typecheck |
| `lib/server/persistenceService.ts` | Support adapter call; neutral links/outcomes on validation commit; governance mapping | Keeps existing Support path authoritative and records Outcome history | Existing Support probes plus E2E |
| `lib/trustEngine.ts` | Challenged item is `human_required`, `autoEligible:false` | Fail-closed automation while challenged | E2E and trust probes |
| `lib/memory.ts` | Challenged items remain inspectable with an explicit reason | Retrieval is not truth; inspectability is retained | E2E invariant |
| `lib/server/rbac/definitions.ts` | Six memory capability keys and role grants | Human/role authority separation | Migration and route checks |
| `app/api/organizations/[organizationId]/memory/outcomes/route.ts` | GET/POST Outcome contract | Evidence read vs outcome record authority | E2E HTTP proof |
| `app/api/organizations/[organizationId]/memory/challenges/route.ts` | GET/POST Challenge contract | Evidence read vs challenge-open authority | E2E HTTP proof |
| `app/api/organizations/[organizationId]/memory/challenges/[challengeId]/route.ts` | PATCH review; disposition-specific scope/deprecate checks | Review/revalidation/scope/deprecation separation | Typecheck and E2E scope review |
| `app/api/organizations/[organizationId]/memory/knowledge/[knowledgeItemId]/evidence/route.ts` | Evidence inspection contract | Inspectability without mutation | E2E Case A |
| `scripts/oip-v2-fix-001-foundation-probe.cjs` | Disposable deterministic Case A/B/C acceptance proof | Exercises gates, outcome classes, idempotency, challenge, version, provenance | Passed |
| `package.json` | `probe:oip-v2-fix-001` script | Repeatable verification entry point | Passed |
| `docs/ARCHITECTURE_BASELINE.md` | Current memory implementation truth | Documents neutral core and Support adapter | Documentation review |
| `docs/KNOWN_LIMITATIONS.md` | Current limits and deferred governance/UI scope | Prevents overclaiming | Documentation review |
| `docs/implementation/15_API_ARCHITECTURE.md` | Implemented memory endpoints and contract boundaries | Documents explicit commands and auth | Documentation review |
| `docs/implementation/16_STORAGE_ARCHITECTURE.md` | Current neutral storage foundation | Documents additive/historical model | Documentation review |
| `docs/audits/OIP-V2-FIX-001-domain-neutral-memory-foundation.md` | This report | Audit trail and final evidence | This report |

## 7. Schema Changes

The schema adds bounded outcome and challenge enums, neutral source/evidence/link tables, durable outcome and challenge history, governance state, and Support bridge columns. Composite organization-plus-ID foreign keys enforce tenant locality. Unique organization/idempotency keys provide retry boundaries. KnowledgeItem IDs, `sourceTicketId`, ValidationRecord, MemoryChangeRecord, TrustEvidence, revisions, candidate state, TicketResolutionEvidence, and existing Support columns remain intact.

## 8. Migration Safety

Migration identifiers are `20260824120000_add_oip_v2_memory_foundation` and `20260824130000_add_memory_governance_capabilities`. The first hand-authored local attempt exposed a PostgreSQL identifier collision in an index name. The failed partial objects were inspected, confirmed empty, removed by exact object name, and the failed migration was resolved before the corrected additive SQL was applied. No business rows were present in the partial objects and no existing Support/Knowledge data was dropped or rewritten. The corrected migration and capability migration completed successfully; final status is applied. This recovery is recorded as a local migration-safety event, not hidden.

## 9. Domain-Neutral Source Model

`OrganizationalSource` identifies an organization-scoped source/work object using `sourceKind`, `sourceSystem`, `sourceObjectType`, `sourceObjectId`, actor/timestamps, and metadata. A unique organization/system/object boundary makes repeated source ingestion idempotent and prevents one tenant from resolving another tenant's source.

## 10. Domain-Neutral Evidence Model

`EvidenceRecord` is an organization-scoped durable assertion/reference attached to a Source. It stores evidence type/role, actor, occurrence time, content/reference, state, metadata, and idempotency identity. `MemoryEvidenceLink` connects evidence to a KnowledgeItem with relationship and optional knowledge revision. Composite tenant foreign keys reject cross-organization links.

## 11. Support Evidence Adaptation

`ensureSupportSourceAndEvidenceTx` maps TicketRecord to `OrganizationalSource` and TicketResolutionEvidence to `EvidenceRecord` inside the existing transaction. The adapter preserves the original Support records and does not make neutral evidence a bypass. Existing resolution evidence is still checked by the pre-existing Support gate before validation commit.

## 12. Provenance Preservation

The original `KnowledgeItem.sourceTicketId` remains the canonical original provenance field. Neutral links add inspectable origin/support evidence alongside it. Later successful, correction, failure, challenge, and scope-update records do not replace `sourceTicketId`; scope update appends a governed `knowledgeVersions` entry rather than erasing the original content/history.

## 13. Outcome Event Model

`KnowledgeReuseOutcome` is a durable organization-scoped event linked to KnowledgeItem, optional version, Source/work, Evidence, actor, reuse mode, bounded classification, required edits, trust action/delta/evidence, knowledge revision, idempotency key, and timestamp. It represents the reuse event itself; counters are projections/consequences, not the only history.

## 14. Outcome → Trust Integration

The existing deterministic trust model remains in place. Outcome handling applies bounded deltas: human SUCCESS +5, automatic SUCCESS +3, CORRECTION_REQUIRED -2, FAILURE -10, with counters and success rate updated in the same transaction. Existing Support `trust_update_only` continues through Validation/MemoryChange/TrustEvidence; the new durable Outcome is recorded alongside that path. No event-sourcing rewrite was introduced.

## 15. Outcome Idempotency

`organizationId + idempotencyKey` is unique for Outcomes. A retry returns the existing event before revision mutation, so it does not double-apply counters or trust. Evidence and Source adapters have their own organization-scoped idempotency boundaries. The E2E probe verifies SUCCESS retry identity and one stored Outcome; CORRECTION_REQUIRED and FAILURE are each exercised once.

## 16. Challenge Model

`KnowledgeChallenge` records the challenged KnowledgeItem/version, Source, Evidence, opener, rationale, state, disposition, reviewer, decision rationale, idempotency key, and timestamps. `KnowledgeChallengeDecision` records the immutable decision snapshot, before/after state, expected/resulting revisions, actor, and rationale.

## 17. Challenge Lifecycle

Opening requires evidence, rationale, expected revision, organization authority, and idempotency. The item moves to `governanceState="challenged"`, `autoResponseEligible=false`, and a revision increment. Review is human-authorized and resolves exactly once to `REVALIDATED`, `SCOPE_UPDATED`, or `DEPRECATED`.

## 18. Revalidation

`REVALIDATED` resolves the challenge, restores trusted governance state, and preserves the challenge and decision history. It does not delete the original evidence or rewrite the historical source. The implementation keeps automatic response eligibility false after review, requiring an explicit later governed trust/automation decision.

## 19. Scope Update

`SCOPE_UPDATED` accepts only the bounded scope/content patch fields defined by the service, appends a new `knowledgeVersions` history entry containing the challenge context, preserves the original content/provenance, resolves the challenge, and restores trusted governance state. The E2E proof asserts version history and stable `sourceTicketId`.

## 20. Deprecation Behavior

`DEPRECATED` marks the KnowledgeItem lifecycle as deprecated and resolves the challenge without deleting the item, evidence, outcome history, source links, or prior versions. A separate `memory.challenge.deprecate` capability is required in addition to review authority.

## 21. Retrieval Behavior During Challenge

Challenged memory remains inspectable and retrievable for explainability, but retrieval does not assert truth. `lib/memory.ts` adds the explicit open-challenge reason, while `lib/trustEngine.ts` returns `human_required` and `autoEligible:false`. Thus wrong retrieval and challenged memory remain distinguishable without silently hiding evidence.

## 22. Human Governance

Challenge opening, reviewing, revalidating, scope update, and deprecation are explicit server commands. The actor is taken from authenticated organization context. Required rationale/evidence and revision checks are enforced before mutation. No background worker or reflection path can approve a challenge.

## 23. AI Authority Boundary

No AI authority increased. AI remains advisory and cannot approve reusable memory, approve Reflection, open or approve a Challenge, revalidate, promote, mutate trusted memory directly, or bypass Support resolution evidence. The challenged state deliberately fails closed for automation.

## 24. Authorization

Added capabilities are `memory.evidence.read`, `memory.outcome.record`, `memory.challenge.open`, `memory.challenge.review`, `memory.challenge.scope`, and `memory.challenge.deprecate`. Reviewer grants include all six; support agents can inspect evidence, record outcomes, and open challenges but cannot review; viewers can inspect evidence only. The PATCH route separately checks scope and deprecate capabilities by disposition.

## 25. Optimistic Concurrency

Outcome and challenge mutations require the expected KnowledgeItem revision. Challenge review requires the revision observed after opening. A stale revision produces a safe conflict and leaves state unchanged. Idempotent retries are resolved before the revision check when the same logical command already committed.

## 26. Transaction / Atomicity Analysis

Source/evidence adaptation, KnowledgeItem updates, links, Outcomes, Challenges, and challenge decisions use the same Prisma transaction for each command. Unique constraints protect duplicate retries. Composite tenant FKs protect organization boundaries. The existing Support validation transaction retains its resolution-evidence gate and writes neutral links/outcomes alongside existing validation/memory/trust records.

## 27. Support Backward Compatibility

Support ticket creation, resolution evidence, resolved-state gates, Reflection preparation/recovery, validation, new/improve-existing learning, provenance, retrieval, grounding, explainability, successful reuse, trust updates, optimistic concurrency, and protected behavior remain on their existing paths. Relevant NC-FIX probes passed, and the new OIP probe proves the Support adapter without requiring users to understand the neutral tables.

## 28. Unit Tests

No standalone Jest/Vitest unit runner is configured for this repository. The new validation and service boundaries typecheck, and the deterministic probe exercises the command behavior over a disposable database and HTTP server. Existing pure trust/retrieval behavior is covered by the repository's regression probes. This is a test-structure limitation, not an unverified claim.

## 29. Integration Tests

`npm run probe:oip-v2-fix-001` passed after exercising Support evidence gating, neutral source/evidence links, SUCCESS retry idempotency, CORRECTION_REQUIRED, FAILURE, challenge opening, fail-closed automation, SCOPE_UPDATED history, challenge decision history, and stable provenance. `npx prisma validate`, `npx prisma generate`, and migration status also passed.

## 30. Regression Tests

Passed relevant probes: `probe:nc-fix-003-resolution-evidence`, `probe:nc-accept-001-learning-loop`, `probe:nc-fix-006-knowledge-reuse`, `probe:nc-fix-008-post-resolution-reflection`, `probe:nc-fix-011-reflection-promotion-safety`, `probe:nc-fix-012-reflection-provenance-boundary`, `probe:nc-fix-015-grounded-reuse-evidence`, `probe:nc-fix-017-recurrence-concurrency`, and `probe:nc-fix-010-concurrency-recovery` (the latter passed when run against a local server on port 3000). `npx tsc --noEmit` and the build's integrated lint/type validation passed. Standalone `npm run lint` is currently blocked by Next's interactive ESLint setup prompt because the repository has no ESLint configuration; no lint finding was reported.

## 31. End-to-End V2 Proof

Case A created and resolved a Support issue, attached durable resolution evidence, validated learning, created active memory, and inspected original neutral Source/Evidence. Case B reused the memory and recorded SUCCESS twice through the same idempotency key; only one Outcome and one trust/counter effect resulted. Case C recorded CORRECTION_REQUIRED and FAILURE, preserved lesson content/provenance, opened a human Challenge with evidence, and completed SCOPE_UPDATED with versioned history. The probe printed all proof invariants as true.

## 32. Performance/Index Review

New tables use organization-scoped unique keys and indexes for source identity, source creation, memory links, outcome creation, challenge state/creation, and decision lookup. Reads are organization/item/challenge bounded; no global event scan, vector index, N+1 loop, or production-scale claim was introduced.

## 33. Documentation Changes

Updated `docs/ARCHITECTURE_BASELINE.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/implementation/15_API_ARCHITECTURE.md`, and `docs/implementation/16_STORAGE_ARCHITECTURE.md`. Historical audit/report files and the pre-existing Canon edits were preserved. This report is the required implementation artifact.

## 34. Known Limitations

The neutral adapter currently has Support as its first producer. There is no dedicated challenge-management UI, automatic decay/retirement, bulk challenge review, policy-driven scope inference, or broad first-party evidence adapters. Conventional unit-test infrastructure is absent. These are bounded follow-ups, not missing P0 persistence/governance primitives.

## 35. Deferred Capabilities

Vector databases, embeddings, general RAG, hybrid semantic search, knowledge graphs/visualization, generic company chat, arbitrary document ingestion, and Slack/Jira/Zendesk/GitHub/Notion connectors were not implemented. No dashboard, connector expansion, autonomous memory, or broad UI redesign was added.

## 36. Git Diff Summary

The task adds the neutral-memory schema/service/API/probe/report and updates the four directly affected implementation documents plus existing server/type/RBAC files. The diff is additive at the data-model boundary, with a small Support transaction integration and challenged retrieval/trust guard. Pre-existing modified Canon/TODO files and pre-existing untracked audit/report artifacts remain in place and are not part of the task change set.

## 37. Repository State After

Ending HEAD remains `084f9ab46d6555e793df8b73b1abb085267a2a05`; no commit was made. The worktree remains intentionally dirty. Task-created paths are the files listed in Section 6. Pre-existing dirty paths remain present, no unrelated pre-existing file was overwritten, nothing was staged, and no reset/clean/restore/checkout/stash/delete was used against unrelated work.

## 38. Follow-Up Recommendations

1. Add a small unit-test harness for the pure command validation and trust-delta policy.
2. Add a minimal reviewer UI for evidence/outcome/challenge inspection and disposition.
3. Add the next neutral adapter only when a real non-Support domain requires it.
4. Define governed retention/decay and deprecation policy before implementing automation around those states.
5. Keep future retrieval improvements separate from this trust/governance foundation.

## Final Verification Matrix

| Requirement | Result | Evidence |
|---|---|---|
| Source belongs to one organization | PASS | Composite organization keys/FKs; probe |
| Evidence belongs to Source organization | PASS | Composite FKs; probe |
| Cross-organization linkage rejected | PASS | Prisma constraints and service organization checks |
| Duplicate Source/Evidence/Outcome ingestion idempotent | PASS | Unique keys; probe |
| Support resolution evidence still gates learning | PASS | Existing gate plus Case A probe |
| Original `sourceTicketId` stable | PASS | Case C probe |
| SUCCESS/CORRECTION_REQUIRED/FAILURE durable | PASS | Case B/C probe |
| Retry does not double-count trust | PASS | SUCCESS retry probe |
| Correction/failure does not rewrite lesson | PASS | Case C probe |
| Challenge requires human/evidence/rationale | PASS | API/service contract and probe |
| Open challenge fail-closes automation | PASS | trust/retrieval changes and probe |
| Scope update/deprecation authority distinct | PASS | RBAC migration and route checks |
| Revision conflicts fail safely | PASS | NC-FIX-010 and NC-FIX-017 probes |
| AI authority unchanged | PASS | No AI mutation path added |
| No vector/RAG/connector expansion | PASS | Scope review |
| `npx prisma validate` | PASS | Command completed |
| `npx prisma generate` | PASS | Command completed |
| `npx tsc --noEmit` | PASS | Command completed |
| `npm run lint` | ENVIRONMENTAL FOLLOW-UP | Next 15 `next lint` prompts for first-time ESLint configuration; build-integrated lint/type validation passed |
| `npm run build` | PASS | Final command result |
| Case A → B → C proof | PASS | `probe:oip-v2-fix-001` |

## Direct Answers 1–15

1. `OrganizationalSource` now records domain-neutral organization/system/object provenance.
2. `EvidenceRecord` now records durable, typed evidence attached to a Source, with `MemoryEvidenceLink` to memory.
3. TicketRecord and TicketResolutionEvidence are adapted in-transaction; the existing Support evidence remains authoritative and still gates Reflection.
4. `KnowledgeReuseOutcome` is the durable reusable Outcome event linked to work/source, evidence, actor, memory, revision, and trust consequence.
5. A bounded enum stores `SUCCESS`, `CORRECTION_REQUIRED`, or `FAILURE`; required edits and evidence remain inspectable.
6. Deterministic deltas and projections update once inside the transaction; organization/idempotency uniqueness makes retries no-ops.
7. Challenge lifecycle is `OPEN` then human disposition `REVALIDATED`, `SCOPE_UPDATED`, or `DEPRECATED`, with decision history.
8. Revalidation resolves the challenge while preserving the Challenge, evidence, decision, and prior versions.
9. Scope update appends a governed version entry and never replaces original `sourceTicketId` provenance.
10. Open challenged memory remains inspectable/retrievable, but trust marks it `human_required` and automation is disabled.
11. Yes. Existing Support behavior and relevant regression probes remained compatible.
12. No. AI authority did not increase.
13. No. Human validation, evidence gates, provenance, concurrency, protected-case, and advisory-AI invariants remained enforced.
14. No. No vector, RAG, graph, connector, or broad UI expansion occurred.
15. Yes. The complete disposable Support Case A → Case B → Case C proof passed.

## Safety and Scope Closure

Final verdict: `OIP_V2_FIX_001_IMPLEMENTED_AND_VERIFIED`

No commit, push, tag, deployment, or publication occurred.
