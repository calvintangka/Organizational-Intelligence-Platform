# RSS-2.6 — Concurrent Client + Revision Observability Report

**Audit date:** 2026-08-09
**Branch:** `master`
**HEAD:** `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
**Certified baseline:** `v0.1.0-certified` still dereferences to `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba` (not modified)

## 1. Executive Summary

RSS-2.6 preserves optimistic concurrency and makes genuine KnowledgeItem revision conflicts programmatically observable. A stale write remains HTTP 409, now with `REVISION_CONFLICT`, resource identity, expected/current revision, and an optional request ID. The adapter preserves those fields. The UI presents a controlled “updated elsewhere” notice with **Reload latest**; it never blindly replays the stale payload.

The permanent disposable probe verified two authenticated clients, reload/retry, a ten-request same-revision burst, authorization ordering, cross-organization isolation, and mature-state immutability. No certified tag, mature resource, organization limit, or RSS-2.1 switching behavior was changed.

## 2. Final Verdict

**CONCURRENT_CLIENT_REVISION_OBSERVABILITY_VERIFIED**

## 3. Background

The historical 409 (`stored revision 54`, `expected 53`) was a correct lost-update guard reached unnecessarily during organization switching. RSS-2.1 removed the outgoing whole-snapshot flush. RSS-2.6 retains the guard for genuine direct writes and improves diagnosis and recovery.

## 4. Documentation Reviewed

RSS-2.0 through RSS-2.5 reports, `docs/CHANGELOG.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/PRODUCTION_CONFIGURATION.md`, the RSS-1.2S3 server-owned write report, persistence/runtime reports, TODO-078 RBAC material, `lib/server/persistenceService.ts`, `lib/persistence/serverPersistenceAdapter.ts`, `lib/persistence/session.ts`, and `app/page.tsx`.

## 5. Baseline

The working tree was already dirty from RSS-2.0–2.5; those changes were preserved. PostgreSQL reports 23 migrations and an up-to-date schema. Runtime: Node `v24.14.1`, npm `11.11.0`, Next.js `15.5.22`. Mature protected data was digested before and after the disposable run; the digest was identical. Disposable users, organizations, role fixtures, and knowledge rows were zero after cleanup.

## 6. Revision Model Inventory

| Resource | Revision Mechanism | Conflict Contract | Result |
| --- | --- | --- | --- |
| `KnowledgeItem` | integer `revision`, initial 1; `UPDATE ... WHERE id, organizationId, revision`; bump by one | HTTP 409, `REVISION_CONFLICT`, expected/current revision and resource identity | ENFORCED |
| Organization profile | `updatedAt` plus `_profileRevision` in settings | HTTP 409 generic `CONFLICT`; client reloads profile | ENFORCED |
| Candidates, metrics, logs, patterns | no per-row optimistic revision | snapshot upsert/transaction behavior | NO REVISION FIELD |
| Tickets | server-owned workflow transition and idempotency/state checks | route-specific structured errors | SERVER WORKFLOW GUARD |
| Validation/memory audit | append-only transactional commit; no snapshot PUT | commit/idempotency conflicts | APPEND-ONLY |

KnowledgeItem is the only canonical resource with an integer optimistic revision. Snapshot `saveKnowledge` updates every submitted item and can therefore advance unchanged included rows; this is documented behavior, not last-write-wins.

## 7. Original 409 Path

The old path was `selectOrganization` → `persistOrganizationState` → `saveKnowledge` → conditional KnowledgeItem update. A browser holding revision 53 submitted an unchanged item while PostgreSQL held 54. The guard correctly rejected it. RSS-2.1 removed `persistOrganizationState` from `selectOrganization`; the current source and RSS-2.1 probe both assert that no whole-snapshot or knowledge write occurs during switching.

## 8. RSS-2.1 Relationship

The switch remains server-authoritative: explicit ticket/profile queues drain first, active organization changes, then incoming state loads. A stale knowledge snapshot cannot block a normal switch. Direct stale knowledge writes still return 409.

## 9. Conflict Contract

Authorized revision conflicts return:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "... Reload the latest version before saving again.",
    "resourceType": "knowledge",
    "resourceId": "…",
    "expectedRevision": 1,
    "currentRevision": 2,
    "requestId": "…"
  }
}
```

The body excludes resource content, SQL, secrets, and stack traces. `requestId` is returned only when supplied by the request headers.

## 10. Server Conflict Classification

Revision mismatches use `REVISION_CONFLICT` and HTTP 409. Generic idempotency/profile/payload conflicts remain `CONFLICT`; validation, authorization, authentication, and infrastructure errors retain their existing classes/statuses.

## 11. Adapter Error Contract

`ServerPersistenceAdapterError` now preserves structured conflict details (`resourceType`, `resourceId`, `expectedRevision`, `currentRevision`, `requestId`) instead of forcing clients to parse human text. Network, authentication, authorization, validation, and server errors remain distinguishable.

## 12. Two-Client Conflict

Two authenticated sessions loaded the same disposable item at revision 1. Client A saved successfully to revision 2. Client B’s stale revision-1 write returned HTTP 409 / `REVISION_CONFLICT`; A’s title remained authoritative.

## 13. Reload / Retry

Client B reloaded the server item at revision 2, intentionally changed it, and saved successfully at revision 3. The stale request did not increment the revision.

## 14. Multiple Browser Tabs

The permanent probe verifies the same behavior using two authenticated HTTP clients. A real in-app browser two-tab rehearsal was **not executed** in this run; it is reported as such rather than inferred from the API test.

