# TODO-062D Developer Bulk Upload Stress Test Report

## Verdict

`MEMORY_PROMOTION_DEFECT_FOUND`

The complete 100-row Developer bulk workflow was exercised against the unchanged TODO-062B fixture. Bulk persistence, classification, mature-memory retrieval, provider fallback, human review, reflection, lesson creation, cross-language reuse, duplicate prevention, and mature-data preservation were verified. The run found two live promotion-audit defects: the first new-memory promotion did not create initial trust evidence, and its resolved source ticket retained empty `validationRecordIds`/`knowledgeChanged` links. Targeted fixes were applied and type-checked, but the already-created historical rows were not rewritten.

## Environment

- Application: `http://localhost:3000/`
- Organization: `profile-oip-developer-demo` / OIP Developer Demo
- Mode: Developer
- Persistence: server-authoritative PostgreSQL
- Configured provider: LM Studio (with Claude fallback configured)
- Fixture: `tmp/TODO-062B-developer-bulk.csv`
- Fixture size: 11,058 bytes; 100 data rows; 50 English and 50 Indonesian
- Fixture upload key: `bulk-d5ccce9c`
- Fixture was not regenerated, reset, or reseeded.

## Pre-Test Baseline

Baseline captured before the reflection work, after the TODO-062C1 run:

| Resource | Baseline |
|---|---:|
| Knowledge items | 46 |
| Knowledge candidates | 1,803 |
| Validation records | 1,802 |
| Memory-change records | 1,802 |
| Ticket records | 5,115 |
| Trust evidence | 4,500 |
| Emerging patterns | 47 |
| Intelligence-log entries | 118 |
| Lessons | 180 |
| Canonicals | 46 |
| Trust total | 2,791 |
| Ticket sequence counter | 5,115 |
| Profile revision | 33 |

Developer Mode was active, the configured provider was reachable but frequently returned truncation/decline/timeout responses, and the bulk-upload UI was available.

## Dataset Summary

The exact existing 100-row fixture contains 10 categories, 10 rows per category, 5 English and 5 Indonesian rows per category, unique external IDs, Unicode, and no duplicate rows. The fixture was loaded through the real UI; no row was manually uploaded.

## Bulk Upload Results

- Upload start: `2026-07-29T13:40:46.710Z`
- Upload completion: `2026-07-29T13:44:01.355Z`
- Rows detected: 100
- Rows accepted: 100
- Rows skipped: 0
- Rows rejected: 0
- Parsing warnings: none observed
- Duplicate warnings: none
- UI/server errors: none
- Analysis progress reached 100%; the prior 99% stall was not reproduced.
- Retrying the same fixture was idempotent: no second set of bulk tickets was created.

## Ticket Creation Results

All 100 bulk rows already existed exactly once under the stable upload key. The bulk ticket range was `OD-20260729-5016` through `OD-20260729-5115`; 100/100 had a unique external entry ID, raw message, language, and persisted classification.

Additional lifecycle tickets:

- `OD-20260729-5116`: discarded after an intentional company-information misroute; no memory change.
- `OD-20260729-5117`: human-reviewed new-knowledge source; resolved.
- `OD-20260729-5118`: English immediate-reuse ticket; remained in human review after lesson retrieval.
- `OD-20260729-5119`: Indonesian immediate-reuse ticket; remained in human review after lesson retrieval.
- `OD-20260729-5120`: second distinct retention topic; held in human review and not promoted.

## Classification Summary

The bulk run produced 100/100 classifications and 100/100 clusters. Supported operational/product/business families remained separated; intentionally ambiguous or unsupported rows were safely held rather than forced into memory.

Observed result groups:

| Result | Rows |
|---|---:|
| Login / Login Issue | 10 |
| Login / Password Reset | 10 |
| Activation / Activation Failure | 10 |
| Billing / Billing & Invoice Issue | 10 |
| Billing / Billing & Charge Issue | 10 |
| Delivery / Delivery Problem | 5 |
| Delivery Delay / Delivery Delay | 5 |
| Business Inquiry / Product Information Inquiry | 10 |
| Business Inquiry / General Business Inquiry | 5 |
| Business Inquiry / Multilingual Support Inquiry | 5 |
| Reporting & Exports / Reporting & Exports Problem | 5 |
| Uncategorized / Uncategorized Problem | 10 |

## Confusion Matrix

