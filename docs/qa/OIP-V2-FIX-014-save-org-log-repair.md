# OIP-V2-FIX-014 — Save Organization Log Repair

Status: candidate repair complete; ready for independent verification.

## 1. Executive Summary

- Task ID: OIP-V2-FIX-014
- Investigation started: 2026-09-11 09:29:28 +07:00
- Branch: `landing/option-c32-release-polish`
- Starting HEAD: `2340081e2e5077fd8eefda7befa3bc83c8abc62e`
- Final verdict: `OIP_V2_FIX_014_SAVE_ORG_LOG_CANDIDATE_READY_FOR_INDEPENDENT_VERIFICATION`

The real application reproduced a `saveOrgLog` HTTP 500 during an ordinary ticket workflow. Ticket processing completed with HTTP 200, but the intelligence-log PUT failed and the new log entry was absent from the organization database. The defect was the server’s unbounded, one-row-at-a-time interactive transaction: a rollback-only reproduction of the same shape crossed Prisma’s default five-second timeout at 2,000 entries and produced `P2028`. The repair now validates the request before the transaction, persists only the product’s existing 80-entry tail, locks the organization row for concurrent writers, rejects foreign IDs, and prunes only the oldest retained rows. Focused automation, affected cross-fix regressions, a clean real-app acceptance, TypeScript, diff-check, and production build all pass. The result is a candidate ready for independent verification.

## 2. Confirmed Defect

### Real-app reproduction

- User: Avery Morgan QA
- Organization: Meridian Field Operations
- Organization ID: `org-2114cd96-cb5f-4905-b445-6e22f24fc361`
- Ticket: `MF-20260911-0088`
- Action: entered a customer issue and selected `Submit Ticket`.
- Workflow result: `POST /api/organizations/org-2114cd96-cb5f-4905-b445-6e22f24fc361/tickets/process` returned HTTP 200.
- Log request: `PUT /api/organizations/org-2114cd96-cb5f-4905-b445-6e22f24fc361/intelligence-log` returned HTTP 500 in 5,730 ms.
- Browser evidence: `Persistence failed for saveOrgLog: Server persistence could not read intelligence log. (HTTP 500).`
- Persistence evidence: the ticket row exists with status `in_review`; no `intelligence_log` row matched `MF-20260911-0088`.

A second ordinary log-producing action, changing `Correct the language` to Indonesian, produced another HTTP 500 from the same PUT route in 5,812 ms and another identical browser persistence error. Two `saveOrgLog` failures were observed in this FIX-014 reproduction.

At reproduction time the organization had 614 valid intelligence-log rows, no invalid timestamps, and no duplicate IDs. The oldest stored timestamp was `2026-09-06T21:10:45.205Z`; the newest was `2026-09-10T10:22:41.994Z`. These database observations are evidence for this organization only and are not treated as assumptions about other tenants.

### Request and server boundary

The browser calls `saveOrgLog`, the server persistence adapter sends a PUT to the organization resource route, and `app/api/organizations/[organizationId]/[resource]/route.ts` dispatches `intelligence-log` to `saveIntelligenceLog`. The server function currently performs one `tx.intelligenceLog.upsert` for every submitted entry and then deletes every scoped row whose ID is absent from the submitted snapshot. The write is wrapped by the generic database error mapper, which currently presents the observed write failure as `Server persistence could not read intelligence log.` with HTTP 500.

### Overlap and failure evidence

The earlier FIX-005 real-app evidence independently recorded two overlapping intelligence-log PUTs returning HTTP 500 for the same organization. In the fresh FIX-014 reproduction, two failures were observed but their completion lines were sequential; overlapping execution was not asserted from that run. The client-side FIX-005 queue is present and serializes the known same-page callers, so the remaining defect is not assumed to be solved by client sequencing alone.

## 3. Historical Context

