# REL-PREP-001 — Post-v0.1.1 Changelog & Release History Reconciliation

## 1. Executive Summary

The authoritative developer changelog is `docs/CHANGELOG.md`; no root-level `CHANGELOG.md` exists. Its newest recorded milestone was RSS-2.9, followed by a stale Current Platform Status describing version 0.9.0, localStorage persistence, and LM Studio-only AI. A read-only inventory of the post-v0.1.1 reports, production diff, migrations, routes, schema, probes, and current runtime was completed before editing. The changelog now records the nine completed NC-FIX production changes, the NC-FIX-007A audit, the final acceptance history, current architecture/status, and remaining limitations.

## 2. Final Verdict

`REL_PREP_001_VERIFIED_WITH_FOLLOWUPS`

The changelog is reconciled and ready for release-certification audit. Minor unrelated documentation cleanup remains outside this task: historical mojibake is preserved, and `docs/KNOWN_LIMITATIONS.md` still contains older v0.1.0 release-process language.

## 3. Baseline

- Execution date: 2026-08-12; timezone: Asia/Jakarta.
- Branch: `master`.
- HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- Certified baseline: `v0.1.1-certified` -> `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- The certified tag was not modified.
- Worktree was already dirty: 26 tracked files changed, 2,164 insertions and 389 deletions, plus pre-existing untracked reports, probes, routes, libraries, migrations, and local logs. Existing changes were preserved.
- `git diff --check` reported only existing Windows LF/CRLF normalization warnings.
- Node `v24.14.1`; npm `11.11.0`; TypeScript `5.9.3`; Prisma CLI/client `7.9.1`.
- PostgreSQL at `127.0.0.1:5432` was reachable; 25 migrations were found and the database was up to date.
- Current evidence already available from NC-FIX-009: TypeScript, Prisma validation/migration status, and production build passed.

## 4. Existing Changelog State

The target file was `docs/CHANGELOG.md`. It is a developer-history document rather than a strict release-note format and intentionally preserves architecture, implementation, migration, verification, and limitation notes. Historical entries through Version 0.8.0 and Version 0.9.0 were not rewritten. The existing Unreleased section contained RSS-2.1 through RSS-2.9 history and the old AI-chain note.

## 5. Last Recorded Milestone

The last recorded milestone before this reconciliation was `RSS-2.9 HOTFIX CERTIFICATION`, which is the final pre-NusaCloud milestone. The post-v0.1.1 NusaCloud section was inserted before Current Platform Status without duplicating or rewriting RSS-2.9 history.

## 6. Post-v0.1.1 Evidence Inventory

| Task / milestone | Primary evidence | Production / schema evidence | Permanent verification |
| --- | --- | --- | --- |
| NC-FIX-001 | `docs/NC-FIX-001-IN-REVIEW-DRAFT-PERSISTENCE-REPORT.md` | `app/page.tsx`, existing `TicketRecord.resolution` JSON; no migration | `probe:nc-fix-001-draft-persistence` |
| NC-FIX-002 | `docs/NC-FIX-002-MULTI-TURN-CASE-CONVERSATION-LIFECYCLE-REPORT.md` | `TicketMessage`, message routes/workflow, migration `20260810000000_add_ticket_messages` | `probe:nc-fix-002-multi-turn-conversation` |
| NC-FIX-003 | `docs/NC-FIX-003-RESOLUTION-EVIDENCE-REFLECTION-GATING-REPORT.md` | `TicketResolutionEvidence`, evidence route/workflow, migration `20260811010000_add_resolution_evidence` | `probe:nc-fix-003-resolution-evidence` |
| NC-FIX-004 | `docs/NC-FIX-004-RESPONSE-FORMATTING-PIPELINE-DIAGNOSIS-REPORT.md` | Prompt formatting guidance and whitespace-preserving Cases rendering | `probe:nc-fix-004-response-formatting` |
| NC-FIX-005 | `docs/NC-FIX-005-AI-DRAFT-LATENCY-MEASUREMENT-REPORT.md` | Metadata-only AI and process timing instrumentation; no schema change | `probe:nc-fix-005-ai-draft-latency` |
| NC-FIX-006 | `docs/NC-FIX-006-KNOWLEDGE-REUSE-APPROVAL-SOURCE-TICKET-INTEGRITY-REPORT.md` | Durable reuse TicketRecords, evidence-backed source validation, stable commit identities | `probe:nc-fix-006-knowledge-reuse` |
| NC-FIX-007 | `docs/NC-FIX-007-CROSS-DOMAIN-RETRIEVAL-COMPATIBILITY-GUARD-REPORT.md` | `lib/retrievalCompatibility.ts` integrated into retrieval/drafting; no migration | `probe:nc-fix-007-retrieval-compatibility` |
| NC-FIX-007A | `docs/NC-FIX-007A-RETRIEVAL-AUDIT-RECONCILIATION-REPORT.md` | Audit-only; no production/schema/package changes | Existing NC-FIX-007 and TODO audit probes |
| NC-FIX-008 | `docs/NC-FIX-008-POST-RESOLUTION-REFLECTION-LIFECYCLE-REPORT.md` | Narrow server workflow repair; no migration | `probe:nc-fix-008-post-resolution-reflection` |
| NC-FIX-009 | `docs/NC-FIX-009-GROUNDING-COLD-START-UI-LABEL-RECONCILIATION-REPORT.md` | Shared presentation guard and follow-up/resume state correction; no migration | `probe:nc-fix-009-grounding-ui-state` plus browser matrix |
| NC-ACCEPT-001 / FINAL | Acceptance reports under `docs/` | Verification-only; no production repair in acceptance runs | Permanent acceptance probe and official browser rerun |

## 7. Production Change Matrix

Nine post-v0.1.1 NC-FIX tasks changed production behavior or observability: NC-FIX-001 through NC-FIX-009. NC-FIX-007A and the acceptance tasks did not change product behavior. The production changes cover draft durability, conversation lifecycle, evidence safety, formatting, observability, reuse provenance, retrieval compatibility, post-resolution Reflection, and grounding-label truthfulness. Two migrations were added by NC-FIX-002 and NC-FIX-003; the other changes required no schema migration.

## 8. Audit / Acceptance Matrix

| Milestone | Primary classification | Changelog treatment |
| --- | --- | --- |
| NC-FIX-007A | AUDIT_ONLY | Concise verification/safety note; no product feature claim |
| NC-ACCEPT-001 initial report | ACCEPTANCE_ONLY | Historical verification context; not a code fix |
| NC-ACCEPT-001-FINAL failed run | ACCEPTANCE_ONLY / defect discovery | Concise note that it exposed the Reflection lifecycle conflict later repaired by NC-FIX-008 |
| NC-ACCEPT-001-FINAL official rerun | ACCEPTANCE_ONLY | Verification milestone with `NC_ACCEPT_001_FINAL_VERIFIED_WITH_FOLLOWUPS` |

## 9. NC-FIX-001 Reconciliation

Classification: `BUG_FIX` / `PRODUCT_CHANGE`. In-review generated and human-edited responses now persist through the existing `TicketRecord.resolution.finalResponse` field and draft revision contract. Case switching and resume no longer lose the current draft. The existing JSON field was sufficient; no schema migration was added.

## 10. NC-FIX-002 Reconciliation

Classification: `PRODUCT_CHANGE` / `ARCHITECTURAL_CHANGE`. One support case now owns ordered customer and agent messages, persisted `waiting_for_customer` state, same-case follow-up reopening, separate current draft state, bounded labeled AI context, stable message identity, idempotent sends, serialized appends, and resume hydration. This added the normalized `TicketMessage` model/table and migration `20260810000000_add_ticket_messages` plus message/transition API behavior.

## 11. NC-FIX-003 Reconciliation

Classification: `SAFETY_FIX` / `PRODUCT_CHANGE`. Durable `TicketResolutionEvidence` supports customer confirmation, agent verification, and manual verified resolution. Reflection may remain a preliminary unresolved draft, but validation and memory promotion require a resolved, evidence-backed case. Server authority, tenant scope, source-message provenance, actor derivation, idempotency, and concurrent resolution protections remain enforced. Migration `20260811010000_add_resolution_evidence` added the evidence table and constraints.

## 12. NC-FIX-004 Reconciliation

Classification: `UX_FIX` / `BUG_FIX`. The diagnosis confirmed that meaningful internal newlines survived provider parsing, drafting, persistence, API serialization, and editor hydration. Production-relevant changes added explicit plain-text paragraph guidance to the draft prompt and `whitespace-pre-wrap` to the Cases final-response display. No rich-text dependency, schema change, or unsafe HTML path was introduced.

## 13. NC-FIX-005 Reconciliation

Classification: `OBSERVABILITY_CHANGE` / `PERFORMANCE_INSTRUMENTATION`. AI and process timing metadata now measures prompt construction, provider request and response-body time, parsing, retrieval, draft processing, persistence, fallback attempts, and browser-visible completion. Controlled DeepSeek evidence did not confirm a systematic 1–2 minute defect; provider response-body time was the measured dominant contributor. The changelog does not claim that AI latency was fixed.

## 14. NC-FIX-006 Reconciliation

Classification: `SAFETY_FIX` / `PRODUCT_CHANGE`. Reuse now requires a canonical persisted organization-scoped source TicketRecord and evidence-backed resolution. Stable candidate, validation, memory-change, and commit identities protect duplicate/concurrent retries; distinct source tickets increment reuse accounting once. The changelog preserves the semantic distinction between knowledge reuse and successful solution confirmation. No migration was needed.

## 15. NC-FIX-007 Reconciliation

Classification: `SAFETY_FIX` / `ARCHITECTURAL_CHANGE`. `lib/retrievalCompatibility.ts` adds deterministic tri-state compatibility semantics and integrates them before grounded drafting. Unknown/Uncategorized is not compatible with everything; incompatible candidates are vetoed before grounding; high trust and high reuse cannot override incompatibility; all-incompatible sets fail closed to cold start. The narrow NC-FIX-007 probe and browser controls pass. The broader repository verdict remains partial because unrelated recall/classification audits retain known limitations, which are not misrepresented as fixed.

## 16. NC-FIX-007A Reconciliation

Classification: `AUDIT_ONLY`. The report explicitly states that no production source, tests, expectations, fixtures, package scripts, database state, or prior report was modified. It reconciled residual red results as known recall/classification limitations, fixture drift, stale expectations, or historical findings and confirmed zero cross-domain false-positive authorizations. It is recorded as a verification milestone, not a product feature.

## 17. NC-FIX-008 Reconciliation

Classification: `PRODUCT_CHANGE` / `SAFETY_FIX` / `ARCHITECTURAL_CHANGE`. The server workflow now allows an evidence-backed resolved case to prepare/resume Reflection without reopening support history, while preserving the pre-resolution draft path. Validation still requires durable evidence and human approval; resolved evidence, provenance, final response, and resolution state remain intact through commit. No schema migration was needed. Verdict: `NC_FIX_008_VERIFIED_WITH_FOLLOWUPS`.

## 18. NC-FIX-009 Reconciliation

Classification: `UX_FIX` / `BUG_FIX`. The follow-up path no longer hard-codes `memory_grounded` after a customer reply. Presentation derives from existing authoritative grounding IDs or the explicit organization-profile path; resume derives from persisted `memoryMatch`. Cold-start follow-ups remain clearly ungrounded while genuine lesson-grounded cases retain grounding copy. No retrieval, trust, reuse, evidence, Reflection, schema, or migration behavior changed. Verdict: `NC_FIX_009_VERIFIED`.

## 19. NC-FIX-010 Status

NC-FIX-010 is `PENDING`. Repository search found references describing it as a recommended optimistic-concurrency reload/retry UX follow-up, but no dedicated completion report or implementation evidence. It was not recorded as completed and no claim was added that it is fixed.

## 20. NC-ACCEPT-001-FINAL Reconciliation

The first final acceptance run failed at post-resolution Reflection preparation because the active-review-only server guard conflicted with the supplied phase order. That history remains preserved and is summarized only as the discovery that led to NC-FIX-008. The official rerun then verified the full NusaCloud flow through cold start, support interaction, customer confirmation, evidence-backed resolution, post-resolution Reflection, human validation, Organizational Memory promotion, similar-case retrieval, grounded response, human reuse approval, and durable reuse accounting. Its verdict is `NC_ACCEPT_001_FINAL_VERIFIED_WITH_FOLLOWUPS`. This is a verification milestone, not a software fix.

## 21. Other Post-v0.1.1 Changes

The production diff and untracked files were cross-checked for significant changes outside the named NC-FIX sequence. The meaningful items are the two ticket/evidence migrations, new ticket message/evidence API routes, server persistence/workflow expansion, AI timing metadata, compatibility library, grounding presentation helper, and permanent probes. RSS-2.1 through RSS-2.9 were already represented as the certified pre-NusaCloud history and were not duplicated. Local development logs and historical reports were not treated as product milestones.

## 22. Persistence / Migration Evolution

Current code and schema verify PostgreSQL-backed server-owned persistence through Prisma. `TicketRecord` remains the durable case aggregate; `TicketMessage` provides immutable ordered conversation history; `TicketResolutionEvidence` provides auditable resolution proof; KnowledgeItems, candidates, validations, memory changes, trust evidence, memberships, organizations, metrics, and audit records are organization-scoped durable resources. The current database has 25 applied migrations. Historical localStorage claims remain only inside their historical version sections.

## 23. Current Platform Status Reconciliation

`docs/CHANGELOG.md` now states: certified baseline v0.1.1 with current work unreleased; modular monolith Next.js architecture; Next.js server routes and React frontend; PostgreSQL and Prisma 7.9.1; server-authoritative tenant-scoped persistence; authenticated sessions, scrypt, memberships, RBAC, and active-organization authorization; DeepSeek -> LM Studio -> deterministic fallback; validated Organizational Memory; deterministic compatibility-guarded retrieval; evidence-backed validation and Reflection; durable reuse tracking; enabled pattern discovery; and not-yet-release-certified controlled/private-beta readiness.

## 24. Current AI Runtime

`lib/ai/adapter.ts` and the current environment resolve the active browser mode to DeepSeek. The chain is DeepSeek API first, LM Studio as optional fallback, and deterministic fallback when remote providers are unavailable. The current model/default configuration includes DeepSeek `deepseek-v4-flash` and LM Studio `google/gemma-4-e4b`. AI output remains advisory and subject to deterministic safety gates and human review. Claude is not represented as active runtime.

## 25. Known Limitations

- NC-FIX-010 remains pending.
- Provider-side 429/rate-limit conditions remain possible and are handled as fallback/diagnostic conditions; NC-FIX-005 did not optimize provider latency.
- Broader TODO-041/TODO-047 recall, ranking, and conservative classification limitations remain; NC-FIX-007 addresses the reported cross-domain false-positive boundary, not perfect recall.
- Historical Developer Demo audit/fixture findings remain non-blocking and protected state is unchanged.
- The current worktree is unreleased; no v0.1.2 version or release claim is made.

## 26. Historical Preservation

Historical Version 0.8.0, Version 0.9.0, and RSS-2.1 through RSS-2.9 entries were preserved. Their localStorage/no-database statements remain valid as descriptions of the historical implementations they documented. Existing visible encoding corruption was not broadly rewritten; one minor mojibake artifact remains as a documentation follow-up.

## 27. CHANGELOG.md Changes

Only `docs/CHANGELOG.md` was changed for the changelog itself. A coherent `Post-v0.1.1 NusaCloud Learning-Loop Development` section was added under Unreleased, covering Added, Changed, Fixed, Safety / Governance, Architecture Impact, Verification, Known Limitations, and Major Files / Components. The Current Platform Status table was replaced with current evidence-backed values. No release version was invented.

## 28. Consistency Audit

- No root-level `CHANGELOG.md` exists; the repository’s developer changelog is `docs/CHANGELOG.md`.
- RSS-2.9 remains the last historical pre-NusaCloud milestone.
- NC-FIX-001 through NC-FIX-009 are recorded as completed production changes with accurate scope.
- NC-FIX-007A and acceptance tasks are distinguished as audit/verification milestones.
- NC-FIX-010 is not marked completed.
- Current status no longer claims localStorage-only persistence, no production database, no authentication, or LM Studio-only AI.
- No v0.1.2, release, tag, commit, or publication claim was added.
- Historical entries were not rewritten.

## 29. Release-Preparation Impact

A. Does the changelog cover all significant post-v0.1.1 production changes? **YES**.

B. Does it distinguish product changes from audit and acceptance milestones? **YES**.

C. Is Current Platform Status accurate? **YES**, against current schema, server, frontend, environment, and reports.

D. Are known unresolved issues represented accurately? **YES**, including NC-FIX-010, provider rate limits, and broader retrieval limitations.

E. Does it contain an unsupported release claim? **NO**.

F. Is changelog history ready for release-certification audit? **YES**, with minor unrelated documentation cleanup follow-ups.

## 30. Repository Changes

- Changed: `docs/CHANGELOG.md`.
- Added: `docs/REL-PREP-001-POST-V0.1.1-CHANGELOG-RECONCILIATION-REPORT.md`.
- Production source changed for REL-PREP-001: **NO**.
- Tests changed for REL-PREP-001: **NO**.
- Fixtures changed: **NO**.
- Database schema changed: **NO**.
- Migration added: **NO**.
- Commit created: **NO**.
- Push performed: **NO**.
- Tags modified: **NO**.
- Release published: **NO**.

## 31. Recommendation

Use the reconciled `docs/CHANGELOG.md` as the release-history input for the next certification audit. Track NC-FIX-010 separately and optionally perform a narrow documentation cleanup for the remaining mojibake and stale standalone limitation references; do not rewrite historical release sections as part of that follow-up.

## 32. Final Verdict

`REL_PREP_001_VERIFIED_WITH_FOLLOWUPS`

### Final Output

Task: REL-PREP-001 — Post-v0.1.1 Changelog & Release History Reconciliation

Final verdict: `REL_PREP_001_VERIFIED_WITH_FOLLOWUPS`

Existing last recorded milestone: RSS-2.9 HOTFIX CERTIFICATION

Certified baseline: OIP v0.1.1 — Organization Lifecycle Hotfix

Certified baseline SHA: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`