## 15. Conflict UX

The smallest recovery UI is implemented in `app/page.tsx`: “This item was updated elsewhere…” plus a **Reload latest** action. Raw stored/expected revision text is diagnostic only.

## 16. Unsaved Work Behavior

The stale server write is never applied. The local attempted state remains until the user chooses reload, but reload replaces the editor’s knowledge collection; no automatic merge or durable draft buffer is claimed. Result: **PARTIAL** preservation.

## 17. Retry Loop Analysis

The adapter performs no automatic retry. Persistence effects catch and surface failures; a 409 does not replay the same stale payload. Promotion marks stale revision failures retryable for an intentional user retry only.

## 18. Background Persistence

The existing background collection effects use the same guarded write path and surface conflicts. RSS-2.1’s switch path does not reintroduce background whole-organization flushing. Durable job retries are separate workflow/idempotency retries and do not rewrite a stale KnowledgeItem revision.

## 19. Resource-Level Isolation

After the A conflict, a valid write to independent resource B succeeded. Snapshot writes include all submitted rows and may advance their revisions as part of one transaction; the conflict still aborts the transaction atomically and does not poison the organization or prevent later valid writes.

## 20. Organization Switching During Conflict

The source contract and RSS-2.1 regression prove a conflict remains scoped to the write that caused it. Switching does not resolve it by flushing Org A and does not leak the stale resource into another organization.

## 21. Refresh / Restart

The reload action reads authoritative PostgreSQL state and suppresses hydration echo-writes. A full browser refresh/hard-refresh and a Next.js restart were not separately executed during this acceptance run; durable authority is nevertheless demonstrated by direct database readback and the API’s process-independent conditional update.

## 22. Multi-User Concurrency

The probe provisions two users with authorized membership in Org A and uses separate authenticated clients; the core stale-write sequence is exercised with the two client sessions. No invitation UX was added.

## 23. Authorization vs Conflict Ordering

An unauthorised caller received 403 with no revision fields. A request without a session received 401. Authorization is enforced by the organization route before the persistence handler can compare revisions.

## 24. Revision Monotonicity

The primary resource followed 1 → 2 → 3 across successful writes. Rejected stale writes did not bump the row. Validation and unauthorized requests did not mutate it. The burst resource advanced exactly once for the single winning request.

## 25. Concurrent Burst

Ten simultaneous writes from the same revision produced exactly one HTTP 200 and nine HTTP 409 responses. The final row had one authoritative title and one revision increment; no duplicate resource or malformed JSON appeared.

## 26. Cross-Organization Isolation

Org A’s conflict and burst did not prevent a valid write to an equivalent disposable resource in Org B. Mature organizations were not used for mutation.

## 27. Observability

Revision conflicts emit metadata-only process-local telemetry (`revision_conflict`) with organization, resource, expected/current revision, and rejected outcome. Authorization decisions continue through the existing durable authorization audit table. No resource body or secret is logged.

## 28. Correlation / Diagnostics

If `x-request-id` or `x-correlation-id` is supplied, the same safe request ID is returned in the conflict envelope and response header. The ordinary browser adapter currently supplies context internally but does not add these HTTP headers, so cross-request correlation is available when callers provide it and otherwise remains a documented limitation.

## 29. Security Negative Controls

PASS: unauthorized and unauthenticated callers receive no revision details; stale writes cannot overwrite newer data; rejected writes do not increment revisions; Org A conflict exposes nothing about Org B; conflict bodies contain no customer content; no blind stale retry exists; direct stale write remains HTTP 409.

## 30. Regression Results

| Scenario | Expected | Actual | Result |
| --- | --- | --- | --- |
| RSS-2.1 | switch without snapshot flush; stale direct write 409 | passed | PASS |
| RSS-2.2 | server-owned creation/Owner | passed | PASS |
| RSS-2.3 | signup/zero-org onboarding | passed | PASS |
| RSS-2.4 | demo isolation | passed | PASS |
| RSS-2.5 | membership/ownership/limits | passed | PASS |
| TODO-078 RBAC, auth, active org, switching | pass | passed | PASS |
| TypeScript | no errors | passed | PASS |
| Prisma validation/status | valid/up to date | passed | PASS |
| Production build | success | passed on Next 15.5.22 | PASS |
| OIP Benchmark | 1000/1000 | 1000/1000, 100% overall, 100% critical security | PASS |

## 31. Data Integrity

The mature digest covering Developer Demo, FastDrop, and Maesa organizations, memberships, role assignments, knowledge, candidates, validation/memory history, tickets, metrics, logs, patterns, and persistence authority was unchanged. Disposable cleanup completed with zero RSS-2.6 users, organizations, knowledge rows, or role fixtures.

## 32. Remaining Limitations

There is no real-time collaborative editing, semantic merge, WebSocket/cross-tab live synchronization, durable revision history per write, or dedicated conflict telemetry platform. Snapshot collection writes can advance unchanged included rows. Browser two-tab and Next.js restart rehearsals remain operational follow-ups.

## 33. Recommendation

Keep the revision guard and structured contract. A future bounded task may add durable conflict audit records or cross-tab refresh signaling if product evidence requires them. Do not weaken 409 protection or start RSS-2.7 automatically.

## 34. Final Verdict

**CONCURRENT_CLIENT_REVISION_OBSERVABILITY_VERIFIED**

Permanent acceptance probe: [scripts/rss-2.6-concurrent-client-revision-observability-probe.cjs](../scripts/rss-2.6-concurrent-client-revision-observability-probe.cjs)
