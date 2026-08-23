# NC-FIX-013R — Stash Reconciliation, Current-Branch Recovery & Final Verification

Execution date: 2026-08-23
Timezone: Asia/Jakarta
Branch: `landing/option-c32-release-polish`
Starting HEAD: `a0176e4430ba29ffcf490d6810328b5a62ce203f`
Current NC-FIX-014 commit: `a0176e4430ba29ffcf490d6810328b5a62ce203f`
Package version: `0.2.0`

## 1. Executive Summary

QC-009 still reproduced on the current post-NC-FIX-014 branch. Home labeled a
historical all-retained-ticket metric as **Open tickets**, so a discarded ticket
continued to inflate operational workload. The historical NC-FIX-013 stash was
inspected without applying it. Only the valid current-state metric contract,
shared predicate, freshness logic, probe, changelog entry, and report were
selectively reconciled.

The repair preserves durable TicketRecords and `lifetimeTickets`, while Home now
uses a fresh `openTickets` projection.

## 2. Final Verdict

**NC_FIX_013R_RECONCILED_COMMITTED_VERIFIED**

QC-009 reproduced, the fix was selectively reconciled, browser acceptance passed
with `2 → 1 → refresh 1 → resolve 0`, all required regressions and build checks
passed, disposable data was removed by exact IDs, the exact scope was committed,
and the NC-FIX-013 stash remains present and unchanged.

## 3. Current Baseline

- Baseline time: `2026-08-23T12:41:14.292+07:00`.
- Repository root: `C:/Users/Calvin/Documents/My Project/Hackathon 2`.
- Branch: `landing/option-c32-release-polish`.
- HEAD: `a0176e4430ba29ffcf490d6810328b5a62ce203f` — `fix: restore resolved-ticket Reflection recovery`.
- Working tree initially contained only four preserved untracked historical reports.
- No staged changes were present.
- Package version: `0.2.0`.
- PostgreSQL port 5432 was reachable.
- Prisma reported 25 migrations and an up-to-date database.

## 4. Stash Inventory

The only stash entry is:

`stash@{0}` — created `2026-08-13 17:47:03 +0700`, message
`On landing/option-b-cinematic: WIP: NC-FIX-012/013 uncommitted work preserved from landing/option-b-cinematic before Option C`.

The stash is a three-parent stash. Its base is
`ea573523641f605f89feea93274e428b357e5f03` —
`docs(landing): record option B visual review report`.

## 5. NC-FIX-013 Stash Identification

`stash@{0}` is the NC-FIX-013 candidate, but it is a mixed NC-FIX-012/NC-FIX-013
WIP stash rather than a clean single-task snapshot. It was inspected through
stash trees and diffs only. It was not applied, popped, or dropped.

## 6. Stash/Base Commit

The stash base predates the current landing-page commits, NC-FIX-012 recovery, and
NC-FIX-014. The current branch therefore remained authoritative. The large
`app/page.tsx` diff also contains line-ending and older-branch changes, so it was
not restored wholesale.

## 7. Current-Branch Overlap

| Path | Stash classification | Current overlap | Conflict | Recovery strategy |
|---|---|---|---|---|
| `app/page.tsx` | Mixed NC-FIX-013 core plus older NC-FIX-012/landing code | Changed by NC-FIX-012/014 and landing work | Yes, if applied wholesale | `MANUAL_PORT` |
| `components/views/HomeView.tsx` | `NC_FIX_013_CORE` | No protected NC-FIX-012/014 logic | No | `DIRECT_REUSE` |
| `lib/server/persistenceService.ts` | `NC_FIX_013_CORE` plus older mixed changes | Current server persistence differs from stash base | Conceptual overlap only | `MANUAL_PORT` |
| `types/metrics.ts` | `NC_FIX_013_CORE` | Current type lacked `openTickets` | No protected conflict | `DIRECT_REUSE` |
| `package.json` | Mixed NC-FIX-012/013 test registrations | Current package already contains NC-FIX-014 registration | No, isolated entry | `MANUAL_PORT` |
| `docs/CHANGELOG.md` | Mixed NC-FIX-012/013 documentation | Current NC-FIX-012/014 entries are protected | Yes if rewritten | `MANUAL_PORT` |
| `lib/application/learning/reflectionCommands.ts` | NC-FIX-012 core | Protected NC-FIX-012 committed in current HEAD | Yes | `DROP_AS_OBSOLETE` |
| `lib/ticketMetrics.ts` | `NC_FIX_013_CORE` untracked stash file | Absent on current branch | No | `DIRECT_REUSE` |
| NC-FIX-013 probe | `NC_FIX_013_TEST` untracked stash file | Absent on current branch | No | `DIRECT_REUSE` |
| NC-FIX-012 probe/report and release artifacts | Unrelated or protected historical material | Must remain outside this fix | Yes by scope | `DROP_AS_OBSOLETE` |

