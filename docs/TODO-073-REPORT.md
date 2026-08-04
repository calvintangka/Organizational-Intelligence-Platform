# TODO-073 Durable Async Reflection Worker Report

## Verdict

**COMPLETED_WITH_LIMITATIONS**

Reflection generation now runs as a durable `reflection.generate` worker job. The worker reuses `generateReflectionCommand` and `validateReflectionCommand`, persists one review-only prepared reflection, and never calls `promoteKnowledgeCommand` or writes candidate, validation, memory, trust, knowledge, lesson, or version state. Human promotion remains the existing TODO-069/TODO-067 path.

## Architecture

The async flow is: reviewer approval -> `reflection.generate` enqueue -> worker lease -> scoped TODO-070 server session -> load ticket/profile/knowledge -> generate and validate reflection -> persist `PreparedReflection` -> durable result -> reviewer review -> existing TODO-069 promotion command -> TODO-067 atomic transaction.

The UI path is enabled with `NEXT_PUBLIC_OIP_ASYNC_REFLECTION=true`; the default synchronous path remains available for controlled rollout.

## Job Contract

The immutable job input contains ticket, understanding, reviewed response, existing-match, selected-draft, and language-context snapshots. Organization scope, request/correlation identity, actor identity, idempotency key, and input digest are durable job metadata. The job type is `reflection.generate`, version `1`.

## Worker Flow

The handler validates the snapshot, confirms the ticket exists in the scoped organization, loads the organization profile and knowledge, runs `generateReflectionCommand`, runs fail-closed reflection validation, writes a prepared reflection, and completes the job. Progress stages are `generating`, `validating`, `persisting`, and `prepared`. No autonomous promotion, validation record, candidate, lesson, trust, or memory write occurs.

## Persistence

Added the additive `PreparedReflection` PostgreSQL model and migration `20260804010000_add_prepared_reflections`. It stores the review-only reflection, input snapshots, warnings/reasons, generation metadata, job/request/correlation identity, and status. It does not store or create candidate, validation, memory-change, trust, knowledge, lesson, or version records.

The reviewer can reload a prepared reflection through `GET /api/organizations/{organizationId}/prepared-reflections/{reflectionId}` or the durable job status result.

## Idempotency

Passed. Replaying the same job key returns the original job and prepared reflection. Reusing the key with a different input digest is rejected. The prepared-reflection store also enforces organization-scoped idempotency, so concurrent workers cannot create a duplicate prepared reflection.

## Restart Recovery

Passed in `probe:todo073-reflection-recovery`. A disposable job claimed by `todo073-crashed-reflection-worker` expired, was released, and completed by `todo073-restarted-reflection-worker`. Attempt history recorded `lease_expired` then `succeeded`; exactly one prepared reflection remained.

## Cancellation

Passed for queued and running boundaries. Queued cancellation became terminal `cancelled` without a prepared reflection. Running cancellation moved through `cancellation_requested` and finalized safely as `cancelled`. Completed reflection jobs cannot be retroactively cancelled. The worker's cooperative abort signal is retained for cancellation during generation/validation.

## Provider Failure

Reflection generation is deterministic through the existing reflection command and does not call a provider directly. Existing reflection safety and TODO-062D failure-closed coverage remains applicable. No autonomous fallback or unsafe provider-produced content was introduced. A live provider outage is therefore not a reflection-worker dependency in this phase.

## Reflection Safety

Passed. The worker runs `validateReflectionCommand` before persistence. Reviewer-authored unsafe lesson content containing credentials, temporary workarounds, email addresses, ticket identifiers, or copied ticket text is rejected by the existing `assessReflectionSafety` boundary. The worker stores only a validated prepared reflection and never promotes it.

## Multilingual Results

English and Indonesian disposable jobs both generated the same safe `create_new` reflection action, and both retained `promotionRequired: true`. The worker carries response/internal language context into `generateReflectionCommand`; no language-only duplicate version or autonomous lesson was created.

## Human Review

Prepared reflections remain review material. Warnings/reasons and validation status are persisted and returned to the reviewer. The result explicitly carries `promotionRequired: true`. The worker has no code path to `promoteKnowledgeCommand`.

## Promotion Parity

The UI continues to invoke `promoteKnowledgeCommand` after async reflection polling completes, using the same reflection decision and review inputs as the synchronous path. TODO-069 and TODO-067 remain the promotion/atomicity gates. A full fresh async-generated-reflection-to-live-promotion run was not added to the disposable worker probe; this is a limitation, not an autonomous promotion claim.

## Immediate Reuse

No memory changes occur before reviewer promotion, so immediate reuse remains unavailable until the reviewer completes the existing promotion step. Existing TODO-058 and TODO-069 coverage governs post-promotion cross-language reuse. A fresh async reflection followed by live promotion and follow-up reuse was not run in this task.

## Performance

No percentile or throughput claims are made. The disposable reflection jobs completed quickly in the local PostgreSQL environment, but the sample is too small for average/median/P95/P99 reporting.

## Focused Probe Results

- `probe:todo073-reflection-worker` - PASS: durable enqueue/replay/digest conflict, two workers, prepared reflection, promotion-required result, zero promotion-side effects, completed cancellation rejection.
- `probe:todo073-reflection-recovery` - PASS: lease expiry, restart worker, two attempts, one prepared reflection.
- `probe:todo073-reflection-cancel` - PASS: queued/running cancellation, no prepared output, fail-closed unsafe reflection validation.
- `probe:todo073-reflection-parity` - PASS: English/Indonesian parity and promotion-required boundary.

## Regression Results

- `npx prisma validate` - PASS
- `npx prisma migrate status` - PASS: database schema up to date, 14 migrations applied
- `npx tsc --noEmit` - PASS
- `npm run build` - PASS: production build and prepared-reflection route compiled
- TODO-058 multilingual foundation - PASS
- TODO-062D, TODO-067, TODO-068, TODO-069, TODO-070 - PASS
- TODO-072 async bulk, recovery, cancellation, and parity - PASS
- Focused TODO-073 probes - PASS

## Data Safety

All TODO-073 failure/restart/cancellation tests used disposable `todo073-probe-*` organizations. Cleanup removed their organizations, users, jobs, attempts, prepared reflections, and tickets. No mature organization was reset or reseeded. The migration is additive and was explicitly applied. The core worker probe recorded zero before/after changes for knowledge, candidates, validations, memory changes, and trust evidence; prepared reflections increased only from zero to one.

## Remaining Findings

1. A fresh end-to-end acceptance that promotes a newly prepared async reflection and immediately reuses the resulting lesson remains follow-up coverage.
2. Full browser-refresh restoration of an in-flight reflection job ID is not automated; the durable API and prepared-reflection endpoint are available.
3. Percentile performance and injected database-outage measurements remain unclaimed.

## TODO-073 Status

**COMPLETED_WITH_LIMITATIONS**

## Commit

The verified TODO-073 implementation is committed in the repository's latest commit.
