# TODO-062B Bulk Ticket Persistence Report

## Verdict

**COMPLETED**

All TODO-062B acceptance criteria passed. The same 100-row fixture was uploaded through the real Developer Mode UI, persisted before analysis, analyzed to 100%, reloaded after refresh, and verified in the durable case list. Re-uploading the identical file did not create duplicates.

The parent TODO-062 report still contains separate classification, retrieval, drafting, and memory-promotion findings. Those areas are explicitly out of scope for TODO-062B.

## Current Architecture

Before this fix, `commitBulkCluster()` generated ticket IDs and wrote ticket records only for the cluster being approved. Unclustered rows and unapproved clusters remained only in React state, so leaving or refreshing the page discarded their ticket records.

The corrected architecture is:

```text
CSV parse
  -> stable upload key + entry IDs
  -> transactional bulk ticket preparation
  -> one durable ticket per row
  -> bulk analysis and cluster assignment
  -> persisted classification/cluster metadata
  -> optional human cluster commit and memory promotion
```

Clusters are review groups only. They are no longer persistence boundaries.

## Root Cause

The old persistence boundary was human cluster approval. Ticket creation was inside `commitBulkCluster()`, after analysis and after a reviewer chose a cluster. This made persistence depend on review state and caused the observed `100 uploaded -> 10 durable -> 90 temporary` behavior.

The fix moves ticket creation to the upload-intake boundary and makes later analysis/commit operations update those existing records.

## Persistence Flow

1. The uploader computes a deterministic key from the filename and file bytes.
2. The parsed rows are sent to `POST /api/organizations/{organizationId}/tickets/bulk-prepare` before analysis begins.
3. The server validates the batch, locks/increments the organization ticket sequence, and creates missing ticket records in one transaction.
4. Each record stores its organization, ticket ID, original message, subject, `intakeMode: "bulk"`, `bulkUploadKey`, `bulkEntryId`, status, timestamp, and nullable cluster membership.
5. Analysis updates the same rows with classification, detected language, and cluster membership while retaining `in_review` status.
6. `commitBulkCluster()` looks up the prepared rows by upload key and entry ID; it does not allocate replacement ticket IDs.

## Database Changes

Added nullable `TicketRecord` metadata:

- `bulkUploadKey`
- `bulkEntryId`
- `bulkClusterId`
- `intakeMode`

Added the composite unique index `(organizationId, bulkUploadKey, bulkEntryId)` in migration `20260729120000_add_bulk_ticket_idempotency`.

## Transaction Safety

The server preparation method validates non-empty entry IDs, rejects duplicate entry IDs in a request, requires one upload key per batch, and performs sequence allocation plus row creation inside a transaction. The unique database constraint provides a second idempotency boundary.

Evidence:

- Real UI duplicate upload of the exact same file: Developer ticket count remained `5,115`; bulk rows remained `100`.
- Developer bulk key `bulk-d5ccce9c`: `100` rows, `100` distinct entry IDs, `0` duplicate composite keys.
- Disposable `test-oip-regression` persistence probe: every retry returned the existing rows and persisted counts remained exact at 1, 10, 25, 50, and 100.
- The disposable probe removed only its own keyed rows and restored the disposable organization sequence state.

Browser interruption and malformed-row rollback were not simulated against the mature Developer organization. They were excluded from destructive testing; no production data was deliberately damaged.

## UI Validation

Fixture: `tmp/TODO-062B-developer-bulk.csv`

- Real Developer Mode bulk-upload UI: pass.
- File size: 11,058 bytes.
- Rows detected: `100`.
- Rows skipped: `0`.
- Duplicate upload: no duplicate tickets.
- Analysis result: `Analysis complete (100%)`.
- Refresh after upload and analysis: pass.
- Returning to Cases after navigation/reload: pass; UI displayed `5,115 cases found`.
- Review state: all 100 fixture tickets remained `in_review`.

## Regression Results

### Durable persistence probe

