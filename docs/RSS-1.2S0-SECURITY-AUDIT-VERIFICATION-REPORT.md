# RSS-1.2S0 — Independent Verification of Critical Security Audit Findings

**Audit date:** 2026-08-06  
**Audit type:** Verification only; no remediation implemented  
**Final verdict:** **CRITICAL_FINDINGS_CONFIRMED**  
**Release recommendation:** **DO NOT EXPOSE EXTERNALLY**

## 1. Executive Summary

The three release-critical claims were independently reproduced against the current working tree. Anonymous requests reached every AI proxy's provider boundary; repeated login, AI, and ticket requests encountered no application rate limit; and a disposable Support Agent persisted forged ticket lifecycle, identity, resolution, review, validation, and knowledge-reference data. Two further integrity defects were reproduced: a Viewer used `metrics.read` to persist metrics, and a malformed legacy role value received Support Agent capabilities.

The Claude endpoint itself is structurally correct (`POST https://api.anthropic.com/v1/messages` with the required headers and request shape), so the “invalid endpoint” part of that claim is rejected. The currently configured credential was rejected upstream, however, so the fallback could not succeed in the captured environment.

| ID | Audit claim | Result | Severity | Runtime reproduced | Impact | Next action |
| -- | ----------- | ------ | -------- | ------------------ | ------ | ----------- |
| 1 | AI proxy endpoints are callable without authentication | CONFIRMED | Critical | Yes | Anonymous callers can consume server-held provider credentials and potentially create billable usage | RSS-1.2S1: authenticate and authorize every AI proxy before configuration/provider access |
| 2 | No rate limiting exists on login, AI proxies, and high-cost write paths | CONFIRMED | Critical | Yes | Credential attacks, cost amplification, and write/queue abuse are not bounded by OIP | RSS-1.2S2: application/gateway abuse controls with verifiable policy |
| 3 | Client ticket fields can forge protected state and attribution | CONFIRMED | Critical | Yes, including database evidence | A Support Agent can forge resolved state, actor, resolution, reflection, validation IDs, and knowledge references | RSS-1.2S3: command DTOs and server-owned lifecycle/actor fields |
| 4 | Security headers are absent | CONFIRMED | Medium | Yes, development server | Browser hardening is absent from root and API responses; production edge behavior is not represented in the repo | RSS-1.2S4: application header policy plus production verification |
| 5 | Claude fallback uses an invalid endpoint or cannot succeed | PARTIALLY CONFIRMED | Medium | Yes | Endpoint contract is correct, but the configured credential is rejected and fallback is unavailable in this environment | RSS-1.2S5: credential/configuration acceptance gate and live canary |
| 6 | Metrics writes are authorized by a read-only capability | CONFIRMED | High | Yes, including database evidence | A Viewer can rewrite organizational metrics | RSS-1.2S6: introduce/enforce `metrics.write` or a narrower server-owned mutation boundary |
| 7 | Interactive ticket processing has no bounded overall deadline | CONFIRMED | High | Per-call mock plus source trace | Sequential retries/fallbacks can compose to roughly 20 minutes on one reachable path, with no aggregate watchdog | RSS-1.2S7: end-to-end budget, cancellation propagation, and worker handoff |
| 8 | Unknown/malformed roles normalize to a permissive role | PARTIALLY CONFIRMED | High | Yes, including persisted malformed membership | Legacy/imported malformed roles receive Support Agent capabilities; managed role assignment itself rejects unknown values | RSS-1.2S8: fail-closed normalization and data migration |
| 9 | Connector secret access is not separately audited | CONFIRMED | Medium | Yes with synthetic connector secret | Authorization is audited, but decryption/access is not represented by a dedicated immutable secret-access event | RSS-1.2S9: connector secret-access audit event and correlation |
| 10 | AI request limits permit unsafe model/token parameters | PARTIALLY CONFIRMED | High | Yes with mock provider | Three routes forwarded `max_tokens=999999` and `temperature=999`; chat also accepted a client model override | RSS-1.2S10: strict schemas, allowlists, clamps, and request/body budgets |

