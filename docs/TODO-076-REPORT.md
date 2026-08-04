# TODO-076 Enterprise Connector Framework Report

## Verdict

COMPLETED_WITH_LIMITATIONS.

## Connector Use Cases

| Scenario | Classification | TODO-076 treatment |
|---|---|---|
| Signed webhook intake | Implement now | Generic signed webhook reference connector |
| Polling intake / scheduled synchronization | Framework support only | Versioned adapter `fetchChanges(cursor, limit)` port; no live poller |
| Manual import / historical backfill | Framework support only | Durable event ledger and external mapping can record a backfill source; UI/workflow deferred |
| External ticket update | Implement now | Mapping reuse records updates without creating a second OIP ticket |
| External event replay | Implement now | Ledger replay count, conflict detection, and durable-job retry |
| Future outbound write-back | Defer to TODO-019 | No outbound adapter method is activated |

## Architecture

External requests enter only through the generic signed webhook endpoint. The installation selects the tenant and adapter; HMAC verification precedes normalization. The service persists a normalized event ledger entry and `connector.intake` durable job in one database transaction. The worker reuses the existing `processTicket` application service and records the mapping/result without external side effects.

## Connector Domain Model

Added tenant-scoped `ConnectorInstallation`, `ConnectorCredential`, `ConnectorInboundEvent`, and `ExternalObjectMapping` records. Installation status supports draft, active, paused, degraded, disabled, and revoked. Event records store status, payload digest, provenance, safe metadata, normalized signal, replay count, job linkage, safe errors, and completion time.

## Credential Boundary

The reference connector encrypts only the signing secret with AES-256-GCM before persistence. The browser/API never receives it after creation; safe API responses expose only `credentialConfigured`. Production requires `OIP_CONNECTOR_CREDENTIAL_KEY`; local development uses a documented development-only fallback key. Credentials are scoped to an installation, support rotation, and are revoked on installation revocation.

## Adapter Port and Registry

`ConnectorAdapter` defines version, capabilities, configuration verification, inbound verification, normalization, connection test, and optional polling. The registry accepts only the built-in `generic.signed_webhook` adapter; unknown types fail safely and no customer-supplied code is loaded.

## Inbound Event Ledger

The ledger is the external idempotency and provenance boundary. It does not persist a raw body, authorization headers, or plaintext credential. It stores a normalized connector-neutral work signal only after signature validation.

## Idempotency

The uniqueness boundary is installation + external event ID + event type, separate from durable-job and ticket idempotency. Repeated identical delivery returns the original job; conflicting body digest returns a safe conflict. A 10-way simultaneous delivery probe created one event and one `connector.intake` job.

## Tenant Resolution

The inbound URL resolves a connector installation; its persisted organization is authoritative. Request payload organization fields are ignored. Event IDs and external object IDs are scoped to installations, so identical IDs remain isolated across tenants and connector replacements.

## Webhook Security

The reference route accepts only POST JSON bodies up to 256 KB, validates timestamp freshness, computes HMAC-SHA256 over `timestamp.rawBody`, compares signatures in constant time, and rejects missing/invalid authentication before event/job creation. Invalid signatures, expired timestamps, and content-type spoofing created zero durable jobs in focused tests.

## Normalized Work Signal

`ExternalWorkSignal` is connector-neutral and typed. It retains external object/event IDs, supported ticket metadata, requester fields, bounded tags, timestamps, and source URL. Message HTML is stripped; empty sanitized text, unsupported events, missing IDs, and malformed JSON fail permanently.

## Durable Job Integration

Webhook acknowledgement records the ledger entry and queues `connector.intake` in one transaction. The worker loads the verified normalized signal and invokes the existing ticket application service with a stable connector-event idempotency key. No ticket processing occurs in the webhook request.

## External Object Mapping

Mappings are unique per installation, object type, and external ID. A pending mapping reservation prevents concurrent first-event workers from creating two OIP tickets. A retry after a crash reuses ticket idempotency and completes that reservation safely.

## Create/Update Semantics

The first supported object event creates one OIP ticket in review. Later updates reuse the mapping and only refresh safe synchronization state; they do not create another ticket. Deleted/reopened source statuses are represented in `syncState`. No external update causes an automatic reply, trust update, or knowledge promotion.

## Ordering and Reconciliation

Per-object source timestamps prevent stale updates from overwriting a newer mapping. Concurrent updates while a first mapping is processing are recorded as deferred, not double-applied. Perfect global ordering is not claimed. The adapter exposes a durable-cursor polling foundation; a live poller/backfill controller is deferred.

## Reference Connector

Implemented `generic.signed_webhook` version 1. It is intentionally not presented as a Zendesk, Jira, Slack, or other vendor contract.

## Polling Foundation

The adapter port includes bounded `fetchChanges(cursor, limit)` and the installation stores a durable cursor. No cursor is advanced by the current webhook path. A production poller, rate-limit scheduling, and backfill control surface are future work.

## Installation APIs

