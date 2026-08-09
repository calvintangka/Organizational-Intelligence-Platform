# RSS-1.2E-RERUN — Final Live Acceptance Report (2026-08-09)

Gate 1 verdict: **`LIVE_ACCEPTANCE_FAILED`**  
Gate 2 (RSS-1.3): **NOT EXECUTED**

This is a new verification report. The pre-existing untracked
`docs/RSS-1.2E-FINAL-LIVE-ACCEPTANCE-RERUN.md` was preserved unchanged.

## 1. Executive Summary

The final live acceptance rerun stopped at a mandatory security gate. The Developer Demo integrity and OrgMetrics gates pass under RSS-1.2E.3, and TODO-079 is repeatable at 580/600. However, `npm run probe:rss-1.2s2-rate-limiting` exits 1. The failure is classified as a probe/fixture regression (B), not verified product corruption:

1. The first run uses the real `.env.local` `RATE_LIMIT_HASH_SECRET` in the parent process while the spawned probe server uses `rss12s2-probe-secret`. The parent reset therefore cannot clear the server's hashed account bucket; login recovery is observed as `429`.
2. A diagnostic rerun with the secret aligned makes login recovery pass (`200`), then reaches a second stale assertion. The observed AI statuses are `[200, 200, 200, 429]` after one already-counted request; the probe asserts the third item must be `429` even though the fourth overall request is the first denied request.

A bounded run of the RSS-1.2S4 security-header probe also timed out before readiness and produced no gate result. This is recorded as an unclassified environment/probe startup limitation, not silently reported as pass. Per the task's failure rule, RSS-1.3 was not run, and no implementation or certification logic was changed.

## 2. Repository / Environment

| Item | Result |
|---|---|
| Branch | `master` |
| HEAD | `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` |
| Remote | `https://github.com/calvintangka/Organizational-Intelligence-Platform.git`; no local `origin/master` ref, so divergence was not determined without fetching |
| Worktree | Dirty before this run: 153 status entries; no reset, stash, clean, commit, tag, or push |
| Runtime | Node 24.14.1; npm 11.11.0; Prisma 7.9.1; TypeScript 5.9.3 |
| Database | PostgreSQL reachable; 22 migrations; `prisma migrate status` up to date |
| Persistence | `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server` |
| Required configuration | `.env.local` contains database, AI, DeepSeek, auth, and rate-limit configuration; values were not printed |
| Build | Isolated `npm run build` passed before this acceptance rerun |

The dirty tree includes pre-existing stabilization edits, generated logs, probe scripts, and reports. It cannot satisfy a release-cleanliness precondition even if Gate 1 were green.

## 3. Developer Demo Integrity

`node scripts/developer-demo-integrity-probe.cjs` completed with `PASS_WITH_FINDINGS` and zero release-blocking findings:

| Measure | Result |
|---|---:|
| Current `DATA_CORRUPTION` | 0 |
| Current `CURRENT_AUDITABILITY_GAP` | 0 |
| Historical auditability findings | 70 |
| Probe/fixture drift | 3 |
| Release-blocking findings | 0 |

Current counts remain knowledge 47, candidates 1,805, validations 1,804, memory 1,804, evidence 4,500, tickets 5,182, patterns 50, versions 133, lessons 181, and sequence 5,182. The simulator's secondary cross-check remains unavailable for its historical 519 bulk-ticket references, as documented in RSS-1.2E.3; the database-backed gate is clean.

## 4. OrgMetrics Verification

`npm run probe:rss-1.2e2-orgmetrics-reconciliation` ran in dry-run mode and returned zero delta:

| Field | Persisted | Derived | Delta |
|---|---:|---:|---:|
| `lifetimeTickets` | 5,182 | 5,182 | 0 |
| `knowledgeReused` | 4,723 | 4,723 | 0 |
| `knowledgeVersions` | 133 | 133 | 0 |
| `emergingPatternsDetected` | 50 | 50 | 0 |

