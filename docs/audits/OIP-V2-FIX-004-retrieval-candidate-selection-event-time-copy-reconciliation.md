# OIP-V2-FIX-004 — Retrieval Candidate Selection, Event-Time Persistence & Retrieval Copy Reconciliation

## 1. Executive Summary

Implemented the authorized targeted repair. Deterministic retrieval now uses normalized inflection handling, lesson/workflow/evidence coverage, structured condition compatibility, lifecycle penalties, and stable intrinsic tie-breaking. The `datetime-local` source-entry path now preserves the entered local wall-clock value before API serialization. Presentation copy now distinguishes no candidate, weak, ungrounded, scope-incompatible, human-review, and grounded states.

## 2. Final Verdict

`OIP_V2_FIX_004_IMPLEMENTED_WITH_FOLLOWUPS`

The three confirmed defects are repaired and automated checks pass. A full authenticated manual UI walkthrough remains a follow-up because the prior browser session was unavailable, and the existing database contains a separate near-duplicate QA Event A that requires the exact R2 rerun to certify live selection.

## 3. Repository State Before

- Branch: `landing/option-c32-release-polish`
- HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Worktree was already dirty with pre-existing organizational-memory, documentation, migration, and release-report changes.
- No reset, clean, restore, stash, stage, commit, push, tag, deploy, or publish was performed.

## 4. QA-001R-R2 Baseline

R2 stored and inspected a fresh Wi-Fi roaming/scanner Event A, but Event B ranked an older broad warehouse-scanner memory first. The old candidate was weak and grounding correctly failed closed. R2 also observed an occurrence-time display mismatch and contradictory memory-found/cold-start copy.

## 5. Confirmed Defects

- Candidate selection favored broad lexical overlap and historical candidates.
- The source-entry default sliced a UTC ISO string into a timezone-less input value.
- Copy inferred cold start from knowledge-base emptiness even when a candidate existed.

## 6. Retrieval Pipeline Trace

`Event B → understanding/retrieval text → normalized candidate generation → structured compatibility → intrinsic score → deterministic rank → existing lesson/grounding gates → presentation state/copy`.

## 7. Competing Candidate Inventory

The probe includes: A specific validated Wi-Fi roaming scanner lesson; B an older deprecated broad scanner memory; C a backend-outage memory; D a certificate memory. Diagnostics record title, score, compatibility, lifecycle penalty, and evidence contribution.

## 8. Retrieval Root Cause

The primary classification is `CANDIDATE_FEATURE_GAP`, `QUERY_FEATURE_GAP`, `SCORING_WEIGHT_GAP`, `SPECIFICITY_GAP`, and `HISTORICAL_CANDIDATE_BIAS`. Retrieval ignored lesson/workflow evidence and used usage/recency as a duplicate tie-break.

## 9. Why Historical Memory Won

The old item received similar category/symptom overlap despite being deprecated. The prior score had no lifecycle penalty, evidence-coverage score, or operational-condition distinction; usage and recency could then influence duplicate selection.

## 10. Candidate Selection Repair

Added bounded token normalization for common operational inflections, indexed lesson/workflow/example evidence, added evidence-coverage and lifecycle diagnostics, penalized deprecated/candidate/challenged records, and removed usage/recency from tie resolution.

## 11. Ranking Semantics

Ranking uses intrinsic category/tag/keyword/concept/phrase/session/compatibility evidence, supporting-evidence overlap, condition overlap, evidence quality, and lifecycle penalties. Trust is displayed separately and is not a relevance score.

## 12. Specificity Handling

Lesson signals, root causes, solutions, resolution workflow, examples, and normalized operational terms contribute bounded evidence and specificity points. Broad symptom overlap alone is insufficient to outrank a specific evidence-backed candidate.

## 13. Condition Compatibility

Generic healthy-versus-outage polarity is now checked. Distinct structured root-cause facets cannot pass merely through shared offline/synchronization symptoms. Wi-Fi transition evidence remains required for transition-scoped candidates.

## 14. Evidence/Grounding Role

Evidence quality and evidence-term overlap improve candidate ranking diagnostics, but ranking never grants grounding. Existing lesson matching, compatibility, AI discrimination, and human-review gates remain authoritative.

## 15. Trust Role in Ranking

Trust is not used to make a candidate more relevant. Trust/governance continues to determine review and automation posture after retrieval.