## 2. Audit Scope

The audit covered the ten primary claims, then the requested cross-cutting checks: CSRF posture, body limits, upstream error leakage, session rotation and revocation, connector fallback keys, full-ticket export, authorization-audit failure behavior, error semantics, and unknown-organization disclosure.

Only a new probe and this report were added. Production source, security rules, configuration, existing tests, tags, and historical reports were not changed by this task. Pre-existing working-tree modifications were preserved and are part of the audited state.

## 3. Repository and Runtime Identity

| Attribute | Captured value |
| --- | --- |
| Branch | `master` |
| HEAD | `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` |
| Tags present | `pre-security-upgrade`, `foundation-ready-for-async` |
| Working tree | Dirty before audit; numerous pre-existing modified/untracked files, including AI routes |
| Node | `v24.14.1` |
| Next.js | `15.5.22` |
| Prisma CLI/client | `7.9.1` |
| Database target | PostgreSQL at `127.0.0.1:5432/oip_development` |
| Persistence mode | `server` |
| AI provider mode | `deepseek` |
| Current organization | `profile-oip-developer-demo` (`OIP Developer Demo`) |
| App server before testing | Not running |
| Security test server | Dedicated Next development server, port `3100` |
| Regression server | Built production server, port `3000` |
| App server after testing | Not running; ports 3000 and 3100 closed |

Credential presence was recorded without values: database URL configured; DeepSeek credential configured; Anthropic credential configured; OpenAI/Tier-1 credential not configured in `.env.local`. The security probe replaced configurable provider credentials/base URLs with synthetic values and a loopback mock. The Claude route is hard-coded to Anthropic, so its single harmless request used the configured credential; Anthropic rejected it. No secret value was logged.

## 4. Verification Method

1. Captured Git, package, process, port, environment-presence, database, organization, and data-count baselines.
2. Inspected every primary route, shared authorization boundary, capability map, persistence mapping, provider chain, connector vault, and deployment/header configuration.
3. Ran `node scripts/rss-1.2s0-security-verification.cjs`. The probe started a dedicated development server and local mock provider; created a disposable organization, Owner, Support Agent, Viewer, malformed-role membership, connector, tickets, sessions, and metrics; recorded HTTP/database evidence; and deleted all fixtures in `finally`.
4. Used a harmless exact-response prompt only: `Respond with exactly: OK`.
5. Used a synthetic connector secret and synthetic provider credentials for mockable routes. No customer content or real secret was displayed.
6. Compared global counts and a mature-memory digest before and after testing, and repeated the comparison after regressions.
7. Ran the required TypeScript, Prisma, build, RBAC, provider, diagnostics, safety, and benchmark regressions without editing tests.

Primary commands:

```text
node --check scripts/rss-1.2s0-security-verification.cjs
node scripts/rss-1.2s0-security-verification.cjs
npx.cmd tsc --noEmit
npx.cmd prisma validate
npm.cmd run build
npm.cmd run probe:todo078-rbac
npm.cmd run probe:todo082a-deepseek
npm.cmd run probe:todo082c-diagnostics
npm.cmd run probe:todo046
npm.cmd run benchmark:oip-v1
```

## 5. Claim-by-Claim Results

### Claim 1 — Unauthenticated AI proxies: CONFIRMED / Critical

Expected secure behavior was 401/403 before provider configuration or execution. None of the four `POST` handlers calls `requireAuthenticatedUser`, `requireOrganizationMembership`, or `requireCapability`.

Runtime results without cookies or authorization headers:

| Endpoint | Status | Provider reached | Response/diagnostic result |
| --- | ---: | --- | --- |
| `/api/ai/chat` | 200 | Local mock, yes | `OK`; internal mock base URL/model/endpoint exposed in headers |
| `/api/ai/deepseek` | 200 | Local mock, yes | `OK`; provider diagnostics returned |
| `/api/ai/openai-compatible` | 200 | Local mock, yes | `OK`; provider diagnostics returned |
| `/api/ai/claude` | 502 | Anthropic, yes | Sanitized `Claude API authentication failed`; endpoint/model diagnostics returned |