The 5,182 value is expected append-only evolution from the brief's older 5,180 snapshot, not a hard-coded invariant. No `--apply` command was run.

## 5. Authentication / Session

The rate-limit probe exercised authenticated login branches in its disposable organization. The first run reached normal login (`200`), account limiting (`429`), and valid-login-while-limited (`429`) before the harness reset failure. With the hash secret aligned, recovery returned `200`. TODO-079's authenticated HTTP workflow also passed its persistence and security checks.

The complete live authentication/session/organization-switching matrix was not accepted as a Gate 1 result after the mandatory RSS-1.2S2 failure.

## 6. TODO-079 Results

`npm run acceptance:todo079` was run twice from the same controlled fixture state. Both runs returned `TODO079_RUNNER_RESTORED`, score 580/600, release threshold 560, and `releaseReady: true`.

| TODO-079 Case | Previous controlled run | Current run | Delta |
|---|---:|---:|---:|
| 1–12 aggregate | 580/600 | 580/600 | 0 |

The runner reported identical historical dataset and reconstructed digests, `repeatCount: 2`, `developerDemoUnchanged: true`, `fixtureDeleted: true`, and no duplicate tickets/candidates. Dimension scores were category 60, intent 60, canonical 60, lesson 45, draft 60, security 60, language 55, diagnostics 60, persistence 60, explainability 60.

## 7. Repeatability

TODO-079 was repeatable: both acceptance invocations produced 580/600 and the same digests. The runner itself also reports two passes per invocation. No deterministic drift was observed in canonical identities, retrieval decisions, security routing, or persistence outcomes.

## 8. Provider Verification

| Provider / probe | Status | Result |
|---|---|---|
| RSS-1.2A provider stability | Executed | PASS |
| RSS-1.2S1 AI proxy authorization | Executed | PASS |
| RSS-1.2S5 prompt-injection boundaries | Executed | PASS |
| RSS-1.2S6 Claude readiness | Executed | PASS; diagnostics did not leak the key |
| TODO-082A DeepSeek | Executed | PASS; OpenAI-compatible response and safe diagnostics |
| TODO-082C diagnostics | Executed | PASS |
| Optional provider exhaustion/timeout/malformed-output branches | Partly covered | No mandatory product failure established; full matrix stopped after Gate 1 failure |

## 9. End-to-End Pipeline

TODO-079 covered login, billing/duplicate invoice, refund, activation, permissions, delivery, security incident, reporting, business inquiry, Indonesian/English cases, persistence, diagnostics, and explainability through the authenticated HTTP surface. The full final-live multi-case pipeline requested by RSS-1.2E was not certified after the RSS-1.2S2 stop.

## 10. Organizational Memory

The post-probe integrity check still reports zero current corruption, zero current auditability gaps, 4,500 valid evidence rows, intact 47-item trust chains, zero cross-organization references, zero duplicate ticket IDs, and coherent current sequence state. TODO-079 disposable fixtures were reported deleted and Developer Demo remained unchanged.

## 11. Language

TODO-079 exercised English and Indonesian acceptance cases and returned the expected language dimension score of 55/60. The earlier language/runtime probes remain available in the repository, but a complete fresh RSS-1.2D language matrix was not rerun after the mandatory RSS-1.2S2 failure.

## 12. Security

| Gate | Expected | Actual | Classification / result |
|---|---|---|---|
| RSS-1.2S1 proxy authorization | Pass | Pass | PASS |
| RSS-1.2S2 rate limiting | Pass | Exit 1 | **B — probe/fixture regression; Gate 1 blocker** |
| RSS-1.2S3 server-owned ticket writes | Pass | Pass | PASS |
| RSS-1.2S4 security headers/middleware | Pass | Timed out before readiness | C/B — environment or probe startup limitation; no claim of pass |
| RSS-1.2S5 prompt injection | Pass | Pass | PASS |
| RSS-1.2S6 Claude fallback readiness | Pass or honest optional limitation | Pass | PASS |
| TODO-046 safety | Pass | Pass | PASS |
| TODO-078 RBAC | Pass | Pass | PASS |

