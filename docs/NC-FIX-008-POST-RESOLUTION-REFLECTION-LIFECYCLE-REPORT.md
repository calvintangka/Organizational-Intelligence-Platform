## 1. Executive Summary

NC-FIX-008 diagnosed and repaired the contradiction exposed by NC-ACCEPT-001-FINAL: an evidence-backed resolved case could not prepare Reflection because the server only allowed `prepare_reflection` for active review states. The authoritative product contract is now explicit: a Reflection draft may be prepared before resolution, but validation requires a resolved case with durable resolution evidence; a resolved evidence-backed case may also prepare Reflection without reopening support history. The narrow server repair, permanent HTTP regression, focused regressions, production build, and fresh browser lifecycle all pass.

## 2. Final Verdict

`NC_FIX_008_VERIFIED_WITH_FOLLOWUPS`

NC-FIX-008 is complete and NC-ACCEPT-001-FINAL is READY to rerun. One unrelated presentation finding remains: the UI can label a cold-start draft as grounded in organizational memory even when persistence reports no KnowledgeItem and empty grounding IDs. That finding is out of scope for this lifecycle repair.

## 3. Baseline

- Run date: 2026-08-11; timezone: Asia/Jakarta (SE Asia Standard Time).
- Branch: `master`.
- HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`; `v0.1.1-certified` still resolved to that HEAD.
- Node v24.14.1; npm 11.11.0; Prisma CLI/client 7.9.1; TypeScript 5.9.3.
- PostgreSQL was reachable at `127.0.0.1:5432`; Prisma validation passed; the database was up to date with 25 existing migrations.
- The worktree was already dirty before NC-FIX-008: 25 tracked files modified, 2,118 insertions and 371 deletions, plus pre-existing NC-FIX/RSS reports, scripts, routes, library code, and migrations. Existing changes were preserved.
- Baseline scripts included NC-FIX-002, NC-FIX-003, NC-FIX-006, NC-ACCEPT-001, and the prior NC-ACCEPT-001-FINAL report; no prior NC-FIX-008 script existed.
- No reset, stash, clean, commit, push, tag, or release action was performed.

## 4. Original NC-ACCEPT-001-FINAL Failure

The original browser acceptance created a cold-start NusaCloud organization, persisted the first case, sent an agent response, captured same-case customer confirmation, recorded resolution evidence, and resolved the case. The next normal action, `Approve & Continue to Reflection`, returned `A Reflection can only be prepared for an active review case.` The resolved TicketRecord had `validationEligible: true`, evidence IDs, no prepared Reflection, no validation record, and no KnowledgeItem.

## 5. Lifecycle Source Inventory

| Component | Responsibility | Current contract and NC-FIX-008 impact |
|---|---|---|
| `lib/server/tickets/ticketWorkflow.ts` | Server-owned ticket state transitions and audit rows | `resolve_with_evidence` makes a case `resolved` and sets evidence-backed eligibility; `prepare_reflection` was incorrectly limited to active states; `commit` now preserves support resolution metadata when already resolved. |
| `app/api/.../tickets/[ticketId]/transition/route.ts` | Authenticated transition API | Parses `prepare_reflection`, `resolve_with_evidence`, and `commit`; authorization remains route/server-owned. |
| `app/page.tsx` | Browser lifecycle controller | Calls Reflection preparation, requires resolved plus `validationEligible` for validation, and commits learning through the server transition. No client authority change was made. |
| `components/ReflectionPanel.tsx` | Human Reflection/lesson editing and validation UI | Keeps validation disabled when the server-provided eligibility is false; unchanged by this fix. |
| `lib/server/persistenceService.ts` | Durable validation/memory commit | Requires every source ticket to be resolved and to have durable resolution evidence; tenant and provenance checks remain authoritative. |
| `lib/application/learning/reflectionCommands.ts` | Reflection generation, validation normalization, and promotion command | Human validation and idempotent promotion path remained unchanged. |
| Prisma `TicketRecord` JSON fields and transition audits | Durable state, evidence links, validation links, and audit history | No schema migration was needed. |
| NC-FIX-008 probe | Permanent server regression | Added exact lifecycle, safety, persistence, tenant, provenance, idempotency, and immutability assertions. |

## 6. Failure Reproduction

The failure reproduced in a fresh browser-created disposable organization `NusaCloud NC-FIX-008 msoc924a`, ID `org-5dad9139-8c1f-437b-9a9c-6a394931ba6f`, TicketRecord `NN-20260811-0001`. Statuses were `waiting_for_customer` after send, `in_review` after same-case customer confirmation, and `resolved` after customer-confirmation evidence. The server response to `prepare_reflection` was a 409 workflow error with the exact original message. Persistence after rejection retained `status: resolved`, `validationEligible: true`, the evidence ID, and no prepared decision. The disposable organization was removed after capture.

## 7. Existing Reflection Eligibility Contract

Before the fix, active `in_review` or `waiting_for_customer` cases could prepare a preliminary Reflection, which was stored with `validationEligible: false` and an evidence-required reason. `resolve_with_evidence` then set `validationEligible: true`. The UI validation path required `status === resolved` and `validationEligible === true`. This showed that the active-state restriction protected the old draft stage but contradicted the later resolved-validation stage.

## 8. Existing Resolution Contract

Resolution evidence may be customer confirmation, agent verification, or manual verified resolution. Customer confirmation must reference a customer message belonging to the same organization and TicketRecord. `resolve_with_evidence` accepts only an actionable unresolved case, verifies evidence ownership, persists `resolved`, records `resolvedBy`, and stores all evidence IDs. The persistence service separately blocks validation when a source ticket is unresolved or has no durable evidence.

## 9. Root Cause

The root cause was a stale state guard in `prepare_reflection`: it accepted only `in_review` and `waiting_for_customer`, even though the surrounding product contract had already made resolved evidence-backed cases eligible for Reflection validation. The guard was not required to protect evidence safety because `requireResolutionEvidence` and the resolved-state validation/promotion checks already provide that authority.

## 10. Authoritative Lifecycle Decision

The reconciled contract supports both stages with distinct semantics:

- `in_review` or `waiting_for_customer` → Reflection preparation is allowed as an unvalidated draft; it cannot promote memory.
- `in_review` or `waiting_for_customer` → evidence attachment is allowed; it sets eligibility false until resolution.
- `resolved` + server-found durable resolution evidence → Reflection preparation is allowed and remains `validationEligible: true`.
- `resolved` + prepared Reflection → human validation may proceed through the existing server-authoritative promotion flow.
- A resolved case does not reopen support conversation history. Reflection is learning metadata only.
- A duplicate preparation is safely rejected with 409; duplicate promotion replays the existing idempotent validation result.
- Resolved support outcome metadata remains immutable during the later learning commit.

## 11. Safety Invariants

The repair preserves: no-evidence promotion blocking; sent response and Waiting for customer not proving resolution; draft Reflection not equaling memory; resolved status alone not authorizing learning; human/server validation; canonical TicketRecord provenance; tenant isolation; duplicate/concurrent safety; trust/applicability semantics; and reuse/outcome separation.

## 12. Repair Design

The smallest safe repair was to extend only `prepare_reflection` for `status === resolved`, call the existing server-side `requireResolutionEvidence`, preserve `validationEligible: true` and evidence IDs, and reject a pre-existing prepared decision. The existing active-case draft behavior remains unchanged. A second narrow adjustment makes a learning `commit` preserve `resolvedAt`, `resolvedBy`, final response, human-edit state, resolution mode, and evidence IDs when the TicketRecord is already resolved. No schema change or client-side authority change was needed.

## 13. Production Changes

- `lib/server/tickets/ticketWorkflow.ts`: post-resolution evidence-backed Reflection eligibility, duplicate-preparation rejection, and resolved-case support metadata preservation during learning commit.
- `package.json`: added `probe:nc-fix-008-post-resolution-reflection`.
- No migration was added.

## 14. Server-Authority Verification

The permanent probe passed direct authenticated HTTP checks. No-evidence validation returned `RESOLUTION_EVIDENCE_REQUIRED`; customer confirmation was source-linked; evidence-backed resolution succeeded; resolved Reflection preparation succeeded; duplicate preparation returned 409 without a second preparation audit; wrong-tenant and unauthorized access were rejected; missing source-ticket validation was rejected; validation created one candidate, one validation, one memory change, and one KnowledgeItem; replay returned `replayed: true` without duplicate semantic records.

## 15. Exact Lifecycle Regression

`scripts/nc-fix-008-post-resolution-reflection-lifecycle-probe.cjs` follows the mandatory exact order through legitimate HTTP ticket creation and transition endpoints: persisted case → agent response → Waiting for customer → same-case customer confirmation → evidence → resolve → post-resolution Reflection → restart/logout-login resume → validation/promotion. It passed all assertions, including canonical provenance, agent-verification evidence, duplicate preparation safety, and resolved support metadata immutability.

## 16. Premature Promotion Negative Control

PASS. Validation before resolution evidence returned 409 `RESOLUTION_EVIDENCE_REQUIRED`. No KnowledgeItem, ValidationRecord, or MemoryChangeRecord was created by the premature attempt.

## 17. Customer Confirmation Control

PASS. The browser and server regression used the canonical customer confirmation, linked it to `ticket-message-NN-20260811-0001-3`, resolved the same TicketRecord, and carried the evidence ID through Reflection, validation, and memory provenance.

## 18. Agent Verification Control

PASS. The NC-FIX-008 server probe accepted an agent-verification evidence type on a separate disposable tenant case. Existing NC-FIX-003 agent-verification and manual-verification checks also passed.

## 19. Reflection Persistence

PASS. After post-resolution preparation, the server probe restarted the application and performed logout/login recovery. The same resolved TicketRecord retained `reflection.preparedDecision`, `validationEligible: true`, evidence IDs, and ordered conversation history. No duplicate preparation record was created.

## 20. Human Validation

PASS. The fresh browser run displayed the Reflection editor, required a problem name and lesson fields for the new issue type, and completed `Validate & Commit to Organizational Memory`. The server-created ValidationRecord was durable and linked to the authenticated reviewer.

## 21. Organizational Memory Promotion

PASS. Fresh browser persistence created KnowledgeItem `canonical-mobile-clock-in-location-permission-disabled`, Lesson `lesson-15483b07`, ValidationRecord `validation-93b03845`, and MemoryChangeRecord `memory-change-93b03845`. Initial `timesReused` was 0. The lesson remained bounded to disabled NusaCloud location permission rather than universalizing all clock-in failures.

## 22. Provenance Chain

PASS. KnowledgeItem `sourceTicketId` was canonical `NN-20260811-0001`; its durable provenance included the same source TicketRecord and organization; the validation and memory records belonged to the same tenant; resolution evidence `resolution-evidence-003d14ee-1251-450c-b04c-a00b3613577f` referenced `ticket-message-NN-20260811-0001-3`. The internal generalized lesson representation used its existing opaque evidence reference, while canonical source-ticket provenance remained the TicketRecord/KnowledgeItem link.

## 23. Idempotency / Concurrency

PASS. Duplicate Reflection preparation was safely rejected. Duplicate validation/promotion replay returned the prior committed result and left one ValidationRecord, one MemoryChangeRecord, and one KnowledgeItem. Existing NC-FIX-003 concurrent resolution and NC-FIX-006 concurrent reuse checks also passed.

## 24. Resolved-Case Integrity

PASS after the second narrow repair. Read-only before/after comparison showed `resolvedAt`, `resolvedBy`, final response, human-edit state, and evidence IDs unchanged when learning commit followed resolution. Customer and agent messages, evidence, canonical TicketRecord identity, and tenant ownership remained unchanged.

## 25. Browser Regression

PASS. A fresh rebuilt production browser run completed first case creation, cold-start retrieval, response send, same-case customer follow-up, evidence capture, resolution, post-resolution `Approve & Continue to Reflection`, Reflection editing, human validation, and KnowledgeItem creation. A clean post-fix browser tab showed the promoted knowledge and zero error/warning console entries. The reused diagnostic tab retained only the earlier pre-fix console entry; it was not a new post-fix error.

## 26. NC-FIX-001–007 Regression Results

- NC-FIX-001 draft persistence: PASS.
- NC-FIX-002 multi-turn conversation: PASS.
- NC-FIX-003 resolution evidence/Reflection gating: PASS.
- NC-FIX-004 response formatting: PASS.
- NC-FIX-006 knowledge reuse/source-ticket integrity: PASS.
- NC-FIX-007 compatibility: 18/18 PASS.
- Prisma validation: PASS.
- Production build: PASS.

One initial parallel run produced a transient NC-FIX-001 500 from disposable-server contention; its isolated rerun passed, and the final sequential regression run passed.

## 27. Data Integrity

The final browser acceptance organization was isolated and removed by exact organization/account IDs after evidence capture. The final pre-cleanup state had one TicketRecord, three ordered messages, one customer-confirmation evidence row, one ValidationRecord, one MemoryChangeRecord, and one KnowledgeItem. No migration was added. No broad data deletion or protected-state mutation occurred.

## 28. Secondary UI Finding

REPRODUCED independently and kept out of NC-FIX-008 scope. After the customer follow-up, the UI displayed `AI draft grounded in organizational memory` while the acceptance organization still had zero KnowledgeItems, `memoryMatch: none`, and empty grounding IDs. The same screen also retained contradictory cold-start copy. Persistence and server authorization did not show unauthorized knowledge influence. Recommended separate task: `NC-FIX-009 — Grounding and Cold-Start UI Label Reconciliation`.

## 29. New Findings

No new acceptance-blocking product defect or regression was found. The only remaining finding is the out-of-scope presentation inconsistency in section 28. Protected audit output remained `PASS_WITH_FINDINGS` with zero release-blocking findings and an unchanged protected digest.

## 30. NC-ACCEPT-001-FINAL Readiness

READY. A fresh browser-created NusaCloud case can now complete customer confirmation → resolution evidence → resolution → Reflection → human validation → Organizational Memory without bypasses. NC-ACCEPT-001-FINAL itself was not declared accepted by this task; it should be rerun as a separate acceptance task.

## 31. Repository Changes

Added:

- `docs/NC-FIX-008-POST-RESOLUTION-REFLECTION-LIFECYCLE-REPORT.md`.
- `scripts/nc-fix-008-post-resolution-reflection-lifecycle-probe.cjs`.

Changed:

- `lib/server/tickets/ticketWorkflow.ts`.
- `package.json`.

No tests/expectations or fixtures were weakened, no protected database state was intentionally mutated, and no commit, push, tag, or release was created.

## 32. Recommendation

Mark NC-FIX-008 verified with follow-ups. Proceed to a fresh NC-ACCEPT-001-FINAL rerun using the exact original phase order. Track the unrelated UI label inconsistency separately as NC-FIX-009; do not expand the lifecycle repair to change grounding semantics.

## 33. Final Verdict

Task: NC-FIX-008 — Post-Resolution Reflection Lifecycle / Acceptance Contract Reconciliation  
Final verdict: `NC_FIX_008_VERIFIED_WITH_FOLLOWUPS`  
Original failure reproduced: YES  
Original error: `A Reflection can only be prepared for an active review case.`  
Root cause: stale active-case-only `prepare_reflection` guard contradicted resolved evidence-backed validation state.  
Authoritative lifecycle: pre-resolution Reflection drafts remain unvalidated; resolved cases with server-verified durable evidence may prepare Reflection; human validation and promotion remain separate.  
Reflection allowed after evidence-backed resolution: YES  
No-evidence promotion blocked: PASS  
Resolved-without-valid-evidence bypass: BLOCKED  
Server authority: PASS  
Customer-confirmation evidence: PASS  
Agent-verification evidence: PASS  
Post-resolution Reflection preparation: PASS  
Reflection persistence: PASS  
Human validation: PASS  
Organizational Memory promotion: PASS  
KnowledgeItem created: `canonical-mobile-clock-in-location-permission-disabled`  
Lesson created: `lesson-15483b07`  
Canonical source TicketRecord: `NN-20260811-0001`  
Provenance integrity: PASS  
Tenant isolation: PASS  
Duplicate Reflection preparation: PASS  
Duplicate promotion: PASS  
Resolved-case support evidence unchanged: PASS  
Browser exact lifecycle: PASS  
Original browser error still occurs: NO in clean post-fix browser validation  
NC-FIX-001 regression: PASS  
NC-FIX-002 regression: PASS  
NC-FIX-003 regression: PASS  
NC-FIX-004 regression: PASS  
NC-FIX-006 regression: PASS  
NC-FIX-007 compatibility: 18/18  
TypeScript: PASS via production build  
Prisma: PASS  
Production build: PASS  
Protected Developer Demo state: UNCHANGED  
Historical NusaCloud evidence: UNCHANGED  
Secondary grounded-memory UI label reproduced: YES  
Current product defects: NONE blocking; out-of-scope UI label inconsistency remains  
New regressions: NONE  
Recommended follow-ups: NC-ACCEPT-001-FINAL rerun; NC-FIX-009 UI label reconciliation  
NC-ACCEPT-001-FINAL: READY  
Exact blocker: NONE for NC-FIX-008; separate final acceptance rerun required  
Production files changed: `lib/server/tickets/ticketWorkflow.ts`  
Test/probe files added or changed: `scripts/nc-fix-008-post-resolution-reflection-lifecycle-probe.cjs`; `package.json` alias  
Migration added: NO  
Database intentionally mutated outside disposable test data: NO  
Commit created: NO  
Push performed: NO  
Tags modified: NO  
Release published: NO  
Report: `docs/NC-FIX-008-POST-RESOLUTION-REFLECTION-LIFECYCLE-REPORT.md`  
Recommended next step: NC-ACCEPT-001-FINAL rerun.
