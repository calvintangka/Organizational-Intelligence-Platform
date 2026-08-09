# RSS-1.2S4-FIX — Security Header Probe Startup Stabilization Report

Date: 2026-08-09  
Verdict: `SECURITY_HEADER_PROBE_STABILIZED`

## 1. Executive Summary

The RSS-1.2S4 security-header probe was stabilized without changing middleware, CSP, HSTS, or any production security policy. The original timeout was reproduced and separated into two issues: a stale/missing production artifact (`next start` exited because `.next` had no build) and an unbounded readiness fetch that could hang indefinitely while the server was compiling or stalled. The probe now selects an isolated port, refuses occupied configured ports, uses bounded HTTP readiness polling, captures startup diagnostics, cleans up on startup failure and assertion failure, and includes negative startup controls.

The repaired probe passed three consecutive executions. All existing RSS-1.2S4 header, CSP, API, webhook, static-asset, and negative security assertions passed. Protected database state was unchanged.

## 2. Previous RSS-1.2E Failure

RSS-1.2E recorded RSS-1.2S4 as timed out before readiness, so no header verdict was established. Reproduction of the old harness showed that its `fetch('/api/auth/me')` had no abort or per-request timeout; a stalled/compiling response could block the polling loop beyond the intended 30-second bound. After the readiness repair, the next controlled run failed fast with the exact artifact error: `Could not find a production build in the '.next' directory`.

## 3. Context Reviewed

Reviewed the RSS-1.2S4 report, RSS-1.2E rerun report, RSS-1.2S2-FIX report, RSS-1.2S1 report, RSS-1.2E.3 integrity report, `scripts/rss-1.2s4-security-headers-middleware.cjs`, `middleware.ts`, `next.config.ts`, `package.json`, `.env.example`, and the production Next.js start path.

## 4. Baseline Environment

| Item | Result |
|---|---|
| Branch / HEAD | `master` / `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` |
| Worktree | Pre-existing dirty tree; 156 status entries at final baseline; preserved |
| Node / npm / Next | 24.14.1 / 11.11.0 / 15.5.22 |
| PostgreSQL / migrations | Reachable; 22 migrations; up to date |
| Environment presence | `DATABASE_URL`, server persistence mode, rate-limit secret, AI base URL, and auth development configuration configured; values not printed |
| Existing processes | A repository Next process was listening on port 3000; it was not killed or used by this probe |
| Probe ports | 3500 was free during the repaired runs; the probe scans 3500–3510 when no explicit URL is supplied |

## 5. Timeout Reproduction

The old command `npm run probe:rss-1.2s4-security-headers` was run before modification. It did not emit a readiness result before the controlling command timed out and left the probe process tree behind, requiring termination of only the positively identified RSS-1.2S4 processes. The first repaired run then produced a deterministic startup error when `.next` was absent, proving the artifact condition rather than silently testing another server.

## 6. Failure Classification

| Cause | Classification | Evidence |
|---|---|---|
| Unbounded readiness request | B — probe readiness defect | `fetch` had no `AbortSignal`; a stalled response blocked the polling loop |
| Missing `.next` production artifact | E — stale/missing build artifact | `next start` exited with the explicit Next.js production-build error |
| Timeout left child processes | F — process-lifecycle defect | Old controlling timeout left the npm/Node probe tree running |
| Production middleware startup | Not a product regression | Fresh build + `next start` became ready in under 1 second and all headers passed |

## 7. Build / Artifact Analysis

The required sequence was exercised as:

| Startup Stage | Previous | Current | Result |
|---|---|---|---|
| Build | Artifact could be absent/stale | `npm run build` passed (Next 15.5.22) | PASS |
| Server spawn | Could remain unobserved | Tracked child PID and stdout/stderr | PASS |
| Readiness | Unbounded fetch / timeout | HTTP `GET /api/auth/me`, status 401 accepted, bounded polling | PASS |
| Header assertions | Not reached | All S4 assertions reached | PASS |
| Shutdown | Old timeout could orphan processes | Child stop and bounded wait | PASS |

The probe does not silently rebuild or delete user artifacts; the acceptance run explicitly rebuilt before production-server verification.

## 8. Port Ownership Analysis

With no `RSS12S4_BASE_URL`, the probe selects the first free port from 3500–3510 and records it. An explicitly configured URL must include a port and must be bindable; if occupied, the probe fails rather than testing an unknown/stale server. The existing repository server on port 3000 was left untouched.

## 9. Environment Propagation

The spawned production server inherits the configured database, persistence, AI, and auth environment. The probe supplies only probe-scoped values for `RATE_LIMIT_HASH_SECRET` and `RATE_LIMIT_MODE=off`; no `.env.local` file is modified and no secret value is logged. Required configuration presence is checked before spawn.

