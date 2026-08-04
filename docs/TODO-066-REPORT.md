# TODO-066 Codebase Architecture, Maintainability & Scale Readiness Audit

Audit date: 2026-08-03  
Repository: `C:\Users\Calvin\Documents\My Project\Hackathon 2`  
Scope: architecture, maintainability, transaction safety, multi-tenancy, async readiness, AI-provider boundaries, operations, scale, and readiness for TODO-018/TODO-019.  
Audit mode: read-only analysis and proportionate validation. No production code, schema, mature data, reset, reseed, migration, or runtime behavior was changed for this audit.

## Verdict

`TARGETED_REFACTOR_REQUIRED`

The repository is a credible modular-monolith foundation with strong tenant-scoped persistence, several good transaction boundaries, useful provider and persistence ports, and unusually careful mature-fixture safeguards. It is not a rewrite case and should not be split into microservices at this stage.

Targeted structural work is required before TODO-018 durable async processing and before TODO-019 governed autonomy. The highest-priority issues are the UI-owned application workflows, a shared mutable persistence authority, a validation commit that can be shadowed by an independent candidate snapshot save, broad client-shaped resource writes, missing durable job/idempotency/outbox primitives, and unauthenticated AI proxy routes. These are architectural boundary problems, not isolated cleanup items.

The existing synchronous/local behavior can continue for the current phase while these seams are extracted incrementally. A modular monolith remains the recommended target.

## Executive Summary

### What is healthy

- PostgreSQL/Prisma is the durable authority for server mode and most important reads are explicitly organization-scoped.
- `withOrganizationRoute` consistently combines organization validation and membership authentication for the main organization APIs (`lib/server/organizationRoute.ts:54-67`).
- The validation/memory promotion command is a meaningful transactional boundary with replay and optimistic-concurrency checks (`lib/server/persistenceService.ts:1296-1473`).
- Bulk intake, ticket allocation, reset, imports, and profile updates have useful transaction or conflict controls.
- The AI surface has a provider port and deterministic fallback behavior (`lib/ai/types.ts`, `lib/ai/adapter.ts:38-218`).
- Migration import/export has digest, ownership, checkpoint, conflict, verification, and rerun concepts rather than being a blind data copy.
- Read-only regression probes for BUG-008, BUG-009, BUG-010, multilingual behavior, reflection safety, and the performance probe passed in this audit.

### What blocks the next phase

- `app/page.tsx` is a 4,210-line client controller containing the live ticket, bulk, reflection, knowledge, organization, persistence, AI, and UI state machines. The primary workflow cannot yet be invoked safely from a worker or connector without recreating browser state.
- `RoutingPersistenceAdapter` is a singleton with mutable active organization/authority state. Background or overlapping organization work can race against that shared mutable selection (`lib/persistence/index.ts:105-267`).
- `confirmReflection`/`applyValidatedMemoryChangeInternal` updates local React state and queues the server commit, while an independent candidate snapshot effect can persist the post-validation candidate state. A failed commit can therefore leave candidate state advanced without the corresponding validation, memory-change, and knowledge transaction (`app/page.tsx:874-894`, `app/page.tsx:1064-1153`).
- The generic organization resource route accepts client-shaped snapshot writes for knowledge, candidates, metrics, logs, patterns, and tickets. Membership is enforced, but role-based write policy and domain command validation are not (`app/api/organizations/[organizationId]/[resource]/route.ts:29-73`).
- AI routes do not require authentication and allow caller-controlled model/token/timeout inputs within loose caps (`app/api/ai/chat/route.ts:91-165`, `app/api/ai/claude/route.ts`). There is no tenant quota, rate limit, cost accounting, or provider circuit breaker.
- No durable job table/queue, job status, worker recovery, outbox, external action ledger, or general connector idempotency key exists. The current UI and browser/request lifetime are the durability boundary.
- The installed production dependency tree has eight audit findings, including four high-severity advisories. The installed Next.js version is in affected ranges; this must be resolved before private beta.

### Decision

Proceed with incremental modular-monolith refactoring. Do not begin broad TODO-018/TODO-019 implementation on top of the current UI-owned workflow and mutable routing authority. First extract command/application services, close the validation atomicity hole, make persistence calls explicitly organization-scoped and stateless, add authenticated policy boundaries, and establish durable job/idempotency primitives. After that, the same domain services can be called by HTTP, a worker, and eventually governed connectors.

## Repository Inventory

### Topology

The repository is a Next.js App Router application with a client-heavy main screen, API route handlers, shared domain modules, Prisma/PostgreSQL persistence, localStorage compatibility, AI adapters, fixtures, and executable probes.

Main areas:

- `app/`: UI entrypoint and API routes for auth, organizations, organization resources, ticket flows, migration flows, AI, and validation commit.
- `components/`: composed views and UI-specific state/rendering components.
- `lib/`: analyzer, canonicalization, drafting, retrieval/memory, reflection, trust, bulk processing, AI, telemetry, persistence adapters, and server services.
- `types/`: broad shared TypeScript domain types and migration types.
- `prisma/`: schema and 13 migrations covering the current organization/auth/ticket/trust/import model.
- `data/`: developer-demo foundation, scenarios, packs, and test-query data.
- `scripts/`: seed/reset/migration/probe utilities, including disposable HTTP/DB probes and mature-data checks.
- `docs/`: prior TODO reports and the protected mature-data baseline.
- Generated/runtime directories such as `.next`, `generated`, `.cache`, and `node_modules` are present and treated as generated or local state.

