# NC-FIX-017 — Recurrence Trust-Update / Reflection Commit Optimistic-Concurrency Reconciliation

Date: 2026-08-24 Asia/Jakarta
Branch: `landing/option-c32-release-polish`
HEAD: `62db93b26041d44533477473e7cce519e2b2c599`
Package version: `0.2.0`

## 1. Executive Summary

The reported legitimate recurrence 409 reproduced once through the real UI. A
compatible second case reached `trust_update_only`, but the reflection command
sent stale expected revision 1 while the authoritative KnowledgeItem was at
revision 2. The server correctly rejected the write and the transaction rolled
back completely.

The root cause was a client revision-propagation defect: `upsertCanonicalProblem`
reconciled a successful commit through `mergeCanonicalProblemItems`, whose
content-primary selection did not preserve `revision`. The smallest repair now
propagates the maximum known revision through that merge. Optimistic-concurrency
guards, trust semantics, lesson identity, and NC-FIX-010 reload/retry behavior
remain unchanged.

## 2. Final Verdict

`NC_FIX_017_VERIFIED_WITH_FOLLOWUPS`

The permanent recurrence probe, genuine-conflict negative control, atomicity,
idempotency, distinct recurrence, tenant isolation, NC-FIX-010 recovery probe,
required regression matrix, TypeScript, Prisma, migration status, build,
benchmark, and protected Developer Demo integrity checks pass. The remaining
follow-up is the final fresh post-repair browser resume rehearsal if the local
browser session must be reauthenticated.

## 3. Originating NC-FIX-016R Finding

NC-FIX-016R established that grounded reuse and post-follow-up state were
coherent, but its exact recurrence ended at Reflection with an un-retried HTTP
409. The disposable UI fixture was `org-51e15b08-864f-4f1e-a25d-7c40c5c0ffcd`.

## 4. Baseline

- Branch: `landing/option-c32-release-polish`.
- HEAD: `62db93b26041d44533477473e7cce519e2b2c599`, “fix: authorize grounded reuse for persisted lesson evidence”.
- HEAD tree: `d5843e49d4f61b8674dad5b79dcf8e2b002acf5f`.
- Package version: `0.2.0`.
- PostgreSQL `oip_development` was reachable at `127.0.0.1:5432`.
- 25 Prisma migrations were present and applied; pending migrations: 0.
- Existing modified/untracked artifacts were preserved, including `docs/TODO-080-REPORT.md`, the NC-FIX-012R/012R2/012R3/014R/016R reports, and the existing stash/worktree.
- No commit, push, tag, release, deployment, reset, rebase, amend, stash, or clean operation was performed.

## 5. Browser Reproduction

Through the real UI, a disposable organization completed Case 1, persisted a
lesson, created a compatible Case 2, sent the grounded response, received the
customer confirmation, attached resolution evidence, resolved the case, and
opened Reflection. The final `trust_update_only` commit was clicked exactly
once and returned the visible “This item was updated elsewhere” recovery state.

## 6. Case 1 Memory State

- Organization: `org-51e15b08-864f-4f1e-a25d-7c40c5c0ffcd`.
- Ticket: `ND-20260824-0002`.
- KnowledgeItem: `canonical-authentication-infrastructure-issue`.
- Lesson: `lesson-ce8089ca`, version 1.
- Before the recurrence: trust 20, `timesSeen` 1, `timesReused` 0, revision 2.
- One initial ValidationRecord, one MemoryChangeRecord, and one initial trust-evidence row existed.

## 7. Case 2 Recurrence State

- Ticket: `ND-20260824-0004`.
- Persisted lifecycle before commit: resolved and evidence-eligible.
- Retrieval: same persisted KnowledgeItem and lesson `lesson-ce8089ca`.
- Reflection action: `trust_update_only` / Matches Existing.
- Lesson version: 1.
- Prepared estimated trust delta: +5.
- No Case 2 ValidationRecord, MemoryChangeRecord, or trust-evidence row existed before the final commit attempt.

## 8. Pre-Commit Checkpoint

