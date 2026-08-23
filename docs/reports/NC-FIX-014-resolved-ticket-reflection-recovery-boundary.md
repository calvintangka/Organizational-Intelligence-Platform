# NC-FIX-014 — Resolved Ticket Reflection Recovery Boundary

Authorized repair task. Restores a UI recovery path for resolved,
evidence-eligible tickets whose Reflection has not yet been prepared, without changing
resolution, human review, identity validation, or promotion semantics. No push, deployment,
tag, commit, or protected-case mutation was performed.

---

## 1. Executive Summary

The repair adds a narrow recovery path for the confirmed dead-end state:

```text
resolved + resolution evidence + validationEligible=true + no preparedDecision + no decision
```

The workspace resume guard and the Cases detail resume action now share a pure predicate in
`lib/ticketReflectionRecovery.ts`. A resolved, eligible, not-prepared ticket is resumable and
is labeled "Prepare Reflection" in Cases; resuming it restores human review, and the existing
"Approve & Continue to Reflection" action performs the existing `prepare_reflection`
transition. The server evidence gate and promotion controls are unchanged.

Verification: a new permanent probe (`probe:nc-fix-014-resolved-reflection-recovery`) passes,
as do the NC-FIX-011 and NC-FIX-012 probes and `tsc --noEmit`. Protected real-world cases and
the database are unchanged, and no disposable rows remain.

---

## 2. Previous Findings Reconciliation

- NC-FIX-014R established the dead-end state and that NC-FIX-012 was not causal.
- Re-verified against current code before editing:
  - `resolve_with_evidence` does not prepare Reflection (ticketWorkflow.ts:700-719).
  - `prepare_reflection` remains a separate transition (ticketWorkflow.ts:278-301).
  - `resumeTicketFromRecord` previously required `preparedDecision` (app/page.tsx).
  - `CaseLookupView` previously required `preparedDecision` for the resume action.
  - `NC-20260818-0004` is the reproduction (resolved, eligible, no preparedDecision).
  - NC-FIX-012 (`763b2c8`) does not touch this lifecycle.

No prior finding was contradicted by the current HEAD.

---

## 3. Baseline

- Branch: `landing/option-c32-release-polish`
- HEAD: `763b2c805e3f20ca87c7599c54b26c2e55644a70` (NC-FIX-012 commit, untouched)
- Worktree at start: 4 untracked reports from prior tasks; no tracked modifications
- Stash: `stash@{0}` intact (`bd2240f`)
- Package version: `0.2.0`

---

## 4. Root Cause

OBSERVED FACT (from NC-FIX-014R): `resolve_with_evidence` marks a ticket resolved and
`validationEligible=true`, but never creates `preparedDecision`. Reflection preparation is a
separate explicit transition triggered only by the UI "Approve & Continue to Reflection"
action. The UI previously exposed Reflection recovery for resolved tickets **only** when
`preparedDecision` already existed. Therefore a resolved, eligible, not-prepared ticket had no
reachable Reflection action and displayed "No reflection recorded yet".

INFERRED BEHAVIOR (not persisted): for `NC-20260818-0004`, the explicit approve/prepare step
was not executed; no prepare audit, no "Reflection initiated" log, and no preparedDecision
exist.

---

## 5. Intended Invariant

```text
resolved
  + resolution evidence exists
  + validationEligible = true
  + preparedDecision = absent
  + decision = null
      ↓
  user can explicitly resume/prepare Reflection
      ↓
  prepare_reflection (existing transition)
      ↓
  preparedDecision persisted
      ↓
  existing human review → validation → promotion (unchanged)
```

The repair is recoverability only. It does not auto-promote, auto-create lessons, or mutate
knowledge memory.

---

## 6. Selected Repair Boundary

Selected: **Option D — Combined UI + existing `prepare_reflection` transition** (the smallest
justified change).