FIX-005 added an in-memory per-organization client queue and regression coverage after same-page overlapping full-snapshot writes produced HTTP 500. Its accepted scope was bounded to same-page overlap, independent organization queues, and queue recovery after a rejected write. It did not change the server’s unbounded interactive transaction or provide a multi-tab/process persistence boundary. FIX-014 is required because the server still accepts a full snapshot and performs unbounded per-row transactional work, while the live application continues to return HTTP 500.

## 4. Root Cause

The proven server sequence is:

1. The client sends the current intelligence-log snapshot to the organization resource route.
2. `saveIntelligenceLog` opens one interactive Prisma transaction.
3. The transaction loops through every submitted entry and awaits an individual `upsert` for each row.
4. The transaction then performs scoped snapshot deletion.
5. Prisma’s default interactive transaction timeout is five seconds. A rollback-only execution of this same loop and deletion shape crossed that boundary at 2,000 entries and returned raw Prisma error `P2028`: `A query cannot be executed on an expired transaction`.
6. The route’s generic persistence error conversion surfaces the database failure as HTTP 500 and the misleading “could not read intelligence log” message.

The live 614-row PUTs returned HTTP 500 after approximately 5.7–5.8 seconds under the running application. The live error was not claimed to expose raw `P2028`; the raw timeout was independently proven with the same server transaction shape. The earliest incorrect boundary is the unbounded, one-row-at-a-time interactive transaction, not the browser’s reflection or ticket workflow.

## 5. Repair

Candidate repair: keep server writes atomic, bound submitted log work to the existing product limit of 80 entries, serialize writers for one organization using an organization-row lock, reject cross-organization ID collisions, and prune only the oldest rows beyond the bounded retention set. This avoids arbitrary sleeps or retries and preserves legitimate concurrent writes from distinct callers.

Implemented in `lib/server/persistenceService.ts`:

- validates all submitted records before opening the transaction;
- bounds transactional work to `normalizedEntries.slice(-80)`, matching `lib/orgMemory.ts`;
- locks the organization row with `FOR UPDATE`, providing one serialization point for same-organization writers across tabs/processes;
- checks existing IDs for foreign ownership and returns a conflict before any write;
- upserts the bounded entries atomically;
- prunes only rows beyond the newest 80 by timestamp and ID, avoiding stale-snapshot deletion of a concurrent writer’s entry.

No arbitrary timing, sleeps, or retries were added. Legitimate concurrent writes are serialized and retained within the established bound; duplicate IDs remain prevented by the database primary key and the regression verifies no unexpected duplicates.

## 6. Permanent Regression Protection

- `scripts/oip-v2-fix-014-save-org-log-reliability-regression.cjs` — focused server-level regression for bounded large snapshots, concurrent organization writes, no lost updates, duplicate prevention, and tenant isolation.
- `package.json` — permanent npm entry for the FIX-014 regression.

The primary regression exercises the actual `saveIntelligenceLog` boundary. It seeds 614 rows, submits 2,000 entries, verifies the bounded tail and newest entry, runs concurrent same-organization saves with distinct entries, checks unique IDs and no lost updates, and verifies a cross-tenant collision is rejected without mutation. Static assertions fail if the bounded transaction, organization lock, or stale-snapshot deletion protection is removed.

## 7. Automated Verification

- `npm run probe:oip-v2-fix-014-save-org-log-reliability`: PASS — final rerun completed the 2,000-entry snapshot in 1,927 ms; bounded retention, concurrent writes, no lost updates, uniqueness, and tenant isolation passed.
- `npm run probe:oip-v2-fix-005-org-log-persistence`: PASS — same-organization serialization, queue recovery, organization isolation, and app integration passed.
- `npm run probe:oip-v2-fix-013-reflection-promotion-and-draft-recovery`: PASS.
- `npm run probe:oip-v2-fix-013r2-reflection-draft-navigation`: PASS.
- `npm run probe:oip-v2-fix-013r4-reflection-rejection-correction-retry`: PASS.
- `npm run probe:oip-v2-fix-009-reflection-commit-identity`: PASS.
- `npm run probe:nc-fix-011-reflection-promotion-safety`: PASS.
- `npm run probe:nc-fix-012-reflection-provenance-boundary`: PASS.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- `npm run build`: PASS — production compilation, lint/type validation, static generation, optimization, and build traces completed.

