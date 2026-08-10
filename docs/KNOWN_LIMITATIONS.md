# OIP Known Limitations

This document lists genuine limitations remaining for the planned `v0.1.0-certified` release. Completed capabilities are not listed as limitations.

## Release process

- The official certified release commit is `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`; the annotated `v0.1.0-certified` tag is published on the configured remote. A GitHub Release page is optional and was not created in RSS-1.4.
- RSS-1.3 release-mode certification passed on the certified source. Future release candidates still require a clean reviewed checkout and explicit approval.

## Live validation

- TODO-079 deterministic release acceptance currently scores 580/600 (threshold 560); a full browser/UI rehearsal remains an operational follow-up.
- TODO-058C retains a stale fixture label (`canonical-billing-invoice-issue`) while the accepted product canonical is `canonical-duplicate-invoice`; this is documented fixture debt and does not change product behavior.
- BUG-009 live HTTP verification requires its local endpoint to be running; the endpoint was unavailable during the latest focused verification.
- Production-scale load validation and multi-customer design-partner validation remain limited.

## Operations

- Worker monitoring and dead-letter capabilities exist in the application, but a production monitoring deployment and on-call process are not included here.
- Connector support is intentionally early and currently centered on the generic signed-webhook framework rather than a broad connector ecosystem.
- Deployment, rollback, and release approval procedures are documented by this package but still require operational rehearsal.

## Configuration

- Production must explicitly configure server persistence with `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server`.
- Production connector use requires a managed `OIP_CONNECTOR_CREDENTIAL_KEY`.
- Async feature flags, worker concurrency, telemetry policy, and provider settings require deployment-specific decisions.
- AI provider availability is environment-dependent; deterministic fallback remains the safe behavior when providers are unavailable.

## Scope

- OIP is intended for controlled design partners and private-beta organizations, not unattended broad production operation.
- Human review remains required for reusable-memory promotion, sensitive security requests, and governed external effects.
- RSS-2.3 intentionally does not include email verification, password-reset redesign, invitations, member management, billing/subscription onboarding, or broad organization lifecycle tutorials. RSS-2.7 adds the scoped lifecycle flow and recovery states, but not those advanced account features.
- Existing FastDrop Logistics, Maesa Tech, and OIP Developer Demo memberships retain their historical zero-formal-owner state. RSS-2.2 intentionally does not retrofit or reconcile those organizations; demo-membership isolation and broader lifecycle UX remain later RSS-2 work.
- Cross-tab live active-organization synchronization is not implemented; each tab refreshes its server-backed context independently.
- RSS-2.4 verifies the three mature demo tenants and explicit development provisioning, but does not add invitations/member administration or historical ownership reconciliation. RSS-2.7 covers the scoped lifecycle UX; advanced lifecycle administration remains deferred.
- RSS-2.5 documents but does not implement invitations/member onboarding, ownership transfer UI beyond the existing protected role-assignment primitive, organization leave/deletion, or billing/plan-based limits. New customer organizations have a server-authoritative Owner; historical demo organizations retain their legacy role shape.
- RSS-2.6 keeps revision conflicts intentionally strict: there is no automatic semantic merge, real-time collaborative editing, durable per-write revision history, or live cross-tab conflict synchronization. Conflict diagnostics are metadata-only process telemetry plus existing authorization audits; the exact customer-facing KnowledgeItem two-tab browser rehearsal passed in RSS-2.8-FINAL-KNOWLEDGEITEM-TWO-TAB-CLOSURE. Stale local drafts may be replaced by an explicit Reload latest action. Snapshot knowledge writes can advance unchanged rows included in the submitted collection.
- Browser tooling does not export a full HAR archive; targeted request/status evidence is available and this remains a non-blocking tooling limitation.