### Runtime and tooling

`package.json` has development, build, start, lint, Prisma, seed/reset, migration, and many named probe scripts. It does not define a conventional `test` script or a conventional unit/integration test runner. TypeScript is strict with `noEmit`; Next is configured with React strict mode. The Prisma config loads `.env.local`/`.env` and uses `DATABASE_URL`.

Declared runtime dependencies are intentionally small: Next/React, Prisma 7.8, PostgreSQL, dotenv, and styling/build dependencies. This is a good base for a modular monolith, but the codebase currently uses the browser and process-local telemetry as important orchestration state.

### Size and coupling hotspots

Large files are not automatically defects, but the following are meaningful review targets:

| Area | Approx. lines | Architectural concern |
|---|---:|---|
| `app/page.tsx` | 4,210 | UI, orchestration, domain sequencing, persistence, and recovery in one client component |
| `lib/canonicalProblemEngine.ts` | 1,823 | Dense canonicalization and learning policy surface |
| `lib/analyzer.ts` | 1,633 | Analysis/classification logic and profile-aware behavior |
| `lib/server/persistenceService.ts` | 1,473 | Many resource mappers, snapshot writers, commands, and queries in one server service |
| `lib/drafting.ts` | 1,401 | Drafting policy and prompt/result shaping |
| `lib/bulkUpload.ts` | 1,193 | Bulk pipeline, clustering, AI budget/watchdog, and record shaping |
| `lib/server/migrationImportExecutionService.ts` | 1,142 | Large but coherent migration execution state machine |
| `lib/orgMemory.ts` | 1,035 | Compatibility/local memory and legacy fallback concerns |

The main maintainability risk is not raw line count. It is that the largest files cross multiple architectural layers and cannot be reused by a worker without importing browser state or mutable process state.

## Current Architecture

### Request and UI flow

The main application is a client component (`app/page.tsx:1`) that owns approximately 50 React state values spanning authentication, organization selection, tickets, AI analysis, memory, candidates, validations, metrics, logs, patterns, profiles, reflection, and UI state (`app/page.tsx:470-545`). It hydrates multiple persisted resources and then drives the ticket pipeline from the browser.

The single-ticket flow (`app/page.tsx:3580-3893`) creates a ticket ID, persists the ticket, executes relevance/domain/understanding/canonical/AI/language/retrieval/trust/pattern/drafting work, then updates UI state. Bulk analysis and reflection have adjacent orchestration paths. React request-generation guards reduce stale UI updates, but they do not create durable work identity or resumable server state.

The API layer is a conventional Next route layer over server services. Organization routes usually authenticate and scope access before calling persistence. The validation commit route is the clearest command-style API. Most other resource updates remain generic snapshot-style APIs.

### Persistence layers

There are three meaningful modes:

1. LocalStorage compatibility through the local adapter and legacy organization-memory paths.
2. Server persistence through `ServerPersistenceAdapter`, organization API routes, Prisma, and PostgreSQL.
3. A routing adapter that chooses the active authority and organization for the client.

The server persistence service is stronger than the UI boundary suggests. It scopes reads, uses database transactions for important operations, validates payload organization claims, and has server-side actor context for validation commits. The weakness is the combination of many independent snapshot writes with browser-owned orchestration and a mutable shared router.

### AI architecture

`AIProvider` and `AIProviderResult` provide a useful provider port (`lib/ai/types.ts`). `createAIAdapter` selects a disabled or LM Studio/Claude fallback chain (`lib/ai/adapter.ts:38-218`). LM Studio has bounded request timeouts and JSON extraction; the chain records attempts and falls back deterministically.

The provider abstraction is suitable for reuse by a worker after extraction. It is not yet a production control plane: there is no tenant policy, spend budget, concurrency scheduler, durable retry state, circuit breaker, provider health state, or provider-result accounting. The two direct API proxy routes also bypass the organization authorization boundary.

## Dependency Direction

A static import scan covered 125 TypeScript/TSX files and found 394 internal edges.

### Positive direction

- API routes generally call server route wrappers/services rather than embedding database queries.
- Server persistence is below the route layer.
- AI provider implementations sit behind a provider abstraction.
- Core analyzer, canonical, drafting, reflection, trust, and retrieval modules can be reused without importing React.
- Prisma access is centralized through server persistence and Prisma helpers.

### Direction problems

- `app/page.tsx` imports and directly coordinates most business modules, adapters, state transitions, and persistence operations. It is the application service in practice, but it is a client component.
- A real runtime cycle exists between `lib/orgMemory.ts` and `lib/ticketRecords.ts`, around legacy/local fallback behavior. A type-only cycle also exists between `types/index.ts` and `types/migrationExport.ts`.
- The shared types barrel has the highest fan-in (approximately 70 internal importers), making type changes high blast-radius.
- A mutable `RoutingPersistenceAdapter` is imported as a singleton by both UI and persistence callers. Explicit `orgId` parameters coexist with mutable active authority, which creates two competing sources of context.
- Server persistence is a large mixed query/write service. It is serviceable now, but adding worker commands, connector execution, or policy logic directly there would further entangle concerns.