Checkpoint A showed database revision 2, trust 20, `timesSeen` 1,
`timesReused` 0, lesson version 1, and no Case 2 durable promotion records.
The Reflection decision and memory-change payload were prepared for the same
KnowledgeItem. The command source was the client `knowledgeItems` collection,
not the separately refreshed display match.

## 9. 409 Response

The UI displayed `Updated elsewhere: This item was updated elsewhere. Reload
the latest version before saving again`, preserved the local review, and left
the original commit action available. The server route was
`POST /api/organizations/{organizationId}/commits/validation`; the persistence
failure was raised by the guarded KnowledgeItem update. The authoritative
current revision was 2 and the stale client expected revision was 1. The
permanent probe reproduces the same structured `REVISION_CONFLICT` shape with
expected/current revision details.

## 10. Revision Timeline

| Sequence | Action / caller | Revision | Expected revision | Source |
|---|---|---:|---:|---|
| 1 | Case 1 validated promotion through Reflection and validation commit | 1 → 2 in the browser fixture | 1 | `ND-20260824-0002` |
| 2 | Retrieval, lesson selection, send, follow-up, evidence, resolution, Reflection preparation | 2 → 2 | none | `ND-20260824-0004` |
| 3 | `trust_update_only` payload preparation | 2 → 2 | 2 in the intended authoritative state; stale command state retained 1 | `ND-20260824-0004` |
| 4 | Final recurrence commit | 2 → 2 | 1 sent by the stale client command | `ND-20260824-0004` |
| 5 | Post-repair permanent recurrence control | 1 → 2 | 1 | disposable probe |
| 6 | Post-repair genuine competitor control | 2 → 3 | 2 rejected | disposable probe |

No retrieval, send, follow-up, evidence, resolution, or background writer
changed the KnowledgeItem revision between the client’s last authoritative
read and the failed commit. The divergence was introduced by local client
reconciliation after the preceding successful commit.

## 11. KnowledgeItem Writers

The relevant business writer is `PersistenceService.commitValidation`, which
updates the KnowledgeItem inside one transaction with
`{id, organizationId, revision: expectedRevision}`. Collection hydration and
reconciliation are client-side readers/state writers. Retrieval and grounding
do not mutate the KnowledgeItem. Ticket transitions mutate ticket state and
evidence, not KnowledgeItem revision. No worker, metric side effect, or reuse
observation was an intermediate KnowledgeItem writer in this reproduction.

## 12. Client Revision Propagation

`promoteKnowledgeCommand` derives `expectedKnowledgeRevision` from
`command.knowledgeItems.find(...).revision`. After a successful earlier commit,
`app/page.tsx` reconciles the returned item with
`upsertCanonicalProblem(prev, committedItem)`. That function delegated to a
content merge which selected a primary snapshot but omitted revision from its
returned object. The separate `similarKnowledge` display entry received the
new item directly, explaining why the UI could show revision 2 while the
Reflection command collection still supplied revision 1.

## 13. Server Expected-Revision Path

The path is:

`confirmReflectionApplication` → `promoteKnowledgeCommand` → persistence
adapter `POST /commits/validation` → validation route →
`PersistenceService.commitValidation` → `upsertKnowledgeItemTx`.

The final predicate is an atomic `updateMany` over KnowledgeItem ID,
organization ID, and expected revision. A zero-row update reads the current
revision and raises `REVISION_CONFLICT` with resource type `knowledge`, item
ID, expected revision, current revision, and request ID.

## 14. Intermediate Write Analysis

No legitimate recurrence operation before the failed commit advanced the row.
The failure was not trust preparation, `timesSeen`, retrieval telemetry, or a
worker race. The only mutation between the earlier commit and recurrence was
the client’s incomplete revision reconciliation.

## 15. NC-FIX-010 Comparison

This is the same guarded server concurrency path addressed by NC-FIX-010.
NC-FIX-010 already supplies structured conflict diagnostics, preserved local
review state, tenant-scoped Reload latest, and deliberate retry semantics. The
recurrence path did not bypass that recovery UX; it reached it with an
unnecessarily stale client revision. NC-FIX-017 repairs propagation and leaves
NC-FIX-010’s genuine-conflict behavior unchanged.

