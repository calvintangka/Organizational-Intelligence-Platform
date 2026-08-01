# TODO-062C1 Configured Provider Retrieval Preservation Report

## Verdict

**COMPLETED**

The configured-provider bulk path now preserves a qualifying deterministic retrieval when the provider rejects, times out, returns unusable output, exhausts its budget, or is unavailable. The unchanged `tmp/TODO-062B-developer-bulk.csv` fixture completed through the real Developer Mode UI, and the 10 applicable mature lesson matches survived the configured-provider decision path.

## Environment

- Application: http://localhost:3000/
- Account mode: Developer
- Organization: OIP Developer Demo (`profile-oip-developer-demo`)
- Bulk upload key: `bulk-d5ccce9c`
- Fixture: `tmp/TODO-062B-developer-bulk.csv` (unchanged; not regenerated)
- Provider: configured local LM Studio path with Claude fallback
- Database: connected; read-only verification succeeded
- UI: Developer Mode bulk upload enabled
- Analyze start: `2026-07-29T13:40:46.710Z`
- Analysis complete: `2026-07-29T13:44:01.355Z`

No reset, reseed, deletion, reflection, validation, promotion, or prompt change was performed for TODO-062C1.

## Pre-Test Baseline

| Measure | Baseline |
|---|---:|
| Knowledge items | 46 |
| Knowledge candidates | 1,803 |
| Validation records | 1,802 |
| Memory-change records | 1,802 |
| Ticket records | 5,115 |
| Trust evidence | 4,500 |
| Emerging patterns | 47 |
| Intelligence log rows | 118 |
| Lesson count | 180 |
| Canonical count | 46 |
| Trust total | 2,791 |
| Ticket sequence counter | 5,115 |
| Profile revision | 33 |
| Organization settings digest | `b6ca9f83f8ab69ed` |
| Metrics digest | `e3749729a664c54e` |

Mature knowledge fingerprints, lesson text digests, canonical IDs, provenance, revisions, and version lineage were captured before the run.

## Dataset Summary

- Exactly 100 rows, 10 categories x 10 rows
- 50 English and 50 Indonesian rows
- UTF-8 CSV, 11,058 bytes
- Unique external IDs `csv-1` through `csv-100`
- No duplicate rows, blank rows, malformed delimiters, or extra headers
- Real UI parser result: 100 queries detected, 0 rows skipped
- Same fixture reused from the prior stalled run

## Bulk Upload Results

The complete fixture was uploaded through the real Developer Mode bulk-upload UI. The UI reported 100 detected queries and 0 skipped rows. Analysis reached `Analysis complete (100%)` after the row-analysis and clustering phases.

| Measure | Result |
|---|---:|
| Rows accepted | 100 |
| Rows rejected | 0 |
| Rows skipped | 0 |
| Duplicate warnings | 0 |
| Parsing warnings | 0 |
| UI/server errors affecting completion | 0 |

## Ticket Creation Results

| Check | Result |
|---|---:|
| Organization tickets after run | 5,115 |
| Bulk tickets | 100 |
| Distinct entry IDs | 100 |
| Duplicate upload-key/entry keys | 0 |
| Classified | 100 |
| Clustered or intentionally unclustered | 100 |
| Raw messages preserved | 100 |
| Status | 100 `in_review` |
| Languages | 50 `en`, 50 `id` |

The mapping is one-to-one and monotonic: `csv-n` maps to `OD-20260729-(5015+n)`, from `csv-1 -> OD-20260729-5016` through `csv-100 -> OD-20260729-5115`. No row, customer, company, language, or external ID swap was found.

## Classification Summary

Classification and canonical results remained identical to the deterministic parity probe and the prior TODO-062C run.

| Fixture category | Persisted result | Result |
|---|---|---:|
| Password Reset | Login / Password Reset | 10/10 |
| Login and Access | Account Access / Account Access Failure (5); Login / Login Issue (5) | 10/10 safe |
| Account Activation | Activation / Activation Failure | 10/10 |
| Billing and Invoice | Billing / Billing & Invoice Issue | 10/10 |
| Refund and Payment | Billing / Billing & Charge Issue | 10/10 |
| Shipping and Delivery | Delivery / Delivery Problem (5); Delivery Delay / Delivery Delay (5) | 10/10 |
| Product Information | Business Inquiry / Product Information Inquiry | 10/10 |
| Company and Business Inquiry | Business Inquiry / General Business Inquiry (5); Multilingual Support Inquiry (5) | 10/10 |
| New reusable knowledge | Reporting & Exports (5); Uncategorized (5) | 10/10 safe |
| Ambiguous/noisy/unsupported | Account Access (5); Uncategorized (5) | 10/10 safe |

## Confusion Matrix

| Expected intent | Account Access | Login | Activation | Billing | Delivery | Delivery Delay | Business Inquiry | Reporting & Exports | Uncategorized |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Password reset | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Login/access | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Activation | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Billing/invoice | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| Refund/payment | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| Shipping/delivery | 0 | 0 | 0 | 0 | 5 | 5 | 0 | 0 | 0 |
| Product information | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 |
| Company/business | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 |
| New knowledge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 5 |
| Ambiguous/noisy | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |

Supported categories were 100% safe/correct against the fixture expectations. Ambiguous and intentionally unsupported rows were retained for human review rather than forced into unsafe canonicals.

## Language Results

- English detection: 50/50
- Indonesian detection: 50/50
- Unicode preservation: passed
- Deterministic cross-language parity: passed
- Configured-provider mature-memory preservation: passed for both mature-memory lesson groups

## Retrieval Results

The exact deterministic parity probe remains green:

```text
fixtureRows: 100
categoryParity: 100
canonicalParity: 100
memoryParity: 100
lessonParity: 100
languageParity: 100
bulkMemoryHits: 10
singleMemoryHits: 10
bulkLessonHits: 10
mismatches: []
```

The real configured-provider UI result persisted:

| Retrieval result | Count |
|---|---:|
| Mature lesson matches | 10 |
| Mature knowledge IDs | 10 |
| No match | 90 |
| Retrieval audit records | 100 |

The 10 retained matches were:

- `demo-ki-invoice-currency-display` / `demo-les-invoice-currency-display-001`: 5 tickets
- `demo-ki-invoice-pdf-stale-address` / `demo-les-invoice-pdf-stale-address-001`: 5 tickets

The audit grouping was:

| Decision | Provider outcome | Count |
|---|---|---:|
| `deterministic_preserved` | `rejected` | 10 |
| `rejected_by_compatibility` | `not_run` | 90 |

Representative retained row `csv-31` (`OD-20260729-5046`) recorded deterministic score 77, the mature knowledge ID, the lesson ID, provider label `LM Studio`, provider outcome `rejected`, and the reason that the score met the preservation floor. This directly distinguishes a provider rejection from no candidate and proves that provider rejection no longer erases deterministic retrieval.

## Decision Trace and Root Cause

The configured-provider bulk path is:

```text
language detection
  -> understanding and business routing
  -> canonical selection
  -> deterministic retrieveMemory
  -> lesson preselection and compatibility gate
  -> deterministic ranking
  -> configured AI discrimination
  -> final retrieval decision
  -> durable ticket memoryMatch + retrievalAudit
```

The original destructive decision point was the AI discrimination branch in `lib/bulkUpload.ts`: when the provider returned `isDistinctFromMatch` with non-low confidence, the code set `existingMatch = null` and `retrievedLessonId = null`. That erased a deterministic match even when the provider response was truncated, unavailable, or not supported by explicit contradiction evidence.

The fix is at the same decision point:

- deterministic retrieval is captured before provider execution;
- a score of at least 70 is a preservation floor, not a lower retrieval threshold;
- a provider may confirm or improve the deterministic result;
- only a high-confidence provider rejection with explicit contradiction language can reject a below-floor deterministic match;
- provider failures preserve the deterministic result;
- the original deterministic IDs and score remain in `retrievalAudit` even if a below-floor result is explicitly rejected;
- bulk persistence in `app/page.tsx` writes the audit beside `memoryMatch`.

No AI prompt was changed for this fix.

## Draft Quality Results

Human review remained available for all 100 tickets. Existing lesson-grounded results were preserved for the 10 applicable tickets. No reflection or validation action was taken, so no new lesson was created. The unchanged fixture contained no evidence requiring a new memory promotion in this scoped retrieval-preservation task.

The bulk UI exposes cluster review rather than 100 independent draft panels; therefore exhaustive per-ticket prose review and per-stage draft timing were not instrumented in this task. Database checks found no cross-ticket text or identity swaps.

## Provider Results

Observed and controlled outcomes:

| Failure mode | Expected policy | Result |
|---|---|---|
| LM timeout/exception | Preserve qualifying deterministic retrieval | Guarded path preserves; controlled unavailable/exception scenarios retained 10/10 |
| `finish_reason=length` | Treat as no valid provider result | Preserved deterministic retrieval |
| Malformed JSON | Treat as no valid provider result | Preserved deterministic retrieval |
| Provider unavailable | Preserve deterministic retrieval | Real run retained 10/10 applicable matches |
| Claude fallback failure | Preserve deterministic retrieval | No mature match was cleared by fallback failure |
| AI budget exhausted | Preserve deterministic retrieval | Explicit `budget_exhausted` audit outcome in controlled probe |
| Cancellation | Abort the run without committing a partial analyzed result | Not deliberately exercised against production data |
| Unexpected guarded exception | Preserve deterministic retrieval | Explicit `exception` audit outcome in controlled probe |

The real configured provider returned rejection outcomes for the 10 mature candidates. The audit proves those rejections were non-destructive.

## New Knowledge Review

No new knowledge was promoted. Category 9 remained review-only and was not used to manufacture a canonical, lesson, or memory record. Existing-memory paraphrases remained reuse candidates; duplicate lessons were not created.

## Reflections Completed

None. TODO-062C1 is limited to preservation of retrieval and auditability; reflection and promotion were intentionally not invoked.

