# NC-FIX-009 — Grounding and Cold-Start UI Label Reconciliation

## 1. Executive Summary

NC-FIX-009 is verified. The defect was presentation-only: the multi-turn follow-up path hard-coded `memory_grounded` after a customer reply even when the server persisted no KnowledgeItem match and an empty `basedOnKnowledgeIds` list.

## 2. Final Verdict

`NC_FIX_009_VERIFIED`

## 3. Baseline

Baseline date: 2026-08-11. Branch: `master`. Baseline HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`. The worktree already contained the NC-FIX-001 through NC-FIX-008 implementation/report changes and other user-owned changes; those changes were preserved. PostgreSQL reported all 25 migrations applied.

## 4. Source Finding

The immediate defect was `app/page.tsx` in the durable customer-follow-up state update. It rebuilt the response with `draftMode: "memory_grounded"` and a conversation-context label rather than carrying forward the computed follow-up response fields. The resume path also inferred memory grounding from `draftSource === "ai_advisory"` instead of persisted memory state.

## 5. Grounding UI Inventory

Grounding copy was found in `components/views/TicketWorkspace.tsx`, `components/ProvenancePanel.tsx`, and the OIP reasoning timeline. Before the repair, those surfaces trusted `draftMode`/AI source without independently checking the grounding identifiers.

## 6. Server / API Grounding Inventory

The authoritative ticket record was `N1-20260811-0001` in disposable organization `org-af1ced0d-f3f8-4b3d-8222-2c0f87e16900`. After the follow-up, PostgreSQL contained no KnowledgeItem for that organization; `memoryMatch` was `{ matchType: "none", knowledgeId: null, lessonId: null }`; the persisted draft contained `draftMode: "cold_start"`, `groundingLabel: "no organizational knowledge"`, and `basedOnKnowledgeIds: []`.

## 7. Reproduction

The cold-start ticket initially showed the truthful no-memory copy. After sending the first response and adding the first customer follow-up, the UI showed `AI draft grounded in organizational memory` while OIP reasoning still showed `No knowledge match — cold start` and the memory panel showed no match.

## 8. Authoritative Grounding State

For this contract, a grounded label requires an authorized KnowledgeItem id in `basedOnKnowledgeIds`. The approved organization-profile path is the only intentional exception because it is explicit profile grounding rather than KnowledgeItem reuse. AI provider success, `draftSource: "ai_advisory"`, or a conversation context is not grounding evidence.

## 9. Root Cause

The follow-up response object overwrote authoritative grounding metadata after the server-side draft had already correctly determined cold-start state. The resume path had the same class of presentation drift by treating any AI advisory source as memory grounded.

## 10. Presentation-Only Verification

No retrieval, compatibility, ranking, trust, reuse approval, evidence, reflection, schema, or persistence workflow was changed. The repair reconciles displayed response state against the existing authoritative identifiers and preserves the server result.

## 11. UI Semantic Contract

`memory_grounded` and `lesson_grounded` copy is displayed only when `basedOnKnowledgeIds` is non-empty, or when `groundingLabel` is explicitly `organization profile`. Otherwise the presentation state is normalized to `cold_start` with `no organizational knowledge` copy.

## 12. Positive / Negative Label Matrix

| Scenario | Expected | Result |
|---|---|---|
| Cold start | No grounded label | Pass |
| Follow-up before memory exists | No grounded label | Pass |
| Validated similar case | Grounding shown | Pass |
| Incompatible candidate | No grounding | Pass |
| Generic Uncategorized negative | No grounding | Pass |
| Strong compatible Uncategorized positive | Grounding only after selection | Pass in NC-FIX-007 probe |
| Negated root cause | No grounding | Pass |
| Resume | Same truthful state | Pass |
| Cross-case / tenant isolation | No foreign grounding | Pass |

## 13. Repair Design

The repair has three parts: preserve `followUpDraft.draftMode` and `followUpDraft.groundingLabel`; derive resumed state from `memoryMatch` rather than AI source; and apply a shared presentation guard in both grounding-copy surfaces.

## 14. Production Changes

Added `lib/groundingPresentation.ts`, imported it from `TicketWorkspace` and `ProvenancePanel`, corrected the follow-up and resume derivation in `app/page.tsx`, and added the required package alias and permanent probe. No database migration was added.

## 15. Cold-Start Negative Regression

The repaired browser flow initially displayed `AI suggestion - no organizational knowledge exists yet; this draft is not based on validated memory`, `No knowledge match`, and cold-start memory copy. After the first response and follow-up, it remained cold start and did not display any organizational-memory grounding label.

## 16. True Grounding Positive Regression

A controlled disposable approved-memory fixture with a validated lesson for mobile clock-in/location permission produced `Lesson-informed draft`, `Knowledge Used`, and `Grounded Organizational Memory authorized`. The positive path remained grounded after the presentation guard.

## 17. Incompatible Candidate Control

An incompatible payroll-password ticket in the disposable organization produced `No knowledge match — cold start` and no grounded label while the mobile lesson existed. NC-FIX-007 compatibility assertions also passed.

## 18. Uncategorized Controls

The browser generic Uncategorized/login case did not reuse the mobile memory. The permanent NC-FIX-007 probe passed both the generic Uncategorized negative and the strong compatible Uncategorized positive selection control.

## 19. Negation Control

The browser negation case stated that location permission was already enabled and GPS worked correctly. It produced no memory match and no grounded label.

## 20. Navigation / Resume Consistency

The original cold-start case was opened through Cases, inspected, and resumed in the workspace. Resume showed `No knowledge match — cold start`, `No template available`, and no organizational-memory grounding label.

## 21. Multi-Case State Isolation

The browser used separate ticket ids for cold start, positive, incompatible, and negation cases. The cross-tenant NC-FIX-007 probe passed, and the disposable organization was removed after testing.

## 22. Server / Persistence / UI Reconciliation

The pre-repair mismatch was proven against the same ticket row: the UI label claimed memory while the persisted row retained `memoryMatch.none`, no KnowledgeItem, cold-start draft mode, and empty grounding ids. After repair, the UI matched those persisted values.

## 23. Permanent Regression

`npm.cmd run probe:nc-fix-009-grounding-ui-state` passed 6/6 assertions, covering cold-start follow-up normalization, missing lesson ids, selected memory, selected lesson, organization-profile grounding, and truthful cold-start stability. The probe reports zero database writes and zero residual rows.

## 24. Browser Regression

Browser acceptance ran against the current application on a disposable local workspace. It covered cold-start initial state, cold-start follow-up, validated-memory positive, incompatible candidate, generic negative, negation, Case Lookup/resume, and cleanup. All observed outcomes matched the matrix.

## 25. Copy / Terminology Review

The repair keeps existing terminology and avoids broad copy redesign. Cold start says no validated organizational knowledge exists; grounded copy is reserved for an authorized KnowledgeItem or explicit organization profile; no provider-success wording is treated as grounding evidence.

## 26. NC-FIX-001–008 Regression Results

All required probes passed: NC-FIX-001 draft persistence, NC-FIX-002 multi-turn conversation, NC-FIX-003 resolution evidence/reflection gating, NC-FIX-004 response formatting, NC-FIX-005 AI draft latency, NC-FIX-006 knowledge reuse/source-ticket integrity, NC-FIX-007 retrieval compatibility, and NC-FIX-008 post-resolution Reflection lifecycle.

## 27. Data Integrity

The disposable organization, user, KnowledgeItems, tickets, and related rows were deleted by exact organization/user identifiers. Final verification returned zero NC-FIX-009 organizations, zero KnowledgeItems, zero tickets, and zero disposable users. Protected Developer Demo integrity remained `PASS_WITH_FINDINGS` with `releaseBlockingFindings: 0`; the protected digest remained `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4` before and after.

## 28. Out-of-Scope Findings

NC-FIX-010 stale-concurrency handling and provider 429 warnings remain out of scope. They were not modified or reclassified by this fix.

## 29. New Findings

No new NC-FIX-009 findings were identified after the repair. The only observed pre-repair issue was the presentation mismatch documented above.

## 30. Release-Certification Impact

The change is low-risk and presentation-only. It adds no migration, preserves existing server authority, passes TypeScript compilation, and passes the production build.

## 31. Repository Changes

Relevant additions/edits are `app/page.tsx`, `components/views/TicketWorkspace.tsx`, `components/ProvenancePanel.tsx`, `lib/groundingPresentation.ts`, `scripts/nc-fix-009-grounding-ui-state-reconciliation-probe.cjs`, `package.json`, and this report. Existing unrelated dirty-worktree changes were preserved.

## 32. Recommendation

Accept NC-FIX-009 for release. Keep the permanent probe in the regression suite and treat `basedOnKnowledgeIds`/explicit profile grounding as the presentation contract for future label changes.

## 33. Final Verdict

`NC_FIX_009_VERIFIED`
