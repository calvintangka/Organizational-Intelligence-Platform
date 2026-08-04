# OIP Design Partner Guide

This guide describes a controlled pilot of the planned `v0.1.0-certified` foundation. It is intentionally operational rather than promotional.

## What OIP currently supports

- Ticket intake and deterministic understanding
- Profile-grounded classification and canonical-problem selection
- Retrieval from organization-scoped validated memory
- Draft responses for human review
- Reflection and governed learning workflows
- Durable async bulk, reflection, pattern-discovery, and connector jobs
- Worker operations visibility
- Signed-webhook connector boundaries
- Organization membership, RBAC, approvals, and governed actions
- Explainability and certification evidence

## Expected deployment model

Use a separate application and worker deployment backed by PostgreSQL. Configure explicit server persistence, managed connector encryption where needed, supervised workers, backups, HTTPS, and a named operator responsible for review and rollback.

## Recommended pilot size

Start with 1–3 organizations and a small set of named internal operators. Each organization should have a clear owner, reviewer, support operator, and escalation contact. Expand only after the organization-isolation, worker, connector, and approval workflows are understood in practice.

## Recommended ticket volume

Begin with a bounded sample, such as 50–200 tickets per organization, and observe queue behavior, draft quality, review time, memory changes, and worker health before increasing volume. Do not treat this range as a tested production capacity guarantee.

## Feedback expectations

Report the ticket ID, organization, timestamp, current release commit, expected behavior, observed behavior, screenshots or safe diagnostics, and whether the issue concerns classification, retrieval, drafting, learning, worker processing, connector handling, authorization, or governed execution. Never include secrets in an issue.

## Success metrics

- Reviewer acceptance and edit rate
- Correct current-intent and canonical-problem selection
- Retrieval precision and unsafe-match rate
- Time from intake to reviewed response
- Queue latency, retry, dead-letter, and recovery behavior
- Memory integrity and promotion correctness
- Tenant-isolation and authorization outcomes
- Connector event idempotency and normalization outcomes
- Operator confidence and time-to-resolution

## Current limitations

The pilot remains controlled because production-scale load validation, broad connector coverage, production monitoring deployment, live TODO-079 acceptance, and final release approval are not complete. Human review remains required for reusable memory and sensitive actions.