## 8. QC-009 Current Reproduction

QC-009 reproduced before recovery using disposable organization
`org-e7e0ee34-81f2-4fc2-8ff4-3926bc6ac28e`.

Tickets `NB-20260823-0001` and `NB-20260823-0002` were both `in_review`. After a
fresh Home load, Open tickets was `2`. Ticket `NB-20260823-0002` was discarded
through the normal UI; its durable row became `discarded`, but Home still showed
`2` after Tickets → Home navigation. This is the defect: retained history was
being presented as current operational work.

## 9. Authoritative Open-Ticket Contract

The Prisma enum and current type define exactly these lifecycle states:

Count as open:

- `open`
- `in_review`
- `waiting_for_customer`

Exclude from open:

- `resolved`
- `rejected`
- `discarded`

No new lifecycle status was introduced.

## 10. Current Root Cause

`components/views/HomeView.tsx` rendered **Open tickets** from
`orgMetrics.lifetimeTickets`. The authoritative persistence layer defines that
field from all retained TicketRecords, so a discarded row was correctly retained
and incorrectly counted for the operational card. The root cause is a metric
semantic/aggregation boundary defect, not a discard-persistence defect.

## 11. Recovery Strategy

Keep `lifetimeTickets` unchanged as historical throughput. Add a shared
`OPEN_TICKET_STATUSES` predicate, calculate fresh server-side `openTickets`, use
the same predicate for local-authority fallback, bind Home to `openTickets`, and
refresh the projection after ticket transitions, Home navigation, hydration, and
organization switching.

## 12. Stash Content Reused

- The status tuple and predicate from `lib/ticketMetrics.ts`.
- The Home binding to `openTickets`.
- The server fresh-count design in `loadOrgMetrics()`.
- The transition/navigation refresh contract.
- The narrow NC-FIX-013 lifecycle probe.

These were reconciled into current files rather than copied across the branch.

## 13. Stash Content Reimplemented

- `app/page.tsx` freshness logic was manually inserted around the current
  post-NC-FIX-014 transition and hydration code.
- The current `persistenceService.ts` mapping/query was manually integrated.
- Only the NC-FIX-013 package script and changelog entry were ported from mixed
  stash files.
- The final report was written for the current branch and current evidence.

## 14. Stash Content Dropped as Obsolete

Dropped from recovery and preserved outside the commit:

- NC-FIX-012 reflection command changes, because they are already committed and
  protected in NC-FIX-012.
- The stash's NC-FIX-012 probe/report material.
- Release-certification manifest/report artifacts and `nc009-dev.*` logs.
- The old branch-specific NC-FIX-013 report; this current-branch reconciliation
  report replaces it as the authoritative record.

## 15. Production Changes

Committed production changes are limited to `app/page.tsx`,
`components/views/HomeView.tsx`, `lib/server/persistenceService.ts`,
`lib/ticketMetrics.ts`, and `types/metrics.ts`. No Prisma migration was needed.

## 16. Discard Persistence

The discarded browser record remained durably retained and appeared in Cases as
`discarded`. The permanent probe also verified the row and discard audit remain
present. The repair changes only metric projection, not lifecycle retention.

## 17. Active-Ticket Regression

The permanent probe verified `open` plus `in_review` yields `openTickets = 2`.
Fresh browser acceptance created two active tickets and Home displayed `2`.

## 18. Resolved-Ticket Regression

The permanent probe resolved the remaining active row with valid evidence and
verified `openTickets = 0`. Browser acceptance used the normal manual-verified
evidence flow; Home displayed `0` and remained `0` after refresh.

## 19. Waiting-for-Customer Regression

The permanent probe sent an agent message, changed an `in_review` ticket to
`waiting_for_customer`, and verified that it remained counted as open.

## 20. Rejected/Terminal Status Regression

The permanent probe's status matrix verified `resolved`, `rejected`, and
`discarded` are excluded while active statuses remain counted.

## 21. Tenant Isolation

The permanent probe verified tenant B's active/discarded rows affect only tenant
B. Tenant A's metric remained independent. The browser organization-switch test
also showed the first disposable organization at `1` and the final organization
at `0`.

## 22. Historical Metric Preservation

`lifetimeTickets` remains a separate historical field and is not used for the
Home Open-ticket card. The NC-FIX-013 probe verified the historical metric and
other persisted metric fields were unchanged by discard and resolution metric
reads.

## 23. Other Dashboard Metrics

The permanent probe verified `knowledgeReused`, `autoResolutions`,
`humanResolutions`, `totalResolutionTimeSec`, `resolutionsCount`,
`memoryGrowthToday`, and `memoryGrowthDate` remain unchanged. Knowledge,
Reflection, trust, retrieval, and resolution semantics were not modified.

## 24. Navigation / Refresh

Fresh browser results:

- initial Home: `2`;
- after UI discard and Tickets → Home: `1`;
- after browser refresh: `1`;
- after organization switch away and back: correct tenant-specific values;
- after legitimate resolution: `0`;
- after final browser refresh: `0`.

## 25. Permanent Probe

`scripts/nc-fix-013-dashboard-open-ticket-metric-probe.cjs` passed with:

`activePairCount=2`, `afterDiscardCount=1`, `afterRefreshCount=1`,
`afterFinalResolutionCount=0`, `waitingCount=2`, discarded persistence and
exclusion true, status matrix true, tenant isolation true, other metrics
unchanged true, and exact cleanup.

## 26. Fresh Browser Acceptance

Fresh organization: `org-92f48671-3d54-47eb-ab39-86a74da75257` /
`NC-FIX-013R Browser QA Final`.

Fresh tickets: `NB-20260823-0001` and `NB-20260823-0002`.

The real UI sequence passed: create organization, create two active tickets,
Home `2`, discard ticket B, Home `1`, refresh Home `1`, Cases retained ticket B
as `discarded`, resolve ticket A with manual verified evidence, Home `0`, and
refresh Home `0`. Final browser error/warning logs were empty. A transient
development overlay alert appeared while Next.js was recompiling the existing
document-title metadata boundary; it did not persist in final console logs or
block the acceptance flow.

## 27. NC-FIX-012 Regression

`npm.cmd run probe:nc-fix-012-reflection-provenance-boundary` passed all 12
provenance, rejection, retry, idempotency, atomicity, and tenant controls.

## 28. NC-FIX-014 Regression

`npm.cmd run probe:nc-fix-014-resolved-reflection-recovery` passed recovery
predicate, preparation, evidence gate, no automatic promotion, duplicate guard,
and tenant isolation. NC-FIX-008 and NC-FIX-011 also passed.

## 29. TypeScript / Build / Prisma

- TypeScript no-emit: PASS.
- Prisma validation: PASS.
- Migration status: PASS; 25 migrations found and database schema up to date.
- Production build: PASS; Next.js compiled, lint/type checking passed, and 13/13
  static pages were generated.
- Existing non-blocking build warning: `tailwind.config.ts` is loaded as an ES
  module without the package `type: module` setting.

## 30. Cleanup

Deleted only these exact disposable organizations:

- `org-e7e0ee34-81f2-4fc2-8ff4-3926bc6ac28e`
- `org-92f48671-3d54-47eb-ab39-86a74da75257`

Residual checks returned zero organizations, tickets, messages, evidence, or
metrics for those IDs. The NC-FIX-013 probe's disposable rows also cleaned up.

## 31. Protected Data

The count of non-target organizations was 64 before and after cleanup. Both
protected Nusa Cloud organizations remained present. No NC-FIX-012 evidence,
NC-FIX-014 evidence, Developer Demo data, release-certification data, users, or
stash content was targeted.

## 32. CHANGELOG

Added an NC-FIX-013 Unreleased entry documenting QC-009, the distinction between
`openTickets` and `lifetimeTickets`, active/excluded statuses, retention, metric
freshness, and probe/browser verification. NC-FIX-012 and NC-FIX-014 entries were
not rewritten. The pre-existing NC-FIX-014 entry still contains its earlier
pre-commit wording; current Git history is authoritative for its committed state.

## 33. Exact Commit Scope

Approved NC-FIX-013 paths:

- `app/page.tsx`
- `components/views/HomeView.tsx`
- `docs/CHANGELOG.md`
- `docs/reports/NC-FIX-013R-STASH-RECONCILIATION-AND-FINAL-VERIFICATION.md`
- `lib/server/persistenceService.ts`
- `lib/ticketMetrics.ts`
- `package.json`
- `scripts/nc-fix-013-dashboard-open-ticket-metric-probe.cjs`
- `types/metrics.ts`

No NC-FIX-012/014 implementation or report is in scope.

## 34. Stash Preservation

`stash@{0}` remained present throughout. It was inspected without application,
was not popped, and was not dropped. The final stash list is unchanged.

## 35. Known Follow-Ups

- The full release-certification rerun remains a separate task.
- The existing development metadata boundary can produce a transient Next.js
  overlay alert during recompilation; final browser console logs were clean.
- The pre-existing NC-FIX-014 changelog wording should be reconciled in a future
  documentation-only task if desired; it was deliberately not rewritten here.

## 36. Recommendation

Run a clean-candidate release-certification rerun against the resulting NC-FIX-013
commit. Keep the NC-FIX-013 stash as forensic backup and do not reconcile it again
unless new evidence requires it.

## 37. Final Verdict

**NC_FIX_013R_RECONCILED_COMMITTED_VERIFIED**

The current-state Open-ticket metric is reconciled, discarded rows remain durable
but are excluded from operational work, protected NC-FIX-012/014 behavior passes,
the browser sequence and permanent probe pass, cleanup is exact, and the stash is
preserved unchanged.
