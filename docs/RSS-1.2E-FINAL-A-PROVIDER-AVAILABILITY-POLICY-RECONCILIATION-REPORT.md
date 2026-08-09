# RSS-1.2E-FINAL-A — Provider Availability Policy Reconciliation

Date: 2026-08-09  
Scope: current release runtime policy and acceptance reclassification.

## 1. Executive Summary

The active release provider policy is now reconciled to **DeepSeek API → LM Studio → deterministic fallback**. Claude implementation and its isolated contract route remain available for future development and RSS-1.2S6 contract tests, but Claude is removed from active adapter routing, diagnostics ordering, release configuration, and developer health targets. Current live verification recorded DeepSeek 5/5, real DeepSeek outage → LM Studio success, and deterministic fallback after controlled exhaustion. No active-chain scenario invoked Claude.

## 2. Previous Release Blocker

RSS-1.2E-FINAL previously returned `BLOCKED_BY_ENVIRONMENT` because LM Studio was unavailable during the mandatory real failover replay. Under the approved policy, LM Studio is an optional local fallback; intentional operator disablement must not block acceptance when deterministic fallback is safe. The current runtime later became available without an LM Studio restart by this task, and a real live failover replay passed. The historical blocker is therefore **RECLASSIFIED_NONBLOCKING** under the approved policy.

## 3. Provider Policy Decision

| Tier | Provider | Policy | Required for Release | Current Status |
|---|---|---|---|---|
| 1 | DeepSeek API | REQUIRED_PRIMARY | Yes | Live healthy; 5/5 |
| 2 | LM Studio | OPTIONAL_LOCAL_FALLBACK | No | RUNNING; real failover passed |
| Final | Deterministic fallback | REQUIRED_FINAL_FALLBACK | Yes | Available and safe |
| Historical/isolated | Claude API | NOT_IN_RELEASE_CHAIN | No | Isolated contract only |

## 4. Context Reviewed

Reviewed RSS-1.2A, RSS-1.2S6, RSS-1.2S7, the latest RSS-1.2E-FINAL report, TODO-082A, TODO-082C, `docs/PRODUCTION_CONFIGURATION.md`, `.env.example`, `docs/CHANGELOG.md`, `docs/KNOWN_LIMITATIONS.md`, `lib/ai/adapter.ts`, `lib/server/developerAiDiagnostics.ts`, provider routes, worker adapter construction, browser proxy paths, and provider probes. Historical Claude references were preserved where they document prior work.

## 5. Effective Runtime Chain Before

Before this reconciliation, `lib/ai/adapter.ts` constructed DeepSeek → LM Studio → Claude → deterministic, and diagnostics added Claude whenever `ANTHROPIC_API_KEY` was configured. `.env.example`, production configuration, UI fallback text, and several probes described Claude as an active fallback.

| Location | Current Chain | Uses Claude? |
|---|---|---|
| `lib/ai/adapter.ts` | DeepSeek → LM Studio → Claude → deterministic | Yes, before change |
| `lib/server/developerAiDiagnostics.ts` | DeepSeek → LM Studio → configured Claude → deterministic | Yes, before change |
| Worker/server application adapter | Shared adapter chain | Yes, before change |
| Browser `/api/ai/chat` | LM Studio proxy; shared adapter used by application | Indirectly, before change |
| Claude route/provider contract | Direct isolated Claude route | Isolated only |

## 6. Effective Runtime Chain After

The active adapter now constructs exactly **DeepSeek → LM Studio**; the application’s existing deterministic advisory path is the final guaranteed fallback. If `AI_LMSTUDIO_ENABLED=false`/`off`/`disabled`, the adapter omits LM Studio and goes directly from DeepSeek failure to deterministic handling. Diagnostics expose LM Studio as a provider card but exclude Claude from active order/cards.

## 7. DeepSeek Policy

DeepSeek remains `REQUIRED_PRIMARY`. Current effective mode is `deepseek`, model `deepseek-v4-flash`, endpoint `https://api.deepseek.com`, with server-owned authentication and strict structured-output validation. The current RSS-1.2S7 replay made five real synthetic-data calls: 5/5 successful, all attributed to DeepSeek, with zero LM Studio attempts while healthy and zero Claude attempts.

## 8. LM Studio Availability Policy

LM Studio is `OPTIONAL_LOCAL_FALLBACK`. At final verification it was RUNNING on `127.0.0.1:1234` (`LM Studio.exe`, listener confirmed), and real isolated DeepSeek failure reached LM Studio successfully. The policy probe also forced `AI_LMSTUDIO_ENABLED=false` and confirmed the operator-disabled state skips LM Studio safely and reaches deterministic fallback without Claude.

## 9. Claude Removal from Active Chain

Claude was removed from `createChainProvider()` and `orderedTiers()`, so server, interactive, worker, bulk, and shared application paths cannot invoke it through the release adapter. Diagnostics no longer define or order Claude as an active provider. The developer test endpoint no longer accepts Claude as an active health target. The Claude adapter and `/api/ai/claude` route remain isolated for contract tests and future reuse; they are not reachable through the current release chain.

## 10. Deterministic Fallback Policy

Deterministic fallback remains the required final safe path. Controlled all-remote-failure verification produced a failed DeepSeek attempt, failed LM Studio attempt, no Claude attempt, and a deterministic advisory with the expected safe label. With LM Studio explicitly disabled, only DeepSeek was attempted before the deterministic result was produced.