- Necessary because the server transition already supports `prepare_reflection` from the
  resolved+evidence state; only the UI recovery entry point was missing.
- Alternatives rejected: modifying `resolve_with_evidence` to auto-prepare (would change
  resolution semantics and move toward automatic learning); reconstructing/preparing inside
  `resumeTicketFromRecord` (would duplicate the existing human-review generation path);
  changing the server transition or schema (unnecessary).
- Affected files: `app/page.tsx`, `components/views/CaseLookupView.tsx`,
  `lib/ticketReflectionRecovery.ts` (new), `package.json` (probe alias),
  `scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs` (new).
- Invariants preserved: evidence gate (server unchanged), human review (unchanged approve
  step), identity/promotion controls (untouched), tenant scoping (server transition remains
  organization-scoped).

---

## 7. Files Modified

IMPLEMENTED CHANGE:

```text
M  app/page.tsx
M  components/views/CaseLookupView.tsx
M  package.json
M  docs/CHANGELOG.md
A  lib/ticketReflectionRecovery.ts
A  scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs
```

The `app/page.tsx` diff is the import, the resume-guard replacement, and its comment; a single
trailing blank line is also normalized (non-functional).

---

## 8. Disposable Regression Design

`scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs` uses the repository probe harness
and the real `applyTicketWorkflowCommand` service with a disposable PostgreSQL organization
(`nc-fix-014-*`). It seeds:

- ticket A: resolved + evidence + eligible + no preparedDecision;
- ticket B: resolved + no evidence + eligible;
- ticket C: resolved + evidence + already preparedDecision;
- ticket D: resolved + evidence + eligible + no preparedDecision, in a second organization.

It cleans up the disposable organizations before exit and never touches protected cases.

---

## 9. Regression Results

REGRESSION EVIDENCE:

```text
node scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs  → PASS
node scripts/nc-fix-011-human-reflection-promotion-safety-reconciliation-probe.cjs → PASS
node scripts/nc-fix-012-real-world-reflection-provenance-boundary-probe.cjs → PASS
npx tsc --noEmit                                              → PASS (exit 0)
git diff --check                                              → PASS (exit 0)
```

NC-FIX-014 probe output:

```json
{
  "recoveryPredicate": true,
  "successfulPreparation": true,
  "evidenceGatePreserved": true,
  "noAutomaticPromotion": true,
  "duplicatePreparationGuarded": true,
  "tenantIsolation": true
}
```

---

## 10. Evidence-Gate Verification

REPRODUCED BEHAVIOR: `applyTicketWorkflowCommand` for a resolved ticket with no resolution
evidence throws `TicketWriteError` code `RESOLUTION_EVIDENCE_REQUIRED` (409). The UI predicate
treats `resolved + validationEligible=false` as non-resumable. The server `requireResolutionEvidence`
gate was not modified.

---

## 11. No-Automatic-Promotion Verification

REPRODUCED BEHAVIOR: after `prepare_reflection`, the persisted record has
`preparedDecision != null`, `decision = null`, empty `validationRecordIds`, and the disposable
organization has zero `validation_records`, `knowledge_items`, and `memory_change_records`.
Preparation does not promote knowledge.

---

## 12. NC-FIX-012 Regression Verification

REGRESSION EVIDENCE: the NC-FIX-012 permanent probe passes unchanged. No NC-FIX-012 file was
modified. `effectiveReusablePromotionDraft()` and `lib/reflectionSafety.ts` are byte-identical
to the NC-FIX-012 commit.

---

## 13. NC-FIX-013 Contamination Check

OBSERVED FACT: the complete diff contains no `countOpenTicketRecords`, `openTickets`,
`open-ticket`, `nc-fix-013`, or `NC-FIX-013` changes. No NC-FIX-013 work was recovered.

---

## 14. Protected Case Integrity

OBSERVED FACT (read-only re-query after all tests):