## God Files and Coupling

`app/page.tsx` is the clear god component. It combines view composition, hydration, active-organization selection, persistence scheduling, AI provider calls, domain transformations, reflection safety, validation promotion, metrics, and error reporting. Its 46 custom internal imports are the highest observed out-degree.

The coupling consequences are concrete:

- The ticket pipeline is not a callable application command with a stable input/output contract.
- Browser close, navigation, or process restart can strand analysis/reflection state.
- A server worker would need to duplicate or reverse-engineer the page orchestration.
- Persistence failure is reported but generally cannot roll back the already-updated React state.
- Testing the business flow requires a browser-shaped environment instead of a small application-service test.

`lib/server/persistenceService.ts` and `lib/bulkUpload.ts` are large but have more coherent boundaries. They should be split by command/query or resource only as part of extracting stable application ports, not as a cosmetic line-count exercise.

## Duplicate Business Logic

There is useful reuse, but several parallel paths can diverge:

- Single-ticket orchestration in `app/page.tsx` and bulk orchestration in `lib/bulkUpload.ts` both sequence relevance, understanding, canonical selection, retrieval, lesson matching, and record shaping. Shared domain functions exist, but the sequencing, AI budget, clustering, and persistence behavior are separate.
- Reflection generation/safety is in domain modules, while confirmation, lesson application, candidate/knowledge state updates, and persistence scheduling are in `app/page.tsx`. This splits policy from the state transition that enacts it.
- Local and server persistence adapters intentionally implement parallel contracts, but validation commit semantics differ: local mode is snapshot-oriented, server mode has an authoritative transaction. This compatibility split needs explicit capability/authority semantics.
- Provider fallback is centralized in `lib/ai/adapter.ts`, but page and bulk paths apply additional timeout/watchdog/budget behavior. A worker will need one shared execution policy.
- Organization/profile normalization is mostly centralized, but server/client mappers still perform repeated coercion and JSON shaping.

The recommended response is to define application commands around the shared domain modules, not to merge all behavior into one larger utility module.

## Domain Model Assessment

The domain has real concepts: organizations, memberships, profiles, tickets, knowledge items, candidates, validations, memory changes, trust evidence, lessons, versions, patterns, migration batches, and bulk entries. There are useful lifecycle types and canonical/lesson relationships.

The model is not yet a strong command/domain boundary:

- `types/knowledge.ts:174-221` makes `KnowledgeItem` carry base content, canonical metadata, learning metadata, version metadata, provenance, trust, and optional organization/revision fields in one broadly optional object.
- Prisma uses JSON for several important ticket and candidate substructures (`prisma/schema.prisma` ticket/knowledge/candidate models). Server mapping uses casts such as `as unknown as` (`lib/server/persistenceService.ts:300-304`).
- Important state concepts remain stringly typed in Prisma (`proposedAction`, `roleExercised`, `changeType`).
- `TicketRecord` uses `orgId` while most persistence and API contracts use `organizationId`, increasing mapper and policy risk.
- Ownership and revision are optional in several shared types even though server persistence requires them for safe multi-tenant operation.

This is manageable for the current product phase. Before autonomous actions, introduce explicit command DTOs, actor/tenant context, value objects for IDs and state, typed JSON schemas at trust boundaries, and explicit state-transition functions.

## Application Service Readiness

Current readiness is partial.

Reusable domain services exist for analysis, canonicalization, retrieval, drafting, reflection safety, trust, language, and migration verification. The main application workflow does not yet exist as a reusable application service. It is a client orchestration function with side effects spread across React state, persistence queues, and fire-and-forget work.

Required seam before TODO-018:

```text
ProcessTicketCommand(actor, organization, ticket input, idempotency key)
  -> application service
  -> domain analysis/retrieval/drafting policies
  -> repositories, AI port, job/outbox ports
  -> durable ticket/work state and an explicit result
```

The same service should be callable by the current HTTP/UI path and a later worker. The page should render state and submit commands; it should not be the durable workflow engine.

## Async and Concurrency Readiness

### Existing strengths

- Ticket sequence allocation is transactionally serialized.
- Bulk ticket preparation has a durable upload key/entry key boundary and a unique constraint for replay safety.
- Validation commit has replay handling, candidate uniqueness, and knowledge revision checks.
- Profile writes have server revisions and the BUG-009 conflict-recovery probe passes.
- UI request generation guards reduce stale result application in the current browser.

### Blocking gaps

- No durable job identity, status, attempt count, lease, cancellation, or checkpoint exists for single-ticket analysis, bulk analysis, pattern discovery, or reflection.
- `void checkPatternDiscovery` is fire-and-forget from the UI. It has no durable retry or operator-visible completion state.
- AI calls are executed from browser/request flow, often sequentially. A watchdog timeout does not necessarily cancel underlying work unless the provider observes the same abort signal.
- There is no queue/backpressure/provider concurrency limit for 100 concurrent AI requests.
- The singleton routing adapter can change active authority while another async operation is in flight.
- Snapshot saves for candidates, metrics, logs, patterns, and other resources are not coordinated under a per-organization command transaction.

Conclusion: the code can support async work after extraction, but the current orchestration cannot be promoted to a worker by simply adding a queue.

