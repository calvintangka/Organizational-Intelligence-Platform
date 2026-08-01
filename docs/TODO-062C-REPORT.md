# TODO-062C Developer Bulk Classification & Mature Memory Retrieval Report

## Verdict

**MEMORY_DEFECT_FOUND**

Classification and durable bulk persistence passed on the unchanged TODO-062B fixture. The scoped test did not pass end to end because the real configured-provider run persisted zero mature-memory matches and zero lesson matches. No reflection, validation, memory promotion, or commit was performed.

## Environment

- Application: http://localhost:3000/
- Account mode: Developer
- Organization: OIP Developer Demo (profile-oip-developer-demo)
- Bulk page: available and enabled
- Provider: local LM Studio path with Claude fallback
- Database: connected; direct read-only verification succeeded
- Fixture: tmp/TODO-062B-developer-bulk.csv
- Upload key: bulk-d5ccce9c
- Latest Analyze click: 2026-07-29T13:10:35.998Z
- No reset, reseed, deletion, or mature-memory mutation was performed.

The UI displayed a persistent warning after the development-server restart: “Persistence failed for saveKnowledgeCandidates: Server persistence could not read knowledge candidates.” This did not prevent the 100 ticket records from being persisted, but it is recorded as a separate finding.

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
| Organization settings digest | b6ca9f83f8ab69ed |
| Metrics digest | e3749729a664c54e |

Knowledge fingerprints, lesson text digests, canonical IDs, provenance, revisions, and version lineage were captured.

## Dataset Summary

- Exactly 100 rows; 10 categories × 10 rows
- 50 English and 50 Indonesian rows
- File size: 11,058 bytes
- UTF-8, one message header, unique IDs csv-1 through csv-100
- Duplicate rows: 0; blank rows: 0
- Parser result: 100 detected, 0 skipped
- Shape: raw_queries
- Fixture reused unchanged; it was not regenerated.

## Bulk Upload Results

- Complete file selected through the real Developer Mode bulk-upload UI.
- UI showed 100 queries detected, 0 rows skipped.
- No delimiter, Unicode, duplicate-row, or header warning appeared.
- Analysis reached Analysis complete (100%).
- The UI visibly progressed through row analysis and a separate clustering phase.
- 30 rows were intentionally placed in the unclustered bucket; none were silently lost.
- The same upload key was reused for the final rerun.

## Ticket Creation Results

| Check | Result |
|---|---:|
| Total organization tickets | 5,115 |
| Bulk tickets | 100 |
| Distinct external IDs | 100 |
| Duplicate upload-key/entry keys | 0 |
| Classified | 100 |
| Cluster-assigned | 100 |
| Raw messages preserved | 100 |
| Status | 100 in_review |
| Languages | 50 en, 50 id |
| Ticket range | OD-20260729-5016 through OD-20260729-5115 |

Complete mapping is one-to-one and monotonic: csv-n → OD-20260729-(5015+n), for every n from 1 through 100.

Grouped ranges:

- csv-1..csv-10 → OD-20260729-5016..OD-20260729-5025
- csv-11..csv-20 → OD-20260729-5026..OD-20260729-5035
- csv-21..csv-30 → OD-20260729-5036..OD-20260729-5045
- csv-31..csv-40 → OD-20260729-5046..OD-20260729-5055
- csv-41..csv-50 → OD-20260729-5056..OD-20260729-5065
- csv-51..csv-60 → OD-20260729-5066..OD-20260729-5075
- csv-61..csv-70 → OD-20260729-5076..OD-20260729-5085
- csv-71..csv-80 → OD-20260729-5086..OD-20260729-5095
- csv-81..csv-90 → OD-20260729-5096..OD-20260729-5105
- csv-91..csv-100 → OD-20260729-5106..OD-20260729-5115

## Classification Summary

The deterministic parity probe and persisted UI result agree on all 100 rows for category and canonical selection. Business Inquiry routing and Password Reset specificity now work in bulk.

| Fixture category | Persisted result | Safe/correct |
|---|---|---:|
| Password Reset | Login / Password Reset: 10 | 10/10 |
| Login and Access | Login / Login Issue: 10 | 10/10 |
| Account Activation | Activation / Activation Failure: 10 | 10/10 |
| Billing and Invoice | Billing / Billing & Invoice Issue: 10 | 10/10 |
| Refund and Payment | Billing / Billing & Charge Issue: 10 | 10/10 |
| Shipping and Delivery | Delivery Delay: 5; Delivery Problem: 5 | 10/10 |
| Product Information | Business Inquiry / Product Information Inquiry: 10 | 10/10 |
| Company/Business Inquiry | Business Inquiry / Multilingual Support Inquiry: 5; General Business Inquiry: 5 | 10/10 |
| New reusable knowledge | Reporting & Exports: 5; Uncategorized: 5 | 10/10 safe |
| Ambiguous/noisy/unsupported | Account Access: 5; Uncategorized: 5 | 10/10 safe |