| Scenario | DeepSeek | LM Studio | Deterministic | Claude | Result |
|---|---|---|---|---|---|
| DeepSeek healthy | Serves | 0 attempts | Not used | 0 attempts | PASS |
| DeepSeek fails; LM Studio running | Failed | Serves | Not used | 0 attempts | PASS — live |
| DeepSeek fails; LM Studio disabled | Failed | Skipped | Used | 0 attempts | PASS |
| DeepSeek and LM Studio fail | Failed | Failed | Used | 0 attempts | PASS |

## 11. Configuration Changes

`.env.example` now documents DeepSeek as primary, LM Studio as optional local fallback, deterministic as fail-safe, and `AI_LMSTUDIO_ENABLED` as the operator switch. Claude-only variables are no longer required or documented as release configuration. `docs/PRODUCTION_CONFIGURATION.md` now states that Claude credentials are not required. The user’s actual `.env.local` secrets were not printed, removed, or rewritten.

## 12. Diagnostics Changes

`providerDiagnosticsSnapshot()` now reports the active order as `DeepSeek API → LM Studio → Deterministic fallback` when LM Studio is enabled. Claude is absent from active provider definitions/cards/order. When `AI_LMSTUDIO_ENABLED=false`, the LM Studio card reports `disabled` and the active order becomes `DeepSeek API → Deterministic fallback`. Provider failures remain classified and secret-free.

## 13. Worker / Server Consistency

Interactive application calls, background worker calls, bulk/async paths, and browser-facing application calls all obtain the shared `createAIAdapter()` chain. Removing Claude at the shared adapter boundary makes the current release policy consistent across these paths. The direct Claude proxy remains an isolated route and is not selected by the shared adapter or diagnostics.

## 14. Negative Controls

The policy probe passed: healthy DeepSeek stops before LM Studio; isolated DeepSeek failure reaches LM Studio when it is running; disabled LM Studio is skipped; all remote failure reaches deterministic fallback; no scenario records a Claude attempt; DeepSeek failures remain visible in diagnostics; disabled LM Studio is visible as `disabled`.

## 15. Security Verification

RSS-1.2S1 authorization, RSS-1.2S2-FIX rate limiting/provider suppression, RSS-1.2S4-FIX security headers, RSS-1.2S5 prompt-injection hardening, TODO-046 safety, and structured-output/diagnostic secrecy probes passed after the policy change. Removing an inactive fallback did not weaken server-owned credentials, authorization, rate limiting, timeout handling, validation, or safe failure behavior.

## 16. Regression Results

| Check | Result |
|---|---|
| RSS-1.2A provider stability | PASS |
| RSS-1.2S1 authorization | PASS |
| RSS-1.2S2-FIX rate limiting | PASS |
| RSS-1.2S4-FIX security headers | PASS |
| RSS-1.2S5 prompt injection | PASS |
| RSS-1.2S6 isolated Claude contract | PASS; active-chain expectation modernized |
| RSS-1.2S7 live provider replay | PASS; DeepSeek 5/5 and real LM fallback |
| TODO-046 | PASS |
| TODO-078 | PASS against controlled runtime |
| TODO-080 | PASS |
| TODO-082A | PASS; no Claude active-chain calls |
| TODO-082C | PASS; diagnostics order modernized |
| TODO-083 expanded | PASS, 200/200 |
| TypeScript | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS; 22 migrations current |
| Production build | PASS |
| OIP Benchmark v1 | PASS, 1000/1000 |

## 17. Data Integrity

Final `probe:developer-demo-integrity` returned `PASS_WITH_FINDINGS`, current corruption 0, and release-blocking findings 0. Counts remained unchanged (knowledge 47, candidates 1805, validations 1804, memory 1804, evidence 4500, tickets 5183, patterns 50, versions 133, lessons 181, sequence 5183). Protected digest before/after remained `a6eaa46dfcdb253329bb1d017553c5a74f074a126d4b994cd0e45eb037be2f74`. OrgMetrics read-only reconciliation remained zero-delta for all four authoritative fields. Provider-policy probes used synthetic/in-memory fixtures and did not mutate protected Organizational Memory.

## 18. RSS-1.2E Reclassification

The prior LM Studio blocker is reclassified as `RECLASSIFIED_NONBLOCKING` under the approved optional-provider policy. When LM Studio was unavailable in the earlier gate, that absence was an environment condition, not a product failure. The new policy additionally verifies safe operator-disabled behavior. Current live availability later permitted a successful real DeepSeek → LM Studio replay.

## 19. Remaining Limitations

- Claude live readiness remains intentionally unverified; only isolated contract behavior is retained.
- LM Studio availability remains deployment/environment-dependent; `AI_LMSTUDIO_ENABLED` must be set deliberately when operators disable it.
- Historical reports continue to mention the former Claude tier and are not rewritten.
- The worktree remains dirty and is not a clean RSS-1.3 release candidate.

## 20. Recommendation

Provider policy is reconciled and the previous RSS-1.2E LM Studio blocker no longer blocks this policy gate. RSS-1.3 should still wait for the separate clean-worktree/release-certification process. Do not treat isolated Claude contract coverage as live Claude release readiness.

## 21. Final Verdict

**PROVIDER_POLICY_RECONCILED**

The current active release chain is demonstrably DeepSeek → LM Studio → deterministic fallback, Claude is excluded from active routing and diagnostics, DeepSeek live verification passes, both live LM fallback and disabled-LM deterministic fallback are safe, security regressions are absent, benchmark is 1000/1000, and protected data is unchanged.

