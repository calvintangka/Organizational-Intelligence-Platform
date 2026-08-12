# NC-FIX-010 - Optimistic-Concurrency Reload / Retry UX Reconciliation

Date: 2026-08-12  
Scope: NusaCloud post-v0.1.1 learning-loop worktree  
Final verdict: `NC_FIX_010_VERIFIED_WITH_FOLLOWUPS`

## 1. Executive Summary

NC-FIX-010 addressed a recovery UX gap around already-correct optimistic concurrency. The server rejected stale KnowledgeItem writes safely, but the client did not clearly state that the local review remained available or provide a verified reload-and-deliberate-retry contract. The repair preserves stale-write rejection, exposes structured diagnostics, guards reloads against organization-switch races, keeps the local review state, and requires an explicit retry.

## 2. Final Verdict

`NC_FIX_010_VERIFIED_WITH_FOLLOWUPS`. The scoped concurrency recovery behavior is verified by permanent API regression coverage, focused NC-FIX regressions, a two-tab browser rehearsal, TypeScript, Prisma validation, and production build. Unrelated provider-rate-limit and broader retrieval/classification limitations remain follow-ups and are not NC-FIX-010 blockers.

## 3. Baseline

Baseline review used the current dirty post-v0.1.1 worktree without resetting or discarding pre-existing changes. The v0.1.1 certified baseline and existing NC-FIX/RSS evidence were preserved. No release commit, tag, push, or tracker mutation was performed.

## 4. Source Finding

The source finding was a genuine recovery UX defect, not a missing server guard. When another authorized client advanced a KnowledgeItem from revision N to N+1, the local client still held revision N. The server correctly returned a conflict, but the prior UI primarily offered Reload latest and did not explicitly document local review preservation, reconciliation, or deliberate retry.

## 5. Concurrency Source Inventory

The relevant path is: authenticated organization route or validation-commit route -> persistence adapter -> `PersistenceService.upsertKnowledgeItemTx` -> conditional revision update. The client path is: KnowledgeItem state and Reflection state -> `reportPersistenceError` / learning-command stale failure -> conflict notice -> `reloadLatestKnowledge` -> explicit user retry.

## 6. Conflict Reproduction

Reproduced with two independently authenticated clients against one disposable organization and one KnowledgeItem. Both loaded revision 1. Client A saved an authoritative update, advancing to revision 2. Client B attempted a stale local update based on revision 1 and received HTTP 409 with `REVISION_CONFLICT`; the newer server content remained intact.

## 7. Revision Advancement Analysis

The permanent probe observed the sequence `1 -> 2` for the competing write, rejected the stale attempt with expected revision 1 and current revision 2, then applied the user-selected retry against revision 2 and observed final revision 3. No automatic stale replay occurred.

## 8. Server Concurrency Contract

PASS. Existing persistence protection remains conditional on `{id, organizationId, revision: expectedRevision}` and bumps the revision atomically. A mismatch does not overwrite newer content. The transaction rolls back governed validation, memory-change, trust-evidence, and KnowledgeItem work together when the guarded update fails.

## 9. Client Conflict Contract

PASS after repair. `REVISION_CONFLICT` is recognized as an expected recoverable condition. The client preserves the local review state, records organization/resource/operation and expected/current revision diagnostics, shows a Reload latest action, and does not claim success or silently retry.

## 10. User-Work Preservation Reproduction

The browser rehearsal left both tabs in Reflection after manual verified resolution. After Tab B received the stale conflict, the DOM still showed the unsaved-review preservation statement and the original Reflection commit action remained available. Reloading changed the authoritative KnowledgeItem collection only; the review remained open.

## 11. Authoritative Recovery Contract

Reload latest reads the server-owned KnowledgeItem collection for the active organization, replaces the authoritative collection, reconciles matching `similarKnowledge` entries by ID, clears stale history presentation, and records the loaded current revision. It does not merge or write the local draft automatically.

## 12. Recovery UX Contract

The conflict banner tells the reviewer that the item changed elsewhere, that the unsaved review remains available, and that Reloading does not auto-merge or overwrite it. After reload it states that the latest server state was loaded and that the original action should be retried deliberately.

## 13. Conflict Logging Contract

Expected stale persistence conflicts use `console.warn` with a recoverable-conflict message. Unexpected persistence errors continue through the error path and remain `console.error` failures. Browser diagnostics recorded the expected learning-promotion warning and no new unexpected error during the acceptance sequence.