Post-v0.1.1 production changes identified: 9

Post-v0.1.1 audit/acceptance milestones identified: 4

NC-FIX-001 recorded: YES

NC-FIX-002 recorded: YES

NC-FIX-003 recorded: YES

NC-FIX-004 recorded: YES

NC-FIX-005 recorded: YES

NC-FIX-006 recorded: YES

NC-FIX-007 recorded: YES

NC-FIX-007A recorded: YES

NC-FIX-008 recorded: YES

NC-FIX-009 recorded: YES

NC-FIX-010 status: PENDING

NC-FIX-010 recorded as completed: NO

NC-ACCEPT-001-FINAL verification milestone recorded: YES

Current Platform Status updated: YES

Current certified baseline: v0.1.1

Current development status: Unreleased post-v0.1.1 NusaCloud learning-loop development

Current architecture: Modular monolith; Next.js App Router with server-side application services and ports/adapters

Current backend: Next.js server routes and server-owned application workflows

Current frontend: React/Next.js authenticated support workspace and lifecycle views

Current database: PostgreSQL

Current ORM: Prisma 7.9.1

Current persistence: Server-authoritative, organization-scoped PostgreSQL persistence; 25 migrations applied

Current authentication: Session-based users with scrypt password hashing, memberships, RBAC, and active-organization authorization