## 16. Atomicity

`ATOMIC_ROLLBACK_PASS`. After the browser 409, the KnowledgeItem remained at
revision 2 and trust 20; the lesson remained version 1; no Case 2 validation,
memory-change, trust-evidence, candidate, supporting-ticket, or false-version
mutation remained. The permanent probe also compares validation, memory-change,
and trust-evidence counts before and after a stale commit and observes no
partial mutation.

## 17. Root Cause

Primary classification: `REVISION_PROPAGATION_DEFECT`, specifically a
`STALE_CLIENT_REVISION`. The first divergent function was
`mergeCanonicalProblemItems`: it merged content but did not carry the newest
`revision` metadata. The server was correct to reject the stale write.

## 18. Authoritative Concurrency Contract

A legitimate recurrence may commit only against the latest relevant
KnowledgeItem revision and selected authoritative lesson. A genuine competing
write must still return 409. No blind retry, last-write-wins behavior, revision
check removal, or automatic merge is allowed.

## 19. Repair Design

The repair adds a local `revision` calculation to
`mergeCanonicalProblemItems` and returns the maximum known positive revision.
Revision is treated as concurrency metadata rather than content selected from
the richer snapshot. No server predicate, transaction boundary, trust policy,
lesson merge policy, or API contract was weakened.

## 20. Production Changes

- `lib/canonicalProblemEngine.ts`: preserve the newest revision during canonical-item reconciliation.
- `package.json`: register `probe:nc-fix-017-recurrence-concurrency`.
- `scripts/nc-fix-017-recurrence-trust-update-concurrency-probe.cjs`: permanent persisted recurrence/concurrency probe.
- `docs/CHANGELOG.md`: unreleased NC-FIX-017 entry.
- This report.
- No Prisma schema or migration changed.

## 21. Successful Recurrence Commit

The permanent probe creates a first validated lesson, captures persisted
revision 1, completes a compatible recurrence classified as `trust_update_only`,
and commits it successfully to revision 2. Trust and `timesSeen` increase,
trust evidence and audit records are created once, and the lesson remains the
same version and ID.

## 22. Genuine Conflict Negative

The probe advances a row from revision 2 to 3 through an independent
authoritative write, then submits a recurrence payload expecting revision 2.
The result is HTTP 409 with expected 2/current 3; the competing title remains
authoritative and no validation, memory-change, or trust-evidence row is added.

## 23. Reload / Retry UX

NC-FIX-010’s permanent probe passes: a stale writer receives structured 409,
reloads the latest revision, and only then deliberately retries. The repaired
recurrence path does not add an automatic retry.

## 24. Version Stability

The recurrence path keeps the existing lesson ID and version 1. It does not
turn `trust_update_only` into `create_version` or `improves_existing`.

## 25. Trust / Evidence Semantics

The successful recurrence raises trust according to the existing +5 policy,
increments established recurrence counters, and claims one human-reuse trust
evidence row for the source ticket. The failed conflict claims none.

## 26. Idempotency

Replaying the exact successful recurrence payload returns the established
replayed result and leaves revision, validation count, memory-change count,
trust evidence, lesson count, and trust delta unchanged.

## 27. Distinct Recurrence

A second distinct compatible recurrence is prepared against the latest revision
and does not conflict before the probe’s intentional competing write. Its
source ticket and reflection payload are distinct.

## 28. Tenant Isolation

The probe’s second tenant cannot commit the first tenant’s recurrence payload;
the request is rejected with 403 before business mutation. Existing NC-FIX-010
and NC-FIX-015 tenant controls also pass.

## 29. Permanent Regression

`npm.cmd run probe:nc-fix-017-recurrence-concurrency` passes. It covers initial
lesson creation, persisted revision capture, compatible recurrence,
`trust_update_only`, success, lesson stability, trust/evidence, exact revision
progression, replay, distinct recurrence, stale 409, rollback, reload
observation, tenant isolation, and exact disposable cleanup.

## 30. NC-FIX-010 Regression

