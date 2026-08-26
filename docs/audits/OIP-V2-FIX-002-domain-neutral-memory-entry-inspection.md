# OIP-V2-FIX-002 — Domain-Neutral Organizational Memory Entry & Inspection

## 1 Executive Summary

Implemented the smallest authorized product surface for a normal operator to record a non-Support organizational experience, attach Source-linked Evidence, prepare advisory learning, explicitly validate it, and inspect the resulting Organizational Memory. The existing OIP-V2-FIX-001 primitives and Support adapter remain the authority; no parallel memory system was introduced.

Both QA-001 high-severity gaps are closed. The new deterministic acceptance probe passed, the warehouse scenario was exercised manually in the application, the production build and typecheck passed, the OIP-V2-FIX-001 foundation probe passed, and the relevant Support/reflection/reuse/provenance/concurrency regressions passed sequentially.

## 2 Final Verdict

`OIP_V2_FIX_002_IMPLEMENTED_WITH_FOLLOWUPS`

The implementation is functionally verified and both HIGH QA blockers are closed. Follow-ups are non-blocking: standalone `npm run lint` remains blocked by the repository's existing interactive ESLint setup prompt, and the surface can receive ordinary visual-polish follow-up. No safety-critical regression was observed.

`QA_001_RERUN_READY`

## 3 Repository State Before

- Branch: `landing/option-c32-release-polish`
- Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- The worktree was already dirty before this task.
- Pre-existing modified files included the architecture/canon/implementation documentation, `app/page.tsx`-adjacent product code, `lib/memory.ts`, `lib/server/persistenceService.ts`, `lib/server/rbac/definitions.ts`, `lib/trustEngine.ts`, `package.json`, `prisma/schema.prisma`, and type files.
- Pre-existing untracked files included the OIP-V2-FIX-001 source/evidence services, migrations, API surface, types, audit reports, and foundation probe.
- No reset, clean, restore, checkout, stash, stage, commit, push, tag, deploy, or publish operation was performed.

## 4 QA-001 Defect Baseline

QA-001 ended with `OIP_V2_QA_001_ORGANIZATIONAL_MEMORY_CORE_PARTIALLY_ACCEPTED`.

- `V2-GAP-001`: a normal operator could not initiate non-Support learning without fabricating a TicketRecord.
- `V2-GAP-002`: there was no practical product inspection surface for Source, Evidence, validation, outcomes, challenges, versions, provenance, and trust history.

## 5 Existing V2 Foundation Reverification

The existing `OrganizationalSource`, `EvidenceRecord`, `MemoryEvidenceLink`, `KnowledgeReuseOutcome`, `KnowledgeChallenge`, `KnowledgeChallengeDecision`, immutable evidence, idempotency, optimistic concurrency, Support adaptation, organization scoping, and AI advisory boundaries were reused. `npm run probe:oip-v2-fix-001` passed after implementation.

## 6 Files Changed