## 14. Root Cause Classification

The rejected write is an `EXPECTED_CONCURRENCY_CONFLICT`. The pre-repair product findings are classified as `RECOVERY_UX_DEFECT`, `LOCAL_STATE_LOSS_DEFECT` in the explicit contract/presentation sense, and `ERROR_CLASSIFICATION_DEFECT` where expected conflicts were previously logged like unexpected failures. The conflict origin is `TRUE_MULTI_CLIENT_CONFLICT`.

## 15. Repair Design

The minimal repair keeps server authority and optimistic concurrency unchanged. It adds structured diagnostics at the learning-command boundary, expected-conflict logging, explicit local-work preservation state, guarded latest loading, visible preservation/retry copy, and structured validation-route error details. No blind retry, automatic merge, migration, or provider change was introduced.

## 16. Production Changes

Changed files are `app/page.tsx`, `app/api/organizations/[organizationId]/commits/validation/route.ts`, `lib/application/learning/reflectionCommands.ts`, `package.json`, `scripts/nc-fix-010-optimistic-concurrency-reload-retry-probe.cjs`, `docs/CHANGELOG.md`, and this report. No Prisma schema or migration changed.

## 17. Stale-Write Safety Control

PASS. Direct stale PUTs still return HTTP 409 `REVISION_CONFLICT`; the newer row remains authoritative. The repair does not bypass expected revisions, convert conflicts to success, or weaken organization ownership checks.

## 18. Reload-Latest Control

PASS. Reload latest loads the current server revision and records it in recovery state. A late response is ignored when its captured organization-switch generation or organization ID no longer matches the active context. The browser flow confirmed the latest-state message.

## 19. Safe Retry Control

PASS. Retry is user-initiated after Reload latest. The permanent probe explicitly performs the retry with the refreshed snapshot, and the browser Tab B deliberately clicked the original Reflection commit action after reload. There is no automatic replay of the stale payload.

## 20. Local Edit Preservation

PASS. The local review, reviewed response, Reflection decision, and lesson draft remain in the active workspace state while the authoritative KnowledgeItem is refreshed. The UI explicitly communicates that Reload latest does not auto-merge or overwrite the local review.

## 21. Two-Client / Two-Tab Control

PASS. The permanent probe used two authorized clients. The browser rehearsal used two authenticated tabs in the same organization: Tab A committed first; Tab B received the stale conflict, reloaded, and retried successfully. The expected warning was visible in browser diagnostics.

## 22. Same-Client Self-Conflict

PASS / NOT APPLICABLE as an external race. No same-client self-conflict was observed. Existing request guards and serialized workflow writes remain in place; this repair does not weaken them or add a client-side retry loop.

## 23. Idempotent Replay

PASS. The new concurrency probe does not duplicate the KnowledgeItem row or operation when recovering. Existing governed learning and reuse idempotency probes remain passing. A deliberate retry is a new guarded operation against the new revision, not an accidental replay of the stale write.

## 24. Knowledge Revision Integrity

PASS. The probe ended with exactly one target row at revision 3 after one competing write and one deliberate retry. Stale content was not persisted, and the browser fixture was removed after acceptance.

## 25. Trust / Reuse Integrity

PASS. NC-FIX-006 reuse/source-ticket/idempotency evidence remains passing. NC-FIX-010 does not alter trust or reuse semantics; a concurrency conflict cannot be interpreted as customer-confirmed success or a successful reuse event.

## 26. Provenance Integrity

PASS. Authorization, source-ticket, validation, memory-change, and governed-operation provenance remain server-owned. The validation route now preserves safe structured conflict details without exposing unsafe internals.

## 27. Grounding-State Integrity

PASS. NC-FIX-009 grounding/cold-start evidence remains passing. Reloading KnowledgeItems does not fabricate grounded status for the current draft and does not convert a stale conflict into a grounding claim.

## 28. Navigation / Resume

PASS. Existing NC-FIX-001 and NC-FIX-008 evidence confirms durable in-review and post-resolution Reflection resume behavior. The repaired conflict path keeps the active Reflection open while authoritative knowledge is reloaded; it does not navigate away or discard the case review.

## 29. Authorization

PASS. The permanent probe confirmed an unauthorized user receives 403 before revision details are disclosed. No `currentRevision` was returned to the unauthorized caller. Authenticated conflict details remain limited to the authorized organization route.