## 16. Scope Role in Ranking

Scope and structured compatibility remain safety boundaries. Firmware-specific cases and conflicting root-cause facets are rejected; historical records remain inspectable.

## 17. Tie-Breaking

Ties use intrinsic specificity and then stable item ID. Usage counts, `lastUsedAt`, and `lastUpdated` no longer decide ties.

## 18. Ordering Independence

The FIX-004 probe runs the same candidate set in multiple input orders and obtains the same specific Event A winner.

## 19. Event B Before/After

Before: R2 observed old deprecated memory first with score 32, prior active QA Event A 31, and fresh R2 Event A 30. After: the required competing fixture ranks specific Event A first with score 100; deprecated broad memory scores 70 and is penalized by 30. The existing database also contains a near-duplicate prior QA Event A, so the exact R2 live dataset needs rerun certification.

## 20. False-Positive Controls

Backend outage is rejected against a healthy candidate. Certificate memory is rejected by distinct authentication versus network-transition root-cause facets. Firmware scope remains fail-closed.

## 21. Event C / Event D Scope Behavior

The firmware-specific post-scope query remains excluded. The FIX-003 regression probe confirms firmware, outage, and certificate controls.

## 22. Event-Time Root Cause

The client initialized `datetime-local` from a UTC ISO string truncated to minutes. That can display a shifted local wall-clock value even though the server stores an ISO instant correctly.

## 23. Event-Time Repair

Added `formatLocalDateTimeInput` and `serializeLocalDateTimeInput`. The form now initializes from local date getters, validates the wall-clock value, and explicitly serializes it for the API.

## 24. Timezone Verification

The helper round-trips `2026-08-24T16:15` using the runtime's local timezone; the probe observed `2026-08-24T09:15:00.000Z` in the current environment. The API persisted an explicit `2026-08-24T16:15:00.000Z` instant unchanged.

## 25. Retrieval Copy Root Cause

`knowledgeItems.length === 0` was used as a cold-start signal even when a weak `topMatch` existed. AI fallback/presentation state therefore could say no knowledge existed while the memory panel showed a candidate.

## 26. Retrieval State/Copy Repair

Added presentation-state derivation for `NO_CANDIDATE`, `WEAK_CANDIDATE`, `UNGROUNDED_CANDIDATE`, `SCOPE_INCOMPATIBLE`, `HUMAN_REVIEW_REQUIRED`, and `GROUNDED_REUSABLE`. Candidate-present states never use “no organizational knowledge exists” copy.

## 27. Outcome Idempotency Regression

FIX-003 probe passed SUCCESS, correction, and FAILURE retries, including concurrent retries and separate logical events.

## 28. Trust Regression

FIX-003 probe passed trust effects and retains trust as separate reliability metadata.

## 29. Challenge/Scope Regression

FIX-003 probe passed challenge fail-closed behavior and `SCOPE_UPDATED` firmware exclusion.

## 30. Domain-Neutral Entry Regression

FIX-004 exercised the domain-neutral Source API for occurrence-time persistence. Existing FIX-003 exercised source/evidence/outcome projection.

## 31. Organization Isolation

FIX-003 probe passed cross-organization inspection denial.

## 32. AI Authority

No AI authority changed. AI remains advisory; deterministic compatibility, grounding, governance, and human review remain the authorization boundaries.

## 33. Files Changed

FIX-004 touched: `app/page.tsx`, `components/ProvenancePanel.tsx`, `components/views/OrganizationalMemorySurface.tsx`, `components/views/TicketWorkspace.tsx`, `lib/application/tickets/processTicket.ts`, `lib/eventTime.ts`, `lib/memory.ts`, `lib/retrievalCompatibility.ts`, `lib/retrievalPresentation.ts`, `package.json`, `scripts/oip-v2-fix-004-retrieval-candidate-selection-event-time-copy-probe.cjs`, and `types/knowledge.ts`. The required report is this file. Pre-existing dirty files were preserved.

## 34. Tests Added/Changed

Added `probe:oip-v2-fix-004` and pure helper assertions for ranking, order independence, false positives, copy states, invalid dates, and local datetime serialization. No migration or schema change was needed.

## 35. Acceptance Probe

`probe:oip-v2-fix-004` passed with verdict `OIP_V2_FIX_004_RETRIEVAL_SELECTION_EVENT_TIME_AND_COPY_RECONCILED_AND_VERIFIED`.