| Path | Purpose / symbols | QA gap | Safety implications | Tests/evidence |
|---|---|---|---|---|
| `app/page.tsx` | Adds the Memory Core surface and applies refreshed server state to the existing page state. | Gaps 001/002 | Preserves existing KnowledgeView and Support flow. | Typecheck, build, manual browser flow. |
| `components/views/HomeView.tsx` | Adds Record Organizational Experience quick action and neutral empty-state guidance. | Gap 001 | Does not remove New Ticket. | Manual Home snapshot. |
| `components/views/OrganizationalMemorySurface.tsx` | Entry, Evidence, preparation, validation, list, detail, outcome, challenge, review UI. | Gaps 001/002 | Uses authenticated relative APIs; no direct persistence writes. | Manual browser flow and build. |
| `app/api/organizations/[organizationId]/memory/experiences/route.ts` | Domain-neutral Source command. | Gap 001 | Capability and organization route wrapper; bounded inputs. | FIX-002 probe. |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/evidence/route.ts` | Source-linked Evidence create/read. | Gaps 001/002 | Source ownership and capability checks. | FIX-002 probe. |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/prepare/route.ts` | Advisory preparation command. | Gap 001 | No trust mutation. | FIX-002 probe. |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/validate/route.ts` | Human validation command. | Gaps 001/002 | Reuses governed commit and authenticated actor. | FIX-002 probe, manual UI. |
| `app/api/organizations/[organizationId]/memory/knowledge/[knowledgeItemId]/route.ts` | Full inspectable memory detail. | Gap 002 | Organization-scoped read. | FIX-002 probe, manual UI. |
| `lib/server/organizationalMemoryPrimitives.ts` | Adds transactional Source/Evidence helpers. | Gap 001 | Preserves immutable Evidence and Support helper behavior. | Typecheck, FIX-001/FIX-002 probes. |
| `lib/server/organizationalMemoryService.ts` | Adds neutral Source/Evidence/preparation/validation/inspection services. | Gaps 001/002 | Shared existing services; no alternate memory store. | Typecheck, build, probes. |
| `lib/server/persistenceService.ts` | Extends the existing validation commit with a neutral Source/Evidence context. | Gap 001 | Support gate remains unchanged in its existing branch; neutral path validates exact organization/source/evidence ownership. | Typecheck, build, FIX-001 and regression probes. |
| `lib/server/rbac/definitions.ts` | Adds `memory.source.create`, `memory.evidence.create`, `memory.learning.prepare`. | Gap 001 | Viewer remains ungranted; owner/admin/reviewer/support-agent policies are explicit. | Build, FIX-002 isolation/authorization probe. |
| `prisma/migrations/20260824140000_add_memory_entry_capabilities/migration.sql` | Seeds three minimal capabilities for existing roles. | Gap 001 | Additive RBAC data migration only; no schema rewrite. | `prisma migrate deploy`, migrate status. |
| `types/organizationalMemory.ts` | Adds source-kind, inspection, and prepared-learning contracts. | Gaps 001/002 | Type-only composition of existing Knowledge contracts. | Typecheck/build. |
| `types/index.ts` | Exports inspection/preparation contracts. | Gaps 001/002 | Type export only. | Typecheck. |
| `package.json` | Adds `probe:oip-v2-fix-002`. | Verification | No runtime behavior outside the probe command. | Probe passed. |
| `scripts/oip-v2-fix-002-entry-inspection-probe.cjs` | Disposable API/domain acceptance probe. | Gaps 001/002 | Raw DB only for setup, assertions, and cleanup; lifecycle actions use APIs. | Probe passed. |
| `docs/ARCHITECTURE_BASELINE.md` | Documents neutral entry and inspection surface. | Documentation closure | No Canon change. | Review. |
| `docs/KNOWN_LIMITATIONS.md` | Updates stale limitation about absent challenge UI and Support-only entry. | Documentation closure | Records remaining deferred scope honestly. | Review. |
| `docs/implementation/15_API_ARCHITECTURE.md` | Documents new application contracts. | Documentation closure | Contract documentation only. | Review/build route listing. |
| `docs/implementation/16_STORAGE_ARCHITECTURE.md` | Documents operator entry/inspection over existing storage. | Documentation closure | No schema redesign. | Review. |
| `docs/audits/OIP-V2-FIX-002-domain-neutral-memory-entry-inspection.md` | This audit and evidence report. | All | Audit-only artifact. | This report. |

## 7 Navigation / Entry Surface

The existing Knowledge destination now presents a `MEMORY CORE` section with `Record organizational experience` and `Add Organizational Experience`. Home Quick actions also exposes `Record Organizational Experience`. Manual DOM evidence showed both labels without requiring an internal URL or developer tooling.

## 8 Organizational Experience Entry

The form collects title, bounded source type, occurred date/time, description, optional location/context, and generates internal identity/idempotency values. The manual warehouse scenario created an `OPERATIONAL_EVENT` Source without a Support ticket.

## 9 Source Model Integration

The route writes the existing `OrganizationalSource` model through `createOrganizationalSource` and `ensureSourceTx`. Source identity, source kind, source system/type, occurred time, actor, and metadata remain durable and organization-scoped.

## 10 Evidence Entry

The Evidence route writes existing `EvidenceRecord` rows through `ensureEvidenceTx`. The accepted bounded types are observation, investigation, system_result, action_taken, confirmation, outcome, and reference. The probe created five Evidence records.

## 11 Evidence UX

The UI explicitly labels Source as the organizational event/origin and Evidence as what supports what happened or was learned. Each manual Evidence row showed type, timestamp, and content. The entry form states that Source/Evidence are not trusted memory by themselves.

## 12 Learning Preparation

`POST .../prepare` loads the Source and Evidence, requires at least one Evidence item, persists a deterministic proposed candidate, and returns the prepared learning plus advisory reflection decision. It does not create a KnowledgeItem or trust event.

## 13 Reflection Generalization

The neutral path uses the existing candidate/validation machinery and returns an advisory ReflectionDecision. It does not duplicate Support Reflection or grant trust. The candidate has no Support `sourceTicketIds` and the neutral validation commit uses `neutralContext` with Source/Evidence IDs.

## 14 Human Validation

The UI showed `Prepared for human validation`, `Not trusted yet`, the proposed reusable lesson, evidence-derived content, rationale, and a separate `Validate learning` action. Validation is explicit and actor-authenticated. No auto-approval exists.

## 15 Memory List

Validated Support and neutral KnowledgeItems use the existing organization Knowledge list. The new list showed the warehouse memory with title, summary, `active`/`deprecated` lifecycle, trust score, version, and validator. The page refresh fix applies authoritative refreshed state so a newly validated item appears in the list.

## 16 Memory Detail

Selecting the warehouse memory showed current lesson, revision, lifecycle, trust explanation, Origin, Validation, Evidence, Outcome history, Challenges and decisions, and Version and memory changes. No database inspection was needed.

## 17 Provenance Inspection

Detail showed the original Source title, source kind/type, occurred timestamp, validator, validation rationale, and the stable Source identity carried into the memory provenance. The probe asserted that `provenance.sourceTicketId` is the neutral Source ID, not a TicketRecord ID.

## 18 Evidence Inspection

Detail showed five origin Evidence entries and later reuse/challenge Evidence labels and content. The probe asserted five origin Evidence records before Outcome/Challenge activity and inspected all linked relationships after lifecycle changes.

## 19 Trust Inspection

The UI displayed human validator, trust projection, successful reuse, corrections/failures, lifecycle, last validation, Source/validation context, and the explanatory text that trust is evidence-backed and the numeric score is only one signal. A SUCCESS outcome visibly increased trust from 20 to 25.

## 20 Outcome Entry

The detail card provides plain labels `Worked`, `Worked with correction`, and `Did not work`, maps them to SUCCESS, CORRECTION_REQUIRED, and FAILURE, and requires outcome evidence. Source identity and actor are generated/derived without exposing UUID entry. The manual UI recorded SUCCESS; the existing foundation/regression probes cover correction and failure API behavior, and the new probe covers neutral SUCCESS/idempotent retry.

## 21 Outcome History

After remounting the detail surface, the manual UI showed `1 event`, `Worked`, `Trust +5`, timestamp, actor, and linked outcome Evidence. The acceptance probe asserted exactly one outcome row after a replayed idempotent request.

## 22 Challenge Entry

The detail card provides `Challenge this memory`, requires rationale and supporting Evidence, and leaves the original memory inspectable. Manual UI showed the OPEN challenge and its Evidence relationship before review.

## 23 Challenge Review

The authorized review controls expose only `REVALIDATED`, `SCOPE_UPDATED`, and `DEPRECATED`, plus reviewer rationale and a bounded scope note for SCOPE_UPDATED. Manual UI exercised all three dispositions across follow-up challenges; the probe exercised SCOPE_UPDATED.

## 24 Scope Update

Manual UI review as SCOPE_UPDATED produced version 2, preserved version 1, retained the original Source/Evidence, and showed `RESOLVED · SCOPE_UPDATED`. The acceptance probe asserted history length and preserved provenance.

## 25 Revalidation

Manual UI opened a follow-up Challenge and reviewed it as REVALIDATED. The detail surface retained the prior SCOPE_UPDATED decision and displayed `RESOLVED · REVALIDATED` with reviewer rationale. No original record was overwritten.

## 26 Deprecation

Manual UI opened a third Challenge and reviewed it as DEPRECATED. The list showed `deprecated`, and detail showed `RESOLVED · DEPRECATED` alongside the earlier decisions. The historical lesson, Evidence, outcome, and versions remained inspectable.

## 27 History / Version Inspection

The manual detail view showed Version 1 (initial validation), Version 2 (scope narrowed), memory-change entry, and all three challenge decisions in chronological product context. Challenge resolution does not erase the original event, evidence, validation, or prior version.

## 28 Authorization

New routes use the existing organization route and capability enforcement. New minimal capabilities are `memory.source.create`, `memory.evidence.create`, and `memory.learning.prepare`; validation still requires `knowledge.promote`. Viewer is not granted the new mutation capabilities. The probe uses an authenticated Owner session and verifies cross-tenant read rejection.

## 29 Organization Isolation

The acceptance probe creates a second organization, attempts to inspect the first organization's memory through the second organization path, and receives 404. Source, Evidence, Knowledge, Outcome, Challenge, and inspection service queries retain organization predicates. No cross-tenant result was observed.

## 30 AI Authority Boundary

No AI authority increased. Preparation is advisory; AI does not validate, promote, create authoritative Evidence, record Outcomes, open/review Challenges, change scope, deprecate memory, or grant trust. The UI's validation action is a human action and the server derives actor identity from the session.

## 31 Support Backward Compatibility

Support source/evidence adaptation remains in the existing validation commit branch and was not replaced. The OIP-V2-FIX-001 foundation probe passed, as did NC-FIX-003, NC-ACCEPT-001, NC-FIX-006, NC-FIX-008, NC-FIX-011, NC-FIX-012, NC-FIX-015, NC-FIX-017, and NC-FIX-010 when rerun sequentially.

## 32 Automated Tests

Passed:

- `npx tsc --noEmit`
- `npm run probe:oip-v2-fix-002`
- `npm run probe:oip-v2-fix-001`
- `npm run probe:nc-fix-003-resolution-evidence`
- `npm run probe:nc-accept-001-learning-loop`
- `npm run probe:nc-fix-006-knowledge-reuse`
- `npm run probe:nc-fix-008-post-resolution-reflection`
- `npm run probe:nc-fix-011-reflection-promotion-safety`
- `npm run probe:nc-fix-012-reflection-provenance-boundary`
- `npm run probe:nc-fix-015-grounded-reuse-evidence`
- `npm run probe:nc-fix-017-recurrence-concurrency`
- `npm run probe:nc-fix-010-concurrency-recovery`

The initial parallel rerun produced transient 500/404 results from dev-server contention; all required probes were rerun sequentially and passed. Those parallel results are classified as environmental/harness contention, not FIX-002 regressions.

## 33 Acceptance Probe

`npm run probe:oip-v2-fix-002` passed with:

- five Evidence records and no TicketRecord
- candidate pending before validation
- validated memory with inspectable provenance/Evidence
- SUCCESS outcome, idempotent retry, and one trust update
- Challenge, fail-closed automation, SCOPE_UPDATED, and version history
- cross-organization read blocked

Probe verdict: `OIP_V2_FIX_002_ENTRY_AND_INSPECTION_PROBE_PASSED`.

## 34 Manual Product Verification

Using the actual in-app browser and seeded Owner `NC-FIX-017A Repair Browser q1vkz1` in `Merah Putih Operations`:

1. Home exposed Record Organizational Experience.
2. Knowledge exposed the Memory Core entry section.
3. Warehouse operational Source was recorded without a ticket.
4. Five textual Evidence records were added and displayed.
5. Learning preparation displayed an advisory, not-trusted candidate.
6. Human validation displayed actor/rationale and produced memory.
7. Memory list and detail displayed Source, Evidence, validation, provenance, trust explanation, and versions.
8. SUCCESS outcome displayed in history with trust delta.
9. Challenge opened visibly and automation controls were disabled while open.
10. SCOPE_UPDATED, REVALIDATED, and DEPRECATED reviews were completed.
11. Version and complete challenge history remained visible after each review.

Equivalent evidence is the browser DOM snapshot/request transcript in this task session; no screenshot artifact was required to establish the UI states.

## 35 Regression Results

Relevant Support and learning regressions passed sequentially. No caused-by-FIX-002 core or safety regression was found. The only non-pass command was standalone lint, classified as environmental repository configuration because `next lint` stops at an interactive ESLint setup prompt.

## 36 Build / Typecheck / Lint

- Prisma validation: migration status reports 28 migrations and database up to date.
- Prisma generation: passed during `npm run build`.
- Typecheck: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed; new routes were listed in the route manifest.
- Integrated build lint/type validation: passed.
- Standalone lint: `npm run lint` cannot complete non-interactively because the repository has no configured ESLint choice and `next lint` prompts for Strict/Base/Cancel. This is a follow-up, not a FIX-002 code failure.

## 37 Documentation Changes

Updated only directly affected documentation:

- `docs/ARCHITECTURE_BASELINE.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/implementation/15_API_ARCHITECTURE.md`
- `docs/implementation/16_STORAGE_ARCHITECTURE.md`

Canon semantics and historical reports were not changed by this task.

## 38 Known Limitations

- Standalone ESLint configuration is not established, so `npm run lint` remains interactive.
- The surface is intentionally compact and not a broad analytics/dashboard experience.
- Outcome UI manual verification exercised SUCCESS; CORRECTION_REQUIRED and FAILURE are exposed by the same bounded selector and covered by existing API/regression probes rather than separately entered in this manual session.
- Challenge review is human-only; bulk review, automatic decay, retirement scheduling, and policy-driven scope inference remain out of scope.

## 39 Deferred Capabilities

Vector search, embeddings, RAG, connectors, arbitrary document ingestion, graph visualization, analytics suite, autonomous agents, automatic challenge generation, automatic revalidation, trust decay, automatic retirement, and broad workflow redesign remain deferred. No deferred capability was added here.

## 40 Git Diff Summary

- Ending branch: `landing/option-c32-release-polish`
- Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05` (unchanged; no commit)
- One additive migration was applied: `20260824140000_add_memory_entry_capabilities`.
- The worktree remains dirty with the pre-existing changes plus the FIX-002 implementation/report files. No unrelated pre-existing changes were reverted or normalized.

