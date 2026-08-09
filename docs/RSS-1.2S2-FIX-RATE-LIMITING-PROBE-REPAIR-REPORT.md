# RSS-1.2S2-FIX — Rate-Limiting Probe Repair Report

Date: 2026-08-09  
Verdict: `RATE_LIMIT_PROBE_REPAIRED`

## 1. Executive Summary

The RSS-1.2S2 verification harness was repaired without changing production rate-limit policies, limiter semantics, thresholds, authentication, or protected data. The parent process and spawned server now share one probe-scoped HMAC secret, while the operator's `.env.local` secret remains untouched. The AI burst assertions now account for the preliminary request and assert the complete overall sequence and provider-call suppression.

The repaired probe passed three consecutive executions. Each run verified login/account and IP limits, AI user and organization limits, ticket/job/connector/admin limits, concurrency, shared PostgreSQL state across limiter instances, restart persistence, failure-mode behavior, cleanup, and five negative controls.

## 2. Previous RSS-1.2E Failure

The prior RSS-1.2E rerun stopped at RSS-1.2S2 because:

- `loginRecovery` returned `429` after the probe called its reset helper.
- The AI burst assertion expected `aiStatuses[2] === 429`, although a preliminary AI request had already consumed quota.

The original command was reproduced unchanged: `npm run probe:rss-1.2s2-rate-limiting` exited 1 at `after the reset window the valid login must recover` with `429 !== 200`.

## 3. Context Reviewed

Reviewed the RSS-1.2S2 report, the latest RSS-1.2E rerun report, RSS-1.2S1 authorization report, RSS-1.2E.3 integrity report, `.env.example`, the RSS-1.2S2 probe, `lib/server/rateLimit/{policies,keys,store,rateLimiter,index}.ts`, and the login/AI route integrations.

Baseline: branch `master`, HEAD `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb`, Node 24.14.1, npm 11.11.0, PostgreSQL reachable, 22 migrations up to date, and a pre-existing dirty worktree. `RATE_LIMIT_MODE` was absent from the parent environment; `RATE_LIMIT_HASH_SECRET` was configured in `.env.local` but its value was never printed.

## 4. Reproduction

The unmodified probe failed at login recovery with a 429. A diagnostic run with the parent environment manually aligned to the child secret made login recovery return 200, then exposed the stale AI assertion. This independently confirmed two probe defects rather than a production limiter regression.

## 5. Failure Classification

| Failure | Classification | Evidence |
|---|---|---|
| Login recovery remains 429 | B/C — probe/environment propagation defect | Parent reset hashed with `.env.local` secret; child server hashed with `rss12s2-probe-secret` |
| AI burst index assertion | B — probe fixture defect | One preflight request is counted before `aiStatuses`; policy boundary is the fourth overall request |
| TODO-078 fixture login HTTP 500 | C — unrelated stale-server/environment limitation | The RBAC probe fails before its assertions against its existing localhost:3000 server; no S2 path or production change was implicated |

No A — product regression or D — protected-data contamination was found.

## 6. Hash-Secret Root Cause

Production dimension keys are HMAC-SHA256 digests derived by `dimensionKey(type, value)` using `rateLimitHashSecret()`. The original probe loaded the real `.env.local` secret in the parent, but `startNextServer()` supplied `rss12s2-probe-secret` to the child. The reset helper therefore deleted a different hashed bucket.

The repair defines one probe-scoped secret, sets it only in the probe process, passes it to the child environment, and restores the parent process value on exit. The value is not logged, persisted, or written to `.env.local`; production defaults and limits remain unchanged.

## 7. AI Request Accounting Root Cause

The old probe issued one allowed `/api/ai/deepseek` preflight request before starting `aiStatuses`, then asserted against stale loop indexes and expected two provider calls. The repaired evidence records both `overallStatuses` and a numbered request sequence. With the test policy's three total permits, the verified sequence is:

| Overall Request # | Probe Phase | Expected | Actual | Provider Called |
|---:|---|---:|---:|---|
| 1 | Preflight | 200 | 200 | Yes |
| 2 | Burst loop 1 | 200 | 200 | Yes |
| 3 | Burst loop 2 | 200 | 200 | Yes |
| 4 | Burst loop 3 | 429 | 429 | No |
| 5 | Burst loop 4 | 429 | 429 | No |

The loop provider count is 2 and the overall AI phase provider count is 3, exactly matching allowed requests. Additional denied requests make zero provider calls.

## 8. Probe Changes

