# OIP Version Summary

## Planned version

`v0.1.0-certified` is the planned first certified release name. The official tag and release date remain pending TODO-081B.

## What OIP can do today

OIP can process organization-scoped support tickets, classify current intent, identify canonical problems, retrieve validated organizational memory, prepare grounded drafts, and keep human review in the loop. It can persist durable jobs for bulk learning, reflection, pattern discovery, and connector work. It provides RBAC, approval authority, governed action controls, audit evidence, connector boundaries, worker operations views, and deterministic certification evidence.

## What OIP intentionally does not do yet

- It does not authorize unattended broad production operation.
- It does not treat an AI suggestion as trusted memory without validation and governance.
- It does not grant sensitive access, disable audit controls, expose secrets, or execute governed effects without authorization.
- It does not claim production-scale capacity or a mature ecosystem of external connectors.
- It does not replace human support, security, compliance, or release approval.

## Architectural principles

- Organization scope is explicit at durable boundaries.
- Deterministic safety and explainability are the baseline.
- Retrieval, trust, reflection, promotion, and execution are separate decisions.
- Asynchronous work is durable, observable, retryable, and idempotent.
- Sensitive effects are governed and auditable.
- Release claims are tied to repeatable evidence rather than feature count.

## Enterprise readiness

The Enterprise Foundation architecture is implemented and the benchmark evidence is strong. Release readiness still depends on a clean reviewed candidate, explicit production configuration, live acceptance verification, documentation review, and an approved immutable tag.

## Target customer

The initial target is a design partner or private-beta organization with a defined support operation, named reviewers, a manageable ticket stream, and an operator able to supervise workers, connectors, memory promotion, and governed actions.

## Deployment options

- Controlled PostgreSQL-backed application plus separate worker deployment for pilots.
- Development/local mode for engineering and demonstrations.
- Optional local LM Studio advisory provider with deterministic fallback.
- Optional server-side provider fallback where policy and secret management permit.

## Roadmap after v0.1.0-certified

The next work should be driven by release evidence: full clean-checkout certification, live adversarial acceptance, production monitoring and on-call practice, scale validation, broader connector coverage, and design-partner feedback. These are follow-on priorities, not claims included in this version.