## Confusion Matrix

| Expected intent | Account Access | Login | Activation | Billing | Delivery | Delivery Delay | Business Inquiry | Reporting & Exports | Uncategorized |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Password reset | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Login/access | 5 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Activation | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Billing/invoice | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| Refund/payment | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| Shipping/delivery | 0 | 0 | 0 | 0 | 5 | 5 | 0 | 0 | 0 |
| Product information | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 |
| Company/business | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 |
| New knowledge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 5 |
| Ambiguous/noisy | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |

The Account Access outcomes are conservative handling of access-denied/contradictory wording, not unsafe cross-domain matches. No unsafe cross-domain canonical match was identified.

## Language Results

- English detection: 50/50
- Indonesian detection: 50/50
- Unicode preservation: passed
- Cross-language classification parity: passed in the deterministic probe
- Cross-language mature-memory retrieval: not proven because live persisted mature-memory hits were zero

## Retrieval Results

Deterministic parity probe, using the same profile, knowledge, fixture, and bulk code path with advisory AI disabled:

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

The real configured-provider UI run persisted:

| Retrieval field | Result |
|---|---:|
| Records with a memoryMatch object | 100 |
| memoryMatch.matchType = lesson | 0 |
| Non-null mature knowledgeId | 0 |
| Non-null lessonId | 0 |

The 10 deterministic candidates were billing/invoice rows. Their lesson evidence was below the current strong-lesson threshold; the representative match had score 1, one multi-token signal (billing invoice), and no contradiction. The bulk path therefore entered broad AI discrimination. The final live records cleared those matches. This is safe against unsupported reuse, but it fails the TODO-062C requirement to demonstrate mature lesson reuse for applicable bulk rows.

## Draft Quality Results

- Human review remained available.
- Validate & commit cluster was not clicked.
- Cluster-level proposed responses were visible, but the bulk UI did not expose 100 individual draft panels.
- No fake attachment, URL, pricing, integration, or unsupported financial promise was intentionally introduced.
- Lesson-grounded draft reuse could not be credited because live mature matches were not persisted.

## Provider Results

Observed diagnostics:

- LM Studio returned finish_reason=length before valid JSON for a canonical suggestion.
- Claude fallback returned HTTP 502 with a quota/billing error.
- The bulk advisory budget was exhausted; remaining work used deterministic reasoning.
- The run still completed at 100%; no provider failure silently dropped a row.

## New Knowledge Review

Category 9 was checked against current canonicals, lessons, knowledge, organization profile, and provenance:

- Five rows classified as Reporting & Exports and remained a new, uncommitted cluster.
- Five rows remained Uncategorized and were not treated as reusable knowledge.
- No customer-specific, one-off, malformed, or unsupported content was promoted.

## Reflections Completed

None. Reflection is outside TODO-062C scope. No reflection form was submitted.

## Memory Promotion Results

None. No validation, trust, memory-change, lesson, or canonical commit action was taken. All Validate & commit cluster controls were left untouched.

## New-Memory Retrieval Tests

Not run because TODO-062C does not promote memory. No newly promoted lessons existed to test.

## Duplicate Prevention

- Same-file retry passed; the ticket count remained 5,115 rather than increasing by 100.
- Final check: 100 distinct bulk external IDs and 0 duplicate upload-key/entry keys.
- Knowledge items, lessons, canonicals, candidates, validations, memory changes, and trust evidence did not increase during this test.

## Cross-Ticket Contamination Review

- Raw messages and external IDs remained one-to-one in the database.
- Representative UI rows preserved their customer/company text.
- No previous-ticket response was written into a ticket record.
- Exhaustive per-ticket draft review was not possible because the bulk UI exposes representative samples rather than 100 separate draft panels.

## Transaction and Retry Safety

- Same-file retry: passed.
- Duplicate external IDs on retry: passed through the same idempotent upload key.
- Partial invalid row: not executed; production data was not deliberately damaged.
- Interrupted upload: not executed.
- No silent partial persistence was observed in the completed run.

