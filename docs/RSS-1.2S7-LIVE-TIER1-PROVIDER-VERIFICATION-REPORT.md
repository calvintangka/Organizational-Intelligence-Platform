# RSS-1.2S7 — Live Tier-1 Provider Verification Report

**Status:** Completed  
**Final verdict:** `TIER1_LIVE_REPAIRED_AND_VERIFIED`  
**Date:** 2026-08-09  
**Scope:** Real configured DeepSeek requests using synthetic data only. RSS-1.2E and RSS-1.3 were not started.

## 1. Executive Summary

The configured Tier 1 is DeepSeek API, model `deepseek-v4-flash`, at `https://api.deepseek.com`. A real baseline request reached DeepSeek and authenticated successfully, but the OIP adapter rejected the response because DeepSeek returned valid JSON in `message.content` alongside a separate `reasoning_content` field. A richer live `analyzeTicket` request also exhausted the bounded completion budget while reasoning was enabled.

Two minimal repairs were applied:

1. The shared adapter now parses only `message.content`; private `reasoning_content` is never accepted as an answer, stored, or exposed. Reasoning-only responses still fail closed.
2. DeepSeek configuration sends `thinking: { type: "disabled" }` and JSON response-format guidance. The authenticated DeepSeek proxy forwards the controlled thinking setting.

The complete replay then passed: five live Tier-1 adapter calls, a real in-memory OIP application-service run, a real authorized proxy call, and a real isolated Tier-1 outage that fell back to live LM Studio. Healthy Tier 1 recorded zero LM Studio or Claude attempts.

## 2. Existing Provider Verification Gap

RSS-1.2A, TODO-082A, TODO-082C, and the security/provider probes established provider ordering, parser, proxy, and fallback contracts with controlled transports. They did not prove that the current DeepSeek credential and current configured model produced an answer accepted by the live OIP runtime. RSS-1.2S7 closed that gap with real network calls.

## 3. Context Reviewed

Reviewed before code changes: RSS-1.2A, RSS-1.2S1, RSS-1.2S2-FIX, RSS-1.2S4-FIX, RSS-1.2S5, RSS-1.2S6, TODO-082A, TODO-082C, and the latest RSS-1.2E rerun report. Relevant implementation inspected: `lib/ai/adapter.ts`, `lib/ai/lmStudio.ts`, `lib/ai/claudeApi.ts`, `lib/ai/deepseekApi.ts`, `lib/server/developerAiDiagnostics.ts`, AI proxy routes, worker construction, and environment resolution.

## 4. Environment / Effective Configuration

| Field | Effective value |
|---|---|
| Branch / HEAD | `master` / `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` |
| Node / npm | v24.14.1 / 11.11.0 |
| Next.js | 15.5.22 |
| Database | PostgreSQL reachable; 22 migrations; schema up to date |
| AI mode | `deepseek` |
| Tier 1 label | `DeepSeek API` |
| Tier 1 base URL | `https://api.deepseek.com` |
| Tier 1 model | `deepseek-v4-flash` |
| Tier 1 timeout | 30,000 ms |
| Tier 1 retries | 1 bounded retry |
| DeepSeek API key | Configured: YES (value not printed) |
| LM Studio base URL | `http://127.0.0.1:1234/v1` |
| LM Studio model | `google/gemma-4-e4b` |
| LM Studio timeout | 30,000 ms (90,000 ms only for isolated failover probe) |
| Claude API key | Configured: YES (value not printed) |

The worktree was already dirty with unrelated prior work; no reset or cleanup of those changes was performed.

## 5. Runtime Provider Chain

`readAIConfig()` feeds the same chain factory for server calls, background workers, and developer diagnostics. Browser callers omit the key and use the authenticated DeepSeek proxy.

| Tier | Provider | Model | Configured | Live result |
|---|---|---|---|---|
| 1 | DeepSeek API | `deepseek-v4-flash` | Yes | Served 5/5 healthy calls; OIP pipeline success |
| 2 | LM Studio | `google/gemma-4-e4b` | Yes | Served isolated Tier-1 outage |
| 3 | Claude API | `claude-haiku-4-5-20251001` | Yes | Skipped on healthy Tier 1; controlled exhaustion contained |
| Final | Deterministic fallback | N/A | Always available | Used only in isolated all-provider failure |

## 6. DeepSeek Endpoint Verification

The effective server endpoint is `https://api.deepseek.com/chat/completions`. Requests use OpenAI-compatible JSON, the configured model, `max_tokens`, strict JSON response guidance, and server-owned Bearer authorization. No duplicate path or credential-bearing URL was observed.