The three mockable routes demonstrably reached a provider and would create billable use with a paid upstream. Claude reached Anthropic but was not billable because authentication failed; a valid key would make the same anonymous path billable. The route checks credential presence before JSON parsing, so an anonymous caller can also probe whether credentials exist.

Safeguards found: per-call timeouts; Claude `max_tokens` clamp; server-side credentials; some upstream-error sanitization. None changes the authentication conclusion. Chat returns raw upstream bodies even for non-OK responses and reports network exception messages and internal base URLs.

### Claim 2 — Absence of rate limiting: CONFIRMED / Critical

Repository searches for rate limiting, throttling, request counters, IP/user quotas, `Retry-After`, 429 construction, middleware, and gateway configuration found no OIP abuse-control implementation. Provider-originated 429 handling exists but is not application protection.

Bounded runtime evidence:

- 10 invalid logins: ten 401 responses, no 429, no `Retry-After`, no lockout. After initial compilation, attempts completed in approximately 20–34 ms each.
- 10 anonymous DeepSeek proxy calls: ten 200 responses, ten upstream mock calls, no 429, no `Retry-After`.
- 10 unique disposable ticket writes: ten 200 responses and ten persisted tickets, no pacing/lockout.

Login, AI proxies, ticket writes, job submission, connector mutations, and governed-action routes contain no rate guard. No repository reverse-proxy/deployment configuration delegates the control. An external production gateway may exist outside the repository, but it was not available for verification and cannot be credited as OIP protection.

### Claim 3 — Client-trusted ticket writes: CONFIRMED / Critical

A disposable Support Agent with `ticket.submit` submitted a single ticket containing forged protected values. The API returned 200 `{ "data": { "saved": true } }`. Database inspection showed all of the following persisted exactly as supplied:

- `status = resolved`
- `resolutionMode = human`
- `actorId = forged-owner-id`
- forged `resolution.finalResponse`, `resolvedAt`, and `humanEdited`
- forged reflection decision and lesson reference
- forged validation record ID
- forged classification and memory/knowledge references

The authorization audit correctly recorded that the Support Agent exercised `ticket.submit`, but it did not override the ticket actor or create a protected lifecycle audit. No lifecycle transition validation or server-derived actor ran after authorization. The fake actor did not need to reference a real user because `TicketRecord.actorId` has no user foreign key.

### Claim 4 — Security headers: CONFIRMED / Medium

`next.config.ts` contains only `reactStrictMode: true`; there is no middleware, reverse-proxy config, or deployment header policy in the repository. Requests to `/` (200) and `/api/auth/me` (401) on the development server omitted all requested headers: CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, and CORP.

HSTS is not expected over local HTTP development. The conclusion is nevertheless confirmed for the application response policy because all non-HSTS browser-hardening headers were also absent and no production policy is represented in source. A production edge outside the repository could reduce deployed impact and must be verified separately.

### Claim 5 — Claude fallback endpoint: PARTIALLY CONFIRMED / Medium

The invalid-endpoint allegation was not reproduced. Source uses:

- `https://api.anthropic.com/v1/messages`
- `POST`
- `Content-Type: application/json`
- `x-api-key`
- `anthropic-version: 2023-06-01`
- Anthropic Messages-style `system`, `messages`, `model`, `max_tokens`, and response block parsing

The harmless live request reached that endpoint and received an authentication rejection, not a path/contract error. The application returned a sanitized 502. Therefore, the implementation is structurally capable of success with valid configuration, but the configured fallback could not succeed during this audit. No key value was printed.

### Claim 6 — `metrics.read` authorizes write: CONFIRMED / High

Both GET and PUT select `metrics.read`. A disposable Viewer sent a harmless metrics PUT, received 200, and database inspection found `lifetimeTickets = 123` and `aiCalls = 7`. No later server guard rejected the mutation. There is no `metrics.write` capability in the current capability list.

