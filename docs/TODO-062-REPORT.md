# TODO-062 Developer Bulk Upload Stress Test Report

## Verdict

**BULK_UPLOAD_DEFECT_FOUND**

The real Developer-mode bulk upload completed at 100% without the former 99% stall, and the database remained connected. The test did not pass end to end: only 70 of the 100 bulk rows became persisted tickets, 30 were held as a sample-only unclustered bucket, supported Product Information and Company/Business rows were not classified, mature memory was not retrieved, and the promoted item had no lesson or complete reflection record.

## Environment

- Application: `http://localhost:3000/`
- Account: Calvin, authenticated Developer account
- Organization: `OIP Developer Demo` (`profile-oip-developer-demo`)
- Developer organization profile revision: 33
- AI path: configured local LM Studio; Claude fallback attempted; deterministic fallback used when advisory calls failed
- Database: connected; direct read-only verification succeeded
- Bulk page: available and enabled
- Timestamps below are UTC unless noted
- No organization reset, reseed, or mature-memory deletion was performed

The UI displayed a recurring non-fatal notice: `Persistence failed for saveKnowledgeCandidates: Server persistence could not read knowledge candidates.` The bulk commit itself did persist its candidate and validation chain.

## Pre-Test Baseline

Captured from `profile-oip-developer-demo` before the upload:

| Measure | Baseline |
|---|---:|
| Knowledge items | 45 |
| Knowledge candidates | 1,802 |
| Validation records | 1,801 |
| Memory changes | 1,801 |
| Ticket records | 5,003 |
| Trust evidence | 4,500 |
| Emerging patterns | 46 |
| Intelligence log rows | 92 |
| Ticket sequence counter | 5,003 |
| Profile revision | 33 |
| Organization settings digest | `b6ca9f83f8ab69ed` |
| Mature-memory digest | `12c251983aed4aeb` |
| Trust total | 2,771 |

Organization settings, supported domains, escalation rules, support boundaries, and provenance references were recorded. Existing mature knowledge item text, lesson text, canonical IDs, trust, revisions, and version lineage were compared after the test.

## Dataset Summary

Fixture: `tmp/TODO-062-developer-bulk.csv`

- File size: 16,388 bytes
- Header: `message`
- Data rows: 100
- Categories: 10 × 10
- English: 50
- Indonesian: 50
- Unique messages: 100
- Blank messages: 0
- Parser result: 100 detected, 0 skipped, 0 warnings
- Shape: `raw_queries`
- Parsed entry IDs: `csv-1` through `csv-100`
- Encoding: UTF-8; Unicode and Indonesian text preserved

The exact existing deterministic fixture was reused; it was not regenerated.

## Bulk Upload Results

- Upload was performed through the real Developer Mode bulk-upload UI.
- UI parse summary: `100 queries detected, 0 rows skipped`.
- Analysis reached `Analysis complete (100%)`.
- The progress bar moved through row analysis and an explicit clustering phase; it did not remain at 99%.
- Six clusters were rendered; 30 rows were placed in the unclustered bucket.
- No duplicate warning, malformed-delimiter warning, or parser warning was shown.
- The UI exposed only representative samples, not all 100 result rows.

## Ticket Creation Results

The bulk UI creates ticket records only when a cluster is committed. One genuinely novel cluster was reviewed and committed; the other clusters were deliberately not approved because they were unsupported by mature-memory retrieval or had incomplete/unsafe resolution evidence.

- Bulk rows persisted: 10 of 100
- Bulk rows not persisted: 90 of 100
  - 60 rows in five uncommitted supported/operational clusters
  - 30 rows in the unclustered bucket
- Rows silently lost: 0 at the database level; they remained in client-side analysis state, but they were not durable tickets
- Bulk ticket IDs: `OD-20260729-5004` through `OD-20260729-5013`
- Follow-up ticket IDs: `OD-20260729-5014` English, `OD-20260729-5015` Indonesian
- All 10 committed bulk records were persisted as `resolved` with the shared validation ID.
- Both follow-up records were persisted as `in_review` and retained human review.

The committed bulk ticket records stored `customerName` as `Bulk Upload` in the knowledge examples rather than preserving the extracted customer identity as structured customer data. The raw issue text still contained the correct names and companies.

