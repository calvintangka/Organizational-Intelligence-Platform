# OIP Architecture Baseline

This is a concise orientation for engineers working with the planned `v0.1.0-certified` foundation. Detailed design remains in `docs/architecture/` and `docs/implementation/`.

## Frontend

OIP uses a Next.js App Router application with React and TypeScript. The main workflow presents intake, understanding, retrieval, draft review, reflection, knowledge, cases, organization context, workers, connectors, and governance views. Browser code does not own server authority for organization-scoped durable writes.

## Backend

Next.js route handlers and server-only application services coordinate ticket processing, learning commands, persistence, authentication context, worker jobs, connectors, and governed actions. Deterministic reasoning is used as the safe baseline; AI providers are advisory and fail through to deterministic behavior.

## Persistence

PostgreSQL is accessed through Prisma and the PostgreSQL adapter. Prisma migrations define the schema. The persistence boundary is organization-scoped and supports an explicit local/server authority model. A release deployment must set `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server`.

## Organizational Memory

Durable memory includes organization-scoped tickets, knowledge items, candidates, validation records, trust evidence, memory-change records, prepared reflections, and emerging patterns. The OIP v2 foundation additionally persists domain-neutral `OrganizationalSource` and `EvidenceRecord` records, explicit `KnowledgeReuseOutcome` events (`SUCCESS`, `CORRECTION_REQUIRED`, or `FAILURE`), and human-governed `KnowledgeChallenge` decisions. Operators can record an organizational experience, add evidence, prepare a learning candidate, validate it, and inspect its Source, Evidence, validation, trust explanation, outcomes, challenges, versions, and provenance from the Knowledge surface. Existing Support ticket/resolution evidence is adapted into those neutral records without replacing its authoritative history. Memory changes are reviewable and auditable; retrieval compatibility is separate from trust and promotion decisions. Retrieval now follows candidate generation → hard compatibility → structured scope/condition/problem selection → evidence/grounding reconciliation → governed reuse. Near-duplicate candidates are selected without automatic merging: meaningful semantic differences win first, equivalent validated representations use a late deterministic chronology tie-break, and a stable canonical ID resolves same-instant ties. An open challenge remains inspectable for retrieval but is not automation-authorized.

## Trust Engine

Trust evidence records validated source-ticket contributions and prevents duplicate trust events. Similarity or retrieval alone does not authorize reusable knowledge or autonomous action.

## Reflection

Reflection evaluates reviewed ticket outcomes and prepares learning commands. Promotion and validation remain governed application-service operations; the system does not silently turn a draft into trusted memory.

## Application services

- Ticket processing: deterministic understanding, profile routing, canonical identification, retrieval, draft preparation, and persistence boundaries.
- Learning services: reflection preparation, validation, promotion, and memory-change recording.
- Governed action services: policy evaluation, approval, execution, idempotency, reversal, and ledger recording.

## Async workers

Durable jobs provide typed/versioned work input, idempotency keys, leases, attempts, retry state, cancellation, progress, results, and safe errors. Separate worker processes handle bulk learning, reflection, pattern discovery, and connector work. The web process does not implicitly replace the worker process.

## Connectors

The connector framework currently includes the generic signed-webhook connector type. Installation state, encrypted credentials, inbound-event digests, normalized signals, external mappings, idempotency, and organization ownership are durable. Connector credentials are never stored as plaintext application state.

## RBAC

Organization membership and capability checks govern access to organization data and operations. Approval authority is separate from ordinary membership. Sensitive operations require the appropriate capability and, where policy requires it, explicit approval.

## Governed execution

The governed action flow separates preparation, policy decision, approval, execution, outcome, reversal, and ledger evidence. Confirmed ticket label actions are bounded by organization policy, idempotency, authorization, and auditability.

## Certification

`scripts/certify.cjs` runs ordered release gates and writes `docs/OIP-CERTIFICATION-REPORT.md`. OIP Benchmark v1 contains 100 deterministic enterprise cases and currently passes 1,000/1,000 checks with 100% critical security. Release mode additionally requires a clean working tree.

## Deployment model

The intended model is a Next.js application, PostgreSQL database, and separate durable-job worker process, with optional local LM Studio or server-side provider access. Controlled pilots should use explicit server persistence, managed connector encryption keys, database backups, worker supervision, and human operational review.