## Memory Promotion Results

None. Knowledge items, lessons, canonicals, candidates, validations, memory changes, trust evidence, and provenance were not changed.

## New-Memory Retrieval Tests

Not applicable. No new memory was promoted in this task.

## Duplicate Prevention

- The exact same fixture and stable upload key were reused.
- Final database state contained 100 bulk rows, 100 distinct entry IDs, and 0 duplicate upload-key/entry keys.
- No duplicate canonical, knowledge item, or lesson was created.
- Same-file retry/idempotency remained intact; the organization ticket count stayed at 5,115.

## Cross-Ticket Contamination Review

- All 100 raw messages were preserved.
- External IDs, customer/company fields, and languages remained one-to-one.
- No prior ticket draft or customer-specific memory was copied into another ticket.
- Retrieval audit retains deterministic source IDs rather than borrowing a previous ticket's result.

## Transaction and Retry Safety

- Complete upload: passed.
- Same-file retry: passed without duplicate tickets.
- Duplicate external ID behavior: stable idempotent upload key; no duplicate durable row.
- Partial invalid row and deliberate interruption: not exercised because production data was not to be damaged.
- No silent partial corruption was observed.

## Performance

| Measure | Result |
|---|---|
| File parsing | 100 rows immediately detected; exact milliseconds not exposed by UI |
| Total configured-provider processing | 194.645 seconds |
| Row analysis | Progress reached the explicit 0-80% phase |
| Clustering | Progress reached the explicit 80-99% phase |
| Average/median/P95 per-ticket stages | Not instrumented by the current UI |
| Slowest visible phase | Clustering/provider-assisted discrimination |
| Database errors affecting tickets | 0 |
| Provider failures | Present but safely handled |
| UI freeze | None observed |
| Former 99% stall | Not reproduced |

## Data Safety

Post-run baseline capture matched the pre-test values:

| Measure | Before | After |
|---|---:|---:|
| Knowledge items | 46 | 46 |
| Knowledge candidates | 1,803 | 1,803 |
| Validation records | 1,802 | 1,802 |
| Memory-change records | 1,802 | 1,802 |
| Ticket records | 5,115 | 5,115 |
| Trust evidence | 4,500 | 4,500 |
| Emerging patterns | 47 | 47 |
| Intelligence log rows | 118 | 118 |
| Lesson count | 180 | 180 |
| Canonical count | 46 | 46 |
| Trust total | 2,791 | 2,791 |
| Ticket sequence counter | 5,115 | 5,115 |
| Profile revision | 33 | 33 |

Organization settings digest, metrics digest, existing knowledge text, existing lesson text, canonical IDs, provenance, revisions, and version lineage remained unchanged. No mature record was deleted or reseeded.

## Defects Found

### Resolved: configured-provider retrieval erased deterministic matches

- Category: Knowledge retrieval / Lesson retrieval / Provider failure
- Rows: `csv-31` through `csv-40` (10 applicable mature-memory rows)
- Expected: Provider rejection or failure must not erase a qualifying deterministic match.
- Actual before fix: configured-provider bulk results persisted zero mature-memory and zero lesson matches.
- Actual after fix: 10 mature-memory and 10 lesson matches persisted; provider rejection was audited as `deterministic_preserved`.
- Evidence: real UI run, database grouping, representative audit payload, deterministic parity probe, and controlled provider-outcome probes.
- Reproducibility: original unchanged fixture reproduced the failure before the fix and passed after the fix.
- Root cause: broad AI discrimination cleared deterministic state on a non-low-confidence distinct response without requiring explicit contradiction evidence or preserving the deterministic candidate on provider failure.
- Severity: High before fix; resolved by this change.
- Production code changed: Yes, targeted retrieval preservation and auditability only.

No unresolved C1 memory-retrieval defect was found. The earlier TODO-062C candidate-persistence warning was not part of this change and caused no ticket or memory mutation in this run.

## Created Ticket IDs

All 100 IDs were verified by `scripts/todo062b-db-check.cjs`:

`csv-1 -> OD-20260729-5016`, incrementing by one through `csv-100 -> OD-20260729-5115`.

## Remaining Findings

- Add production timing instrumentation if exact per-ticket average, median, and P95 reporting is required.
- Exercise cancellation and a disposable malformed-row fixture in a non-production test organization.
- The single-ticket AI discrimination branch still has separate logic; it was outside the scoped bulk retrieval fix and was not changed here.

## TODO-062C1 Status

**COMPLETED**

The original fixture was reused unchanged. The reliability fix changed the configured-provider retrieval decision only: deterministic retrieval is now preserved when the provider cannot provide valid contradictory evidence, and the outcome is durable and auditable. Classification parity, 100-row persistence, configured-provider completion, 10/10 mature lesson preservation, duplicate prevention, and mature-memory safety all passed.

## Commit

No commit was created. The worktree contains prior TODO-060/061/062 changes plus the scoped TODO-062C1 retrieval-preservation changes; no commit was requested.