## Persistence and Transaction Safety

### Strong boundaries

- `commitValidation` is a substantive transaction: it validates ownership, handles replay, creates validation/memory records, records trust evidence, and updates knowledge with revision checks (`lib/server/persistenceService.ts:1296-1473`).
- Bulk preparation validates row limits and IDs, checks existing `(organization, bulkUploadKey, bulkEntryId)`, and allocates ticket sequence values transactionally (`lib/server/persistenceService.ts:1111-1191`).
- Ticket allocation, reset, import resource execution, profile batch writes, and organization deletion have useful database transactions.
- Prisma foreign keys and organization scoping provide a solid data partition foundation.

### Material atomicity issue

The validation commit contract can be bypassed by a separate client snapshot write:

1. `applyValidatedMemoryChangeInternal` creates the validation/memory/knowledge transition and calls `persistence.commitValidatedMemoryChange` through `queuePersistenceSave` (`app/page.tsx:1064-1125`).
2. The function immediately updates React candidate state to `status: "validated"` (`app/page.tsx` in the same flow).
3. A `useEffect` watches candidate state and saves the entire candidate snapshot (`app/page.tsx:874-894`); the server adapter routes this to the generic candidate PUT.
4. If the authoritative commit fails or is delayed, the candidate snapshot can still advance independently. The UI reports persistence failure but does not roll back all related state.

This can leave a candidate apparently validated without a matching ValidationRecord, MemoryChangeRecord, and KnowledgeItem transition. It is a direct violation of the intended atomic promotion boundary and must be fixed before durable async retries or autonomy.

### Snapshot race risks

Resource snapshot saves are individually transactional but not cross-resource atomic. A stale client snapshot can overwrite or delete concurrent candidate/log/pattern/metric state. Knowledge items have some revision protection; collection snapshots do not have a collection revision or command-level merge. Ticket saves are serialized in one client path, but the broader resource set is not.

The correct fix is to make state transitions command-based and server-owned. Snapshot endpoints may remain for compatibility, but they should be restricted, versioned, and removed from authoritative lifecycle paths.

## Multi-Tenancy and Security

### Positive controls

- Organization API wrappers validate membership before handler execution.
- Core persistence reads include `organizationId` filters.
- Payload organization mismatches are rejected (`lib/server/persistenceService.ts:608-613`).
- Bulk idempotency keys and ticket sequences are organization-scoped.
- Organization deletion relies on foreign-key cascade inside a transaction.
- BUG-009 confirms profile revision conflict recovery and unrelated-organization isolation for that workflow.

### Gaps

- Membership is generally treated as sufficient for generic resource writes. Role is returned by authorization but is not consistently evaluated as a permission policy (`lib/server/authorization.ts:18-36`; `app/api/organizations/[organizationId]/[resource]/route.ts:53-73`).
- Any authenticated member can reach broad PUT surfaces for knowledge, candidates, metrics, logs, patterns, and tickets. This is too broad for private beta governance and unsafe as a future autonomy substrate.
- The AI chat and Claude proxy routes do not require authenticated organization context. A caller can select model and token/timeout parameters within route caps. They lack tenant rate limiting, budget enforcement, and usage accounting.
- LocalStorage and local authority caches are compatibility mechanisms, not security boundaries. Server-side authorization remains necessary whenever local fallback can coexist with server mode.
- Session handling has secure cookie/session-hash basics, but no login rate limiting, MFA, session/device management, or explicit cleanup job was found.

No confirmed cross-tenant read was found in the reviewed organization APIs. The risk is that broad write policy and mutable client authority become exploitable once connectors, workers, or autonomy are added.

## AI Provider Architecture

### Good foundation

The provider interface is reusable, and the fallback chain records attempts, uses bounded timeouts, and supplies deterministic fallback behavior when providers fail. BUG-010 exercised provider failover and profile behavior successfully.

### Required controls

- Authenticate and authorize all AI routes with organization/actor context.
- Enforce server-side model allowlists, token/time budgets, prompt-size limits, and tenant quotas.
- Record provider request/result metadata and cost/usage by organization without storing sensitive prompt content by default.
- Add retry/backoff only for safe transient failures, plus circuit breaker/health state and bounded concurrency.
- Give worker jobs durable attempt state and cancellation propagation.
- Keep provider adapters behind the port; do not let provider-specific policy leak into page and bulk orchestration.

## Error Handling

Organization route wrappers and server persistence return useful safe envelopes and classify errors (`lib/server/organizationRoute.ts`, `lib/server/persistenceService.ts:324-333,596-605`). Profile conflict recovery has a clear 409 path.

Error handling becomes inconsistent outside those paths:

- `app/page.tsx` reports persistence failures but does not consistently rollback optimistic domain state.
- AI routes expose route/provider diagnostic behavior and do not share the organization error/authorization envelope.
- Provider fallback uses console-oriented diagnostics rather than a durable correlation ID and structured event model.
- No standard retry classification, idempotency-aware error contract, or worker-dead-letter policy exists.

Before async work, define an error taxonomy covering validation, authorization, conflict, transient dependency, permanent dependency, cancellation, and unknown failures. Every application command should return or persist a correlation ID and a durable outcome.

## Test Architecture

The repository has a valuable executable-probe culture, but not a conventional test architecture.

