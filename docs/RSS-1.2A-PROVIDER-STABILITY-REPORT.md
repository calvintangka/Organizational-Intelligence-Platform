# RSS-1.2A — Provider Stability Report

Status: Provider stabilization implemented; clean release certification rerun pending.

## 1. Executive Summary

RSS-1.2A found and corrected a provider-boundary reliability defect. OpenAI-compatible responses with HTTP 200 and `finish_reason=length` were treated as generic parse failures; the health probe also requested only eight output tokens from reasoning models. Provider exceptions could escape the chain, JSON extraction accepted trailing prose, and diagnostics did not preserve the per-attempt evidence required to explain failover.

The resolution is model-agnostic. DeepSeek remains the current Tier 1 configuration, but the same shared OpenAI-compatible factory and proxy can select any compatible reasoning model through configuration without application-logic changes. The focused stability probe, TODO-082A, TODO-082C, TODO-038, TODO-046, TODO-080, TODO-083, TypeScript, Prisma validation, production build, and OIP Benchmark all pass.

Overall recommendation: **NOT READY** only because `npm run certify -- --release` stops at its existing release working-tree cleanliness gate. The provider code-level gates pass; the release suite must be rerun from a clean, controlled worktree.

## 2. Environment

- Windows / PowerShell
- Next.js 15.5.22, TypeScript 5.9.3, Prisma 7.9.1
- Current configured chain: DeepSeek API → LM Studio → Claude API → deterministic fallback
- Current Tier 1: `deepseek-v4-flash`
- No production ticket or Organizational Memory writes were performed by RSS-1.2A probes.

## 3. Provider Architecture

The application-facing `AIProvider` contract is unchanged. `createOpenAICompatibleProvider` is now the shared provider port; DeepSeek is a compatibility configuration, not a special execution path. A generic `openai-compatible` mode supports:

- `AI_TIER1_BASE_URL`
- `AI_TIER1_MODEL`
- `AI_TIER1_API_KEY` (server-only)
- `AI_TIER1_LABEL`
- `AI_TIER1_TIMEOUT_MS`

Browser calls use `/api/ai/openai-compatible`; the proxy owns the credential and forwards only the controlled model configuration. Existing DeepSeek and LM Studio configuration remains compatible.

## 4. Runtime Flow

```text
Request
  ↓
Tier 1 OpenAI-compatible provider
  ↓  bounded retry for truncation/transient failure
Tier 2 LM Studio
  ↓
Tier 3 Claude API when configured
  ↓
Deterministic fallback
```

Every provider failure is converted into a result. No provider exception is rethrown from the chain. Deterministic fallback is reached only after all active provider tiers fail.

## 5. Root Cause

The exact failing component was the shared `callChatCompletion` boundary in `lib/ai/lmStudio.ts`, reinforced by `lib/server/developerAiDiagnostics.ts`.

1. A provider returned HTTP 200 with `finish_reason=length`. The adapter returned a generic “truncated before valid JSON” failure, but did not expose truncation as a structured failure class or retry it.
2. The health check used `max_tokens: 8`, which was insufficient for reasoning models even when the requested answer was only `OK`. This produced a false provider-health failure.
3. The parser searched for an embedded JSON object, so text such as `prefix { ... } suffix` could be accepted. That violated strict structured-output requirements.
4. `withFallback` rethrew unexpected provider exceptions instead of converting them to safe failed attempts.
5. Diagnostics recorded provider, latency, and reason, but not start/finish timestamps, completion length, parse status, structured-output status, timeout classification, or a stable diagnostic ID. Custom provider labels also could not be mapped reliably.

The fix is correct because it operates at the provider contract boundary, preserves deterministic business logic, and makes uncertainty visible rather than silently converting it into a successful advisory result.

## 6. Health Check Results

The live read-only health check now passes normally:

| Provider | Result | Latency | Retries |
|---|---:|---:|---:|
| DeepSeek API (`deepseek-v4-flash`) | succeeded | 1042 ms | 0 |
| LM Studio | skipped after Tier 1 success | 0 ms | 0 |
| Claude API | skipped after Tier 1 success | 0 ms | 0 |

The previous 8-token false failure is resolved by a bounded 256-token health budget. A failed configured provider remains visible and falls through safely.

## 7. Failover Results

The focused RSS-1.2A probe passed these controlled cases:

- Generic OpenAI-compatible Tier 1 succeeds and lower tiers are explicitly skipped.
- Tier 1 HTTP 503 falls through to LM Studio.
- Tier 1 timeout is classified and falls through without hanging.
- All provider exceptions are contained and end in deterministic failure.
- Generic proxy uses the configured endpoint and server-controlled model.
- Claude authentication failures are classified as authentication failures; missing Claude configuration is represented as unavailable rather than an unexpected runtime 401.

## 8. Timeout Results

Timeouts use `AbortController`, bounded per-call deadlines, and bounded retries (maximum two, with the normal configuration defaulting to one). Retry is limited to transient conditions such as timeout, network failure, 408/425/429, and 5xx responses. No retry loop is unbounded.

The probe confirmed that an abort becomes a `timeout` attempt with `timedOut: true`, then follows the explicit fallback path.

## 9. JSON Validation Results

The provider boundary now requires a complete JSON object. It rejects:

- malformed JSON;
- partial JSON;
- trailing prose or wrapper text;
- empty content;
- reasoning-only content that is not valid JSON;
- missing operation-required fields such as title, summary/category, response text, or discrimination boolean;
- `finish_reason=length` responses.

The previous permissive embedded-object extraction was removed. A valid JSON parse is not sufficient by itself; the operation-specific structured shape is checked before the advisory is accepted.

## 10. Retry Results

Retries are explicit in diagnostics and bounded by configuration. Truncation retries once with a doubled output budget in the focused probe, then succeeds. The same path is shared by any OpenAI-compatible model. Exhausted retry and failover paths remain failures and cannot masquerade as successful provider output.

## 11. Diagnostics Verification

Each attempt now records or derives:

- diagnostic ID;
- provider and model;
- start and finish time;
- latency;
- status and failure class;
- HTTP status;
- timeout flag;
- retry count;
- completion length;
- JSON parse status;
- structured-output validity;
- explicit fallback path.

Diagnostics remain safe: keys, authorization headers, prompts, and ticket content are not serialized into provider diagnostics. The developer diagnostics route supports the generic provider ID and custom provider labels.

## 12. Security Review

- API keys remain server-only for DeepSeek, Claude, and generic Tier 1.
- Authorization headers are never included in diagnostics or user-facing provider errors.
- Provider response bodies are not copied into chain error messages.
- Authentication, quota, rate-limit, timeout, network, unavailable, truncation, malformed-response, and unexpected failures are distinguishable.
- Provider failure cannot bypass deterministic safety behavior or create an accepted structured advisory without valid output.
- No RBAC, memory, retrieval, trust, reflection, canonical, lesson, ticket, or connector logic was changed.

## 13. Regression Results

| Check | Result |
|---|---:|
| RSS-1.2A provider stability probe | PASS |
| TODO-082A provider probe | PASS |
| TODO-082C diagnostics probe | PASS |
| TODO-038 Claude failover probe | PASS |
| TODO-046 safety probe | PASS |
| TODO-080 intent isolation | PASS |
| TODO-083 calibration | PASS |
| TypeScript | PASS |
| Prisma validation | PASS |
| Production build | PASS on isolated rerun |
| OIP Benchmark v1 | 1000/1000, 100% overall, 100% critical security |
| `npm run certify -- --release` | BLOCKED at pre-existing dirty-worktree gate |

The first isolated build attempt encountered a generated `.next` file-move race; the immediate isolated rerun passed. This is not a source or type failure.

## 14. Data Integrity and Remaining Risks

RSS-1.2A provider probes are in-memory/read-only and did not modify tickets, knowledge, lessons, candidates, memory, trust, reflection, patterns, governed actions, connectors, or action records. Only provider infrastructure, diagnostics types, the generic proxy, and provider regression coverage changed.

Remaining risks are deployment-state risks, not an observed uncaught provider defect:

- Claude must have a valid `ANTHROPIC_API_KEY` if it is intended to be an active fallback. An invalid configured key is now reported as authentication failure and falls through safely, but it cannot produce Claude success.
- A release certification run requires a clean worktree under the repository’s enforced `--release` policy. Existing unrelated changes and generated artifacts prevented that stage from running.
- Real provider latency and quota behavior remain environment-dependent and should be checked again in the clean release environment.

## 15. Recommendation

**NOT READY** for final release certification solely because the release suite did not progress beyond its working-tree cleanliness gate. RSS-1.2A provider stabilization itself is passing, and the next action is to rerun `npm run certify -- --release` from a clean controlled worktree, then confirm the configured Claude fallback policy in that environment.