### Claim 7 — No bounded overall interactive deadline: CONFIRMED / High

The provider request helper has per-attempt timeouts and retry caps, but the provider chain awaits tiers sequentially, and the interactive pipeline awaits multiple chains sequentially. The only aggregate signal is a UI-owned `AbortController`; there is no timer, absolute deadline, processing budget, watchdog, or automatic worker handoff around `processTicket`.

A delayed mock proved a requested 1 ms proxy deadline is clamped to the 5-second per-call minimum: the request ended 504 after 5,042 ms. That is a provider-call bound, not an interactive bound.

With the captured 30-second provider configuration and default one retry:

- canonical suggestion and match discrimination explicitly request 90 seconds;
- one three-tier 90-second chain can consume about 180 s Tier 1 + 180 s LM Studio + 90 s Claude = 450 s;
- analysis/canonical run in parallel, so canonical can dominate at about 450 s;
- match discrimination can add about 450 s;
- draft then knowledge enrichment can add approximately 155 s + 155 s under 30/30/35-second tier budgets;
- a reachable matched-ticket path is therefore approximately 1,210 seconds (20 minutes 10 seconds) before database overhead.

Optional semantic evaluation can add more work. Cancellation is checked only between stages; the command signal is not passed into the provider controllers, so user cancellation does not necessarily abort the current provider call immediately.

### Claim 8 — Role normalization fail-open: PARTIALLY CONFIRMED / High

`normalizeRoleKey` defaults every unknown string to `support_agent`. A directly persisted disposable membership with `role = suppport_agent` and no normalized role assignment successfully read the organization (200) and exercised `ticket.submit` (200). This is a real fail-open boundary for legacy, migration, or otherwise malformed membership data.

The managed role PATCH is a mitigating safeguard: `administratorr` returned 400 `ROLE_ASSIGNMENT_REJECTED`, and the target retained `support_agent`. Because the public assignment service fails closed, the finding is partial rather than a fully reachable arbitrary role-assignment exploit.

### Claim 9 — Connector secret-access auditing: CONFIRMED / Medium

A synthetic connector was created, activated, and tested. Test succeeded after decrypting its credential. Two authorization audits were created (`organization.read` and `connector.inspect`), but neither represents credential retrieval/decryption; no secret-access audit model/event was written. The unauthenticated webhook verification path also decrypts the active secret without a dedicated immutable access record.

The secret was never returned by the API or printed by the probe. Authorization auditing is a useful safeguard but does not satisfy separate secret-access auditing.

### Claim 10 — AI request parameter controls: PARTIALLY CONFIRMED / High

Using a mock upstream prevented costly work. Results:

| Route | Client model | `max_tokens=999999` | `temperature=999` | Other controls |
| --- | --- | --- | --- | --- |
| chat | Forwarded `unexpected-model` | Forwarded unchanged | Forwarded unchanged | timeout clamped to 120 s; no message/body bound |
| deepseek | Overridden by server-configured model | Forwarded unchanged | Forwarded unchanged | arbitrary `response_format` forwarded; timeout clamped |
| openai-compatible | Overridden by server-configured model | Forwarded unchanged | Forwarded unchanged | arbitrary `response_format` forwarded; timeout clamped |
| Claude | Server model only | Clamped to 1–4096 | No numeric/range clamp | timeout clamped; message/body count/size unbounded |

Client control is therefore not universal, but the token, temperature, response-format, and body controls are unsafe enough to confirm the vulnerable pattern partially.

## 6. Source Evidence

Line references are for the audited working tree at the identity above.