| Case | status | decision | prepared | validationRecordIds | unchanged |
|---|---|---|---|---|---|
| NC-20260812-0001 | resolved | create_new | no | [validation-ad55ada9] | YES |
| NC-20260818-0003 | resolved | create_new | no | [validation-2efa4898] | YES |
| NC-20260818-0004 | resolved | null | no | [] | YES |

Protected organization row counts unchanged (4 tickets, 2 knowledge items, 2 validation
records, 2 memory changes, 2 candidates, 21 messages, 4 evidence rows).

`NC-20260818-0004` recoverability by the repaired path: **YES** (resolved + eligible + no
preparedDecision → `reflectionRecoveryNeeded=true`); requires explicit user action: **YES**
(resume then "Approve & Continue to Reflection"); current persisted state unchanged: **YES**
(no mutation performed).

---

## 15. Database Safety

- No schema change, no migration.
- No production database writes; the only writes were disposable `nc-fix-014-*` rows created
  and removed by the probe.
- Verified zero leftover disposable organizations/tickets after cleanup.

---

## 16. Stash Integrity

OBSERVED FACT: `stash@{0}` remains
`WIP: NC-FIX-012/013 uncommitted work preserved from landing/option-b-cinematic before Option C`
(`bd2240f`). It was not popped, applied, dropped, branched, or rewritten.

---

## 17. Git Status

```text
M  app/page.tsx
M  components/views/CaseLookupView.tsx
M  docs/CHANGELOG.md
M  package.json
?? lib/ticketReflectionRecovery.ts
?? scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs
?? docs/reports/NC-FIX-012R-reflection-promotion-identity-boundary-investigation.md
?? docs/reports/NC-FIX-012R2-STASH-RECOVERY-CONTRACT-AUDIT-REPORT.md
?? docs/reports/NC-FIX-012R3-COMMIT-READINESS-FINAL-VERIFICATION-REPORT.md
?? docs/reports/NC-FIX-014R-resolved-ticket-reflection-availability-boundary-investigation.md
```

HEAD remains `763b2c8`. Nothing was staged or committed.

---

## 18. Remaining Risks

- The browser acceptance used a disposable organization and was completed before cleanup.
- The browser acceptance did not perform final knowledge promotion; it verified that human
  review and the existing validation gate remain present.
- The exact commit was still pending when this evidence report was assembled.

---

## 19. Final Classification

```text
NC_FIX_014_REPAIR_REQUIRED          (previously established)
NC_FIX_014_REPAIR_IMPLEMENTED
NC_FIX_014_PROBE_RECONSTRUCTED      (new permanent probe)
NC_FIX_014_PROBE_PASS
NC_FIX_014_EVIDENCE_GATE_PRESERVED
NC_FIX_014_NO_AUTOMATIC_PROMOTION
NC_FIX_014_NC_FIX_012_PRESERVED
NC_FIX_014_PROTECTED_CASES_UNCHANGED
NC_FIX_014_REAL_CASE_REQUIRES_EXPLICIT_RECOVERY
```

No `NC_FIX_014_NC_FIX_013_CONTAMINATION` (none found).

---

## 20. Final Verdict

```text
NC_FIX_014_REPAIRED_AND_VERIFIED
```

The recovered workflow makes a resolved, evidence-eligible, not-prepared ticket safely
recoverable through the existing Reflection lifecycle, without bypassing evidence, human
review, identity validation, or promotion controls. NC-FIX-011, NC-FIX-012, and NC-FIX-014
probes pass; TypeScript passes; protected cases, the database, and the stash are unchanged;
no push, deployment, tag, or commit was performed.

---

# NC-FIX-014A — Real-UI Acceptance, Commit Readiness & Exact Commit Addendum

## 21. Executive Summary

