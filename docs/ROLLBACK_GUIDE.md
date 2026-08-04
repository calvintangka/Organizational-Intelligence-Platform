# OIP Rollback Guide

Rollback is an operational decision for a deployed release. Stop unsafe effects first, preserve evidence, and do not improvise database history changes.

## When to roll back

Consider rollback when there is a release-level regression, data-integrity risk, security-control failure, worker retry storm, connector duplication risk, migration incompatibility, or an inability to operate safely within the approved pilot scope.

## Safe order

1. Declare the incident and record the release commit, tag, database migration state, worker version, and affected organizations.
2. Stop new intake if continued processing could create unsafe writes or external effects.
3. Pause or stop workers after allowing safe leases to settle, or terminate them using the platform's incident procedure.
4. Disable affected connectors or governed action execution if external effects are involved.
5. Preserve logs, job IDs, request/correlation IDs, connector event digests, and audit ledger evidence.
6. Deploy the previously approved application/worker commit.
7. Verify database compatibility before starting the older version.
8. Restart application and workers under the prior approved configuration.
9. Run smoke checks, worker health checks, tenant checks, and memory-integrity verification.
10. Reopen intake only after an operator approves the rollback verification.

## Git recovery

Use an approved immutable tag or commit:

```bash
git tag --list
git show <approved-tag>
git rev-parse <approved-tag>^{commit}
```

The repository currently contains `foundation-ready-for-async` and `pre-security-upgrade` baselines. They have different scopes and must not be used as substitutes for an approved `v0.1.0-certified` release tag. Never force-move or delete a release tag.

## Database considerations

Application rollback does not automatically mean database rollback. Prisma migrations are forward history and should not be reversed casually. Confirm whether the previous application is compatible with the current schema; if not, use a tested database restore or a specifically reviewed forward-fix procedure. Preserve Organizational Memory and audit evidence unless an approved recovery plan explicitly requires restoration.

## Worker considerations

Stop workers before changing application versions when job handlers or payload versions are incompatible. Inspect leased, retrying, failed, cancelled, and dead-letter jobs. Do not blindly replay jobs that may have produced external effects; use idempotency and governed-action ledger evidence.

## Connector considerations

Pause affected installations, preserve inbound event IDs and payload digests, keep credential encryption keys stable, and verify external mappings before replay. Do not rotate or discard connector keys during an incident unless the incident plan requires it.

## Verification

After rollback verify:

- application health and login
- database connectivity and migration compatibility
- worker heartbeat and queue behavior
- organization isolation and RBAC
- connector signature/idempotency behavior
- governed action approval and ledger behavior
- memory snapshot and audit-record integrity
- no unexpected external effect or duplicate replay