## 7. Authentication Verification

Authentication **PASS**. A direct live request returned HTTP 200 from DeepSeek using the configured server key. No 401/403, quota, billing, or rate-limit response occurred. The key and Authorization header were never printed or persisted.

## 8. Model Verification

The current configured model `deepseek-v4-flash` was accepted by the live provider and returned HTTP 200 completions. No model substitution was made.

## 9. Direct Live Provider Test

The raw diagnostic request used a harmless synthetic JSON task. DeepSeek returned HTTP 200, `finish_reason=stop`, non-empty content (89 characters in the baseline diagnostic), and valid JSON with the required `title`, `confidence`, and `rationale` keys. The same endpoint/model then passed through the real adapter after repair.

## 10. Structured Output Verification

The strict existing parser and operation schema validators remained enabled. Post-repair live responses reported `jsonParseStatus=valid` and `structuredOutputValid=true`. No markdown salvage, partial-object extraction, or validation weakening was added. The adapter ignores private reasoning metadata and accepts only a complete valid JSON object in `message.content`.

## 11. OIP Adapter Verification

The final live probe made five `suggestPatternName` calls through `createAIAdapter(readAIConfig())`. Every result was `ok=true`, provider `DeepSeek API`, model `deepseek-v4-flash`, no retry, valid JSON, and no fallback.

## 12. OIP Pipeline Verification

A complete `processTicket` application-service operation ran with a disposable in-memory persistence session and synthetic ticket/profile data. It reached `in_review` through stages `persisted → business_relevance → analyzing → retrieved → drafted → in_review`. The first provider attempt was a successful DeepSeek Tier 1 attempt; LM Studio and Claude were recorded as skipped. One in-memory ticket record was created; PostgreSQL and protected fixtures were not used by this pipeline fixture.

## 13. Tier-1 Attribution Evidence

Healthy calls contained explicit diagnostics: Tier 1 attempted **YES**, succeeded **YES**, provider `DeepSeek API`, model `deepseek-v4-flash`, LM Studio **skipped**, Claude **skipped**, deterministic fallback **not used**. The OIP pipeline diagnostics preserved the same attempt array even though the top-level provider label is the chain label.

## 14. Five-Request Live Stability Test

| Test # | Tier 1 | LM Studio | Claude | Deterministic | Final provider | Latency |
|---:|---|---|---|---|---|---:|
| 1 | Succeeded | Skipped | Skipped | Not used | DeepSeek API | 1,310 ms |
| 2 | Succeeded | Skipped | Skipped | Not used | DeepSeek API | 1,003 ms |
| 3 | Succeeded | Skipped | Skipped | Not used | DeepSeek API | 884 ms |
| 4 | Succeeded | Skipped | Skipped | Not used | DeepSeek API | 1,421 ms |
| 5 | Succeeded | Skipped | Skipped | Not used | DeepSeek API | 1,321 ms |

Result: **5/5**, DeepSeek successes 5/5, LM Studio attempts 0, Claude attempts 0, deterministic fallback 0.

## 15. LM Studio Fallback Verification

After healthy Tier 1 was proven, only Tier 1 was pointed at an unreachable local port. The real configured LM Studio instance then returned a valid structured result in 54,213 ms. Diagnostics showed DeepSeek `network` failure, LM Studio success, and Claude skipped. This was an isolated test configuration; the real API key was unchanged.

## 16. All-Provider Failure Verification

An isolated controlled transport returned HTTP 503 for all three remote tiers. The chain contained all three failures without throwing, and `buildAIAdvisory` produced an `unavailable` deterministic advisory preserving the canonical label. No unsafe provider output was accepted.

## 17. Browser / Proxy Verification

The authenticated DeepSeek proxy route was exercised with synthetic data and an in-process authorization seam. It returned HTTP 200 with `x-ai-provider: DeepSeek API`, the configured model, the configured endpoint, non-empty content, and no reasoning channel after the repair. The route owns the key/model/base URL; the client cannot select arbitrary credentials or endpoints. RSS-1.2S2’s live HTTP probe also passed authorization/rate-limit enforcement, denial-before-provider invocation, shared buckets, Retry-After, and negative controls.

## 18. Server / Worker Verification

Server-side adapter calls use `readAIConfig()` directly. `lib/server/jobs/worker.ts` constructs `createAIAdapter(aiConfig)` from that same resolution path, so worker and server paths resolve DeepSeek Tier 1 identically. Developer health diagnostics also resolve `readAIConfig()` and a live health check returned DeepSeek success with LM Studio and Claude skipped.