- Added a deterministic probe-only hash secret shared by parent and child.
- Preserved and restored the original parent environment value on process exit.
- Added startup cleanup for mock/server/database failures.
- Replaced stale AI array-position assertions with explicit overall request accounting.
- Asserted provider calls equal allowed requests and remain unchanged after denial.
- Added five disposable negative controls using the shared `RateLimiter` semantics and `MemoryRateLimitStore`.
- Kept the existing PostgreSQL, HTTP, concurrency, multi-instance, restart, failure-mode, and data-safety coverage.

## 9. Login Verification

The repaired HTTP run reports: normal login 200; account invalid attempts 401/401/401 then 429/429; same-account new-IP remains 429; valid credentials while blocked remain 429; the controlled reset returns 200; IP attempts are 401×5 then 429; malformed credentials are 400; rate-limited responses include numeric `Retry-After`, safe `RATE_LIMIT_EXCEEDED`, and no account identifier.

## 10. AI Rate-Limit Verification

The repaired run verifies the explicit sequence above, six cross-route organization requests allowed followed by a seventh 429, a reset restoring 200, and ten concurrent requests producing exactly three 200 and seven 429 responses. Denied responses report `RateLimit-Remaining: 0` and do not expose provider diagnostics.

## 11. Provider Suppression Verification

The mocked provider was called once per allowed request. The first denied AI burst request, subsequent denied requests, the organization-quota denial, and seven concurrent denials produced zero additional provider calls. This preserves the no-billable-traffic guarantee for denied requests.

## 12. Concurrency / Multi-Instance Verification

Two PostgreSQL-backed limiter instances allowed exactly 5 and denied 2 for a policy with limit 5. A newly constructed limiter instance saw the persisted exhausted counter and denied. Ten concurrent AI requests allowed exactly 3 and denied 7, with 3 provider calls.

## 13. Cleanup / Repeatability

Three sequential executions passed (`3/3`). Every run reported `globalCountsRestored: true`, `matureDigestRestored: true`, zero residual rate-limit counters/events, and successful disposable fixture cleanup. Startup cleanup now also closes the mock/server and database client if readiness fails.

## 14. Negative Controls

All five controls passed on every repaired run:

1. Exceeding the configured limit is denied.
2. A denied AI request suppresses provider invocation.
3. Reset restores the same limiter bucket.
4. Different dimensions do not share a bucket.
5. Denials include a numeric `Retry-After` header.

## 15. Security Review

No output or evidence file contains the operator's real `RATE_LIMIT_HASH_SECRET`, raw IP addresses, raw account identifiers, session tokens, API keys, provider authorization headers, or customer prompts. Denial logs expose only policy, route, dimension class, and safe decision metadata. The probe secret is synthetic and probe-scoped.

## 16. Regression Results

| Check | Result |
|---|---|
| RSS-1.2S2 repaired probe | PASS, 3/3 sequential |
| RSS-1.2S1 AI proxy authorization | PASS |
| RSS-1.2S3 server-owned ticket writes | PASS |
| RSS-1.2S5 prompt-injection boundaries | PASS |
| TODO-046 | PASS |
| TODO-082A DeepSeek | PASS |
| TODO-082C diagnostics | PASS |
| TODO-078 RBAC | FAIL before assertions: fixture login HTTP 500 on existing server; classified C, unrelated to S2 |
| TypeScript | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS; up to date |
| Production build | PASS |
| OIP Benchmark v1 | PASS; 1,000/1,000 and critical security 100% |

No RSS-1.2E or RSS-1.3 command was started.

## 17. Data Integrity

The repaired runs reported mature Developer Demo counts and digest unchanged. RSS-1.2E.3 subsequently rechecked the full protected-state digest and returned the same before/after digest:

`b986c4cc87a9797ec838aa9dfe879fd553b0c53331194ca3b2e812e806ed3363`

RSS-1.2E.2 OrgMetrics reconciliation remained zero-delta. No production rows, OrgMetrics, rate-limit defaults, or thresholds were modified.

## 18. Remaining Limitations

- TODO-078 needs a separate controlled-server/fixture investigation; this task did not change it.
- The prior RSS-1.2S4 startup timeout remains a separate acceptance issue.
- The worktree remains dirty by design; no cleanup, commit, tag, or push was performed.

## 19. Recommendation

Accept RSS-1.2S2-FIX as repaired. Rerun RSS-1.2E only as a separately authorized task after addressing or classifying the unrelated TODO-078 and RSS-1.2S4 environment issues. Do not alter production rate limits or protected data.

## 20. Final Verdict

`RATE_LIMIT_PROBE_REPAIRED`

The harness now accurately tests existing production rate-limiter behavior, preserves all security assertions, proves denied-provider suppression, passes concurrency/multi-instance checks, cleans disposable state, and passes three consecutive executions. Eligible for RSS-1.2S4-FIX: **YES** (do not start it automatically).