## Classification Summary

The bulk result was safe enough to avoid hallucinating answers for 30 held rows, but it did not meet the requested supported-category accuracy.

| Category | Rows | Actual result | Assessment |
|---|---:|---|---|
| Password reset | 10 | Login Issue | Broad domain correct; password-reset specificity lost |
| Login and access | 10 | Login Issue | Broad classification correct; merged with password reset |
| Account activation | 10 | Activation Failure | Correct broad classification |
| Billing and invoice | 10 | Billing & Invoice Issue | Correct broad classification |
| Refund and payment | 10 | Billing & Charge Issue | Broad payment domain correct |
| Shipping and delivery | 10 | Delivery Problem | Broad shipping domain correct |
| Product information | 10 | Unclustered | Safe hold, but supported business/product classification missing |
| Company/general business | 10 | Unclustered | Safe hold, but supported business classification missing |
| New export-naming knowledge | 10 | Reporting & Exports Problem | Broad domain correct; canonical title generic |
| Ambiguous/unsupported | 10 | Unclustered | Correct safe handling |

Specific canonical accuracy for supported, non-ambiguous categories: **60/90 (66.7%)**. English and Indonesian results were balanced at **30/45 (66.7%)** each under the same specific-canonical measure. If broad-domain matches are counted, the operational support subset reaches 70/90 (77.8%), but this still fails the requested password-reset distinction and Product/Business routing.

## Confusion Matrix

| Expected \ Actual | Login | Activation | Billing invoice | Billing/charge | Delivery | Reporting/export | Unclustered |
|---|---:|---:|---:|---:|---:|---:|---:|
| Password reset | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Login/access | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Activation | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| Billing/invoice | 0 | 0 | 10 | 0 | 0 | 0 | 0 |
| Refund/payment | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| Shipping/delivery | 0 | 0 | 0 | 0 | 10 | 0 | 0 |
| Product information | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| Company/business | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| New export naming | 0 | 0 | 0 | 0 | 0 | 10 | 0 |
| Ambiguous/unsupported | 0 | 0 | 0 | 0 | 0 | 0 | 10 |

## Language Results

The parser and lexical detector handled the fixture correctly:

- English: 50/50 detected as `en`
- Indonesian: 50/50 detected as `id`
- Follow-up English: `en`, 100% lexical confidence
- Follow-up Indonesian: `id`, 100% lexical confidence
- No language corruption or row-language swap was observed

Language detection passed; cross-language memory retrieval failed.

## Retrieval Results

No mature knowledge item or mature lesson was selected during bulk analysis. All six rendered clusters were labelled `New canonical problem`; no `relatedKnowledgeId` was shown for the committed cluster. This is a major retrieval defect because the Developer organization contains mature authentication, billing, reporting, and access memory.

The newly promoted item was also not retrieved:

- `OD-20260729-5014`: `No knowledge match — cold start`, `Uncategorized`, `matchType: none`
- `OD-20260729-5015`: `No knowledge match — cold start`, `Uncategorized`, `matchType: none`

The two follow-ups preserved their own text and language, and no previous-customer draft text was observed. They did not reuse the newly promoted response. Cross-language retrieval therefore failed 0/2.

## Draft Quality Results

The committed bulk cluster used the human-authored response template:

> For scheduled CSV exports that collide on the same filename, verify the export run identifiers and preserve both outputs with a unique deterministic filename before retrying. Do not overwrite either export; escalate if the system cannot produce distinct names.

The response avoided a fake URL, attachment, pricing, integration claim, or financial promise. However, the bulk-generated knowledge item used generic internal guidance (`Customer has a reporting or data-export issue`) and did not store a lesson. The two follow-up drafts fell back to `no_template` and retained `Human review required`, which is safe but proves the new memory was not usable.

## Provider Results

- Local LM Studio calls were attempted.
- The browser log recorded `finish_reason=length` for a 700-token advisory response, followed by Claude fallback.
- Claude fallback returned HTTP 502 with a quota/billing error.
- Deterministic fallback completed the bulk run.
- The UI reported `Clustered via local AI`, while the warning log showed the advisory budget was exhausted and remaining clusters used deterministic reasoning.
- Follow-up drafts displayed `AI assistant unavailable — standard draft shown`.