| Expected family | Correct family result | Safe uncategorized/held | Cross-domain or unsafe forced match |
|---|---:|---:|---:|
| Password reset | 10 | 0 | 0 |
| Login/access | 10 | 0 | 0 |
| Activation | 10 | 0 | 0 |
| Billing/invoice | 10 | 0 | 0 |
| Refund/payment | 10 | 0 | 0 |
| Shipping/delivery | 10 | 0 | 0 |
| Product information | 10 | 0 | 0 |
| Company/general inquiry | 10 | 0 | 0 |
| New-knowledge topics | 5 reporting-family results; 5 held | 5 | 0 |
| Ambiguous/noisy/unsupported | 0 forced memory matches | 10 | 0 |

The new-knowledge and ambiguous rows are reported separately because a safe hold is the expected result, not a classification failure. The independent TODO-062C1 deterministic parity probe reported no fixture/category/canonical/memory/lesson/language mismatches.

## Language Results

- English bulk rows: 50/50 preserved and detected.
- Indonesian bulk rows: 50/50 preserved and detected.
- Immediate English follow-up `OD-20260729-5118`: lesson matched strongly.
- Immediate Indonesian follow-up `OD-20260729-5119`: language detected at 100% confidence and the same lesson matched strongly through Indonesian signals.
- No language-specific lesson or canonical duplicate was created.

## Retrieval Results

For the 100 bulk tickets, the prior C1 run recorded 10 mature-memory hits and 90 intentional compatibility holds. The 10 hits were the two existing invoice lessons, five tickets each:

- `demo-ki-invoice-currency-display` / `demo-les-invoice-currency-display-001`
- `demo-ki-invoice-pdf-stale-address` / `demo-les-invoice-pdf-stale-address-001`

The selected bulk reflection cluster was `Invoice PDF Shows Previous Address`. It was committed as an existing-memory version/evidence update, not as a new canonical or lesson:

- Candidate: `candidate-1785334902400-lrwq5n`
- Validation: `validation-1785334902400-a0gmiw`
- Memory change: `memory-change-1785334902400-4usauk`
- Action: `create_version`
- Related knowledge: `demo-ki-invoice-pdf-stale-address`

The new lesson’s later English and Indonesian tickets retrieved the same canonical immediately after promotion, without restart, rebuild, or reseed. The English result showed strong relevance and all four matching English signals. The Indonesian result showed strong relevance with `pengalihan kepemilikan pengetahuan` and `admin keluar`.

## Draft Quality Results

Human review was retained for all new/weak cases. The promoted lesson response used placeholders rather than customer data:

- `{{customerName}}`
- `{{organizationName}}`

The response contained no invented links, attachments, pricing, integrations, secrets, or customer-specific facts. The reuse drafts were lesson-informed and explicitly softened the historical root cause as possible rather than confirmed for the new ticket.

## Provider Results

LM Studio was the configured provider. It returned truncated or unavailable responses on several analysis/drafting calls; Claude fallback also reported quota/billing failure. The application remained usable by falling back to deterministic analysis, profile grounding, or a human-authored cold-start response. No provider failure created a duplicate memory or bypassed human review.

## New Knowledge Review

The first genuinely reusable topic was:

`Knowledge Ownership Transfer After Administrator Departure`

It passed the novelty and usefulness checks: no existing canonical, lesson, knowledge item, or organization-profile equivalent was found before reflection. The first attempted wording was correctly routed as company-information and was not promoted.

A second topic, formal retention explanation, was submitted as `OD-20260729-5120`, held as a new uncategorized topic, and intentionally not promoted because the approval interaction did not transition to reflection during this run.

## Reflections Completed

### Source ticket: `OD-20260729-5117`

- Canonical problem: Knowledge Ownership Transfer After Administrator Departure
- Root cause: Validated organizational knowledge can remain tied to a departing administrator when no controlled successor and access-governance process is defined.
- Resolution: An authorized administrator documents scope and reason, approves a successor, updates ownership/access, revokes departing access, records approver/effective date/version, verifies retrieval, and escalates incomplete authorization.
- Keywords: knowledge ownership; ownership transfer; departing administrator; transfer lesson ownership; pengalihan kepemilikan pengetahuan; admin keluar
- Lesson: The controlled ownership-change process must include authorization, successor assignment, access revocation, audit history, and retrieval verification.
- Internal documentation: Generalized operational guidance only; no customer, company, ticket, secret, or environment data.
- Candidate ID: `candidate-1785335357183-du7k9v`
- Validation ID: `validation-1785335357198-ox3d38`
- Memory change ID: `memory-change-1785335357198-9lpu2f`
- Lesson ID: `lesson-1785335357198-6zei`
- Initial trust: 20