| Claim | Exact source boundary |
| --- | --- |
| 1 | `app/api/ai/chat/route.ts:91-164`; `app/api/ai/deepseek/route.ts:91-191`; `app/api/ai/claude/route.ts:79-188`; `app/api/ai/openai-compatible/route.ts:63-122` |
| 2 | `app/api/auth/login/route.ts:13-35`; AI handlers above; `app/api/organizations/[organizationId]/tickets/route.ts:55-66`; `app/api/organizations/[organizationId]/jobs/route.ts:19-41`; connector/governed-action mutation routes; no middleware/deployment gateway files found |
| 3 | `app/api/organizations/[organizationId]/tickets/route.ts:55-66`; `lib/server/persistenceService.ts:865-904,1154-1168` |
| 4 | `next.config.ts:1-7`; no `middleware.*`, reverse-proxy, or deployment header config found |
| 5 | `app/api/ai/claude/route.ts:5-7,25-38,93-118,121-176` |
| 6 | `app/api/organizations/[organizationId]/[resource]/route.ts:50-55,73-104`; write capability selected at line 91 |
| 7 | `lib/ai/adapter.ts:73-87,120-240`; `lib/ai/lmStudio.ts:87-176,431-448,506-519`; `lib/application/tickets/processTicket.ts:324-340,388-428,511-685`; `app/page.tsx:3775-3855` |
| 8 | `lib/server/rbac/definitions.ts:40-52`; mitigating validation at `lib/server/rbac/roleService.ts:19-35` |
| 9 | `lib/server/connectors/connectorService.ts:82-87,95-110`; `lib/server/connectors/credentialVault.ts:20-27`; generic authorization audit only at `lib/server/rbac/authorizationService.ts:36-55` |
| 10 | chat forwarding at `app/api/ai/chat/route.ts:29-46,118-123`; DeepSeek at `app/api/ai/deepseek/route.ts:33-41,117-123`; compatible at `app/api/ai/openai-compatible/route.ts:25-29,82-88`; Claude clamp at `app/api/ai/claude/route.ts:111-117` |

## 7. Runtime Evidence

The security probe exited 0 twice. The second run added the delayed-provider check and again restored all data. Key observed results:

```text
anonymous AI: chat=200, deepseek=200, openai-compatible=200, claude=502 after provider auth rejection
login burst: 401 x10; 429 x0; Retry-After absent
AI burst: 200 x10; provider calls=10; 429 x0
ticket burst: 200 x10; persisted disposable tickets=10
forged ticket write: 200
viewer metrics write: 200
malformed legacy role: organization read=200; ticket submit=200
managed malformed role PATCH: 400
connector secret test: 200; only generic authorization audits written
delayed proxy: 504 after 5,042 ms
security headers: all eight requested headers absent on root and representative API response
```

No upstream error body from Anthropic was exposed. The safe application response was `Claude API authentication failed`. Chat's source behavior remains less safe because it returns arbitrary upstream text and internal diagnostics.

## 8. Database Evidence

The forged ticket row contained the supplied `resolved`, `human`, `forged-owner-id`, resolution, reflection, classification, memory match, and validation IDs. The metrics row contained the Viewer-supplied values. The malformed membership had no role assignment and was authorized via the normalization fallback. The connector credential existed only inside the disposable organization and was cascade-deleted.

Pre/post global counts were identical:

| Data type | Before | After verification | After regressions |
| --- | ---: | ---: | ---: |
| Users | 9 | 9 | 9 |
| Sessions | 7 | 7 | 7 |
| Memberships | 11 | 11 | 11 |
| Tickets | 5,302 | 5,302 | 5,302 |
| Knowledge items | 59 | 59 | 59 |
| Candidates | 1,868 | 1,868 | 1,868 |
| Validations | 1,867 | 1,867 | 1,867 |
| Memory changes | 1,867 | 1,867 | 1,867 |
| Trust evidence | 4,500 | 4,500 | 4,500 |
| Governed actions | 0 | 0 | 0 |
| Connector installations/events | 0 / 0 | 0 / 0 | 0 / 0 |
| Authorization audits | 2,194 | 2,194 | 2,194 |
| Durable jobs | 37 | 37 | 37 |

The mature Developer Demo had 47 knowledge items throughout. Its mature-memory digest remained:

```text
1a72867324270d3ff11d87e3a01db1456f50275c75fed33687fbb69543f73a75
```

## 9. Severity Reassessment