Real-browser acceptance passed on a fresh disposable organization using the normal product
UI. The case was created, answered, reopened by customer confirmation, resolved with valid
customer-confirmation evidence, discovered in Cases, recovered through **Prepare Reflection**,
returned to Human Review, and advanced through the existing `prepare_reflection` transition.
The ticket stayed resolved, evidence and conversation history remained intact, Reflection
became prepared for human validation, and no KnowledgeItem, ValidationRecord, or memory change
was created.

## 22. Original Dead-End State

Disposable organization: `org-7437b0f6-8887-4681-9428-3509f4c43620`
(`NC-FIX-014A Browser QA`). Disposable ticket: `NB-20260823-0001`.

Before recovery, readback showed:

- `status: resolved`
- valid `customer_confirmation` evidence present
- `reflection.validationEligible: true`
- `reflection.preparedDecision: absent`
- `reflection.decision: null`
- `validationRecordIds: []`
- organization knowledge count: `0`

The Cases UI displayed `resolved`, `No reflection recorded yet`, and an explicit
`Prepare Reflection` action.

## 23. Recovery Predicate

The recovery path was available only for the resolved/evidence-eligible state. The unresolved
control `NB-20260823-0002` displayed only `Resume in workspace`; it did not expose a Reflection
recovery action. After preparation, the resolved case displayed `Resume Reflection`, not
`Prepare Reflection`, preventing duplicate preparation through the UI.

## 24. Real Browser Setup

- Browser: Codex In-app Browser
- URL: `http://localhost:3000/`
- Organization created through the normal zero-organization onboarding UI
- No Developer Demo or protected historical NusaCloud data used
- Browser console errors/warnings after the workflow: none
- Screenshot evidence captured for the pre- and post-recovery Cases detail state

## 25. Pre-Recovery State

The lifecycle completed through the UI as customer message → agent response → waiting for
customer → customer confirmation → resolution evidence → `Resolve with evidence`. Database
readback confirmed the canonical ticket identity, resolved status, valid evidence ID, no
prepared Reflection, no final Reflection decision, and no prior promotion.

## 26. Cases / Prepare Reflection UI

Cases discovered `NB-20260823-0001` as a resolved case. Its detail view showed the explicit
`Prepare Reflection` button. The wording did not imply reopening, a new ticket, or automatic
knowledge promotion. Clicking it restored the existing ticket in the workspace at Human
Review; it did not itself create a prepared Reflection or alter the resolved state.

## 27. Resume / Human Review

The restored workspace showed the existing `Approve & Continue to Reflection` action and
the original conversation/evidence. Clicking that human-review action invoked the existing
`prepare_reflection` transition. The resulting audit sequence included:

```text
resolve_with_evidence: in_review -> resolved
prepare_reflection:   resolved -> resolved
```

## 28. Reflection Preparation

After the transition, `reflection.preparedDecision` was persisted with `decision: null`,
`validationEligible: true`, and the original evidence ID. The UI displayed the Reflection
authoring form and the separate `Validate & Commit to Organizational Memory` action. Reflection
was prepared, not validated or promoted.

## 29. Resolved-State Preservation

The ticket remained `resolved` before and after recovery. No reopen transition, new resolution
event, or duplicate ticket was created. The original ticket ID and final response remained
unchanged.

## 30. Evidence Preservation

The original `customer_confirmation` evidence row and evidence ID remained attached to the
ticket. The resolution evidence gate remained visible and authoritative.

## 31. Navigation / Refresh Persistence

After preparation, navigation to Cases showed `Reflection status: Prepared for human
validation` and `Resume Reflection`. The workspace was resumed from Cases. A full browser
refresh returned to the workspace shell; reopening the case through Cases again showed the
same prepared Reflection state and preserved evidence.

## 32. Negative Controls

- Unresolved/in-review case: no resolved Reflection recovery action; PASS.
- Resolved without evidence: server probe rejected with `RESOLUTION_EVIDENCE_REQUIRED`; PASS.
- Already-prepared Reflection: UI showed `Resume Reflection`, not `Prepare Reflection`; PASS.
- Final Reflection decision / duplicate preparation: service probe rejected duplicate
  preparation with `INVALID_TRANSITION`; PASS.