Final organization metrics showed 25 AI calls, 15 successes, 10 failures, and 7 fallbacks, versus 15/12/3/2 at baseline.

## New Knowledge Review

The Category 9 export-naming collision topic was searched against current knowledge titles/content for export, filename, collision, and duplicate concepts. Existing related items included CSV encoding, export timeout, report column migration, and scheduled-report timezone knowledge, but no equivalent same-filename collision topic was found.

Disposition:

- Category 9: truly new reusable operational topic; eligible and committed once
- Categories 1–8: existing organizational domains or business/product topics; not promoted because retrieval failed and a safe merge target was not established
- Category 10: ambiguous/unsupported; not suitable for memory

## Reflections Completed

One bulk response was human-authored and validated, but the full reflection form was not completed by the bulk UI.

| Field | Recorded result |
|---|---|
| Source ticket | `bulk-ticket-csv-81` through `bulk-ticket-csv-90` in candidate provenance |
| Canonical problem | `Reporting & Exports Problem` |
| Root cause | Not captured by UI; defect |
| Resolution | Human-authored collision-safe filename response |
| Keywords | Not captured by UI; defect |
| Lesson | No lesson created; `lessons: []` |
| Internal documentation | Generic `Customer has a reporting or data-export issue`; insufficient |
| Candidate ID | `candidate-1785325003916-262kdf` |
| Validation ID | `validation-1785325005437-2gy8if` |
| Memory change ID | `memory-change-1785325005437-mcc23v` |
| Initial trust | 20 |

## Memory Promotion Results

The real UI recorded:

- Candidate: `candidate-1785325003916-262kdf`
- Proposed action: `create_new`
- Canonical/knowledge item: `canonical-reporting-exports-problem`
- Validation: `validation-1785325005437-2gy8if`
- Memory change: `memory-change-1785325005437-mcc23v`
- Trust evidence: none added; trust-evidence count remained 4,500
- Revision: 1
- Version: `canonical-reporting-exports-problem-v1`
- Initial trust score: 20
- Provenance: 10 contributing bulk source ticket IDs, validation actor Calvin, role `knowledge_validator`

The candidate/validation/memory-change chain is not orphaned, but it is incomplete as organizational memory because it has no lesson and no structured reflection fields.

## New-Memory Retrieval Tests

Two additional real single-ticket follow-ups were submitted:

| Ticket | Language | Result |
|---|---|---|
| `OD-20260729-5014` | English | Detected correctly; `Uncategorized`; no knowledge match; `in_review` |
| `OD-20260729-5015` | Indonesian | Detected correctly; `Uncategorized`; no knowledge match; `in_review` |

Expected validated-memory reuse: 2/2. Actual validated-memory reuse: **0/2**. No duplicate candidate or memory promotion was created by the follow-ups because both remained in human review.

## Duplicate Prevention

- Fixture rows were unique: pass.
- Parsed IDs were unique: pass.
- No duplicate mature canonical, mature lesson, or mature knowledge item was created: pass.
- One new canonical was created for the novel cluster: expected in principle, but too generic and not lesson-backed.
- Duplicate bulk retry was not executed because the UI does not expose a safe disposable retry mode and the first run already exposed a persistence/coverage defect.

## Cross-Ticket Contamination Review

No cross-customer or cross-company text contamination was observed in the rendered samples or the ten committed raw messages. English and Indonesian rows stayed in their respective source text. The structured customer value in committed knowledge examples was `Bulk Upload`, so identity preservation is incomplete even though raw messages were preserved.

## Transaction and Retry Safety

- Bulk analysis itself was non-persistent until human commit; mature counts were unchanged during analysis.
- The committed cluster wrote its candidate, validation, memory change, and ten ticket records coherently.
- Follow-up tickets were persisted as `in_review` without creating memory.
- Duplicate-upload, malformed-row retry, and interruption/retry tests were not run against this mature organization to avoid adding uncontrolled data after the primary run exposed defects.

## Performance

Observed browser run:

- Parse: immediate UI response; parser probe measured under 10 ms
- Row analysis: pipeline probe measured about 821 ms for 100 rows
- Cluster analysis: provider-bound; visible cluster transitions occurred over several minutes
- Longest provider-backed UI wait: approximately 45 seconds per advisory round trip in the existing reliability probe
- Terminal progress: reached 100%; no permanent 99% state
- Browser UI: remained responsive; Cancel control remained visible during clustering
- Browser memory: no abnormal growth observed

The UI does not expose per-ticket classification, retrieval, or draft timings, so defensible average/median/P95 per-ticket values cannot be derived from this run. The existing reliability probe reports a live 100-row end-to-end analysis around 211 seconds, with a longest silent provider interval around 44.9 seconds.

## Data Safety

| Measure | Baseline | Final | Delta |
|---|---:|---:|---:|
| Knowledge items | 45 | 46 | +1 approved new topic |
| Candidates | 1,802 | 1,803 | +1 |
| Validations | 1,801 | 1,802 | +1 |
| Memory changes | 1,801 | 1,802 | +1 |
| Ticket records | 5,003 | 5,015 | +12 (10 bulk + 2 follow-up) |
| Trust evidence | 4,500 | 4,500 | 0 |
| Emerging patterns | 46 | 47 | +1 |
| Intelligence log | 92 | 118 | +26 runtime/audit entries |
| Ticket sequence counter | 5,003 | 5,015 | +12 |

Mature data safety checks passed:

- Existing mature item count: 45 before and after filtering out the new item
- Mature-memory digest: `12c251983aed4aeb` before and after
- Existing knowledge/lesson text: unchanged
- Existing canonical IDs: unchanged
- Existing trust and provenance: unchanged
- Profile revision: 33 before and after
- Organization settings digest: `b6ca9f83f8ab69ed` before and after
- No mature record deleted, reset, or reseeded

Metric accounting did not pass fully: database ticket records increased by 12, but `org_metrics.lifetimeTickets` increased only from 5,001 to 5,002. That undercount is a persistence/metrics defect. `humanResolutions` increased by one for the single committed cluster, while the two follow-ups correctly remained in review.

## Defects Found

### D-062-001 — Bulk result coverage / ticket persistence

- Row/ticket: 90 uncommitted bulk rows; visible source range includes `csv-1`–`csv-100`
- Category: Ticket persistence / UI workflow
- Expected: all 100 rows become one durable ticket each after the full lifecycle
- Actual: only 10 bulk rows became durable tickets; 90 remained client-side review state
- Evidence: UI showed six clusters plus `30 queries held for individual review`; final DB ticket count was baseline +10 bulk tickets
- Reproducibility: deterministic on this fixture
- Likely root cause: bulk UI persists ticket records only inside `commitBulkCluster`; unclustered rows expose only five sample rows and have no bulk persistence path
- Severity: High
- Production code changed: No

### D-062-002 — Supported Product/Business routing omitted

- Row/category: `csv-61`–`csv-80`, Categories 7–8
- Category: Business relevance / classification
- Expected: Product Information and Business Inquiry classification with organization-profile grounding
- Actual: all 20 held as unclustered with no supported classification
- Evidence: UI unclustered bucket count 30; representative Acme and Meridian rows held for individual review
- Reproducibility: deterministic on this fixture
- Likely root cause: bulk analysis path does not apply the business-inquiry classifier used by the single-ticket path
- Severity: High
- Production code changed: No

### D-062-003 — Password reset merged into generic Login Issue

- Row/category: `csv-1`–`csv-10`
- Category: Classification / canonical matching
- Expected: password-reset/authentication canonical distinct from general login/access
- Actual: all ten merged into `Login Issue` with the ten Login/access rows
- Evidence: 20-query `Login Issue` cluster and generic login problem summary
- Reproducibility: deterministic on this fixture
- Likely root cause: bulk canonical selection collapses password reset and login signals before existing-memory matching
- Severity: Medium
- Production code changed: No

### D-062-004 — Mature memory and lessons never retrieved

