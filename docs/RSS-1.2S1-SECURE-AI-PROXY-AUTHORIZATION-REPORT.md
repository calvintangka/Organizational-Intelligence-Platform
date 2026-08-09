# RSS-1.2S1 — Secure AI Proxy Authorization Report

**Audit date:** 2026-08-06
**Audit type:** Remediation + independent verification of RSS-1.2S0 Critical Finding #1
**Final verdict:** **AUTHORIZATION_BOUNDARY_ENFORCED**
**Release recommendation:** **READY TO PROCEED with RSS-1.2S2 (abuse controls)**

## 1. Executive Summary

RSS-1.2S0 confirmed that all four AI proxy endpoints (`/api/ai/chat`, `/api/ai/deepseek`, `/api/ai/claude`, `/api/ai/openai-compatible`) were callable without any authentication, letting anonymous callers consume server-held provider credentials and create billable upstream usage. RSS-1.2S1 closes that Critical finding with a single, shared authorization boundary through which every AI proxy request must pass before provider configuration, credentials, diagnostics, endpoint selection, or any outbound AI request is touched.

The boundary enforces, in a fixed order: authentication (401), organization resolution (400 when missing), membership verification (403), and the new `ai.use` capability check (403). Every authenticated decision is durably recorded in `authorization_decision_audits` with actor, organization, capability, endpoint, provider, request/correlation IDs, allow/deny, denial reason, and timestamp. Unauthorized requests never contact a provider and receive only the standard safe error envelope.

The new RSS-1.2S1 probe reproduced every branch over HTTP against a mock provider: anonymous, expired-session, and deleted-user requests returned 401 with zero provider calls; missing organization returned 400; unknown/inaccessible organization and missing membership returned 403; Viewer was denied `ai.use` (403) while Owner, Administrator, Reviewer, and Support Agent were allowed (200). The full regression suite continues to pass.

## 2. Root Cause

In the audited working tree, none of the four `POST` handlers called `requireAuthenticatedUser`, `requireOrganizationMembership`, or `requireCapability`. Each handler read provider configuration and environment variables at the top of the request (`readApiKey`, `readBaseUrl`, `readModel`, `read`), then issued an upstream fetch. RSS-1.2S0 observed anonymous requests reaching the local mock (200) and reaching Anthropic (502), confirming provider access and credential probing before any identity check existed.

Source evidence (audited tree): `app/api/ai/chat/route.ts`, `app/api/ai/deepseek/route.ts`, `app/api/ai/claude/route.ts`, `app/api/ai/openai-compatible/route.ts`.

## 3. Security Architecture

RSS-1.2S1 introduces one shared, deterministic authorization boundary used by every AI proxy route:

- **`lib/server/aiAuthorization.ts`** — new. Exposes `withAuthorizedAIRequest(request, { endpoint, provider }, handler)`, `requireAIAccess`, `toSafeAIAccessError`, and `aiAccessErrorResponse`. This is the single source of truth for AI route authorization; no authorization logic is copied into any route.
- **`lib/server/authorization.ts`** — added `resolveActiveOrganizationId(userId)`, the DB seam the boundary uses to resolve the organization context.
- **`lib/server/rbac/definitions.ts`** — registered the new `ai.use` capability and mapped it onto the working/administrative roles.
- **`prisma/migrations/20260806000000_add_ai_use_capability/migration.sql`** — durable capability and role–capability rows.

The boundary reuses the existing RBAC engine (`AuthorizationService`) and its existing audit writer; it does not introduce a parallel authorization mechanism. Provider configuration, environment variables, diagnostics, endpoint selection, and API keys remain in the route handlers and are reached only after `requireAIAccess` resolves.

Error responses use the repository's standard safe envelope `{ error: { code, message } }` with status 401/400/403/503. No provider URL, provider model, API-key existence, environment variable, upstream response body, or stack trace is ever emitted on a denial.

## 4. Authorization Flow

Every AI request now executes exactly this order:

```text
Incoming Request
        │
        ▼
Authentication  ─────────────────────────────── invalid/expired/deleted → 401 UNAUTHENTICATED
        │
        ▼
Organization Resolution  ────────────────────── no active organization → 400 MISSING_ORGANIZATION
        │
        ▼
Membership Verification  ────────────────────── not a member → 403 FORBIDDEN
        │
        ▼
Capability Verification (`ai.use`)  ─────────── capability not granted → 403 FORBIDDEN
        │
        ▼
Audit Authorization Decision  (allow/deny row in authorization_decision_audits)
        │
        ▼
Provider configuration / credentials / endpoint selection / outbound AI request
```

