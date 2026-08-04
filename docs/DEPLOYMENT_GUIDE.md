# OIP Deployment Guide

This guide describes the controlled deployment model for the planned `v0.1.0-certified` release. It does not create a release tag or imply that TODO-081B is complete.

## Prerequisites

- Node.js compatible with the repository toolchain
- npm
- PostgreSQL reachable from the application and worker
- Git checkout containing the approved release commit
- Process supervision for the web application and durable worker
- Secret management for database credentials, connector encryption, and optional provider keys

## Install and verify

```bash
npm ci
npx prisma generate
npx tsc --noEmit
npx prisma validate
npx prisma migrate status
```

Run migrations only against the intended release database:

```bash
npx prisma migrate deploy
```

## Environment variables

Never commit `.env.local`, provider keys, database passwords, or connector keys. Start from `.env.example` and use the deployment secret manager. The complete variable contract is in [PRODUCTION_CONFIGURATION.md](PRODUCTION_CONFIGURATION.md).

Minimum server deployment settings:

```text
DATABASE_URL=<secret-managed PostgreSQL URL>
NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server
OIP_CONNECTOR_CREDENTIAL_KEY=<secret-managed encryption key when connectors are enabled>
```

## Build and start

```bash
npm run build
npm run start
```

The build runs Prisma generation through the `prebuild` script. Start the web application only after migration status and configuration checks pass.

## Worker startup

Run a separate supervised process:

```bash
npm run worker:jobs
```

The worker must be able to reach the same database and receive the same organization/configuration context as the web application. Do not run multiple uncontrolled workers against a production database; choose concurrency and supervision deliberately.

## Connector configuration

Enable connectors only after configuring `OIP_CONNECTOR_CREDENTIAL_KEY` through a secret manager. Validate webhook signatures, use HTTPS at the edge, restrict inbound network paths where possible, and verify connector organization ownership and idempotency before enabling external traffic.

## Persistence mode

Production must explicitly use `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server`. The code default is local-first for development compatibility; it is not an acceptable implicit production decision.

## Security considerations

- Keep `ANTHROPIC_API_KEY`, `DATABASE_URL`, and connector keys server-side.
- Do not expose secrets through `NEXT_PUBLIC_` variables.
- Use TLS for external traffic and managed PostgreSQL connections where required.
- Restrict database access to application/worker identities.
- Require human review for security incidents and governed external effects.
- Back up the database and test restoration before accepting pilot data.

## Troubleshooting

- Migration failure: stop deployment, inspect `npx prisma migrate status`, verify database reachability, and do not manually edit migration history.
- Worker backlog: inspect worker health, leases, retries, dead letters, and database connectivity before restarting repeatedly.
- Provider unavailable: verify provider endpoint/key/timeout; deterministic fallback is expected when AI is disabled or unavailable.
- Connector failure: verify signature configuration, encryption key continuity, installation status, event digest/idempotency, and safe failure metadata.
- Local persistence observed in production: check `NEXT_PUBLIC_OIP_PERSISTENCE_MODE` and restart with the intended environment.
- Build failure: run `npm ci`, `npx prisma generate`, `npx tsc --noEmit`, and `npm run build` in a clean checkout.
