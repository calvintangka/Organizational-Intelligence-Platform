# TODO-074 Durable Async Pattern Discovery Report

## Verdict

**COMPLETED_WITH_LIMITATIONS**

Pattern discovery now runs as a durable `pattern.discover` follow-up job. Ticket processing remains authoritative when enqueueing fails, while the follow-up failure is logged and visible through the durable jobs API. Pattern discovery never promotes Organizational Memory or writes trust, lessons, validations, knowledge, or candidates.

## Previous Pattern Discovery Flow

The previous flow was browser-owned: `handleAnalyzeSecond` called `checkPatternDiscovery`, which ran `detectEmergingPattern`, optionally called the AI pattern-name suggestion provider, mutated React `emergingPatterns`, appended intelligence-log entries, and incremented metrics through browser persistence. `ProcessTicketResult.followUp` already returned `pattern_discovery_requested`, but the initial ticket pipeline ignored it. There was no durable pattern job, retry, lease recovery, or worker result.

The prior domain algorithm was deterministic keyword/category matching with `detectEmergingPattern` and `upsertEmergingPattern`; pattern persistence was snapshot-style `saveEmergingPatterns`. Pattern IDs for that legacy path were time-based, evidence stored customer-facing fields, and duplicate protection was application-level only.

## Async Architecture

The new flow is: ticket processing succeeds -> explicit follow-up intent -> server job enqueue -> worker lease -> scoped TODO-070 server session -> load source ticket, knowledge, and patterns -> run existing detector -> transactionally write pattern/evidence/outcome/log/metrics -> complete the job. Browser execution is no longer required; the existing browser follow-up now only enqueues through the server jobs route.

The bulk strategy is intentionally no automatic follow-up in this phase. A 100-row bulk upload therefore creates zero redundant pattern jobs. A future organization-level scan can be added as a separate contract.

## Job Contract

`pattern.discover`, version `1`, carries organization scope, actor/source metadata, source ticket/job IDs, optional canonical problem ID, sanitized understanding summary, detected signals, tags, category, language, trigger type, and optional time-window metadata. Full ticket text is not stored in the job input; the worker loads the scoped source ticket by stable ID.

The result records `patternFound`, pattern ID, action (`created`, `strengthened`, `merged`, `no_pattern`, or `rejected`), created/strengthened flags, evidence count, matched-ticket count, confidence, safe reason, follow-up requirement, correlation, attempt, replay, and timing metadata.

## Enqueue Boundary

The server ticket worker converts `ProcessTicketResult.followUp` into a durable pattern job. The browser pipeline uses the authenticated jobs route as the server boundary for direct processing and logs enqueue failure without changing the successful ticket result. Stable organization-scoped keys are `pattern:{organization}:{trigger}:{ticket}:v1`.

The chosen failure window is ticket completion to follow-up enqueue. The ticket remains succeeded/authoritative if enqueue fails; the failed enqueue is observable in the intelligence log and can be retried by operations. Pattern execution never blocks ticket completion.

## Idempotency

Passed. Durable job replay with the same key returns the same job; changed input digest conflicts. Pattern outcomes additionally deduplicate the semantic trigger key. `PatternDiscoveryEvidence` has a database unique key on organization, pattern, and ticket, preventing duplicate evidence after replay or a second job key. Pattern IDs are deterministic within an organization and include organization scope, preventing cross-tenant collisions while preserving language-neutral identity within a tenant.

## Worker Handler

The worker validates the explicit organization-bound input, loads knowledge through a TODO-070 server persistence session, and delegates pattern analysis to the server-only transaction boundary. Progress stages are loading, persisting, and succeeded. Invalid input is permanent; serialization/deadlock/database-transient failures are retryable. The handler imports no React or browser state.

## Pattern Persistence

Added `PatternDiscoveryOutcome` for one auditable result per semantic trigger/job correlation and `PatternDiscoveryEvidence` for opaque, organization-scoped ticket linkage. New patterns use deterministic organization-scoped IDs. Existing patterns are strengthened through the current `upsertEmergingPattern` behavior, with duplicate evidence prevented before incrementing counts.

Worker-created example evidence stores an anonymized customer label and safe signal summary. It does not copy customer names, emails, phone numbers, secrets, ticket text, or raw external identifiers. Pattern identity is not language-scoped.

## Transaction Safety

Pattern create/strengthen, evidence linkage, outcome, intelligence log, and metrics update run in one serializable PostgreSQL transaction. A serialization conflict is retryable and rolls back the complete unit. Duplicate evidence is a no-op merge and does not increment pattern metrics. Job completion remains auditable through the outcome's job ID and correlation metadata.

## Concurrency Results

Passed. Two workers processing overlapping evidence created one pattern, two evidence rows, and deterministic `timesSeen: 2`. Two tenants with identical signals produced separate organization-scoped patterns and evidence. Concurrent serialization recovery produced a retryable attempt without duplicate pattern or evidence rows.

## Restart Recovery

