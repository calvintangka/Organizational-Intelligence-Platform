# OIP v0.1.0-certified Release Notes

## Release status

- Version: `v0.1.0-certified`
- Release date: **TBD — publication date is managed separately from the certified tag**
- Intended scope: controlled enterprise pilots and design partners
- Current certification evidence: RSS-1.3 release-mode certification passed on source `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`; OIP Benchmark v1 100% overall, 100% critical security, zero benchmark memory mutations
- Official Git release tag: **`v0.1.0-certified` annotated tag published to the `calvintangka` remote**

## Summary

This release package represents the completed Enterprise Foundation architecture for the Organizational Intelligence Platform (OIP). It consolidates durable organizational memory, governed learning, asynchronous processing, connector boundaries, organization-scoped authorization, and deterministic certification evidence.

The package is the certified baseline recorded by RSS-1.3 and published as `v0.1.0-certified`. A GitHub Release page is optional and is not claimed by this tag-only publication.

## Major milestones

- Durable asynchronous intake and processing
- Atomic validation and application-service boundaries
- Stateless organization-scoped persistence
- Asynchronous bulk analysis, reflection, and pattern discovery
- Worker operations and health visibility
- Enterprise connector framework with signed webhook handling
- Organization RBAC and approval authority
- Governed confirmed-ticket actions with ledger and idempotency controls
- Intent isolation, hierarchy ranking, temporal suppression, and contradiction handling
- OIP Certification Suite and OIP Benchmark v1

## Key architectural improvements

- Durable jobs separate request intake from worker execution.
- Organizational Memory writes are organization-scoped and auditable.
- Reflection and promotion remain reviewable and governed.
- Connectors normalize external signals before they enter OIP workflows.
- Security-sensitive requests fail closed and require authorized review.
- Deterministic intent hierarchy separates the current request from quoted or resolved context.
- Release evidence is produced by a repeatable certification runner.

## Important capabilities

- Ticket understanding, classification, canonical-problem selection, retrieval, drafting, and review.
- Human-reviewed validation and knowledge promotion.
- Async job retries, leases, cancellation, recovery, and idempotency.
- Reflection and emerging-pattern discovery through durable worker jobs.
- Connector installation, credential protection, webhook verification, mapping, and tenancy boundaries.
- RBAC, approval policy, governed action preparation, execution safeguards, and audit ledger.
- Benchmark and memory-integrity evidence for controlled release review.

## Known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). In particular, the official release gate still requires a clean reviewed commit, live TODO-079/BUG-009 verification, production configuration review, release approval, and tag creation.

## Recommended deployment scope

Deploy only to controlled design partners or private-beta organizations with an operator who can review drafts, monitor workers, manage connector credentials, and approve governed actions. Do not treat this package as broad unattended production authorization.