Claims 1–3 remain Critical because they are directly reachable through documented application routes and require no exotic precondition. Claim 6 is High because read-only members can corrupt organizational reporting. Claim 7 is High availability risk because a single interactive workflow can hold resources for many minutes. Claim 8 is High for affected malformed/legacy memberships but reduced from Critical by fail-closed managed assignment. Claim 10 is High because anonymous Claim 1 compounds unsafe token limits into direct cost exposure. Claims 4, 5, and 9 are Medium in isolation.

Passing product-safety benchmarks do not reduce these route, authorization, abuse-control, or governance severities.

## 10. Confirmed Release Blockers

1. Anonymous provider execution (Claim 1).
2. No OIP abuse controls on login, AI, or high-cost writes (Claim 2).
3. Client-owned ticket lifecycle, identity, resolution, review, and governance fields (Claim 3).
4. Viewer-authorized metrics mutation (Claim 6).
5. Unsafe AI request budgets combined with anonymous proxies (Claim 10).
6. No aggregate interactive deadline (Claim 7) before exposing provider-backed ticket processing at scale.

## 11. Partially Confirmed Findings

- Claim 5: correct Anthropic contract, but current credential rejected; fallback unavailable in the captured environment.
- Claim 8: malformed stored roles fail open, while managed API role assignment rejects unknown values.
- Claim 10: server controls some models and Claude tokens, but three routes forward extreme token/temperature values.

## 12. Findings Not Reproduced

No complete primary claim was classified NOT REPRODUCED. Secure behaviors that were reproduced include managed role assignment rejecting unknown roles, unknown organizations returning the same 403 semantics as inaccessible organizations for an authenticated non-member, and invalid sessions returning 401.

## 13. False Positives

No complete primary claim was classified FALSE POSITIVE. The specific subclaim that Claude uses an invalid endpoint is rejected: the current route uses Anthropic's Messages endpoint and contract. Its failure was credential authentication, not URL or payload incompatibility.

## 14. Data Safety and Cross-Cutting Checks

### Data safety

All mutations were confined to a disposable organization/users and synthetic secrets. Cleanup restored every requested count. Mature Organizational Memory, trust evidence, governed actions, and Developer Demo digest were unchanged. No reset, reseed, lesson promotion, reflection approval, trust mutation, governed-action execution, or customer-data operation was performed.

### Secondary security observations

- **CSRF posture:** session cookie is `HttpOnly`, `SameSite=Lax`, and Secure in production (`lib/auth.ts:53-60`). No CSRF token or Origin/Referer validation exists. JSON-only mutation routes and SameSite reduce ordinary cross-site form attacks, but an explicit same-origin policy is absent.
- **Body limits:** webhook intake has a 256 KB limit and migration intake checks advertised/actual size. AI, login, ticket snapshots, jobs, metrics, and most mutation routes call `request.json()` without route-level body/count limits. AI message strings/arrays are unbounded.
- **Upstream leakage:** Claude and DeepSeek sanitize common upstream failures. Chat returns upstream text verbatim for every status and includes base URL, endpoint, model, and exception details. Compatible/DeepSeek diagnostics also reveal provider configuration metadata.
- **Session rotation:** logging in twice produced two stored sessions; the first and second cookies both returned 200. Login does not revoke/rotate existing sessions.
- **Revoke all sessions:** no user-wide revoke endpoint or service was found; logout deletes only the presented session.
- **Connector fallback key:** production fails closed if `OIP_CONNECTOR_CREDENTIAL_KEY` is absent. Non-production falls back to `OIP_CONNECTOR_DEV_SECRET_KEY` or a hard-coded development key (`credentialVault.ts:6-10`).
- **Full ticket export:** `GET .../tickets?full=true` loads the full organization collection with no pagination/cap (`tickets/route.ts:29-35`). It is authenticated but can create memory/response-size pressure.
- **Audit-write failure:** authorization audit exceptions are swallowed (`authorizationService.ts:36-55`). Authorization does not fail open, which is good; audit durability nevertheless fails open and can silently lose required records.
- **Session/authorization semantics:** invalid/no session returns 401; authenticated non-members/unknown organizations return a non-disclosing 403. This behavior was secure under test.
- **Governed actions:** mutation routes initially require `operations.read`, but service methods re-check `action.prepare`/`action.approve`/`action.execute` (`actionService.ts:47-52,69,115,139,161-164`). The later authoritative guard prevents the apparent route-level read-capability bypass.