## Memory Promotion Results

The first promotion created exactly one new canonical and exactly one lesson. The persisted new item was:

- Knowledge ID: `canonical-knowledge-ownership-transfer-after-administrator-departure`
- Revision: 1
- Lesson count: 1
- Human approvals: 1
- Initial trust: 20

The reusable lesson body is generalized, customer-independent, and placeholder-based. Supporting evidence was sanitized before promotion: `Anonymized customer`, a generalized issue summary, a redacted date marker, and an opaque evidence key. Origin ticket IDs remain only in candidate/validation/memory-change provenance fields required for auditability.

## New-Memory Retrieval Tests

| Ticket | Language | Result |
|---|---|---|
| `OD-20260729-5118` | English | Strong canonical match; strong lesson evidence; lesson-informed draft; human review retained |
| `OD-20260729-5119` | Indonesian | Strong canonical match; Indonesian lesson signals matched; lesson-informed draft; human review retained |

No second candidate, canonical, or lesson was created for either follow-up.

## Duplicate Prevention

- Same 100-row fixture retry: no duplicate tickets.
- Existing invoice cluster: existing canonical reused; no duplicate canonical or lesson.
- New lesson: one lesson only.
- TODO-058F probe: passed exactly-once multilingual promotion, rollback, retry, and replay checks.
- TODO-015 probe: passed source-ticket trust idempotency and concurrent-claim checks.
- TODO-016 probe: passed lesson content deduplication and immutability checks.
- TODO-032 probe: passed category compatibility and fail-closed safety checks.

## Cross-Ticket Contamination Review

No customer name, company name, email, raw ticket ID, prior draft, URL, attachment, or signature appeared in the reusable lesson body or customer-response template. The source ticket’s audit/provenance identifiers were preserved separately for traceability.

## Transaction and Retry Safety

The validation commit is server-side transactional: candidate, validation, memory-change, knowledge upsert, and trust evidence claim are committed together or rolled back. Existing idempotency probes passed. The same bulk fixture retry was safe. A deliberately malformed/destructive production failure test was not run.

## Performance

- Bulk parse/upload/analysis wall-clock: approximately 194.6 seconds.
- Progress: reached 100%; no 99% stall.
- Rows processed: 100.
- Per-stage average/median/P95: not instrumented by the current UI, so no fabricated values are reported.
- Observed provider timeouts/truncation: yes; deterministic fallback kept the pipeline moving.
- Browser freeze: no persistent freeze observed; one abandoned confirmation dialog caused a stale tab, which was recovered with a fresh tab.

## Data Safety

Final counts after the live reflection work:

| Resource | Final | Delta from baseline |
|---|---:|---:|
| Knowledge items | 47 | +1 |
| Knowledge candidates | 1,805 | +2 |
| Validation records | 1,804 | +2 |
| Memory-change records | 1,804 | +2 |
| Trust evidence | 4,500 | +0; defect for the new create path |
| Emerging patterns | 50 | +3 |
| Ticket records | 5,120 | +5 |

The 100 bulk tickets were preserved; the five additional tickets are the one discarded test, one promoted source, two follow-ups, and one unpromoted second candidate. Existing mature knowledge text, canonical IDs, lessons, and lineage were not reset or reseeded.

## Defects Found

### 1. Missing initial trust evidence on new-memory promotion

- Category: Trust / Memory promotion
- Ticket: `OD-20260729-5117`
- Expected: Initial promotion creates one trust-evidence row linked to the validation and source ticket.
- Actual: The canonical, candidate, validation, and memory-change rows were created, but trust evidence remained at 4,500; no evidence row existed for the new canonical.
- Evidence: Direct PostgreSQL read after commit; `trust_evidence` query returned zero rows for the new knowledge ID.
- Reproducibility: Reproducible on the live pre-fix create-new path; related TODO-058F and TODO-015 probes pass for their covered paths.
- Likely root cause: `commitValidation` only claimed trust evidence for `trust_update_only`.
- Severity: High.
- Production code changed: Yes. New `create_new` commits now claim `MEMORY_PROMOTION` evidence transactionally and idempotently.

### 2. Resolved reflection ticket lost audit links

