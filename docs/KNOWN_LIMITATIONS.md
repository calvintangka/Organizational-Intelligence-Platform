# OIP Known Limitations

This document lists genuine limitations remaining for the planned `v0.1.0-certified` release. Completed capabilities are not listed as limitations.

## Release process

- The official certified release commit and `v0.1.0-certified` Git tag have not yet been created.
- Release-mode certification still requires a clean reviewed checkout.
- TODO-081B full release certification and explicit release approval remain pending.

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