Passed in `probe:todo074-pattern-recovery`. A disposable job claimed by `todo074-crashed-pattern-worker` expired, was released, and completed by `todo074-restarted-pattern-worker`. Attempts recorded `lease_expired` then `succeeded`; one pattern and one evidence row remained, and the source ticket stayed `in_review`.

## Failure, Retry, and Dead-Letter

Passed. The worker probe exercised a retryable transient failure and successful replay, an invalid follow-up no-op path, and an exhausted retryable job becoming `dead_lettered` with explicit operator requeue support. Pattern failure is isolated from the original ticket job. Full live provider-outage injection was not required because the current pattern algorithm is deterministic and provider naming remains best-effort outside the worker persistence boundary.

## Cancellation

Passed for queued cancellation: the job became terminal `cancelled` without pattern/evidence writes. Completed pattern jobs cannot be cancelled retroactively. Running cancellation remains cooperative at worker boundaries; committed pattern transactions are never silently undone. A dedicated cancellation-after-commit timing race is not automated.

## Privacy and Safety

Passed for worker-created records. Pattern records and evidence contain opaque ticket IDs, safe summaries, language, category, tags, and canonicalized metadata only. No private chain-of-thought, customer identity, email, phone, password, secret, raw ticket text, or cross-tenant evidence was persisted by the worker. Existing legacy browser-created records are not rewritten by this task.

## Multilingual Results

Passed. English and Indonesian source tickets with the same organization-level signal identity created one pattern and two evidence rows; the second job strengthened the existing pattern rather than creating a language duplicate. TODO-058 concept and language handling remains unchanged.

## Bulk Integration

No automatic bulk pattern follow-up was added. This is the smallest safe choice for the current phase and avoids 100 redundant pattern jobs for a 100-row upload. Bulk analysis remains durable and independently auditable under TODO-072.

## UI and Operations

The existing jobs API now accepts `pattern.discover`, and the existing job listing/status/cancel/retry routes provide queued, running, retrying, succeeded, failed, dead-lettered, and cancelled visibility. The ticket UI logs enqueue success/failure but does not wait for pattern completion. A dedicated worker dashboard was not added.

## Telemetry and Performance

Durable job progress, attempt history, correlation ID, result timing, and safe intelligence-log entries are recorded. No ticket content is logged. No percentile or throughput claims are made; the focused probes are correctness/acceptance samples rather than performance benchmarks. Bulk follow-up workload impact is zero because automatic bulk pattern jobs are not enabled.

## Focused Probe Results

- `probe:todo074-pattern-worker` - PASS: enqueue/replay/digest conflict, create, privacy, no-op, queued cancellation, retry, dead-letter, and zero promotion side effects.
- `probe:todo074-pattern-recovery` - PASS: lease expiry, restart recovery, one pattern, one evidence row, original ticket unaffected.
- `probe:todo074-pattern-concurrency` - PASS: two workers, one equivalent pattern, two evidence rows, tenant isolation.
- `probe:todo074-pattern-multilingual` - PASS: English/Indonesian one-pattern identity and create/strengthen parity.

## Parity Results

The worker uses the existing `detectEmergingPattern` and `upsertEmergingPattern` domain logic. Direct and worker paths preserve create/strengthen/no-op decisions, category/signal identity, evidence cardinality, confidence calculation, and organization scope; transport and persistence are different by design. Provider-suggested titles are not used to bypass the safe worker persistence boundary.

## Regression Results

- Prisma validation, migration status, and TypeScript - PASS; 15 migrations applied and database schema up to date.
- Production build - PASS; new durable job route and worker code compile successfully.
- TODO-018 async foundation - PASS.
- TODO-058 multilingual, TODO-061 business memory, TODO-062D reflection safety - PASS.
- TODO-067 atomic validation, TODO-068 ticket service, TODO-070 stateless persistence - PASS.
- TODO-072 async bulk, recovery, cancellation, and parity - PASS.
- TODO-073 reflection worker, recovery, cancellation, and parity - PASS.
- BUG-008 retrieval and semantic, BUG-009 profile conflict recovery, BUG-010 profile pipeline - PASS.
- Organization switching and persistence boundary - PASS.

## Data Safety

All TODO-074 write probes used disposable `todo074-probe-*` organizations and cleanup removed their organizations, jobs, attempts, patterns, evidence, outcomes, logs, metrics, and tickets through cascade/scoped cleanup. No mature organization was reset or reseeded. No manual SQL was used for test data. Mature knowledge, lessons, candidates, validations, memory changes, trust evidence, and HERO provenance remained untouched; the worker probe recorded zero promotion-side effects.

## Remaining Findings

1. A dedicated end-to-end browser acceptance that waits for a queued pattern job and refreshes the emerging-pattern view is follow-up coverage; operations can already inspect the durable job and reload persisted patterns.
2. A cancellation-after-commit race and injected database-outage timing measurement are not fully automated.
3. Existing legacy browser-created pattern rows may contain historical example text; TODO-074 does not rewrite mature legacy data.
4. No percentile performance claims are made for 1/10/50/100 trigger workloads.

## TODO-074 Status

**COMPLETED_WITH_LIMITATIONS**

## Commit

The verified TODO-074 implementation is committed in the repository's latest commit.