## 15. Regression Results

All requested regressions were actually executed after the verification script was complete.

| Regression | Result | Evidence |
| --- | --- | --- |
| TypeScript (`npx.cmd tsc --noEmit`) | PASS | Exit 0 |
| Prisma validation | PASS | Schema valid, exit 0 |
| Production build | PASS | Next 15.5.22 compiled, type-checked, generated 11 static pages, exit 0 |
| TODO-078 RBAC probe | PASS | `TODO-078 RBAC probe passed.` |
| TODO-082A provider probe | PASS | All DeepSeek order, fallback, path, model, credential injection, and diagnostics checks passed |
| TODO-082C diagnostics probe | PASS | Harmless prompt, provider order, fallback, secret redaction, history cap passed |
| TODO-046 safety probe | PASS | `COMPLETED`; unsafe 0/14, positive 7/7, protected snapshots unchanged |
| OIP Benchmark v1 | PASS | 1,000/1,000 checks; 100% overall; 100% critical security cases |

These regressions test product and previously certified safety behavior. They do not cover or negate the newly reproduced route-level findings.

## 16. Recommended Remediation Order

Each item should be a separate remediation task with its own negative tests and independent re-verification:

1. **RSS-1.2S1 — AI proxy authorization:** require authenticated user, active organization, explicit AI capability, and denial before credential/config inspection or upstream fetch.
2. **RSS-1.2S3 — Server-owned ticket write contract:** replace arbitrary snapshot PUT with narrow commands; derive actor from session; validate lifecycle transitions; reject protected review, resolution, trust, and knowledge fields.
3. **RSS-1.2S2 — Abuse controls:** per-IP and per-account login limits, per-user/org AI quotas, write/job/connector/action limits, 429 plus `Retry-After`, bounded gateway policy, and observability.
4. **RSS-1.2S10 — AI budget validation:** body/message limits, model allowlists, maximum token/temperature clamps, response-format allowlists, system-prompt ownership, and cost quotas.
5. **RSS-1.2S6 — Metrics mutation authorization:** add a write capability or server-owned aggregation path; verify Viewer denial and persistence non-change.
6. **RSS-1.2S8 — Role fail-closed migration:** return null/error for unknown values, deny authorization on corrupt role state, migrate legacy `member` explicitly, and add import/database constraints.
7. **RSS-1.2S7 — Overall processing budget:** absolute deadline propagated through all provider tiers/retries, abort propagation, stage budgets, and durable-worker offload.
8. **RSS-1.2S4 — Security header baseline:** CSP/frame policy, nosniff, referrer, permissions, COOP/CORP as compatible, and production HSTS at the HTTPS boundary.
9. **RSS-1.2S9 — Secret-access audit:** immutable secret-read/decrypt event with actor/system principal, installation, purpose, request/correlation IDs, outcome, and fail-safe monitoring.
10. **RSS-1.2S5 — Claude readiness:** replace/revalidate the credential, run a controlled live canary, and block release when configured fallback authentication fails.
11. Create follow-up hardening tasks for session revoke-all/rotation policy, explicit CSRF/origin policy, full-export caps, consistent body limits, safe diagnostics, and durable audit-sink failure alerting.

## 17. Release Recommendation

The current working tree has multiple directly exploitable Critical findings at its public HTTP boundary. The release stabilization sprint must not proceed to external exposure or resume normal acceptance work until Claims 1–3 are remediated, Claims 6 and 10 are closed, abuse controls are demonstrated at the deployed boundary, and this verification suite is rerun independently.

**CRITICAL_FINDINGS_CONFIRMED**

**DO NOT EXPOSE EXTERNALLY**