Strengths:

- Many focused probes cover regression behavior, organization isolation, profile conflicts, multilingual handling, reflection safety, migration idempotency, persistence, and mature-data safety.
- Disposable HTTP/DB probes clean up their fixtures.
- Mature-data probes are read-only and explicitly report protected-organization status.
- TypeScript and production build checks are part of the current validation habit.

Gaps:

- No `test` script and no standard unit/integration runner were found.
- There is no explicit test pyramid separating pure domain tests, repository contract tests, route authorization tests, and end-to-end tests.
- Probe setup is repeated across scripts, some probes depend on a live dev server/DB/env, and mutation/read-only modes are not represented by a single enforcement harness.
- There is no visible CI command that runs the required safety suite, schema validation, build, dependency audit policy, and migration checks as one gate.
- Critical concurrency cases are mostly reasoned from code rather than tested with two simultaneous commands: candidate commit conflict, snapshot races, overlapping organization switches, duplicate single-ticket submissions, provider outage, and worker restart.

The probe suite should be retained and complemented with small deterministic application-service and repository-contract tests.

## Fixture and Migration Health

Migration and fixture discipline is better than the architectural maturity might suggest.

- The TODO-065 historical audit migration is transactional, rerunnable, digest-checked, and explicitly preserves unresolved/`DO_NOT_TOUCH` findings.
- The protected baseline and prior TODO reports document mature counts and safety expectations.
- Import execution has package ownership/digest validation, checkpoints, conflicts, per-resource transactions, and verification.
- Seed/reset tools exist and are clearly named, but their operational safety should remain explicit and separated from read-only audit commands.

The current `developer-demo-integrity-probe.cjs` returns `DATA_INTEGRITY_FAILURE` with the expected known categories documented in TODO-065: it compares historical `MemoryChangeRecord.afterState` snapshots against post-TODO-065 audit metadata/redaction and repeats pre-existing unresolved bulk-ticket and metrics-baseline gaps. It also reports `protectedOrganizationsUnchanged: true`. This is a fixture-verifier compatibility gap, not evidence that this audit mutated mature data. The verifier should be updated before it is used as a clean post-migration gate.

## Dead Code and Legacy Paths

The localStorage path, legacy organization memory, and migration export paths are active compatibility behavior, not safe deletion candidates. The `lib/orgMemory.ts`/`lib/ticketRecords.ts` runtime cycle is a cleanup target, but removing either path would change authority/fallback behavior.

Generated outputs and scratch directories should remain generated/ignored. Seed, reset, migration, and probe scripts should not be deleted during this audit. Before future removal, establish usage evidence and classify each script as operational, migration, fixture, or obsolete. No destructive cleanup is recommended now.

## Dependency Health

Validation on the installed tree:

- `npx.cmd tsc --noEmit --pretty false`: PASS.
- `npm.cmd run prisma:validate`: PASS.
- `npm.cmd run build`: PASS; Next compiled, lint/type validation completed, and all static pages/routes generated.
- Installed production dependency tree: 131 production packages, 8 vulnerabilities total (4 high, 4 moderate, no critical) from `npm.cmd audit --json --omit=dev`.
- High findings include affected Next.js ranges, `fast-uri`, nested `postcss`, and `sharp`; moderate findings include Prisma dev tooling and related transitive packages.
- Installed versions are behind available patch releases, including Next 15.5.19 versus a later 15.5 patch, Prisma 7.8.0 versus a later 7.x patch, and pg 8.16.3 versus a later 8.x patch. This report does not upgrade dependencies.

Dependency upgrades should be treated as a controlled security task before private beta, with build/probe/migration validation after each bounded update. Avoid an unrelated framework major upgrade while extracting application boundaries.

## Performance and Scale Risks

The deterministic TODO-064 performance probe measured:

- 1,000-row bulk run: approximately 4.92 seconds, 203 rows/second, success rate 100%.
- 161 single-ticket understanding samples: approximately 7.1 ms average.
- These are deterministic/local measurements and do not represent live provider latency, production database latency, network behavior, or worker contention.

The principal risks are architectural and data-volume related:

- Several hydration/resource loads are full collection loads. Ticket case lookup has pagination, but general resource APIs still expose unbounded snapshot-style loads.
- Offset/count pagination and JSON-heavy records will need cursor pagination, search/index strategy, retention, and possibly partitioning at very large ticket volumes.
- Bulk analysis is browser/request oriented, with cluster count and AI work not governed by a durable scheduler.
- Process-local telemetry is bounded to approximately 20,000 events per process but is not shared, durable, or queryable across instances.
- Database connection pool, provider concurrency, queue depth, and tenant fairness are not operationally configured in code.

## Operations Readiness

Not ready for private beta without a hardening pass:

- No dedicated health/readiness endpoint was found.
- Prisma configuration validates `DATABASE_URL` lazily; no startup dependency/readiness contract is exposed.
- No graceful shutdown/worker drain path exists.
- Telemetry is process-local metadata (`lib/telemetry.ts:1-7,62-71`) rather than centralized metrics/logging/tracing.
- No durable provider outage backlog, job replay, dead-letter, or operator retry view exists.
- Backup/restore, migration deployment/rollback, tenant export/deletion jobs, and retention/archival policies are not codified as application operations.
- Auth lacks rate limits and stronger account/session controls.

