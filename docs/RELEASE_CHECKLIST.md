# OIP Release Checklist

Target release: `v0.1.0-certified`

Items marked **Automated** are executed by repository commands or the certification runner. Items marked **Manual** require a reviewer or operator.

## Repository

- [ ] **Manual** Confirm intended branch/release commit and review all diffs.
- [ ] **Automated** `git status --short` is clean.
- [ ] **Automated** No staged surprises, merge/rebase state, secrets, dumps, or generated output.
- [ ] **Manual** Confirm existing baseline tags are unchanged.

## Dependencies and build

- [ ] **Automated** Run `npm ci` from the lockfile in a clean checkout.
- [ ] **Automated** Run `npm audit` and review high/critical results.
- [ ] **Automated** Run `npx tsc --noEmit`.
- [ ] **Automated** Run `npx prisma validate`.
- [ ] **Automated** Run `npx prisma migrate status`.
- [ ] **Automated** Run `npm run build`.

## Database and configuration

- [ ] **Manual** Confirm production `DATABASE_URL` and backup/restore plan.
- [ ] **Manual** Confirm `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server`.
- [ ] **Manual** Confirm `OIP_CONNECTOR_CREDENTIAL_KEY` is managed and available when connectors are enabled.
- [ ] **Manual** Confirm worker concurrency, version, async flags, telemetry, and provider choices.
- [ ] **Automated** Confirm migration history is up to date and no drift is reported.

## Regression and certification

- [ ] **Automated** Run required regression probes.
- [ ] **Automated** Run OIP Benchmark v1 at or above 95% overall.
- [ ] **Automated** Confirm critical security benchmark is 100%.
- [ ] **Automated** Confirm memory-integrity snapshots show zero unexpected mutations.
- [ ] **Manual/Automated** Complete live TODO-079 and BUG-009 acceptance with required services available.
- [ ] **Automated** Run `npm run certify -- --release` from the clean candidate.
- [ ] **Manual** Review `docs/OIP-CERTIFICATION-REPORT.md` and approve limitations.

## Documentation and approval

- [ ] **Manual** Review release notes, changelog, known limitations, deployment, rollback, and design-partner guides.
- [ ] **Manual** Confirm release configuration contract and secret-handling procedure.
- [ ] **Manual** Confirm support owner, worker owner, database owner, and rollback owner.
- [ ] **Manual** Approve the release candidate.

## Tag and release

- [ ] **Manual** Create annotated tag `v0.1.0-certified` on the approved commit only.
- [ ] **Automated** Verify tag object, commit resolution, annotation, and repository cleanliness.
- [ ] **Manual** Publish release notes and deployment instructions.
- [ ] **Manual** Record rollback point and approval evidence.