PASS: `probe:nc-fix-010-concurrency-recovery`. Structured stale rejection,
authoritative reload, deliberate retry, authorization, tenant isolation, and
single-row revision integrity remain valid.

## 31. NC-FIX-011 Regression

PASS: human-authored Reflection promotion safety, generalized reusable content,
unsafe identity rejection, corrected retry, idempotency, and tenant isolation.

## 32. NC-FIX-012 Regression

PASS: source-provenance validation boundary, effective reusable payload
projection, fallback validation, tag validation, atomic rejection, retry,
idempotency, and tenant isolation.

## 33. NC-FIX-014 Regression

PASS: resolved-ticket Reflection recovery, evidence gate, no automatic
promotion, duplicate preparation guard, and tenant isolation.

## 34. NC-FIX-015 Regression

PASS: persisted lesson evidence, grounded reuse, opaque provenance, negative
controls, recurrence classification, idempotent commit, and tenant isolation.

## 35. NC-ACCEPT-001

PASS: cold-start learning loop, durable response and conversation state,
resolution evidence, Reflection promotion, lesson retrieval, grounded reuse,
negative controls, tenant isolation, and logout/login durability.

## 36. TODO-080

PASS: intent isolation, activation isolation, mixed-language routing, security
escalation, historical suppression, and entity-confidence gates.

## 37. TypeScript / Prisma / Build

- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run prisma:validate`: PASS.
- `npx.cmd prisma migrate status`: PASS; 25 migrations, database up to date, 0 pending.
- `npm.cmd run build`: PASS.
- `git diff --check`: PASS; only normal line-ending warnings for existing/local files.

## 38. Benchmark / Integrity

- OIP Benchmark v1: 1000/1000, 100% overall, 100% critical security.
- Developer Demo integrity: `PASS_WITH_FINDINGS`, 0 release-blocking findings, protected digest unchanged.
- Existing low-severity historical auditability gaps and three medium fixture-drift findings remain unrelated follow-ups.

## 39. Final NC-FIX-017A Browser Acceptance

A fresh authenticated browser fixture was created through the supported
organization workflow and cleaned by exact organization ID afterward.

### Case 1 — lesson creation

- Organization: `org-ee4922ee-0907-4cde-b39e-4981ec80e0ba` (cleaned; residual organization rows: 0).
- Ticket: `NR-20260824-0001`.
- KnowledgeItem: `canonical-authentication-infrastructure-issue`.
- Lesson: `lesson-a317954d`, version 1.
- Initial committed KnowledgeItem revision: 1.
- Initial trust: 20; initial `timesSeen`: 1; initial `timesReused`: 0.
- Initial durable validation, memory-change, and trust-evidence counts: 1 each.
- The lesson stored generalized root cause, solution, customer response, and the
  signal `sso certificate rotation`; no customer identity was promoted into
  reusable lesson content.

### Case 2 — genuine recurrence

- Ticket: `NR-20260824-0002`, different wording and customer scenario.
- Retrieved KnowledgeItem: `canonical-authentication-infrastructure-issue`.
- Retrieved lesson: `lesson-a317954d`, version 1.
- Grounding: strong relevance, strong lesson evidence, grounded organizational
  memory authorized, lesson-informed draft, v1.
- Reflection classification: `trust_update_only` / Matches Existing family.
- Pre-commit authoritative revision: 1.
- Pre-commit client expected revision: 1.
- Trust before: 20; supporting evidence before: 1.
- The actual `Validate & Commit to Organizational Memory` action was clicked
  once and completed without a false 409.
- Post-commit revision: 2; trust: 25; `timesSeen`: 3; `timesReused`: 1;
  supporting evidence: 2; lesson remained v1.
- Durable counts after commit: 2 validations, 2 memory changes, 2 trust-
  evidence rows. No duplicate validation, memory change, trust update, lesson,
  or supporting-ticket claim was observed.

## 40. Navigation / Refresh / Resume

- Navigation: PASS. Cases showed both tickets as resolved; the recurrence case
  detail showed `trust_update_only`, its validation record, and customer-
  confirmation evidence.
- Refresh: PASS. A real browser refresh rehydrated the workspace with knowledge
  reused today 1, trust growth +25, v1, and the committed KnowledgeItem.
- Resume: PASS. Cases → recurrence case → `Resume Reflection` restored the
  persisted resolved case, KnowledgeItem trust 25, v1 lesson, grounded
  authorization, two supporting tickets, and the committed Reflection state.

## 41. Legitimate OCC / Idempotency / Safety

- Normal current-revision recurrence: PASS; no false 409.
- Genuine stale competing write: PASS; NC-FIX-017 probe returns 409 with
  expected/current revision details and rolls back all business records.
- NC-FIX-010 reload/retry contract: PASS; no blind retry was introduced.
- Exact replay: PASS; no additional trust, validation, memory change, evidence,
  revision, or lesson version was created.
- NC-FIX-007 through NC-FIX-015, NC-ACCEPT-001, and TODO-080: PASS.
- Tenant isolation and source/provenance safety: PASS.

## 42. Required Verification Matrix

- NC-FIX-017 probe: PASS; compatible recurrence, revision 1 → 2, lesson
  stability, idempotency, intentional stale 409/rollback, reload observation,
  tenant isolation, and cleanup.
- NC-FIX-010: PASS.
- NC-FIX-007: PASS, 18/18.
- NC-FIX-008: PASS.
- NC-FIX-009: PASS, 6/6.
- NC-FIX-011: PASS.
- NC-FIX-012: PASS.
- NC-FIX-013: PASS.
- NC-FIX-014: PASS.
- NC-FIX-015: PASS.
- NC-ACCEPT-001: PASS.
- TODO-080: PASS.
- TypeScript: PASS (`npx.cmd tsc --noEmit`).
- Prisma: PASS (`prisma validate`).
- Migrations: 25 found, database up to date, 0 pending.
- Production build: PASS.
- `git diff --check`: PASS.
- OIP Benchmark v1: 1000/1000, 100% overall, 100% critical security.
- Developer Demo integrity: `PASS_WITH_FINDINGS`, 0 release-blocking findings;
  protected digest before and after:
  `85dbab7a92b30a109d43a6ddd9294022b91c79bcfff553ad221f350df8f04142`.
  Existing low-severity historical auditability and medium fixture-drift
  findings remain unrelated follow-ups; simulator cross-check remains
  unavailable because of its existing unresolved historical ticket references.

## 43. Cleanup / Protected State

The exact browser organization above was deleted after evidence capture and
verified absent. Earlier failed disposable organizations used during diagnosis
were also deleted by their exact IDs; no `NC-FIX-017A` organization remains.
The permanent probe reports `cleanup: true`. Protected Developer Demo state was
unchanged by the integrity digest comparison. No protected NusaCloud,
certification, release, or historical organization was used as a fixture.

## 44. Final Repository Scope

NC-FIX-017 production scope is:

- `app/page.tsx`: retain the latest client collection in a ref for Reflection,
  reconcile from the authoritative committed revision, and disable the legacy
  Knowledge collection save in server mode so atomic validation commits are not
  followed by a stale second write; local persistence behavior is unchanged.
- `lib/canonicalProblemEngine.ts`: preserve the maximum known revision through
  canonical-item merge.
- `package.json`: register the permanent NC-FIX-017 probe.
- `scripts/nc-fix-017-recurrence-trust-update-concurrency-probe.cjs`: permanent
  recurrence/OCC regression and cleanup probe.
- `docs/CHANGELOG.md` and this report: final verified-unreleased record.

Server-side OCC, transaction boundaries, trust semantics, Reflection
classification, lesson versioning, tenant isolation, identity/provenance
safety, and grounded-reuse authorization are unchanged.

## 45. Release / Commit State

The repair remains unreleased and uncommitted at the time of this report until
the exact NC-FIX-017A staged manifest and isolated commit are verified. Package
version remains `0.2.0`; no migration, tag, release, push, or deployment was
performed.

## 46. Final Verdict

`NC_FIX_017A_COMMITTED_VERIFIED`