- Wrong tenant, unauthorized access, and nonexistent ticket: NC-FIX-008/014 probes PASS.
- Already-promoted case: no automatic promotion occurred in the browser case; PASS.

## 33. Idempotency / Duplicate Preparation

The permanent NC-FIX-014 probe verified duplicate preparation is rejected, no duplicate
prepared decision is created, no validation or knowledge rows are created by preparation, and
tenant isolation remains enforced.

## 34. NC-FIX-008 Regression

`npm.cmd run probe:nc-fix-008-post-resolution-reflection` passed all lifecycle, evidence,
restart, duplicate, promotion, provenance, authorization, and tenant checks.

## 35. NC-FIX-011 Regression

`npm.cmd run probe:nc-fix-011-reflection-promotion-safety` passed safe generalized promotion,
identity rejection, placeholder handling, atomic rejection, corrected retry, idempotency,
cross-tenant, and authority checks.

## 36. NC-FIX-012 Regression

`npm.cmd run probe:nc-fix-012-reflection-provenance-boundary` passed all twelve projection,
identity, fallback, validation/write-equivalence, atomicity, retry, idempotency, and tenant
checks.

## 37. Static / Build Validation

- TypeScript no-emit: PASS
- Prisma validation: PASS
- Migration status: PASS — 25 migrations found; database schema up to date
- Production build: PASS — Next.js compiled and generated 13/13 static pages
- Build warning: existing Tailwind ESM warning only; no build failure

## 38. Disposable Cleanup

Only the exact disposable organization `org-7437b0f6-8887-4681-9428-3509f4c43620` was deleted
after testing. Before cleanup it contained 2 tickets, 4 messages, 1 evidence row, 0
validations, 0 KnowledgeItems, and 0 memory changes. After cleanup all counts were zero.

## 39. Protected Data

Protected NusaCloud cases, Developer Demo data, NC-FIX-012 evidence, and database rows outside
the disposable organization were not modified. The NC-FIX-013 stash was not applied, altered,
or dropped.

## 40. CHANGELOG

The NC-FIX-014 Unreleased entry was retained and minimally updated to record real-browser
acceptance. No v0.2.0 history or unrelated entry was rewritten. NC-FIX-013 was not added.

## 41. Exact Commit Scope

Approved NC-FIX-014 paths:

```text
app/page.tsx
components/views/CaseLookupView.tsx
docs/CHANGELOG.md
package.json
lib/ticketReflectionRecovery.ts
scripts/nc-fix-014-resolved-reflection-recovery-probe.cjs
docs/reports/NC-FIX-014-resolved-ticket-reflection-recovery-boundary.md
```

Excluded and preserved: NC-FIX-012R/R2/R3 reports, NC-FIX-014R investigation report, and
all stash-only NC-FIX-013 content.

## 42. Commit Verification

The approved path set is explicitly staged only after browser, regression, static, build,
cleanup, and scope checks. The final commit verification records the exact parent, subject,
changed paths, clean index, unchanged stash, and absence of NC-FIX-013 content.

## 43. Known Follow-Ups

- Full release certification remains a separate task.
- NC-FIX-013 remains stash-only and is not part of this change.
- The browser acceptance did not complete knowledge promotion; human validation remains
  required by design.

## 44. Recommendation

Commit only the seven approved NC-FIX-014 paths with the exact subject:

```text
fix: restore resolved-ticket Reflection recovery
```

Do not push, tag, release, amend, or reconcile NC-FIX-013 in this task.

## 45. Final Verdict

```text
NC_FIX_014_COMMITTED_VERIFIED
```

Browser acceptance and all required regressions passed. The report is included in the exact
seven-path commit; post-commit verification confirms the required parent, subject, scope,
clean index, unchanged stash, and absence of NC-FIX-013 implementation content.