The current app can be demonstrated and validated locally; that is different from being operationally ready for multi-tenant beta or autonomous execution.

## Scale Scenario Assessment

| Scenario | Current result | Required work | Blocks |
|---|---|---|---|
| 1,000 organizations | Basic membership/FK/index model is plausible; list and client caches are not paginated/partitioned for admin-scale use | Paginated org queries, cache policy, tenant-aware operations | Private beta hardening, not immediate TODO-018 |
| 10,000 users | Session lookup and membership model can function; no login limiting/MFA/role policy/session lifecycle | Auth hardening, RBAC/permissions, session cleanup and monitoring | Private beta |
| 1M tickets | Ticket indexes and case pagination help; full loads, JSON payloads, count/offset/search limits remain | Cursor pagination, search/index strategy, retention/archival, load tests | Production scale |
| 100 concurrent AI jobs | No durable queue, fairness, quotas, or circuit breaker | Job queue, provider scheduler, tenant budgets, retries, cancellation | TODO-018 |
| Provider outage for 1 hour | Deterministic fallback/timeouts keep some flows usable; in-flight/browser work is lost and no backlog exists | Durable jobs, provider health state, replay/dead-letter | TODO-018 |
| Worker restart during reflection | No worker currently; browser flow can be lost; direct validation transaction is safe only if reached | Durable reflection job/checkpoint and command state | TODO-018 |
| Duplicate connector event | Bulk has uploadKey/entry idempotency; single-ticket intake has no general external event key | Inbound idempotency table/unique key and replay response | TODO-018/connectors |
| Two reviewers validate one candidate | Candidate uniqueness and KnowledgeItem revision help; generic snapshots and UI conflict recovery are incomplete | Command-level conflict result, no independent candidate snapshot write | TODO-018/TODO-019 |
| Tenant deletion/export | Transactional cascade and migration export primitives exist; no durable legal/large-export job | Background export/delete, audit/legal hold, verification | Private beta/enterprise |
| Autonomy retry after partial external execution | No connector/outbox/action ledger or external execution state; double execution is possible | Governed action ledger, outbox, external idempotency, approval policy | TODO-019 architectural prerequisite |

## Findings by Severity

Timing means the latest safe point by which the finding should be addressed.

| ID | Severity | Finding | Evidence | Timing | Recommendation |
|---|---|---|---|---|---|
| F-001 | CRITICAL | Validation promotion can be partially represented by an independent candidate snapshot save. | `app/page.tsx:874-894,1064-1153`; server commit at `lib/server/persistenceService.ts:1296-1473` | Before TODO-018 and TODO-019 | Remove candidate snapshot autosave from the authoritative validation transition; make the server command return the committed aggregate and reconcile UI only after success. |
| F-002 | HIGH | Primary workflows are browser-owned rather than reusable application commands. | `app/page.tsx:1,470-545,3580-3893` | Before TODO-018 | Extract ticket, bulk, reflection, and promotion command services with actor/tenant context and explicit results. |
| F-003 | HIGH | Persistence authority/router is shared mutable state and can race across organization switches/background work. | `lib/persistence/index.ts:105-267`; mutable active adapter/current authority | Before TODO-018 | Make adapters stateless per call or create immutable organization-scoped sessions; keep active org as UI state only. |
| F-004 | HIGH | Generic snapshot PUTs are too powerful and role policy is not enforced. | `app/api/organizations/[organizationId]/[resource]/route.ts:53-73`; `lib/server/authorization.ts:18-36` | Before private beta; before autonomy | Replace lifecycle writes with explicit server commands, validate actor role/capability, and constrain or deprecate generic snapshots. |
| F-005 | HIGH | No durable job, retry, checkpoint, or worker-recovery model. | Browser/request orchestration; `void checkPatternDiscovery`; no job/worker tables/routes found | Before TODO-018 | Add job records, leases, attempts, cancellation, checkpoints, durable outcomes, and a queue port. |
| F-006 | HIGH | No connector/external action ledger or outbox for governed autonomy. | No outbox/action execution/status/idempotency model in reviewed schema/services | Before TODO-019 | Add policy decision, approval, action ledger, outbox, external idempotency key, and execution reconciliation. |
| F-007 | HIGH | AI proxy routes are unauthenticated and lack tenant budget/rate/cost controls. | `app/api/ai/chat/route.ts:91-165`; `app/api/ai/claude/route.ts` | Before private beta; before autonomy | Require auth/org context, enforce allowlists and quotas, add usage accounting, provider health, and bounded concurrency. |
| F-008 | HIGH | Production dependency tree contains four high and four moderate advisories. | `npm.cmd audit --json --omit=dev`; Next 15.5.19 and affected transitive ranges | Before private beta | Apply bounded security patch upgrades and rerun build/probes/migration checks. |
| F-009 | HIGH | No durable single-ticket intake idempotency key exists for future connectors. | Bulk has `(bulkUploadKey, bulkEntryId)` uniqueness; single flow creates ticket ID in UI without external event key | Before TODO-018 connectors | Persist an inbound event/idempotency key and return the original result on replay. |
| F-010 | MEDIUM | Independent snapshot resources have last-write-wins/deletion race risk and unbounded loads. | `lib/server/persistenceService.ts:955-1109`; full resource loads in adapters/hydration | Before large-scale production | Add collection revisions/commands, cursor pagination, bounded payloads, and merge/conflict semantics. |
| F-011 | MEDIUM | Domain objects and persistence JSON are broadly optional/stringly typed. | `types/knowledge.ts:174-221`; Prisma JSON/string fields; casts at `persistenceService.ts:300-304` | Before autonomy; incremental before beta | Introduce typed boundary schemas, command DTOs, actor/tenant context, and explicit state transitions. |
| F-012 | MEDIUM | Test coverage is probe-heavy without a unified CI/test pyramid. | No conventional test files/runner; many standalone `scripts/*probe.cjs`; no `test` script | Before private beta | Add domain unit tests, repository/route contract tests, concurrency tests, and one CI safety command. |
| F-013 | MEDIUM | Operations lack readiness, graceful shutdown, durable telemetry, and recovery controls. | No health/readiness route; `lib/telemetry.ts:1-7,62-71` process-local | Before private beta; before worker rollout | Add readiness/liveness, correlation IDs, centralized metrics/logs, shutdown/drain, backups/restore checks, and job replay. |
| F-014 | LOW | Legacy/local memory and persistence cycle increases maintenance cost. | `lib/orgMemory.ts` <-> `lib/ticketRecords.ts`; localStorage compatibility path | Planned cleanup, not a blocker | Isolate compatibility behind a port and remove the cycle when authority migration is complete; do not delete it now. |
| F-015 | LOW | Historical integrity verifier is not yet compatible with TODO-065 audit metadata/redaction. | `developer-demo-integrity-probe.cjs` returns `DATA_INTEGRITY_FAILURE`; TODO-065 documents the known causes and `protectedOrganizationsUnchanged: true` | Before using as a clean migration gate | Update verifier expectations/schema-aware normalization; preserve unresolved and `DO_NOT_TOUCH` findings. |

