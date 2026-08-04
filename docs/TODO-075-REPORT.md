# TODO-075 Worker Monitoring & Operations Dashboard Report

## Verdict

COMPLETED_WITH_LIMITATIONS. The repository now has an operations-only dashboard, organization-authorized operations APIs, durable worker heartbeats, safe job diagnostics, operator retry/cancel actions, polling refresh, dead-letter visibility, and measured job-attempt performance/provider-mode samples.

## Current Observability Audit

- Before TODO-075, `AsyncJobWorker.health()` exposed process-local health only; worker identity and attempt records were durable, but worker heartbeat and aggregate operations data were not.
- TODO-064 telemetry remains process-local, metadata-only instrumentation. It is not promoted into Organizational Memory, trust, lessons, knowledge, or durable metrics.
- Durable job attempts already stored worker, outcome, provider, and duration fields. TODO-075 now populates provider mode, duration, and safe job-type diagnostics for worker completions/failures.
- Queue state, retry state, failure class, dead-letter state, lease timing, correlation/request identifiers, and progress are derived from durable jobs and attempts.
- Direct provider-call telemetry is not durable yet; the dashboard labels persisted values as observed job-attempt duration and reports provider-request metrics as unavailable.

## Dashboard Architecture

- Added `OperationsView` to the authenticated application shell and navigation.
- Added a read-first operations service that aggregates only memberships available to the authenticated operator.
- Added a persisted `DurableWorkerHeartbeat` record with status, version, poll/heartbeat timestamps, current job reference, capacity, counters, and safe last-error text.
- Dashboard polling defaults to five seconds and includes manual refresh plus JSON diagnostics export.
- The dashboard has overview, worker health, queue, jobs, provider, performance, failure, and dead-letter panels.

## Worker Health

Worker heartbeat status is persisted on startup, polling, execution, completion, failure, and stop. Operations derives `online`, `offline`, or `stopped` from the recorded heartbeat and a 45-second staleness threshold. No synthetic worker or capacity values are created.

## Queue Overview

Queues are grouped by the four durable workflow types: `ticket.process`, `bulk.analyze`, `reflection.generate`, and `pattern.discover`. Each queue reports queued, running, retrying, and dead-lettered counts from durable job records.

## Job Details

Operations job rows and details contain job ID, organization ID, type/version, status, priority, digests, correlation/request IDs, progress, retry state, lease/timing metadata, safe error class/message, worker ID, and safe result summaries. Raw input, ticket/customer text, provider prompts, chain-of-thought, and full result payloads are excluded.

## Organization View

Every operations route requires authenticated organization membership. Aggregates include only organizations accessible to the authenticated operator; the current path organization is validated before data is returned. Cross-organization job records are not returned to an unauthorized member.

## Provider Health

Provider mode is captured on each worker attempt. The local probes measured the configured `disabled` mode with successful samples. The dashboard exposes sample count, success/failure counts, and observed job-attempt duration. Direct provider request latency, token usage, and external quota data remain explicitly unavailable because the existing provider telemetry sink is process-local.

## Performance Dashboard

The dashboard reports measured queue wait and job runtime average/p95 values from durable job attempts. Stage-level performance is shown as unavailable until stage telemetry is durably correlated to jobs. Empty populations return `null`/`unavailable`, not invented zeroes.

## Failure Analysis

Failure groups are derived from safe durable error classes and retryability. Safe messages are retained for operator diagnosis, while raw exception bodies and payload content remain excluded.

## Dead-letter Operations

Dead-lettered jobs are visible in a dedicated panel/API resource. Failed and dead-lettered jobs can be retried through the existing organization-authorized retry endpoint. The dashboard does not delete, edit, or mutate job payloads.

## Operator Actions

Supported actions are refresh, polling toggle, safe diagnostics export, job search/filter, retry for failed/dead-lettered jobs, cancel for queued/running/retry-requested jobs, and safe job-detail inspection. No delete, memory, trust, lesson, knowledge, or prompt-editing actions were added.