## Performance

The UI-visible run completed after approximately 3 minutes 40 seconds from the Analyze click. Exact per-stage timers were not instrumented.

| Measure | Result |
|---|---|
| File parsing | 100/100 immediately visible; exact milliseconds not exposed |
| Row analysis | Explicit 0–80% progress |
| Clustering | Explicit 80–99% progress; slowest visible phase |
| Total processing | Approximately 3m40s |
| Average/median/P95 per-ticket stages | Not instrumented |
| Database errors affecting tickets | 0 |
| Provider/advisory failures | Observed; deterministic fallback completed the run |
| UI freeze | None observed |
| Former 99% stall | Not reproduced |

## Data Safety

Post-run values matched the baseline:

- Knowledge items: 46 → 46
- Knowledge candidates: 1,803 → 1,803
- Validation records: 1,802 → 1,802
- Memory-change records: 1,802 → 1,802
- Trust evidence: 4,500 → 4,500
- Emerging patterns: 47 → 47
- Intelligence log rows: 118 → 118
- Ticket sequence counter: 5,115 → 5,115
- Profile revision: 33 → 33
- Organization settings digest unchanged
- Existing knowledge/lesson digests, canonical IDs, provenance, and version lineage unchanged
- No mature record deleted

## Defects Found

### 1. Mature memory and lesson retrieval lost in configured-provider bulk mode

- Category: Knowledge retrieval / Lesson retrieval / Provider failure
- Rows: csv-31..csv-40; ticket IDs OD-20260729-5046..OD-20260729-5055
- Expected: Applicable mature knowledge and validated lessons remain available to bulk results.
- Actual: 0 persisted mature knowledge IDs and 0 persisted lesson IDs across all 100 rows.
- Evidence: deterministic probe produced 10 memory and lesson hits; live database grouping returned matchType=none for all 100.
- Reproducibility: reproduced in the completed configured-provider rerun; the earlier configured-provider run showed the same persisted outcome.
- Likely root cause: the fixture's billing matches are below the strong-lesson threshold, so broad AI discrimination runs; provider truncation/fallback errors occur in the same run and the match is not retained.
- Severity: High for TODO-062C; no mature-memory corruption observed.
- Production code changed: Yes, bulk classification/routing and strong-lesson gating were changed in this worktree; live retrieval remains unresolved.

### 2. Knowledge-candidate persistence warning after development-server restart

- Category: Persistence / UI workflow
- Expected: Candidate resource reads/writes complete without a migration banner.
- Actual: saveKnowledgeCandidates repeatedly reported that the server could not read knowledge candidates.
- Evidence: browser console error at 2026-07-29T13:08:39.908Z; banner remained during the run.
- Reproducibility: observed after restart and throughout the final UI run.
- Likely root cause: candidate snapshot persistence/read path is unstable in the local development session; direct database reads remained healthy.
- Severity: Medium; it may block later reflection/promotion workflows.
- Production code changed: No targeted fix.

### 3. AI advisory provider instability

- Category: Provider failure / Performance
- Expected: valid bounded advisory responses or a clean deterministic fallback.
- Actual: truncated LM Studio JSON, Claude HTTP 502 quota/billing failure, and exhausted AI budget.
- Evidence: browser console diagnostics above; run completed via deterministic fallback.
- Reproducibility: observed in the final run.
- Severity: Medium; completion remained safe but retrieval quality was affected.
- Production code changed: No provider configuration change.

## Created Ticket IDs

All 100 IDs were verified by scripts/todo062b-db-check.cjs. The complete mapping is csv-1 → OD-20260729-5016, incrementing by one through csv-100 → OD-20260729-5115.

## Remaining Findings

- Resolve mature-memory retrieval for applicable bulk rows under the configured provider.
- Persist a retrieval reason distinguishing “no candidate” from “AI discrimination rejected/unavailable.”
- Investigate the saveKnowledgeCandidates warning before reflection or promotion.
- Re-run this same unchanged fixture after the retrieval fix; do not regenerate it.
- Add per-stage timing and a per-ticket result export before claiming full draft-quality/P95 evidence.

## TODO-062C Status

**MEMORY_DEFECT_FOUND**

Classification, language detection, ticket preservation, clustering progress, retry idempotency, and mature-data safety passed. Mature-memory and lesson reuse in the real configured-provider result did not pass, so TODO-062C remains open.

## Commit

No commit was created. The worktree already contained the TODO-060/061/062 changes, and no commit was requested.