Current AI runtime: DeepSeek API -> LM Studio -> deterministic fallback

Current Organizational Memory status: Enabled; validated KnowledgeItems/Lessons with provenance, trust, versioning, and human-governed promotion

Current retrieval status: Deterministic organization-scoped retrieval with compatibility guard and fail-closed incompatible candidates; broader recall limitations remain

Current validation status: Durable resolution evidence plus server-authoritative human validation gates promotion

Current known limitations: NC-FIX-010 pending; transient provider 429/fallback conditions; broader retrieval/classification recall limitations; minor standalone documentation cleanup

Historical entries rewritten: NO

Historical documentation corrections: NONE; visible mojibake preserved as a minor follow-up

Unsupported release claims: NONE

CHANGELOG.md internally consistent: YES

CHANGELOG.md updated: YES (`docs/CHANGELOG.md`)

Changelog ready for release-certification audit: YES

Production source changed: NO

Tests changed: NO

Fixtures changed: NO

Database schema changed: NO

Migration added: NO

Commit created: NO

Push performed: NO

Tags modified: NO

Release published: NO

Report: `docs/REL-PREP-001-POST-V0.1.1-CHANGELOG-RECONCILIATION-REPORT.md`

Recommended next step: release-certification audit, with NC-FIX-010 tracked separately.