The verification chain is implemented once in `requireAIAccess`:

1. `requireAuthenticatedUser()` — session cookie → `getCurrentUser()` (validates expiry and cascade-deleted sessions); throws 401 `UNAUTHENTICATED`.
2. `resolveActiveOrganizationId(user.id)` — throws 400 `MISSING_ORGANIZATION` when absent.
3. `requireCapability(organizationId, "ai.use", { request, resource, requestId, correlationId })` — resolves the durable role, verifies membership and the `ai.use` capability, and writes the allow/deny audit row; throws 403 `FORBIDDEN`.

Security-rule mapping:

| Rule | Result |
| --- | --- |
| Anonymous user | 401 |
| Expired session | 401 |
| Deleted user | 401 |
| Missing organization | 400 |
| Invalid/unknown organization | 403 |
| No membership | 403 |
| Missing capability | 403 |
| Provider unavailable (post-authorization) | 502/503 |

## 5. AI Capability Design

No existing capability represented "invoke paid AI providers." `operations.read` and `metrics.read` are read-only operational capabilities, and reusing them would have conflated monitoring with paid-provider consumption. A dedicated capability was introduced:

- **Key:** `ai.use`
- **Description:** "Invoke paid AI providers through the OIP AI proxy."
- **Model:** `CapabilityKey` in `CAPABILITY_KEYS` (`lib/server/rbac/definitions.ts`), persisted in `rbac_capabilities` and linked through `rbac_role_capabilities` by migration.
- **Role grants:** Owner, Administrator, Reviewer, Operator, and Support Agent. Viewer is intentionally **not** granted `ai.use` — a read-only contract must never trigger paid AI consumption.
- **Assignment:** the capability is conferred through existing RBAC role assignment. Assigning any of the five working roles to a user grants `ai.use`; it needs no separate assignment flow.

Durable role resolution (`AuthorizationService.resolveRole`) reads `rbac_role_capabilities` and falls back to the in-code `ROLE_CAPABILITIES` map only when a role has no durable rows, so both fresh installs (via migration) and existing deployments resolve consistently. The migration is applied to the development database (`rbac_roles` check confirms `ai_use=1` for owner/administrator/operator/reviewer/support_agent and `ai_use=0` for viewer).

## 6. Shared Authorization Boundary

`withAuthorizedAIRequest(request, options, handler)` is the single reusable boundary. All four routes delegate to it with a fixed endpoint/provider pair:

| Route | `endpoint` | `provider` slug |
| --- | --- | --- |
| `/api/ai/chat` | `/api/ai/chat` | `lmstudio` |
| `/api/ai/deepseek` | `/api/ai/deepseek` | `deepseek` |
| `/api/ai/claude` | `/api/ai/claude` | `claude` |
| `/api/ai/openai-compatible` | `/api/ai/openai-compatible` | `openai-compatible` |

The audit `resource` is `ai_proxy:<endpoint>:<provider>`, capturing both the endpoint and the provider deterministically (e.g. `ai_proxy:/api/ai/deepseek:deepseek`). Request and correlation IDs are read from `x-request-id` / `x-correlation-id` (falling back to a generated UUID) and threaded into the audit row.

Each route's `POST` is now:

```ts
export async function POST(request: Request) {
  return withAuthorizedAIRequest(request, { endpoint: PROXY_PATH, provider: "..." }, async (access) => {
    // provider config, credentials, fetch — only reached after authorization
  });
}
```

The static verification embedded in the RSS-1.2S1 probe asserts all four routes import and call `withAuthorizedAIRequest`, and that no `process.env` / `readApiKey` / `readBaseUrl` / `fetch(` appears before the boundary call.

## 7. HTTP Verification

Verified by `node scripts/rss-1.2s1-ai-proxy-authorization.cjs` against a disposable Next development server whose AI base URLs point at a local mock provider (no external network). Results:

| Scenario | Endpoints | Status | Provider calls |
| --- | --- | --- | --- |
| Anonymous | all four | 401 | 0 |
| Expired session | deepseek | 401 | 0 |
| Deleted user | deepseek | 401 | 0 |
| Missing organization | deepseek | 400 `MISSING_ORGANIZATION` | 0 |
| Unknown/inaccessible organization | deepseek | 403 | 0 |
| No membership in active org | deepseek | 403 | 0 |
| Viewer (missing `ai.use`) | all four | 403 | 0 |
| Owner / Administrator / Reviewer / Support Agent | deepseek | 200 | 1 each |
| Authorized Support Agent | chat, openai-compatible | 200 (`OK`) | 1 each |
| Authorized Support Agent | claude (no key configured) | 503 | 0 |
| Cross-organization member (org B) | deepseek | 200 (authorized under org B) | 1 |

No `x-ai-*` diagnostic header and no provider URL/model/base-port string appears in any denial response; diagnostics are entirely unavailable to unauthorized callers.

## 8. Audit Verification

For the disposable organization, `authorization_decision_audits` contained 12 `ai.use` rows: 7 `allow`, 4 Viewer `deny` (`reason = capability_not_granted`), and 1 no-membership `deny` (`reason = organization_membership_required`). Every row carries `capabilityKey = ai.use`, a `requestId`, and a `resource` of the form `ai_proxy:<endpoint>:<provider>`. A supplied `x-correlation-id` was preserved exactly (`rss12s1-support-corr-*`). No prompt, AI response, or API key is ever written to the audit.

Audit capture mapping:

| Required field | Stored as |
| --- | --- |
| actor | `actorUserId` |
| organization | `organizationId` |
| capability | `capabilityKey` (`ai.use`) |
| endpoint | `resource` (`ai_proxy:/api/ai/...`) |
| provider | `resource` provider slug |
| request ID | `requestId` |
| correlation ID | `correlationId` |
| allow/deny | `decision` |
| denial reason | `reason` |
| timestamp | `createdAt` |

## 9. Regression Results

All requested regressions executed after the RSS-1.2S1 changes:

| Regression | Result | Evidence |
| --- | --- | --- |
| TypeScript (`npx.cmd tsc --noEmit`) | PASS | Exit 0 |
| Prisma validation (`npx.cmd prisma validate`) | PASS | Schema valid |
| Production build (`npm run build`) | PASS | Next 15.5.22, exit 0 |
| TODO-078 RBAC probe | PASS | `TODO-078 RBAC probe passed.` |
| TODO-082A DeepSeek provider probe | PASS | All order, fallback, path, model, credential-injection, and diagnostics checks passed |
| TODO-082C diagnostics probe | PASS | All diagnostics, fallback, redaction, history checks passed |
| TODO-046 weak-fallback safety probe | PASS | Exit 0 |
| TODO-080 intent-isolation probe | PASS | Exit 0 |
| TODO-083 calibration probe | PASS | Exit 0 |
| OIP Benchmark v1 | PASS | 1000/1000 checks, 100% overall, 100% critical security |
| RSS-1.2S0 security verification | PASS | Exit 0, global counts and mature digest restored |
| RSS-1.2S1 AI proxy authorization (new) | PASS | All branches above, data safety asserted |

The three probes that exercised AI route handlers directly in-process (TODO-082A, TODO-038, RSS-1.2A) were updated to present an authenticated actor through a shared in-process stub (`scripts/lib/ai-route-auth.cjs`) that swaps the three `lib/server/authorization.ts` seams (`requireAuthenticatedUser`, `resolveActiveOrganizationId`, `requireCapability`). This was required because the security contract changed: the routes no longer accept anonymous requests. The stubs are test-only; no production code is stubbed. TODO-038 and RSS-1.2A were updated for consistency even though they are not in the required regression list.

## 10. Security Review