### RSS-1.2S2 failure evidence

- Exact command: `npm run probe:rss-1.2s2-rate-limiting`.
- First actual failure: `loginRecovery.status = 429`, assertion `429 !== 200`.
- Cause: parent and spawned server use different `RATE_LIMIT_HASH_SECRET` values, so the parent reset hashes a different dimension key.
- Diagnostic rerun with `RATE_LIMIT_HASH_SECRET=rss12s2-probe-secret`: login recovery `200`; subsequent AI statuses `[200,200,200,429]`; assertion at line 409 expects `aiStatuses[2] === 429` even though one request was already made before the loop.
- Product behavior observed: account limiting, recovery after a correctly shared reset, and the fourth overall AI request being denied all behave as intended.
- Owning follow-up: repair RSS-1.2S2 probe environment propagation and off-by-one fixture assertion, then rerun this acceptance task.

## 13. Regression Matrix

| Command / area | Result |
|---|---|
| Developer Demo integrity | PASS_WITH_FINDINGS; zero blocking |
| RSS-1.2E.2 reconciliation | PASS; zero delta |
| TODO-079 (two invocations) | PASS; 580/600, repeatable |
| RSS-1.2A, S1, S3, S5, S6 | PASS |
| TODO-046, TODO-078, TODO-082A, TODO-082C | PASS |
| RSS-1.2S2 | FAIL at probe level; Gate 1 stopped |
| RSS-1.2S4 | Bounded timeout; no pass claimed |
| Remaining RSS/TODO matrix | NOT RUN after mandatory stop |

## 14. Engineering Gates

Previously verified in the current worktree and unchanged for this read-only rerun:

| Gate | Result |
|---|---|
| TypeScript (`npm exec -- tsc --noEmit`) | PASS |
| Prisma validation | PASS |
| Prisma migration status | PASS; up to date |
| Production build | PASS |
| OIP Benchmark v1 | PASS; 1,000/1,000 and critical security 100% |

These do not override the failed mandatory live security probe.

## 15. Data Integrity

The modernized integrity probe captured protected before/after snapshots covering Developer Demo organizations, knowledge, candidates, validations, memory, evidence, tickets, patterns, logs, metrics, and sequence. Both digests were:

`b986c4cc87a9797ec838aa9dfe879fd553b0c53331194ca3b2e812e806ed3363`

`protectedOrganizationsUnchanged: true`. The final OrgMetrics check remained zero-delta. The RSS-1.2S2 diagnostic run reported disposable fixture counts restored and the mature Developer Demo digest unchanged.

## 16. Remaining Limitations

1. RSS-1.2S2 must be repaired as a probe before acceptance can be rerun: align the hash secret in the parent and spawned server, then correct the AI burst assertion indexing.
2. RSS-1.2S4 did not reach readiness within its bounded run; investigate the startup/port behavior before claiming the security-header gate.
3. The worktree is dirty and contains untracked stabilization artifacts, so RSS-1.3 release cleanliness would be blocked even if Gate 1 passed.
4. RSS-1.2E.3 continues to report 70 historical auditability findings and 3 fixture-drift findings; these are non-blocking but must remain visible.

## 17. Recommendation

Do not execute RSS-1.3 or the release command. The smallest next stabilization task is RSS-1.2S2 probe repair and bounded RSS-1.2S4 startup diagnosis, followed by a fresh RSS-1.2E rerun from a controlled state. Do not change production thresholds, protected data, OrgMetrics, or certification logic to obtain a green result.

## 18. Final Verdict

`LIVE_ACCEPTANCE_FAILED`

Gate 1 is failed because a mandatory RSS-1.2S2 command exited non-zero. The evidence points to a probe/fixture defect rather than current product corruption, but the acceptance rule requires the command to pass or be repaired and rerun. RSS-1.3 is **NOT EXECUTED**. No certified commit, tag, push, or RSS-1.4 eligibility exists.
