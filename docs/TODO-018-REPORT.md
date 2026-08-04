# TODO-018 — Asynchronous Work Intake & Durable Processing

## 1. Summary

Implemented the first durable asynchronous processing foundation on top of PostgreSQL. Single-ticket processing can now be submitted as a durable `ticket.process` job, leased by a worker, resumed after lease expiry, retried with bounded backoff, cancelled, inspected, and replayed safely through organization-scoped APIs.

The existing synchronous browser path remains the default. The new async intake is an explicit server-authority route and client helper so rollout can be enabled deliberately.

## 2. Delivered architecture

- Added `DurableJob` and `DurableJobAttempt` PostgreSQL models and the additive migration `20260804000000_add_durable_async_jobs`.
- Added a typed `JobRepository` port with idempotent enqueue, immutable input digest, atomic conditional leasing, lease renewal, progress, completion, retry, cancellation, dead-letter, and attempt history operations.
- Added `AsyncJobWorker` with bounded concurrency, worker identity, lease heartbeat, cancellation polling, readiness/health state, retry classification, and graceful drain.
- Added a versioned handler registry. `ticket.process` is implemented using the extracted TODO-068 application service and an explicit server persistence session.
- Added organization-scoped `POST/GET /jobs`, job status, cancellation, and retry endpoints plus a browser client helper.
- Added `worker:jobs` for a long-lived worker process.

## 3. Durability and safety

- Job input is stored as an immutable JSON snapshot with a stable digest. The queue never reconstructs work from mutable browser state.
- Idempotency is scoped by `(organizationId, idempotencyKey)` and conflicts when type, version, or input digest differ.
- Claiming uses a conditional update, so concurrent workers cannot both own the same active lease. Expired leases become retryable work.
- Worker effects are at-least-once and rely on the existing organization-scoped ticket idempotency fields and repository replay behavior to prevent duplicate ticket records.
- Actor and organization scope are assigned from authenticated server route context. Worker persistence uses an explicit server `PersistenceContext`; no browser adapter or mutable active organization is used.
- Cancellation is cooperative: queued/retryable jobs cancel immediately; running jobs receive an abort signal and preserve the latest persisted ticket state.
- Safe job responses omit the raw input snapshot while retaining progress, result, digests, error class, and audit correlation fields.
- The migration is additive and was applied with `prisma migrate deploy`; no existing rows were rewritten.

## 4. Controlled rollout boundaries

Only `ticket.process` is registered in this first worker rollout. `bulk.analyze`, `pattern.discover`, and `reflection.generate` are typed job kinds but are rejected at intake until their browser-owned orchestration and commit boundaries are migrated into independently proven handlers. This prevents a generic queue from silently wrapping workflows that still have mixed browser/server ownership.

The outbox pattern is not introduced in this phase. Durable job creation is the explicit intake transaction; downstream connector/outbox work remains part of TODO-018 follow-up hardening.

## 5. Verification

- `npx prisma validate` — PASS
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npx prisma migrate status` — PASS; no pending migrations after deploy
- `npm run probe:todo018-async-foundation` — PASS: idempotency replay/conflict, single lease ownership, lease renewal, retry scheduling, cancellation, worker completion, and exactly one persisted ticket
- `npm run probe:todo067-atomic-validation` — PASS
- `npm run probe:todo068-ticket-application-service` — PASS
- `npm run probe:todo069-learning-application-service` — PASS
- `npm run probe:todo070-stateless-persistence` — PASS

## 6. Performance and operational notes

The queue has indexes for status/availability, organization/status, priority/creation order, and lease ownership/expiry. Worker concurrency and lease/poll intervals are configurable through constructor options and `OIP_JOB_WORKER_CONCURRENCY`. The worker exposes readiness state and does not call `process.exit` during normal operation; the CLI only exits after graceful drain on a termination signal.

Large-volume throughput/load testing, queue metrics export, connector outbox delivery, and bulk/pattern/reflection handler migration remain follow-up work before broad private-beta enablement.

## 7. Verdict

**COMPLETED_WITH_LIMITATIONS** — the durable asynchronous foundation and the first production-shaped ticket handler are implemented and verified. The remaining workflow migrations are explicit, typed, and rejected rather than being represented as unsafe fire-and-forget jobs.