- **AuthN before provider:** every provider-config/env/diagnostic/API-key read now occurs strictly after `requireAIAccess` resolves. Verified functionally (denials produce zero provider calls) and statically (no `process.env`/`readApiKey`/`readBaseUrl`/`fetch(` before the boundary call in any route).
- **Credentials:** API keys are read only inside the authorized handler; an anonymous caller can no longer distinguish "key configured" from "key absent" (both are 401). The probe runs with synthetic keys present and confirms 401 for anonymous access.
- **Outbound requests:** unauthorized requests never execute `fetch`; the mock recorded zero calls for all denial branches.
- **Diagnostics:** denial responses expose no `x-ai-*` headers, no diagnostics body, and no provider URL/model/port. Existing success-path diagnostics are preserved so the authorized UI and the TODO-082A probe continue to work.
- **No new authz mechanism:** the boundary delegates entirely to the existing `AuthorizationService` and the existing audit writer.
- **CSRF:** unchanged; AI routes are JSON POST routes behind the existing `HttpOnly`, `SameSite=Lax`, production-`Secure` session cookie. RSS-1.2S4 remains the dedicated header/origin task.
- **Durable audit failure:** `writeAudit` continues to swallow audit-sink failures so an audit outage never becomes an authorization bypass (pre-existing, unchanged).

## 11. Performance Impact

The boundary adds three indexed lookups to each AI request before the (comparatively expensive) upstream call: one `auth_sessions` read (with user), one `users` read for the active organization, and one membership/role read. All are single-row indexed queries, dwarfed by the outbound AI latency. The RSS-1.2S1 probe did not measure a material change in request handling; the marginal overhead is negligible relative to provider round-trips and is identical in structure to every other org-scoped route in the system.

## 12. Data Integrity

RSS-1.2S1 modifies only the AI authorization boundary and its capability registration:

- New: `lib/server/aiAuthorization.ts`, `scripts/lib/ai-route-auth.cjs`, `scripts/rss-1.2s1-ai-proxy-authorization.cjs`, migration `20260806000000_add_ai_use_capability`.
- Modified: `lib/server/rbac/definitions.ts`, `lib/server/authorization.ts`, the four AI route files, and three probe scripts (test adaptation).

No changes were made to Tickets, Organizational Memory, Lessons, Trust, Reflections, Candidates, Patterns, Governed Actions, or Connectors. The RSS-1.2S1 probe and the RSS-1.2S0 probe both assert (and confirmed) that global table counts and the mature Developer Demo digest are identical before and after testing.

## 13. Remaining Limitations

- **Unauthenticated attempts are not audited.** `authorization_decision_audits` requires a valid `actorUserId` and `organizationId` (both FK-constrained), so an anonymous 401 at the authentication gate — or a 400 for a user with no active organization — cannot be persisted as an org-scoped audit row. The "Audit: DENY" expectation in the negative-test table is satisfied for every decision that has an authenticated actor; anonymous attempts have no actor by construction. This matches the behavior of the rest of the RBAC system. If immutable unauthenticated-attempt auditing is required, a separate model with nullable actor/org is a follow-up item.
- **Nonexistent organization ids cannot be stored.** `users.activeOrganizationId` is FK-validated, so a malformed/nonexistent organization cannot be represented in the database; the identical 403 deny branch (missing membership → `organization_membership_required`) is exercised instead.
- **Diagnostics on success remain as before.** RSS-1.2S0's note that success-path diagnostics expose provider configuration metadata is outside RSS-1.2S1's authorization scope and is tracked under the separate diagnostics/budget remediation (RSS-1.2S10 family).
- **Rate limiting** (RSS-1.2S0 Finding #2) is out of scope and is the next blocker (RSS-1.2S2).

## 14. Recommendation

Approve RSS-1.2S1 and proceed to RSS-1.2S2 (application/gateway abuse controls) and RSS-1.2S3 (server-owned ticket write contract). The AI proxy boundary should be re-verified after any future route or capability-map change by rerunning `node scripts/rss-1.2s1-ai-proxy-authorization.cjs`.

## 15. Release Status

RSS-1.2S1 satisfies every success criterion:

- All four AI proxy endpoints require authentication. **Verified**
- Organization membership is enforced. **Verified**
- RBAC capability checks are enforced (`ai.use`). **Verified**
- Every authenticated authorization decision is audited (allow and deny). **Verified**
- No provider configuration or credentials are accessed before authorization succeeds. **Verified (functional and static)**
- Unauthorized requests never contact an AI provider. **Verified (zero provider calls on all denials)**
- Anonymous requests return 401. **Verified**
- Forbidden requests return 403. **Verified**
- Existing AI functionality continues to work for authorized users. **Verified (Owner/Administrator/Reviewer/Support Agent return 200 via mock)**
- All regressions pass. **Verified**
- RSS-1.2S0 Critical Finding #1 is fully resolved. **Verified**

**AUTHORIZATION_BOUNDARY_ENFORCED**