## Live Updates

`OperationsView` polls the organization operations snapshot every five seconds when enabled. Manual refresh remains available. Polling is bounded to a safe job sample and does not open a streaming connection.

## Security Review

- All operations routes use `withOrganizationRoute`, session authentication, organization ID validation, and membership authorization.
- Aggregation first resolves the operator's authorized memberships and rejects a path organization outside that set.
- Operations-specific sanitization is separate from the legacy job response helper, preventing the dashboard from inheriting full job results.
- Internal IDs, digests, request/correlation metadata, and safe diagnostics are operational metadata; customer content and prompts are not exposed.
- Retry and cancel continue to use the existing server-authority repository boundary.

## API Surface

- `GET /api/organizations/{organizationId}/operations`
- `GET /api/organizations/{organizationId}/operations/workers`
- `GET /api/organizations/{organizationId}/operations/jobs`
- `GET /api/organizations/{organizationId}/operations/jobs/{jobId}`
- `GET /api/organizations/{organizationId}/operations/queues`
- `GET /api/organizations/{organizationId}/operations/providers`
- `GET /api/organizations/{organizationId}/operations/performance`
- `GET /api/organizations/{organizationId}/operations/failures`
- `GET /api/organizations/{organizationId}/operations/dead-letter`
- `GET /api/organizations/{organizationId}/operations/organizations`
- Existing authorized actions remain `POST /jobs/{jobId}/retry` and `POST /jobs/{jobId}/cancel`.
- Supported snapshot filters include status, job type, worker, provider, retryable, error class, created-at range, search, request ID, correlation ID, and organization path scope. Organization is path-scoped and membership-scoped.

## Stress Test Results

TODO-064 performance probe passed with measured deterministic local results, including 1,000-row bulk analysis at approximately 245.819 rows/sec and 100-ticket single-ticket stress at approximately 293.255 tickets/sec. These are existing local probe measurements, not production capacity guarantees.

## Focused Probe Results

- `probe:todo075-dashboard`: PASS; safe snapshot, three jobs, worker sample, dead letter, and payload exclusion.
- `probe:todo075-worker-health`: PASS; persisted worker heartbeat visible after worker lifecycle.
- `probe:todo075-dead-letter`: PASS; dead-letter visibility and operator retry to queued.
- `probe:todo075-provider`: PASS; measured disabled provider-mode samples only.
- `probe:todo075-performance`: PASS; non-negative measured runtime and queue-wait samples.

## Regression Results

PASS: TODO-018 async foundation, TODO-064 performance, TODO-067 atomic validation, TODO-068 ticket application service, TODO-069 learning application service, TODO-070 stateless persistence, all four TODO-072 probes, all four TODO-073 probes, all four TODO-074 probes, BUG-008 retrieval and semantic probes, BUG-009 profile conflict recovery, BUG-010 profile pipeline, TypeScript, Prisma validate, and production build.

## Data Safety

The operations service never serializes `job.input`, full `job.result`, ticket records, customer context, prompts, or chain-of-thought. It emits only safe summaries such as counts, boolean outcomes, action labels, digests, timing, and error classes. Diagnostic export uses the same sanitized snapshot.

## Remaining Findings

- Provider request-level latency, token usage, quota, and external dependency health are not durable; only configured provider mode and job-attempt duration are currently measured.
- Stage-level telemetry is still process-local and cannot be reconstructed in the operations API after process restart.
- The current operations UI is intentionally a first operational surface; role-specific operator permissions beyond organization membership and richer charts are future hardening work.
- Focused probe jobs are run serially because the global worker claim loop intentionally claims across organizations.

## TODO-075 Status

COMPLETED_WITH_LIMITATIONS. The dashboard and its safe durable observability foundation are ready for the next asynchronous processing and connector hardening phase, with the limitations above explicitly visible to operators.

## Commit

Pending final verification and commit.
