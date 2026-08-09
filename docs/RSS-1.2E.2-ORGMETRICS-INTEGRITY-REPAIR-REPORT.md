# RSS-1.2E.2 - OrgMetrics Integrity Repair

Date: 2026-08-07  
Organization: `profile-oip-developer-demo`  
Scope: `lifetimeTickets`, `knowledgeReused`, `knowledgeVersions`, `emergingPatternsDetected` only

## Executive Summary

RSS-1.2E.2 is complete for the four confirmed Class A OrgMetrics fields. The repair derives each value from persisted rows and writes only those four columns in one controlled, serializable transaction.

| Field | Before | Derived/after | Difference |
| --- | ---: | ---: | ---: |
| `lifetimeTickets` | 5,003 | 5,180 | +177 |
| `knowledgeReused` | 4,707 | 4,723 | +16 |
| `knowledgeVersions` | 130 | 133 | +3 |
| `emergingPatternsDetected` | 54 | 50 | -4 |

The post-repair dry run is zero-delta for all four fields. A non-metrics digest remained unchanged across the controlled update, and no writes were made to `mergedTickets`, `duplicatePreventions`, or `promotedPatterns`.

## Root Cause Analysis

- `lifetimeTickets`: several durable ticket and bulk-import paths persisted tickets without updating the client-side metrics patch. The UI resolution path was not an authoritative counter.
- `knowledgeReused`: the same client-specific patch counted only some resolutions; server ticket/reflection writes did not derive reuse from durable ticket-to-knowledge references.
- `knowledgeVersions`: reflection and bulk paths could append embedded versions while the metrics increment was partial or absent.
- `emergingPatternsDetected`: `patternDiscoveryStore` incremented an event-like counter for `patternFound`, including strengthening/replay events. The product meaning is the number of distinct persisted emerging-pattern rows.

### Write-path dependency map

| Path | Durable work | Metric boundary and replay behavior |
| --- | --- | --- |
| Ticket creation/update | `saveTicketRecords` and server-owned `saveClientTicketRecords` upsert `ticket_records`. | Metrics row is locked first; recomputation is in the same transaction. |
| Bulk import | `prepareBulkTicketRecords` upserts the prepared ticket set. | Same lock/recompute boundary; the unique ticket key makes a replay an upsert, not a second ticket. |
| Reflection promotion / validation approval | `commitValidation` writes candidate, validation, memory, evidence, and knowledge rows. | The promotion transaction recomputes after the durable write; an idempotency replay recomputes and returns without incrementing. |
| Version creation | `saveKnowledge` and the `commitValidation` version path append embedded `knowledgeVersions`. | Version total is re-derived from stored arrays in the same transaction. |
| Pattern creation/strengthening | `saveEmergingPatterns` and `PatternDiscoveryStore` upsert patterns and evidence. | Distinct pattern rows are counted; strengthening and duplicate evidence replay do not increment the metric. |
| Migration import | Resource writes are followed by `finalizeBatch`. | Finalization recomputes in the same transaction as the status transition. |
| Retry/idempotency/concurrency | All above paths use scoped unique keys/upserts and lock the same metrics row before mutation. | A retry observes persisted rows and writes the same projection; serializable pattern/reconciliation transactions retry safely. |

## Product Repair

`lib/server/persistenceService.ts` now owns the authoritative derivation and recomputation. The implementation:

- derives ticket count, valid knowledge reuse, embedded knowledge-version count, and distinct pattern-row count from persisted rows;
- locks the organization metrics row with `SELECT ... FOR UPDATE` before writes;
- recomputes after knowledge, ticket, bulk-ticket, pattern, and validation/reflection writes;
- strips the four authoritative fields from caller-provided `saveOrgMetrics` patches;
- handles idempotent validation replay by recomputing within the replay transaction.

`lib/server/jobs/patternDiscoveryStore.ts` now recomputes from distinct rows rather than incrementing on strengthening, and does so on create, replay, and outcome completion. Migration import finalization also recomputes in the same transaction as the final batch status transition.

Two runnable utilities were added:

- `scripts/rss-1.2e2-orgmetrics-reconciliation.cjs` (dry run by default; controlled apply requires `--apply --confirm`)
- `scripts/rss-1.2e2-orgmetrics-concurrency-probe.cjs` (disposable concurrency/idempotency fixture)