| Rows | First returned | Retry returned | Persisted | Distinct entries | Result |
|---:|---:|---:|---:|---:|---|
| 1 | 1 | 1 | 1 | 1 | PASS |
| 10 | 10 | 10 | 10 | 10 | PASS |
| 25 | 25 | 25 | 25 | 25 | PASS |
| 50 | 50 | 50 | 50 | 50 | PASS |
| 100 | 100 | 100 | 100 | 100 | PASS |

### Analysis regression

The existing TODO-062A reliability probe was run against the same deterministic fixture at 1, 10, 25, 50, and 100 rows. Every run terminated at 100% with no failure.

| Rows | Elapsed, instant provider | Reached 100% |
|---:|---:|---|
| 1 | 52 ms | Yes |
| 10 | 174 ms | Yes |
| 25 | 271 ms | Yes |
| 50 | 433 ms | Yes |
| 100 | 918 ms | Yes |

The real UI run used the configured provider and completed clustering at 100%. The fixture contains mixed English/Indonesian, mixed categories, noisy wording, customer/company details, unsupported content, and ambiguous rows.

## Performance

Measured server persistence timings from the disposable transaction probe:

| Rows | First prepare | Idempotent retry |
|---:|---:|---:|
| 1 | 181 ms | 4 ms |
| 10 | 17 ms | 2 ms |
| 25 | 24 ms | 2 ms |
| 50 | 44 ms | 4 ms |
| 100 | 75 ms | 3 ms |

The UI does not expose separate parsing, classification, retrieval, and drafting timers, so per-stage averages/P95 values are not claimed here. No UI freeze, timeout, database error, or provider error was observed in the real 100-row run.

## Data Integrity

Developer organization: `profile-oip-developer-demo`.

| Measure | Before TODO-062B | After TODO-062B | Delta |
|---|---:|---:|---:|
| Ticket records | 5,015 | 5,115 | +100 |
| Ticket sequence counter | 5,015 | 5,115 | +100 |
| Knowledge items | 46 | 46 | 0 |
| Knowledge candidates | 1,803 | 1,803 | 0 |
| Validation records | 1,802 | 1,802 | 0 |
| Memory changes | 1,802 | 1,802 | 0 |
| Trust evidence | 4,500 | 4,500 | 0 |
| Emerging patterns | 47 | 47 | 0 |
| Intelligence log rows | 118 | 118 | 0 |

For the TODO-062B upload key:

- Bulk tickets: `100`.
- Distinct entry IDs: `100`.
- Duplicate `(organizationId, bulkUploadKey, bulkEntryId)` keys: `0`.
- Classified rows: `100`.
- Clustered rows: `100`.
- Rows with original message: `100`.
- Detected language: `50 en`, `50 id`.
- Statuses: `100 in_review`.
- Ticket IDs: `OD-20260729-5016` through `OD-20260729-5115`.
- Mapping: `csv-N` maps to `OD-20260729-(5015 + N)`.

The 45 mature knowledge items present before the parent TODO-062 run were compared after this test: `0` mature fingerprints changed. Profile revision remained `33`, organization settings digest remained `b6ca9f83f8ab69ed`, and no mature record was deleted, reset, or reseeded.

## Remaining Findings

- Full parent TODO-062 classification, canonical matching, mature lesson retrieval, draft-quality, reflection, and memory-promotion findings remain documented in `docs/TODO-062-REPORT.md`; TODO-062B does not redesign those systems.
- Browser-level interruption and invalid-row rollback were not exercised against the mature Developer organization. The transaction/idempotency path was exercised on the disposable regression organization.
- The UI does not currently expose per-stage performance telemetry.

No TODO-062B persistence defect remains.

## TODO-062B Status

**COMPLETED**

Every uploaded row now exists as a durable, queryable, reviewable ticket independently of cluster approval. Refreshing, leaving the upload view, returning to Cases, and retrying the same upload preserve one-and-only-one record per source row.

## Commit

No commit created. The worktree already contained unrelated TODO-060/TODO-061/TODO-062 changes, so the TODO-062B implementation and report remain uncommitted for deliberate review and selective staging.