## 8. Real-App Acceptance

### Initial failure baseline

- User: Avery Morgan QA
- Organization: Meridian Field Operations
- QA ticket: `MF-20260911-0088`
- `SAVE_ORG_LOG_HTTP_500 = 2` in the fresh reproduction
- `EXPECTED_ORG_LOG_ENTRIES_PERSISTED = FAIL`
- `ORG_LOG_LOST_UPDATES = OBSERVED_FOR_REPRODUCED_ENTRIES`
- `UNEXPECTED_DUPLICATE_ORG_LOG_ENTRIES = NOT OBSERVED`
- `CONCURRENT_ORG_LOG_WRITES = NOT OBSERVED IN FRESH RUN; HISTORIC FIX-005 OVERLAP CONFIRMED`
- `ORG_LOG_TENANT_ISOLATION = NOT YET ACCEPTANCE-VERIFIED`

The post-repair acceptance must repeat a real ticket/log workflow and include a realistic burst or concurrent same-organization save. It must record the expected log IDs or ticket-linked events, persisted row count, HTTP 500 count, lost-update count, duplicate count, and tenant-isolation result. Final required results are:

```text
SAVE_ORG_LOG_HTTP_500 = 0
EXPECTED_ORG_LOG_ENTRIES_PERSISTED = PASS
ORG_LOG_LOST_UPDATES = 0
UNEXPECTED_DUPLICATE_ORG_LOG_ENTRIES = 0
CONCURRENT_ORG_LOG_WRITES = PASS
ORG_LOG_TENANT_ISOLATION = PASS
```

### Post-repair acceptance

- User: Avery Morgan QA
- Organization: Meridian Field Operations
- QA ticket: `MF-20260911-0089`
- Action: cleanly reloaded the authenticated workspace, submitted a fresh customer issue, and allowed the ticket analysis/log persistence workflow to complete.
- Ticket processing: HTTP 200.
- Intelligence-log request: HTTP 200 in 6,083 ms.
- Browser persistence errors in the post-reload acceptance window: 0. The browser console retained four earlier baseline errors from the pre-repair reproduction; no new error was emitted for `MF-20260911-0089`.
- Database result: 80 rows, 80 unique IDs; matching row `log-1-1789094195212` with detail `Ticket: MF-20260911-0089` persisted.
- Concurrent burst: the focused production-boundary regression completed two concurrent same-organization saves, retained both unique entries, and reported lost updates `0`.
- Tenant isolation: a foreign organization ID was rejected with `CONFLICT`; the foreign row remained owned by its original organization and the target organization was unchanged.

Final acceptance results:

```text
SAVE_ORG_LOG_HTTP_500 = 0
EXPECTED_ORG_LOG_ENTRIES_PERSISTED = PASS
ORG_LOG_LOST_UPDATES = 0
UNEXPECTED_DUPLICATE_ORG_LOG_ENTRIES = 0
CONCURRENT_ORG_LOG_WRITES = PASS
ORG_LOG_TENANT_ISOLATION = PASS
```

## 9. Safety and Invariants

The repair preserves these invariants:

- all reads and writes remain organization-scoped;
- an invalid or genuine database error remains visible to the caller;
- no save silently drops a legitimate concurrent entry;
- no client or server retry creates duplicate log IDs;
- FIX-013 corrected reflection drafts and validation-retry behavior remain unchanged;
- unrelated ticket, knowledge, metrics, and UI behavior remains unchanged.

## 10. Out of Scope

The following are recorded but are not part of FIX-014 repair scope:

- `saveOrgMetrics` HTTP 429 warnings — OUT_OF_SCOPE;
- duplicate-key warnings unrelated to the intelligence-log save boundary — OUT_OF_SCOPE;
- validation latency — OUT_OF_SCOPE;
- unrelated UI or navigation behavior — OUT_OF_SCOPE.

## 11. Final Diff and Repository State