## 10. Readiness Contract

Readiness is an HTTP response from the exact selected port: `GET /api/auth/me` must return 200 or 401. Each request has a 1,000 ms abort timeout; polling is bounded by a 30,000 ms startup deadline with 250 ms backoff. Child exit is detected immediately. The probe records attempt status/error, elapsed time, stdout, and stderr.

## 11. Timeout Measurements

Across the three repaired runs, startup-to-readiness elapsed times were 918 ms, 905 ms, and 927 ms. Each run saw an initial connection error while Next initialized, then HTTP 401 readiness. The production server stdout reported `Ready in` approximately 600–700 ms. No repaired run exceeded the bounded deadline.

## 12. Security Header Results

| Response | Status | CSP | HSTS | XFO | Referrer | Permissions | Nosniff |
|---|---:|---|---|---|---|---|---|
| HTML `/` | 200 | nonce-based, no unsafe-inline/eval | Present | DENY | strict-origin-when-cross-origin | Present | nosniff |
| API `/api/auth/me` | 401 | Present | Middleware policy | DENY | Present | Present | nosniff |
| Developer route | 401 | Present | Middleware policy | DENY | Present | Present | nosniff |
| Static JS | 200 | Intentionally absent | CDN/static behavior | — | — | — | — |
| Webhook negative path | 404 | Present | Middleware policy | DENY | Present | Present | nosniff |

The CSP nonce matched all five inline scripts. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` passed. COOP and CORP were `same-origin`.

## 13. Webhook / API Verification

`POST /api/connectors/webhook/nonexistent` returned application-level 404 with security headers and no framework 500. The unauthenticated API returned 401 with `Cache-Control: no-store`, CSP, X-Frame-Options, and no CORS exposure.

## 14. Process Cleanup / Repeatability

| Sequential Run | Startup | Headers | Cleanup | Result |
|---:|---:|---|---|---|
| 1 | 918 ms; 401 readiness | PASS | PASS; data restored | PASS |
| 2 | 905 ms; 401 readiness | PASS | PASS; data restored | PASS |
| 3 | 927 ms; 401 readiness | PASS | PASS; data restored | PASS |

No RSS-1.2S4 process or port 3500 child remained after the runs. Startup failures now close the child and database client; normal and assertion-failure paths stop the child in `finally`.

## 15. Negative Startup Controls

All five controls passed:

1. Wrong/unavailable port target is detected.
2. Child exit before readiness is detected.
3. Missing required production configuration is reported explicitly.
4. A wrong HTTP server returning 404 is rejected as not ready.
5. Cleanup after a readiness timeout is reliable.

## 16. Regression Results

| Check | Result |
|---|---|
| RSS-1.2S4 repaired probe | PASS, 3/3 |
| RSS-1.2S1 | PASS |
| RSS-1.2S2 repaired probe | PASS |
| RSS-1.2S3 | PASS |
| RSS-1.2S5 | PASS |
| RSS-1.2S6 | PASS |
| TODO-046 | PASS |
| TODO-078 | PASS on the final controlled run |
| TODO-082A | PASS |
| TODO-082C | PASS |
| TypeScript | PASS |
| Prisma validation | PASS |
| Prisma migration status | PASS; up to date |
| Production build | PASS |
| OIP Benchmark v1 | PASS; 1,000/1,000 and critical security 100% |

RSS-1.2E and RSS-1.3 were not started.

## 17. Data Integrity

Each S4 run reported `globalCountsRestored: true` and `matureDigestRestored: true`. A final Developer Demo integrity check returned `PASS_WITH_FINDINGS`, zero release-blocking findings, unchanged protected-state digest before/after, and OrgMetrics reconciliation returned zero delta. No authenticated fixture or production row was retained.

## 18. Remaining Limitations

- The repository worktree remains dirty by design; no reset, stash, cleanup, commit, tag, or push was performed.
- The probe requires a current production build; it now reports a clear failure instead of hanging when `.next` is absent.
- This task does not certify RSS-1.2E or RSS-1.3 and does not start DeepSeek live diagnosis.

## 19. Recommendation

Accept RSS-1.2S4-FIX as complete. The security-header probe now verifies a known current production server with deterministic port ownership, bounded readiness, complete header assertions, startup negative controls, and reliable cleanup. RSS-1.2E should be rerun only as a separately authorized task.

## 20. Final Verdict

`SECURITY_HEADER_PROBE_STABILIZED`

Original timeout root cause: unbounded readiness fetch combined with a missing/stale `.next` production artifact and incomplete startup cleanup. Production server startup: PASS. Readiness detection: PASS. Sequential repaired runs: 3/3 PASS. Security headers: PASS. Webhook/API negative path: PASS. Cleanup: PASS. Negative startup controls: PASS. Protected data changed: NO.