- Category: Reflection / Provenance
- Ticket: `OD-20260729-5117`
- Expected: Resolved ticket contains its validation ID and changed knowledge ID.
- Actual: `reflection.knowledgeChanged` was null and `validationRecordIds` was empty even though the corresponding validation and memory-change rows existed.
- Evidence: Direct PostgreSQL read of `ticket_records`.
- Reproducibility: Reproducible in the live React state path before the fix.
- Likely root cause: `confirmReflection` read stale `validationRecords`/`knowledgeCandidates` state immediately after asynchronous state updates.
- Severity: High.
- Production code changed: Yes. The commit result IDs are now retained in the closure and written directly to the ticket record.

### 3. Provisional category blocked immediate reuse

- Category: Canonical matching / Lesson retrieval
- Ticket: `OD-20260729-5118` before fix
- Expected: Strong lesson signals authorize the newly promoted lesson across a provisional category label.
- Actual: The first built-in reuse attempt fell back to cold start because the new canonical’s category was set to its title and the category gate rejected the follow-up.
- Evidence: UI showed no memory match on the first reuse attempt.
- Reproducibility: Reproduced once before the fix; after the fix, the real English and Indonesian follow-ups both retrieved the lesson strongly.
- Likely root cause: New uncategorized canonical used the custom problem title as its category, and lesson preselection called compatibility without the ticket.
- Severity: High.
- Production code changed: Yes. New custom canonicals use `Uncategorized`; strong non-contradictory lesson evidence can bridge only provisional labels, and lesson preselection now passes the ticket to the compatibility check.

### 4. Privacy risk in newly promoted supporting examples

- Category: Memory promotion / Provenance safety
- Expected: Reusable memory excludes customer names, raw ticket text, dates, and ticket IDs.
- Actual before fix: The source code copied those fields into `exampleTickets` and learning-history details.
- Evidence: Static code inspection before reflection; the new live item was verified after the patch with anonymized evidence and generalized text.
- Reproducibility: Source-path defect; fixed before the live new lesson was committed.
- Severity: High if unpatched.
- Production code changed: Yes. New evidence examples are generalized and opaque; audit IDs remain in the explicit audit/provenance chain.

## Post-Run Hardening Verification

The follow-up implementation added a fail-closed reflection safety gate before any reviewer-authored lesson is promoted. It rejects customer or organization names, email addresses, phone numbers, dates, ticket/case identifiers, secrets, copied ticket text, temporary workarounds, and environment-specific instructions. New lesson-level provenance now uses a deterministic opaque evidence ID; the real origin ticket remains in the candidate, validation, trust-evidence, and memory-change audit chain.

Targeted verification after the hardening:

- `probe:todo062d-reflection`: passed; safe reflections accepted, unsafe reflections rejected, opaque provenance verified.
- `probe:todo058f-new-lesson-promotion`: passed; one lesson, one canonical, multilingual strengthening, rollback, retry, and replay idempotency.
- `probe:todo058e-persisted-multilingual`: passed; one persisted lesson/canonical across languages and replay safety.
- `probe:todo015-source-ticket-idempotency`: passed; no trust inflation on repeated source-ticket validation, including concurrent claim protection.
- `probe:todo016-content-dedup`: passed; equivalent lessons deduplicated without mutating ticket, memory, or candidate history.
- `probe:todo062c-parity`: passed; 100/100 classification, canonical, memory, lesson, and language parity.
- Production build: passed; Next.js compilation, type checking, static generation, and route generation completed successfully.

The new safety gate is a preventive control for future promotions. It does not rewrite the historically promoted row identified above, preserving the data-safety requirement not to mutate mature organizational history during this verification.

## Created Ticket IDs

- Bulk fixture: `OD-20260729-5016` … `OD-20260729-5115` (100 tickets)
- Reflection source: `OD-20260729-5117`
- English retrieval: `OD-20260729-5118`
- Indonesian retrieval: `OD-20260729-5119`
- Unpromoted second candidate: `OD-20260729-5120`
- Discarded first wording: `OD-20260729-5116`

## Remaining Findings

- The first live promotion remains historically missing its initial trust-evidence row and ticket audit links; the report intentionally does not mutate those records after the fact.
- Legacy knowledge rows may still contain historical raw source metadata by design; the new lesson path prevents raw source IDs and unsafe reviewer text from entering future reusable lesson content.
- Per-stage P95 performance metrics require dedicated instrumentation.
- The second retention candidate remains in human review and was not promoted.
- No production commit was created.

## TODO-062D Status

`COMPLETED_WITH_LIMITATIONS`

The end-to-end lifecycle and immediate cross-language reuse work after the targeted fixes. The verdict remains limited because the first live promotion exposed missing trust/audit persistence that was fixed only for subsequent promotions.

## Commit

No commit created, per instruction.