Package aliases are available as `npm run probe:rss-1.2e2-orgmetrics-reconciliation` and `npm run probe:rss-1.2e2-orgmetrics-concurrency`.

## Transaction Analysis

The controlled repair used `Serializable` isolation, locked the target `org_metrics` row, verified the exact expected pre-state, derived values inside the transaction, and updated only the four authorized columns. The recomputation helper uses the same lock-before-write ordering across production paths, preventing lost counter increments under concurrent writers. Replays derive the same value rather than incrementing again.

## Metric Semantics

| Metric | Authoritative definition |
| --- | --- |
| `lifetimeTickets` | Number of persisted `ticket_records` for the organization. |
| `knowledgeReused` | Resolved tickets whose `memoryMatch.knowledgeId` resolves to a persisted knowledge item, is not that item's source ticket, and occurred at or after the item's creation. |
| `knowledgeVersions` | Sum of `content.knowledgeVersions` array lengths across persisted knowledge items. |
| `emergingPatternsDetected` | Number of distinct persisted `emerging_patterns` rows. Strengthening/replay does not increase it. |

## Dry Run Results

Command: `node scripts/rss-1.2e2-orgmetrics-reconciliation.cjs --dry-run`

- Current: `5,180 / 4,723 / 133 / 50`
- Derived: `5,180 / 4,723 / 133 / 50`
- Differences: `0 / 0 / 0 / 0`
- Non-metrics digest: `c473d9d3f3d10b6f5951d853c9c1f651a32eb3e6c27b1f8234d445611c01f8ae`
- Metrics digest before and after read-only derivation: `ae215cfc00f160947dd0947f8aae3f74d7323adaad0bd63be0802fa70f47b6c6`

The dry-run SQL was restricted to an update of the four named columns for `profile-oip-developer-demo`.

## Reconciliation Results

The single controlled apply used actor `system:rss-1.2e.2` and correlation ID `rss-1.2e.2:2026-08-07:orgmetrics-reconciliation-001` at `2026-08-07T10:44:24.054Z`.

- Before: `5003, 4707, 130, 54`
- After: `5180, 4723, 133, 50`
- Rollback values: the exact before-state values above
- Integrity digest: `c5b50f965df910a852be9ac2d1b619a304112e08b2f406d53ccd446ef99696df`
- Non-metrics digest after: `c473d9d3f3d10b6f5951d853c9c1f651a32eb3e6c27b1f8234d445611c01f8ae` (unchanged)

## Concurrency Results

The disposable probe executed 100 simultaneous ticket writes, two identical 100-row bulk-import preparations, one reflection promotion, one version creation, and 50 pattern creates followed by strengthening replay.

Persisted values were `lifetimeTickets=200`, `knowledgeReused=0`, `knowledgeVersions=2`, `emergingPatternsDetected=50`; derived values were identical. Bulk replay was idempotent, and the disposable organization was deleted in cleanup. The run emitted a non-blocking `pg` client-query deprecation warning after successful assertions.

## Regression Results

PASS: TypeScript (`npx tsc --noEmit`), Prisma validation, production build, TODO-025H, TODO-058, TODO-058B, TODO-078 live RBAC, TODO-080, TODO-082A, TODO-082C, TODO-083 calibration, and OIP benchmark (1,000/1,000; 100% overall and critical-security cases).

The Developer Demo integrity probe now reports all four Class A metrics matching their persisted-row derivations. Its non-zero exit remains attributable to the previously classified historical/probe findings, not to these four fields.

## Data Integrity

The protected Developer Demo counts and snapshots remained stable: knowledge 47, candidates 1,805, validations 1,804, memory 1,804, evidence 4,500, tickets 5,180, patterns 50, versions 133, lessons 181, and ticket sequence 5,180. The before/after non-metrics digest proves the controlled repair changed no data outside the four authorized metric columns. The concurrency fixture was isolated and removed.

## Remaining Limitations

The legacy Developer Demo integrity probe still contains historical/probe defects (actor-roster assertions, older merge/promoted-pattern derivations, historical references, and sequence-era checks). These are outside RSS-1.2E.2 scope and remain classified for RSS-1.2E.3 probe modernization. No additional production-data inconsistency was repaired or concealed.

## Recommendation

Mark RSS-1.2E.2 complete and retain the reconciliation utility for repeatable dry-run verification. Proceed to RSS-1.2E.3 to modernize the remaining integrity probe classifications, then rerun final live acceptance without changing the three explicitly protected metrics.