## 36. Manual UI Verification

Not completed in this turn. The prior authenticated browser tab was no longer available; a fresh local tab showed the login screen. No user credentials were entered. The build and API-backed probe provide automated coverage; the exact authenticated UI walkthrough remains a follow-up.

## 37. Regression Results

`npm run probe:oip-v2-fix-003` passed. The FIX-004 probe passed. The production build, TypeScript check, Prisma validation, and migration status passed.

## 38. Build/Typecheck/Lint

- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `npx prisma validate`: PASS
- `npx prisma migrate status`: PASS; 28 migrations up to date
- `npm run lint`: NOT RUN TO COMPLETION; `next lint` opened its interactive ESLint configuration prompt and exited without a selected configuration.

## 39. Documentation Changes

Only this required FIX-004 audit report was added. No Canon or broad documentation rewrite was made.

## 40. Known Limitations

The live database contains a separate prior QA Event A with near-duplicate evidence. The required fixture passes, but the exact R2 sequence should be rerun in one authenticated session to confirm which duplicate active memory is selected. Manual browser verification and non-interactive lint configuration remain pending.

## 41. Deferred Retrieval Capabilities

No vectors, embeddings, RAG, external search, reranker, LLM judge, or new retrieval infrastructure was added. Such expansion remains deferred.

## 42. Git Diff Summary

The worktree remains intentionally dirty. FIX-004 adds targeted retrieval, presentation, event-time, type, probe, and package-script changes; no unrelated pre-existing changes were reverted.

## 43. Repository State After

- Branch remains `landing/option-c32-release-polish`.
- HEAD remains `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- No commit was created.
- Existing modified and untracked files remain present.

## 44. QA Rerun Readiness

`QA_001R_R2_RERUN_NOT_READY` for final human/UI certification. Automated repair evidence is ready, but the authenticated manual walkthrough and exact live duplicate-memory sequence remain to be rerun.

## 45. Recommended Next Task

Run the full authenticated QA-001R-R2 sequence in one session without deleting the older warehouse memory, capture the live candidate ranking and UI copy, then configure a non-interactive lint command if lint certification is required.

## Defect Closure Matrix

| Defect | Result |
| --- | --- |
| RETRIEVAL-SELECTION-001 — best competing memory selected | CLOSED for required FIX-004 fixture; live duplicate rerun follow-up |
| EVENT-TIME-001 — occurrence time preserved correctly | CLOSED |
| RETRIEVAL-COPY-001 — candidate/cold-start copy consistent | CLOSED |

| Regression | Result |
| --- | --- |
| RETRIEVAL-001 — non-identical retrieval | PASS |
| OUTCOME-IDEMPOTENCY-001 | PASS |
| TRUST-STATE-001 | PASS |
| OUTCOME-CONTEXT-001 | PASS |

## Final Verification Matrix

| Requirement | Result |
| --- | --- |
| Event A generated for Event B | PASS in controlled fixture |
| Event A ranks #1 | PASS in controlled fixture |
| Historical broad memory does not incorrectly win | PASS |
| Backend outage memory does not incorrectly win | PASS |
| Certificate memory does not incorrectly win | PASS |
| Ranking independent of insertion order | PASS |
| Ranking deterministic across repeats | PASS |
| Recency does not dominate relevance | PASS; removed from tie-break |
| Trust does not dominate relevance | PASS; separate metadata |
| Specific conditions influence ranking | PASS |
| Grounding remains separate | PASS |
| Human review remains governed | PASS |
| Event D respects narrowed scope | PASS |
| occurredAt persists correctly | PASS |
| createdAt remains separate | PASS |
| timezone rendering correct | PASS helper/runtime check |
| no-candidate copy correct | PASS |
| weak-candidate copy correct | PASS |
| ungrounded-candidate copy correct | PASS |
| scope-incompatible copy correct | PASS |
| grounded-candidate copy correct | PASS |
| SUCCESS retry remains exact-once | PASS via FIX-003 |
| FAILURE retry remains exact-once | PASS via FIX-003 |
| Outcome context remains visible | PASS via FIX-003 |
| trust state remains non-misleading | PASS via FIX-003 |
| Challenge remains fail-closed | PASS via FIX-003 |
| organization isolation passes | PASS via FIX-003 |
| AI authority unchanged | PASS |
| no vector/RAG/embedding architecture added | PASS |