## Refactor Decision Matrix

| Decision | Recommendation | Reason |
|---|---|---|
| Rewrite the application | No | Core domain and persistence foundations are usable; risk and cost are unnecessary. |
| Split into microservices | No | The current bottleneck is missing internal boundaries and durable workflow primitives, not deployment-unit scale. |
| Keep modular monolith | Yes | It supports incremental extraction, shared transactions, and one domain model while async/worker seams are added. |
| Extract application services | Yes, immediate | Required to reuse workflows from HTTP, workers, and connectors. |
| Replace all local persistence now | No | LocalStorage is an intentional compatibility path; isolate it first and retire it later. |
| Add a queue before refactoring | No | A queue would only make the UI-owned state machine harder to reason about. Extract commands and idempotency first. |
| Add autonomy before ledger/policy | No | External side effects cannot be safely retried or audited without an action ledger/outbox. |

## Proposed Target Architecture

```text
UI / HTTP routes / worker handlers / connector intake
                 |
        application commands and queries
  (actor + organization + request/idempotency context)
                 |
       domain policies and state transitions
 (analysis, canonicalization, retrieval, reflection, trust)
                 |
              ports
 (repositories, AI, queue, outbox, connector, audit, telemetry)
                 |
 adapters: Prisma/Postgres | local compatibility | AI providers
                 | queue worker | external connectors
```

Keep this inside one deployable modular monolith initially. The application layer should own orchestration; domain modules should remain independent of React and transport; repositories should expose commands/queries rather than arbitrary client snapshots; workers should call the same application commands as HTTP.

For autonomy, add these durable concepts before any external side effect:

- `Job`: organization, actor, type, input digest, status, attempt, lease, deadline, cancellation, result/error.
- `IdempotencyKey`: organization, source, external event/action key, request digest, original result.
- `OutboxEvent`: transactionally recorded event for downstream work.
- `ActionLedger`: proposed action, policy decision, approval, external request ID, execution state, result, reconciliation, and audit evidence.
- `PolicyDecision`: actor, capability, risk, required approval, and immutable decision context.

## Recommended Refactor Roadmap

### Phase 1 - Immediate structural refactor

1. Extract `ProcessTicket`, `AnalyzeBulk`, `ConfirmReflection`, and `CommitValidatedMemory` application commands from `app/page.tsx`.
2. Introduce explicit `ActorContext`/`OrganizationContext` and pass them through server commands.
3. Fix F-001: authoritative validation commit must be the only writer of candidate lifecycle, validation, memory change, and knowledge promotion. Reconcile UI after the server result.
4. Make persistence adapters organization-scoped and stateless per operation; eliminate mutable active authority from durable paths.
5. Add typed command DTO validation and structured conflict/authorization/transient errors.
6. Add concurrency tests for two reviewers, duplicate submission, org switching, save failure, and stale snapshots.

### Phase 2 - Durable async processing

1. Add job records and a queue port in the modular monolith.
2. Move bulk analysis, pattern discovery, and reflection to job handlers with checkpoints and bounded retries.
3. Add provider concurrency/quotas, cancellation propagation, dead-letter state, and operator-visible job outcomes.
4. Add single-ticket inbound idempotency and durable request/result correlation.
5. Keep the current UI as a command-submitting/read-model client during migration.

### Phase 3 - Governed autonomy