- Row/category: supported operational rows across Categories 1–6
- Category: Knowledge retrieval / lesson retrieval
- Expected: existing Developer memory and cross-language lessons reused where applicable
- Actual: all bulk clusters labelled `New canonical problem`; no mature `relatedKnowledgeId`; follow-ups reported cold start
- Evidence: UI cluster badges; `OD-20260729-5014` and `OD-20260729-5015` both have `memoryMatch.matchType: none`
- Reproducibility: deterministic on this fixture
- Likely root cause: bulk path does not connect canonical suggestions to mature knowledge retrieval, and promoted generic reporting memory has no lesson/signals for later matching
- Severity: Critical
- Production code changed: No

### D-062-005 — Reflection and lesson promotion incomplete

- Row/category: Category 9, `csv-81`–`csv-90`
- Category: Reflection / validation / memory promotion
- Expected: complete root cause, resolution, keywords, lesson, internal documentation, limitations, preconditions, and escalation guidance
- Actual: candidate validated with generic canonical/internal guidance and `lessons: []`; no trust evidence row
- Evidence: persisted knowledge content and validation record
- Reproducibility: deterministic on this commit path
- Likely root cause: bulk commit uses a reduced `BulkKnowledgeDraft` and bypasses the full ReflectionPanel lesson workflow
- Severity: Critical
- Production code changed: No

### D-062-006 — Newly promoted memory not reusable

- Row/category: follow-ups `OD-20260729-5014` and `OD-20260729-5015`
- Category: Knowledge retrieval / cross-language retrieval
- Expected: English and Indonesian paraphrases retrieve the new lesson
- Actual: both uncategorized, no match, no template, human review required
- Evidence: UI and persisted `memoryMatch` objects
- Reproducibility: deterministic for both languages
- Likely root cause: no lesson/signals were stored and the canonical title is generic
- Severity: Critical
- Production code changed: No

### D-062-007 — Organization metric undercounts persisted tickets

- Row/category: all committed bulk and follow-up tickets
- Category: Ticket persistence / metrics / provenance
- Expected: `lifetimeTickets` tracks the durable ticket count delta
- Actual: ticket records +12, metric +1
- Evidence: pre/post database counts and `org_metrics`
- Reproducibility: observed once in this run; needs regression confirmation
- Likely root cause: bulk and/or review ticket writes do not update org metrics transactionally for every persisted ticket
- Severity: High
- Production code changed: No

### D-062-008 — Provider reliability/quality degradation

- Row/category: clustering and follow-up drafting
- Category: Provider failure / performance
- Expected: configured provider chain returns valid advisory output or clearly bounded fallback
- Actual: LM Studio output truncated at `finish_reason=length`; Claude fallback returned HTTP 502; deterministic fallback and no-template drafts used
- Evidence: browser console warnings and UI draft labels
- Reproducibility: provider-dependent, observed in this run
- Likely root cause: thinking-model output budget and unavailable Claude quota/billing fallback
- Severity: Medium
- Production code changed: No

## Created Ticket IDs

Bulk-committed category 9 tickets:

`OD-20260729-5004`, `OD-20260729-5005`, `OD-20260729-5006`, `OD-20260729-5007`, `OD-20260729-5008`, `OD-20260729-5009`, `OD-20260729-5010`, `OD-20260729-5011`, `OD-20260729-5012`, `OD-20260729-5013`

Follow-up retrieval tickets:

`OD-20260729-5014` (English), `OD-20260729-5015` (Indonesian)

No durable ticket IDs were created for the other 90 bulk rows.

## Remaining Findings

- The 100-row upload is no longer stuck at 99%; the reliability fix is effective in the real UI.
- Bulk analysis must expose and persist all rows before TODO-062 can pass.
- Bulk analysis needs the same business-inquiry, canonical-specificity, and mature-memory retrieval path as single-ticket intake.
- Bulk commit must invoke the full reflection/lesson workflow or explicitly hold the candidate without validation.
- Metrics must be updated in the same transaction as bulk ticket persistence.
- Provider credentials/configuration need separate remediation; no credential was changed here.
- Duplicate-upload and interruption retry checks remain outstanding.

## TODO-062 Status

**BULK_UPLOAD_DEFECT_FOUND**

The former bulk progress stall is fixed and the mature organization was protected, but the full TODO-062 pass criteria are not met.

## Commit

No commit created. No production source code was changed during this test. The workspace already contained uncommitted TODO-060/TODO-061/TODO-062-related changes before the run; those changes were preserved.