## 30. Tenant Isolation

PASS. The probe included an unauthorized/cross-tenant access check and verified no conflict metadata leakage. The browser organization was disposable and was deleted by exact ID after verification; zero residual organization, user, knowledge, and ticket rows remained.

## 31. Normal No-Conflict Path

PASS. Client A's first write succeeded normally and advanced the row without a conflict. The production build and focused regressions showed no change to the normal save path.

## 32. Permanent Regression

PASS. New command: `npm.cmd run probe:nc-fix-010-concurrency-recovery`. Probe file: `scripts/nc-fix-010-optimistic-concurrency-reload-retry-probe.cjs`. It covers source-contract assertions, two-client load, competing write, stale 409, structured details, authoritative reload, explicit retry, no auto-retry, authorization, tenant isolation, and database row/revision integrity.

## 33. Browser Regression

PASS. A disposable browser account and organization were created through the UI. Two tabs reached Reflection, Tab A committed, Tab B hit the stale conflict, Reload latest displayed the authoritative-revision and preserved-review messages, and Tab B retried successfully. The only new diagnostic was the expected recoverable warning. Exact fixture cleanup was verified.

## 34. NC-FIX-001–009 Regression Results

PASS: NC-FIX-001 draft persistence; NC-FIX-002 multi-turn lifecycle; NC-FIX-003 resolution evidence/reflection gating; NC-FIX-004 response formatting; NC-FIX-006 reuse approval/source-ticket integrity; NC-FIX-007 retrieval compatibility (18/18); NC-FIX-008 post-resolution Reflection lifecycle; and NC-FIX-009 grounding/cold-start reconciliation. NC-FIX-005 latency evidence remains passing from its existing permanent probe and is unaffected by this repair.

## 35. Data Integrity

PASS. No production-like mature-state fixture was changed. The browser-only organization had seven disposable test tickets and one disposable KnowledgeItem; all were removed by exact organization/user identifiers and verified absent. No duplicate KnowledgeItem, validation, memory-change, trust, or reuse operation was introduced by NC-FIX-010.

## 36. Out-of-Scope Provider Finding

Provider-side 429/fallback behavior and broader retrieval/classification recall remain out of scope. No AI provider, model, timeout, retry, or fallback policy was changed. These are unrelated nonblocking follow-ups.

## 37. CHANGELOG.md Update

`docs/CHANGELOG.md` was updated under the post-v0.1.1 section with NC-FIX-010 Changed and Fixed entries, permanent/browser verification, and current status. The prior pending limitation line was removed.

## 38. Changelog Consistency

PASS. The changelog no longer records NC-FIX-010 as pending. It records the current work as unreleased post-v0.1.1 development and distinguishes this verified fix from release certification. The existing unrelated provider and retrieval limitations remain listed.

## 39. New Findings

No new NC-FIX-010 defect remains. The first browser rehearsal exposed a disposable fixture mismatch in the test setup, not a production concurrency failure; correcting the exact fixture's canonical database columns allowed the intended flow to complete. The transient first build attempt had a Windows worker `spawn UNKNOWN` failure; the immediate retry passed.

## 40. Release-Certification Impact

NC-FIX-010 is not itself a release certification. It removes the scoped concurrency-recovery UX finding and leaves the worktree unreleased. It is ready for a dedicated certification audit after normal operator review, subject to the unrelated follow-ups documented above.

## 41. Repository Changes

Implementation: `app/page.tsx`, `app/api/organizations/[organizationId]/commits/validation/route.ts`, and `lib/application/learning/reflectionCommands.ts`. Verification: `scripts/nc-fix-010-optimistic-concurrency-reload-retry-probe.cjs` and its package alias. Documentation: `docs/CHANGELOG.md` and this report. No migration, schema, release tag, commit, push, or external tracker mutation was made.

## 42. Recommendation

Proceed to a dedicated certification audit with NC-FIX-010 marked verified with follow-ups. Keep the explicit Reload latest and deliberate retry contract, retain the permanent probe in the release gate, and track provider 429/fallback and retrieval/classification limitations separately.

## 43. Final Verdict

`NC_FIX_010_VERIFIED_WITH_FOLLOWUPS`

Scoped optimistic-concurrency rejection, structured diagnostics, tenant-safe authoritative reload, local review preservation, deliberate retry, idempotency, and browser acceptance are verified. No NC-FIX-010 release blocker remains.