- Starting HEAD: `2340081e2e5077fd8eefda7befa3bc83c8abc62e`
- Starting branch: `landing/option-c32-release-polish`
- Starting index: empty
- Pre-existing tracked modification: `AGENTS.md`
- Pre-existing untracked artifacts and QA/design files: preserved and out of scope
- FIX-014 report: created as the requested documentation artifact
- Source change: `lib/server/persistenceService.ts`
- Permanent regression: `scripts/oip-v2-fix-014-save-org-log-reliability-regression.cjs`
- Package registration: `package.json`
- Documentation artifact: `docs/qa/OIP-V2-FIX-014-save-org-log-repair.md`
- Unrelated pre-existing tracked and untracked files: preserved
- Required engineering-phase state: `HEAD_UNCHANGED = YES`, `INDEX_EMPTY = YES`, `COMMIT = NONE`, `PUSH = NONE`

## 12. Final Verdict

`OIP_V2_FIX_014_SAVE_ORG_LOG_CANDIDATE_READY_FOR_INDEPENDENT_VERIFICATION`

The repair and engineering Definition of Done are satisfied by the evidence above. The result remains a candidate until independent verification is completed. No commit or push was performed in this engineering phase.

## 13. Independent Verification Addendum — OIP-V2-FIX-014V

Independent black-box verification was completed against the actual authenticated development application after the candidate repair.

- User: Avery Morgan QA
- Organization: Meridian Field Operations
- Independent QA tickets/events: `MF-20260911-0090` through `MF-20260911-0096`
- Independent report: `docs/qa/OIP-V2-FIX-014V-independent-black-box-verification.md`
- No direct intelligence-log API calls were used for behavioral testing.
- Database inspection was read-only.
- No product source was modified during verification.

### Independent results

```text
INDEPENDENT_VERIFICATION = PASS
NORMAL_SAVE_ORG_LOG = PASS
SAVE_ORG_LOG_HTTP_500 = 0
EXPECTED_LOG_ENTRIES_PERSISTED = PASS
SAME_ORG_BURST_REQUESTS_SUCCEEDED = PASS
SAME_ORG_BURST_HTTP_500 = 0
SAME_ORG_EXPECTED_EVENTS_PRESENT = PASS
CONCURRENCY_TIMING_PROOF = LIMITED
SAME_ORG_LOST_UPDATES = 0
SAME_ORG_UNEXPECTED_DUPLICATES = 0
RETENTION_LIMIT = PASS
NEWEST_EXPECTED_ENTRIES_RETAINED = PASS
UNEXPECTED_DUPLICATE_ORG_LOG_ENTRIES = 0
ORG_LOG_TENANT_ISOLATION = PASS
UNEXPECTED_SAVE_ORG_LOG_HTTP_5XX = 0
PRODUCT_SOURCE_MODIFICATIONS_DURING_VERIFICATION = 0
```

### HTTP response evidence

- Fresh ticket processing requests returned HTTP 200.
- Observed `PUT .../intelligence-log` requests returned HTTP 200.
- Asynchronous `POST .../jobs` requests returned HTTP 202 as expected.
- No `saveOrgLog` HTTP 500 or unexpected HTTP 5xx response was observed.
- Multiple successful HTTP 200 intelligence-log PUTs were treated as lifecycle writes, not duplicate logical events. Read-only database inspection found each ticket-linked event exactly once.

### Persistence, retention, and isolation evidence

- Organization A retained 80 rows with 80 unique IDs.
- Ticket-linked events for `MF-20260911-0090` through `MF-20260911-0096` were each present exactly once.
- The two-tab same-organization burst submitted within 357 ms and retained both expected events.
- The secondary organization `E2E003R Isolation Workspace` retained its existing 7 unique rows and contained none of the verification-window ticket IDs or markers.
- The browser exposed one known unrelated React duplicate-key warning; no persistence error was emitted.

The behavioral result is now:

`OIP_V2_FIX_014_SAVE_ORG_LOG_INDEPENDENTLY_VERIFIED`