1. Add explicit policy/capability evaluation and approval requirements.
2. Add outbox and action ledger before connector side effects.
3. Add external idempotency and reconciliation for every connector operation.
4. Separate recommendation, approval, execution, and verification states.
5. Test partial failure, provider outage, worker restart, duplicate event, timeout-after-remote-success, and retry-after-unknown-outcome scenarios.

### Phase 4 - Private-beta hardening

1. Enforce RBAC/least privilege and harden sessions/login controls.
2. Authenticate and rate-limit AI routes; add tenant usage/cost controls.
3. Add readiness/liveness, graceful shutdown, centralized telemetry, backup/restore drills, migration deployment policy, and job replay operations.
4. Add cursor pagination, bounded resource loads, search strategy, retention, and large-tenant load tests.
5. Upgrade vulnerable dependencies in bounded patches and make the safety suite a CI gate.
6. Update the mature-data integrity verifier to understand TODO-065 audit metadata while preserving unresolved/privacy findings.

## What Not to Refactor

- Do not rewrite the analyzer, canonical engine, trust model, or migration engine merely because the files are large; extract ports around them first.
- Do not split into microservices before application commands, transactions, idempotency, and observability are stable.
- Do not delete localStorage/legacy memory paths until an explicit authority migration and fallback retirement plan exists.
- Do not reset, reseed, migrate, redact, or “repair” mature data as part of this architecture work.
- Do not make generic snapshot endpoints more capable; constrain them while introducing commands.
- Do not add autonomous external execution until policy, approval, outbox, ledger, and reconciliation are durable.

## Regression Results

| Check | Result | Notes |
|---|---|---|
| TypeScript | PASS | `npx.cmd tsc --noEmit --pretty false` |
| Prisma schema validation | PASS | `npm.cmd run prisma:validate` |
| Production build | PASS | `npm.cmd run build`; compile, lint/type validation, static generation, and route generation succeeded |
| BUG-008 retrieval probe | PASS | Read-only mature-data/retrieval cases; fail-closed semantics passed |
| BUG-008 semantic probe | PASS | Read-only semantic authorization/fail-closed cases passed |
| BUG-009 profile conflict recovery | PASS | Disposable fixtures; server returned 409 and recovery/post-recovery edit succeeded |
| BUG-010 profile pipeline | PASS | Failover/normalization/stale-request cases passed |
| TODO-058 multilingual probe | PASS | Language detection, policy, provenance, and path cases passed |
| TODO-062D reflection probe | PASS | Safe lessons accepted; unsafe lessons rejected; provenance remained opaque |
| TODO-064 performance probe | PASS | Deterministic 1,000-row bulk run approximately 4.92s at 203 rows/s; not live-provider production load |
| Mature integrity probe | KNOWN LIMITATION | Returns `DATA_INTEGRITY_FAILURE` for TODO-065-known historical snapshot/metrics/reference gaps; explicitly reports `protectedOrganizationsUnchanged: true` |
| Production dependency audit | ACTION REQUIRED | 4 high and 4 moderate findings; no critical findings |

The audit started/stopped a local dev server only to run BUG-009. No persistent mature-data write path was invoked by the audit. The disposable BUG-009 probe cleaned its user, memberships, sessions, and organizations.

## Mature Data Safety

Safety conclusion: no mature data was changed by TODO-066.

Evidence:

- The audit executed read-only static analysis, TypeScript/Prisma/build validation, read-only retrieval/semantic/performance/reflection probes, and a disposable BUG-009 probe.
- The disposable probe deleted only its own generated fixtures in its `finally` cleanup.
- No reset, reseed, migration, or mature-data mutation command was run.
- The current mature integrity probe reports `protectedOrganizationsUnchanged: true`.
- TODO-065 documents the accepted post-migration counts: 47 knowledge items, 181 lessons, 5,120 tickets, 1,805 candidates, 1,804 validations, 1,804 memory changes, 4,500 trust evidence rows, 50 patterns, and 133 knowledge versions. The current read-only probe reports the same resource counts.
- The known integrity-verifier failures are documented in TODO-065 and are caused by verifier expectations around the new audit metadata/redaction and pre-existing historical gaps, not by this audit.

## Remaining Unknowns

The following require a later controlled environment or dedicated tests:

- Live provider latency, error rates, cost, token use, concurrency saturation, and cancellation behavior.
- Production PostgreSQL connection pool behavior, lock contention, query plans, and large-tenant storage growth.
- Actual deployment startup, readiness, graceful shutdown, and migration rollback behavior.
- Cross-instance telemetry, log correlation, alerting, and backup/restore recovery time.
- Full role/permission matrix and adversarial authorization testing for every route.
- Exact behavior when a persistence commit fails after optimistic browser state has advanced; the code path is enough to require a fix, but an injected-failure integration test should be added with the refactor.
- External connector timeout-after-success and duplicate-event behavior, because connectors are not yet a durable execution subsystem.

## TODO-066 Status

`COMPLETED`

The architecture and scale-readiness audit is complete. The repository is `TARGETED_REFACTOR_REQUIRED`: suitable for continued modular-monolith development, not yet suitable for directly layering durable async workflows or governed autonomy onto the current UI-owned orchestration.

## Commit

No commit was created. This audit added only this report file and preserved the pre-existing dirty worktree changes.