- `GET/POST /api/organizations/{organizationId}/connectors`
- `GET /api/organizations/{organizationId}/connectors/{installationId}`
- `POST .../{installationId}/activate|pause|disable|revoke|test|rotate-secret`
- `GET .../{installationId}/events`
- `POST .../{installationId}/events/{eventId}/retry`
- `POST /api/connectors/webhook/{installationId}`

Current authorization is organization membership because the repository has no owner/admin capability enforcement yet. This is documented private-beta hardening debt.

## Operations Visibility

TODO-075 operations snapshots now include safe connector installation health, status, event count, mapping count, credential-configured state, and recent safe failure text. `GET /operations/connectors` exposes the same safe data. Raw events and credentials are excluded.

## Failure and Retry

Verification failures are rejected before enqueue. Normalization failures are permanent. Worker processing failures are recorded with safe error class/message and use existing durable-job retry/dead-letter behavior. Authorized retry requeues the original connector job and preserves event identity.

## Pause, Revoke, and Rotation

Paused, disabled, and revoked installations reject new webhooks but do not delete accepted events/jobs. Revocation also invalidates the active credential. Rotation encrypts a new credential, marks the previous credential rotated, and requires activation if it followed revocation.

## Privacy and Retention

The framework stores payload digest, normalized work signal, bounded safe metadata, external IDs, status, mapping, and safe error text. It does not store raw headers, raw webhook body, plaintext credentials, prompts, or chain-of-thought. Normalized ticket text follows existing ticket retention behavior.

## Telemetry and Performance

Measured process-local telemetry spans record webhook acknowledgement, verification, normalization, and durable enqueue latency. TODO-075 continues to report durable queue wait and job runtime. No fabricated provider, quota, token, or production throughput values are reported.

## Concurrency Results

The focused idempotency probe delivered one signed event ten times concurrently: one ledger event and one durable job resulted. Mapping tests proved one ticket for create/update/stale update handling. The framework records concurrent mapping updates as deferred rather than creating a second business effect.

## Security Results

Focused security tests passed for forged signature, expired timestamp, content-type spoofing, inactive/paused/revoked installation, old credential after rotation, payload conflict, and tenant-scoped identical external IDs. Invalid requests created no connector event or durable job.

## Focused Probe Results

- `probe:todo076-connector-installation`: PASS
- `probe:todo076-webhook-security`: PASS
- `probe:todo076-connector-idempotency`: PASS
- `probe:todo076-connector-worker`: PASS
- `probe:todo076-connector-mapping`: PASS
- `probe:todo076-connector-tenancy`: PASS

## Manual/Connector Parity

The connector worker calls the same `processTicket` application service as manual durable ticket processing, so normalized message, language, classification, canonical selection, retrieval, lesson selection, draft, and review state use the same path. Connector provenance and external mapping appropriately differ. Focused worker verification confirmed one persisted ticket in review with no connector-triggered learning side effect.

## Regression Results

PASS: TODO-018, TODO-067, TODO-068, TODO-069, TODO-070, all TODO-072 probes, all TODO-073 probes, all TODO-074 probes, all TODO-075 probes, TODO-058 multilingual, TODO-060, TODO-061, BUG-008 semantic safety, BUG-009 profile conflict recovery, BUG-010 profile pipeline, organization switching, persistence boundary, and server persistence.

Prisma validate, Prisma migration status (17 applied/current), TypeScript, and the production build passed. The build retains the pre-existing Tailwind CommonJS/ESM configuration warning.

`npm audit --omit=dev --json` reported 9 fixable advisories: 4 high and 5 moderate, with none critical. The direct Next.js dependency is in the reported vulnerable range; Prisma transitive tooling and Next/PostCSS/Sharp transitive dependencies also appear. No dependency upgrade was made as part of this connector architecture change.

## Data Safety

The migration is additive and reviewed. Write/security tests use disposable organizations and clean them up. Tests assert one ticket effect, zero invalid-request jobs, no connector-triggered promotion, and encrypted credential material without plaintext secret exposure.

## TODO-019 Readiness

TODO-076 now supplies inbound connector identity, tenant resolution, provenance, durable event ledger, external mapping, secure normalization, and idempotent durable intake. TODO-019 still owns action policy, approvals, permitted outbound actions, external side-effect outbox/action ledger, write-back adapters, rollback/reconciliation, timeout-after-success handling, and autonomous action monitoring.

## Remaining Findings

- The development encryption fallback must never be used in production; production key management/secret-manager integration remains deployment hardening.
- RBAC has only organization membership today; owner/admin-only credential mutation is deferred.
- Polling, historical backfill orchestration, rate-limit scheduling, and vendor-specific adapters are framework-only/deferred.
- Operations metrics are first-party durable summaries; provider request telemetry remains process-local.

## TODO-076 Status

COMPLETED_WITH_LIMITATIONS.

## Commit

TODO-076 enterprise connector framework implementation commit (recorded in the final handoff).
