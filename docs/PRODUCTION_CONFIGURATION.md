# OIP Production Configuration

This document is the release configuration contract. Values shown are names or safe examples only; secrets must come from deployment secret management.

## Required variables

| Variable | Requirement | Guidance |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection URL for the application and worker. |
| `NEXT_PUBLIC_OIP_PERSISTENCE_MODE` | Required for release | Set to `server`; do not rely on the development default `local`. |
| `OIP_CONNECTOR_CREDENTIAL_KEY` | Required when connectors are enabled | Stable secret-managed key for connector credential encryption/decryption. |

## Optional provider variables

| Variable | Purpose | Safe behavior when absent |
| --- | --- | --- |
| `NEXT_PUBLIC_AI_MODE` or `AI_MODE` | `lmstudio` or `disabled` | Defaults to deterministic/disabled behavior. |
| `AI_BASE_URL` | Server-side LM Studio endpoint | Uses the configured application default only when AI is enabled. |
| `AI_MODEL` | LM Studio model name | Uses the application default. |
| `AI_TIMEOUT_MS` | LM Studio timeout | Uses the application default. |
| `ANTHROPIC_API_KEY` | Server-side fallback provider key | Provider fallback is unavailable; deterministic fallback remains. |
| `CLAUDE_MODEL` | Claude fallback model | Uses the application default. |
| `CLAUDE_TIMEOUT_MS` | Claude timeout | Uses the application default. |

## Worker variables

| Variable | Purpose | Recommended starting value |
| --- | --- | --- |
| `OIP_JOB_WORKER_CONCURRENCY` | Maximum concurrent worker jobs | `2`, then tune from observed queue and database capacity |
| `OIP_VERSION` | Worker heartbeat/version identity | Release version, for example `0.1.0-certified` |
| `OIP_TELEMETRY` | Enable/disable telemetry | Set deliberately according to privacy and operations policy |
| `OIP_TELEMETRY_LOG` | Enable diagnostic logging | Keep `false` unless actively troubleshooting |

## Feature flags

| Variable | Purpose | Release decision |
| --- | --- | --- |
| `NEXT_PUBLIC_OIP_ASYNC_BULK_INTAKE` | Async bulk intake path | Enable only after worker and queue readiness are verified. |
| `NEXT_PUBLIC_OIP_ASYNC_REFLECTION` | Async reflection path | Enable only after worker and review workflow readiness are verified. |
| `NEXT_PUBLIC_OIP_ORGANIZATION_ID` | Optional initial organization bootstrap | Set only when deployment intentionally selects a known organization. |

## Connector variables

- `OIP_CONNECTOR_CREDENTIAL_KEY` is required in production when connector credentials are stored.
- `OIP_CONNECTOR_DEV_SECRET_KEY` is development-only fallback material and must not be used as production key management.
- Connector signing secrets belong inside the encrypted connector credential flow, not in source or public environment variables.

## Persistence configuration

Set:

```text
NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server
```

The local-first default exists for development and offline demonstrations. It is not a safe implicit production choice for an organization-scoped durable deployment.

## Development versus production

Development may use local persistence, local LM Studio, disabled AI, development-only seed users, and the connector development fallback. Production must use managed PostgreSQL, explicit server persistence, secret-managed connector encryption, supervised workers, restricted credentials, HTTPS, backups, and approved observability.

## Safe defaults

- AI mode defaults to disabled/deterministic behavior.
- Connector credential access throws in production when the encryption key is missing.
- Diagnostic telemetry logging is opt-in.
- Missing optional provider keys fail through to deterministic behavior.

Safe defaults do not replace explicit release configuration for persistence, secrets, worker supervision, or data protection.