## 41 Repository State After

`git status --short` still includes the pre-existing dirty files and untracked prior-task artifacts. FIX-002 additions are the new entry/inspection routes, surface, neutral service extensions, minimal RBAC capability migration, acceptance probe, direct documentation updates, and this report. Database migration status is clean/up to date. No commit, push, tag, deploy, or publish occurred.

## 42 Recommended Next Task

Configure the repository's ESLint CLI non-interactively, then perform ordinary visual polish/accessibility review of the compact Memory Core surface. After that, rerun `OIP-V2-QA-001` unchanged using the warehouse scenario and retain the QA rerun report as the next audit artifact.

## QA-001 Defect Closure Matrix

| Defect | Closure | Evidence |
|---|---|---|
| `V2-GAP-001` | `CLOSED` | Normal Owner recorded Source + five Evidence items, prepared learning, validated it, and the probe asserted zero TicketRecords. |
| `V2-GAP-002` | `CLOSED` | Manual detail and probe exposed Source, Evidence, validation, provenance, trust, Outcome, Challenge, versions, scope update, revalidation, and deprecation history. |

## Final Verification Matrix

| Requirement | Result |
|---|---|
| Non-Support event can enter OIP without TicketRecord | PASS |
| Source is durable | PASS |
| Evidence is durable | PASS |
| Evidence is visible to authorized user | PASS |
| Learning can be prepared from neutral Source/Evidence | PASS |
| Reflection remains advisory | PASS |
| Human validation remains required | PASS |
| Validated memory links to Source/Evidence | PASS |
| Memory appears in Organizational Memory | PASS |
| Provenance is inspectable | PASS |
| Validation is inspectable | PASS |
| Trust rationale is inspectable | PASS |
| Outcome can be recorded | PASS |
| Outcome history is inspectable | PASS |
| Challenge can be opened | PASS |
| Challenge evidence is inspectable | PASS |
| Human Challenge review works | PASS |
| Scope update preserves history | PASS |
| Revalidation preserves history | PASS |
| Deprecation preserves history | PASS |
| Organization isolation passes | PASS |
| AI authority remains unchanged | PASS |
| Existing Support workflow still passes | PASS |
| No vector/RAG/connectors were added | PASS |
| V2-GAP-001 closed | PASS |
| V2-GAP-002 closed | PASS |