## 19. Diagnostics Review

Diagnostics exposed provider, model, endpoint, latency, completion status, fallback path, attempt status, failure class, HTTP status, retry count, completion length, JSON parse status, and structured-output status. The baseline boundary was observable as `invalid_structured_output` from `reasoning_content`; the rich-prompt boundary was observable as `truncated_response`/`finish_reason=length`. Serialized diagnostics contained no API key, Authorization header, or full prompt.

## 20. Security Review

Strict JSON validation, prompt trust boundaries, authorization, rate limiting, and fail-closed behavior remained intact. `reasoning_content` is never used as an answer channel. The proxy forces a controlled thinking mode and server-owned credentials. RSS-1.2S5, RSS-1.2S6, RSS-1.2S2-FIX, and RSS-1.2S4-FIX all passed after the repair.

## 21. Cost / Request Count

The final replay used **9 real DeepSeek requests**: five Tier-1 stability calls, three calls in the complete synthetic OIP pipeline (analysis, canonical suggestion, draft), and one proxy call. Across diagnosis, baseline reproduction, and replay, **37 bounded real DeepSeek requests** were made by the recorded probe invocations. All prompts were short synthetic prompts; no production/customer ticket was sent. Provider responses did not expose token-usage totals, so no token estimate is claimed.

## 22. Regression Results

| Check | Result |
|---|---|
| Production build | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS; 22 migrations up to date |
| RSS-1.2A | PASS (existing contract probe) |
| RSS-1.2S1 | PASS (existing authorization probe) |
| RSS-1.2S2-FIX | PASS; repaired probe, data restored |
| RSS-1.2S4-FIX | PASS; repaired probe, startup/security/negative controls |
| RSS-1.2S5 | PASS |
| RSS-1.2S6 | PASS |
| TODO-046 | PASS; protected snapshots unchanged |
| TODO-078 | PASS |
| TODO-080 | PASS |
| TODO-082A | PASS |
| TODO-082C | PASS |
| TODO-083 | PASS |
| OIP Benchmark v1 | PASS; 1000/1000, 100% overall, 100% critical security |

## 23. Data Integrity

The S7 OIP pipeline used only in-memory disposable persistence. The Developer Demo integrity probe returned `PASS_WITH_FINDINGS`, protected state digest equal before/after, and zero release-blocking findings. RSS-1.2S2 and RSS-1.2S4 reported restored global/mature snapshots. RSS-1.2E.2 reconciliation was read-only with zero differences for authoritative derived metrics. No Organizational Memory, trust, reflection, ticket, lesson, or protected demo data was changed by S7.

## 24. Root Cause and Repair

| Boundary | Expected | Actual before repair | Classification | Evidence |
|---|---|---|---|---|
| DeepSeek response handling | Valid `content` accepted | Valid JSON content rejected when `reasoning_content` was also present | L — application adapter defect | HTTP 200; valid content; reasoning metadata; adapter emitted `invalid_structured_output` |
| Rich OIP prompt completion | Structured answer within bounded budget | `finish_reason=length` at 700 and 1400 while reasoning was enabled | D/F — provider compatibility and request control | Live `analyzeTicket` raw test; disabled thinking returned `stop` and valid schema |

Changed files: `lib/ai/lmStudio.ts`, `lib/ai/adapter.ts`, `app/api/ai/deepseek/route.ts`, and the permanent probe/package script. No provider order, credential, timeout policy, rate limit, authorization, memory, trust, reflection, or protected data changes were made.

## 25. Remaining Limitations

The all-provider baseline can reach an existing Claude HTTP 404 path when DeepSeek and LM Studio are deliberately unavailable; Claude readiness remains covered by the mocked RSS-1.2S6 contract and is outside this Tier-1 repair. The live browser proxy call used a disposable in-process authorization seam to avoid writing rate-limit counters; the real HTTP authorization/rate-limit behavior is covered by RSS-1.2S1/S2 probes. No production customer session or ticket was used.

## 26. Recommendation

Tier 1 is ready for the next release-acceptance stage. RSS-1.2E rerun is eligible, but was **not started** in this task. RSS-1.3 was not started. No commit, tag, or push was created.

## 27. Final Verdict

`TIER1_LIVE_REPAIRED_AND_VERIFIED`

The verdict is based on the confirmed adapter/request-control defect, successful post-repair live DeepSeek authentication/model/structured output, complete synthetic OIP pipeline acceptance, 5/5 Tier-1 stability, real LM Studio Tier-2 failover, deterministic all-provider fallback, preserved authorization/rate limiting, and unchanged protected data.
