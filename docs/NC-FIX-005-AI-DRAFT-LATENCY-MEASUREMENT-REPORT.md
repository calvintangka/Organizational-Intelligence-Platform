# NC-FIX-005 - AI Draft Latency Measurement Report

## 1. Executive Summary

NC-FIX-005 replaced the original 1-2 minute anecdotal timing for QC-001 with controlled evidence. The production path was instrumented without changing the DeepSeek model, provider policy, timeout policy, prompt contract, schema, or migration state.

The controlled DeepSeek adapter run completed 12/12 samples successfully. Total latency was 1,588.433-2,493.829 ms, with a 1,917.018 ms p50 and 1,999.144 ms mean. Provider time accounted for 99.99% of total adapter time; response-body handling was the dominant measured stage. Browser-visible draft rendering was 3,480.024 ms and 4,506.132 ms in two valid samples, p50 3,993.078 ms.

The evidence does not reproduce a 1-2 minute systematic defect. It does identify noticeable, provider-dominant latency and justifies permanent observability, but not immediate optimization.

## 2. Final Verdict

`NC_FIX_005_LATENCY_MEASUREMENT_VERIFIED`

Measurement is complete, the bottleneck is classified, the permanent probe passes, and no performance defect at the originally reported 1-2 minute severity was confirmed.

## 3. QC-001 Background

QC-001 described the first NusaCloud HR case, NC-20260810-0001, as appearing to take approximately 1-2 minutes using DeepSeek. The draft eventually completed successfully, so the finding was a medium performance concern rather than a confirmed defect. NC-FIX-004 already established that structured DeepSeek output and formatting preservation worked.

## 4. Baseline

- Measurement timestamp: 2026-08-11T08:37:54.7083122+07:00.
- Timezone: SE Asia Standard Time (Asia/Jakarta).
- Branch: `master`.
- HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- Certified tag dereference: `v0.1.1-certified^{}` -> `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- Node: `v24.14.1`; npm: `11.11.0`; Prisma: `7.9.1`.
- PostgreSQL `127.0.0.1:5432`: reachable.
- Migration status: 25 migrations found; database schema up to date.
- Worktree: dirty before and after this task because prior NC-FIX-001 through NC-FIX-004 work was preserved.
- `git diff --check`: no whitespace errors; Git emitted only existing LF/CRLF normalization warnings.

## 5. Current AI Draft Architecture

The measured production path is:

1. `app/page.tsx` `processTicketPipeline` submits the ticket to `/api/organizations/[organizationId]/tickets/process`.
2. The route authenticates, creates scoped server persistence and AI ports, loads profile/knowledge context, and calls `processTicket`.
3. `lib/application/tickets/processTicket.ts` persists the initial ticket, performs deterministic understanding and domain/relevance classification, retrieves memory/lesson candidates, calls the advisory adapter, builds the deterministic draft, requests the AI draft, applies safety/transformation, persists the `in_review` response, and returns the API result.
4. `lib/ai/adapter.ts` executes the configured Tier 1 DeepSeek provider and records attempt/fallback state; LM Studio remains an optional fallback tier.
5. `lib/ai/lmStudio.ts` builds the draft prompt, calls the OpenAI-compatible chat-completions contract directly on the server or through the browser proxy, reads the response body, parses strict JSON, validates the draft schema, and maps the result.
6. React receives the API result and renders `Draft response ready` and the review textbox.

## 6. Timing Methodology

Durations use monotonic `performance.now()` where available and are rounded to three decimals. Wall-clock timestamps remain for existing telemetry correlation only. The deterministic baseline used ten fictional in-memory process runs. The live run used ten sequential fictional DeepSeek drafts followed by two concurrent fictional drafts. The browser run measured from submit click until the rendered draft textbox was visible; an intermediate evidence-gate state was explicitly excluded.

## 7. Instrumentation

Added metadata-only timing fields to `AIDiagnostics` and `ProcessTicketResult.telemetrySummary`:

- prompt character count and prompt construction time;
- provider request time;
- response-body time;
- structured parsing time;
- provider total time;
- process pre-retrieval, retrieval, draft-processing, initial/final persistence, and total time;
- chain attempt latency and provider attempt count;
- fallback-used state.

Existing process-local telemetry remains non-persistent and bounded. No raw prompts or completions are written by the instrumentation.

## 8. Security / Privacy of Measurements

Only durations, counts, status classifications, model/provider labels, prompt character counts, and completion lengths are recorded. The permanent probe never prints prompts, completions, API keys, authorization headers, or customer data. All live inputs were fictional and disposable.

## 9. Deterministic Baseline

Ten deterministic process samples passed. Total process timing was 3.936-29.649 ms, p50 5.707 ms, p90 15.205 ms. The synthetic persistence layer was in memory, so these values are a control baseline rather than a production database benchmark.

The permanent probe also exercised a mocked structured parser path: 4,137 prompt characters, 88 completion characters, and 17.144 ms total, including 16.401 ms simulated request handling.

## 10. OIP Non-Provider Baseline

Across the ten deterministic process controls, retrieval p50 was approximately 0.05 ms and persistence p50 approximately 0.005 ms. Draft transformation was sub-millisecond at p50. These values show that deterministic OIP work and the measured in-memory persistence path are not candidates for the observed multi-second live latency.

## 11. DeepSeek Test Method

The live probe loaded the configured DeepSeek settings, used the real DeepSeek API with `deepseek-v4-flash`, sent fictional cold-start draft inputs, and disabled the local fallback for measurement isolation. Ten calls were sequential; two additional calls were concurrent. The configured timeout was 30,000 ms and the configured retry ceiling was one, but no sample required a retry.

## 12. DeepSeek Samples

| Sample set | Count | Total range | Provider p50 | Result |
|---|---:|---:|---:|---|
| Sequential | 10 | 1,588.433-2,493.829 ms | 1,909.167 ms | 10/10 success |
| Light concurrency | 2 | 2,089.461-2,451.639 ms | 2,270.374 ms | 2/2 success |
| Combined | 12 | 1,588.433-2,493.829 ms | 1,916.774 ms | 12/12 success |

Prompt sizes were 4,131-4,145 characters, p50 4,137.5. Completion sizes were 361-675 characters, p50 553.5.

## 13. Cold vs Warm Behavior

`INCONCLUSIVE`. In the final run the first sample was 1,588.433 ms while the nine later sequential samples had a 1,909.167 ms p50; this does not demonstrate a cold-start penalty. The earlier controlled run had the opposite ordering. Provider-side variability is larger than the evidence for a repeatable cold/warm effect.

## 14. Retrieval Timing

Retrieval timing is exposed in the application result. The ten deterministic controls measured a p50 of approximately 0.05 ms in memory. Live provider samples were intentionally cold-start/no-memory inputs, so no mature organizational retrieval data was used in the DeepSeek costed run.

## 15. Prompt Construction Timing

Draft prompt construction was 0.013-0.077 ms, p50 0.041 ms. Prompt size was stable at 4,131-4,145 characters. Prompt construction is not a meaningful contributor to the measured latency.

## 16. Provider Timing

Provider total timing was 1,587.886-2,493.600 ms, p50 1,916.774 ms, p95 2,470.443 ms. Request transmission/initial response timing was 126.880-234.987 ms, p50 167.546 ms. Response-body timing was 1,374.027-2,287.315 ms, p50 1,758.433 ms. The provider response body is the dominant stage.

## 17. Parsing Timing

Structured JSON parsing was 0.004-0.015 ms, p50 0.007 ms. All 12 live samples produced valid structured output. Parsing is not a bottleneck.

## 18. Persistence Timing

The process result now exposes initial and final persistence separately. In the deterministic in-memory control, persistence p50 was approximately 0.005 ms. Browser full-pipeline acceptance confirmed the draft became visible after the API completed; no persistence timeout or persistence failure was observed.

## 19. Retry / Attempt Analysis

All 12 live samples completed on the first provider attempt. Retries observed: `NO`. The permanent probe records per-attempt latency and retains retry/failure classification for future regressions.

## 20. Fallback Analysis

Fallback observed: `NO`. The live run isolated Tier 1 DeepSeek with LM Studio fallback disabled for attribution. Existing chain behavior and fallback metadata remain unchanged; the deterministic and regression probes cover the non-live fallback-safe path.

## 21. Network Observations

The measured direct DeepSeek request portion had a p50 of 167.546 ms, while response-body handling had a p50 of 1,758.433 ms. No HTTP 429, timeout, authentication error, provider-unavailable error, or network failure occurred. The data points to provider generation/response delivery rather than local request setup or local parsing.

## 22. Browser Perceived Latency

Two valid in-app browser samples measured submit click to visible `Draft response ready` textbox: 4,506.132 ms and 3,480.024 ms. Browser perceived p50 is 3,993.078 ms. A first attempt that only reached the intermediate resolution-evidence gate was excluded and not counted as a visible-draft completion.

## 23. NC-0001-Like Reproduction

The browser reproduction used fictional NusaCloud HR cases matching the original shape: activation email delay, mobile permission issue, and report export timeout. Three disposable full-pipeline browser generations completed with DeepSeek-backed drafts; the visible-draft samples used for the latency statistic were the latter two. None approached one minute, and no mature case, knowledge item, or original NC-20260810-0001 record was modified.

## 24. Cross-Scenario Results

The five direct controlled scenario families were activation email, mobile permission, invoice recipient, report export, and role access. All scenarios used the same safe cold-start grounding contract. The combined live range remained 1.588-2.494 seconds; no scenario-specific failure or fallback pattern was observed.

## 25. Sequential Results

Ten sequential calls achieved 10/10 success. Sequential p50 was 1,909.167 ms. The slowest sequential sample was sample 9 at 2,493.829 ms, with 2,269.105 ms in response-body time and a 601-character completion.

## 26. Light Concurrency Results

`DEGRADED` by latency, `PASS` by correctness. Both concurrent calls succeeded, with totals 2,089.461 ms and 2,451.639 ms, p50 2,270.550 ms. This is slower than the sequential p50 but did not trigger rate limiting, retry, fallback, or malformed output.

## 27. Timeout Configuration

DeepSeek timeout was 30,000 ms. The timeout setting was not changed. No sample reached the timeout threshold. The probe records timeout classification and HTTP status for future samples.

## 28. Latency Distribution

Combined live total latency: minimum 1,588.433 ms; p50 1,917.018 ms; mean 1,999.144 ms; p90 2,426.435 ms; p95 2,470.625 ms; maximum 2,493.829 ms. The distribution is compact relative to the original 60-120 second anecdote.

## 29. Stage Contribution

At the combined live p50, provider total was 1,916.774 ms. Prompt build was 0.041 ms, parsing 0.007 ms, and adapter/non-provider overhead was approximately 0.234 ms. Provider share of total was 99.99%. The deterministic process control showed retrieval and persistence at sub-millisecond p50 levels.

## 30. Bottleneck Classification

Primary bottleneck: `PROVIDER_RESPONSE_BODY`. Secondary contributors are ordinary network/request transit and full-pipeline application work visible only in the browser measurement. Prompt construction, parsing, retrieval, and persistence are not bottlenecks in the measured evidence.

## 31. Performance Severity

`NOTICEABLE`. A roughly two-second provider response and roughly four-second browser-visible draft is user-visible and worth monitoring, but the measured evidence is not poor or unacceptable and does not support an immediate optimization change.

## 32. QC-001 Decision

QC-001 is classified as `MEASUREMENT_COMPLETE_NO_SYSTEMATIC_1_TO_2_MINUTE_DEFECT_CONFIRMED`. The original observation remains a valid historical report, but the controlled reproduction did not reproduce its duration. The current evidence supports provider-dominant noticeable latency with intermittent behavior still possible outside this sample window.

## 33. Optimization Decision

Immediate optimization required: `NO`. The task followed measure-first scope and did not change model, provider, prompt length, timeout, caching, streaming, database architecture, or operation ordering. A future targeted optimization task is justified only if production telemetry shows regression or materially slower tail latency.

## 34. Permanent Observability

The timing envelope is now available in `AIDiagnostics.timing`, chain attempts, and `ProcessTicketResult.telemetrySummary.timing`. It is metadata-only, process-local, bounded by existing telemetry behavior, and safe for normal regression runs. It does not create a database table, migration, or durable customer-data record.

## 35. Permanent Probe

`scripts/nc-fix-005-ai-draft-latency-probe.cjs` is the permanent probe. Default mode runs ten deterministic process samples and a mocked parser check without live dependencies. Explicit `--live` mode runs the controlled DeepSeek measurements and prints safe metadata only. Package alias: `npm run probe:nc-fix-005-ai-draft-latency`.

## 36. NC-FIX Regression Results

- NC-FIX-001: PASS.
- NC-FIX-002: PASS.
- NC-FIX-003: PASS.
- NC-FIX-004: PASS.
- NC-FIX-005 deterministic probe: PASS.

## 37. RSS Regression Results

- RSS-2.1: PASS.
- RSS-2.6: PASS.
- RSS-2.7: PASS.
- RSS-2.8: PASS after rerun against its required isolated port-3510 server.

## 38. Provider Policy

DeepSeek remains the configured primary provider. LM Studio fallback policy is unchanged and was not activated by this task. Claude is not active. No provider replacement or model change was made.

## 39. TypeScript / Prisma / Build

- TypeScript: PASS (`tsc --noEmit`).
- Prisma validation: PASS.
- Migration status: PASS; database up to date at 25 migrations.
- Production build: PASS, including Prisma generate and Next.js optimized build.

## 40. OIP Benchmark

OIP Benchmark v1: 1,000/1,000 checks passed; overall 100%; critical security 100%.

## 41. Protected Data

Developer-demo integrity probe reported `protectedOrganizationsUnchanged: true`. Protected digest before and after was identical: `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`. The probe retained its known historical non-blocking findings; release-blocking findings were zero.

## 42. Cost / Live Call Count

The direct live probe made 12 DeepSeek calls: 10 sequential and 2 concurrent. The browser full-pipeline reproduction made 9 additional DeepSeek calls across three fictional tickets (analysis/canonical work plus draft generation per ticket). Total live provider calls: 21. No production/mature customer data was sent.

## 43. Secret Review

PASS. No secret was added to source, reports, probe output, or durable application data. The live probe output exposed only `apiKeyPresent: true`, never the key itself. Prompt and completion contents were not printed.

## 44. Cleanup

PASS. Three disposable browser ticket records and their three customer messages were removed by exact ticket ID after measurement. No evidence or transition-audit rows were created for those samples. Temporary port-3421 and port-3510 servers were stopped; the pre-existing port-3000 process was not altered. No repository reset, stash, clean, commit, push, or tag mutation was performed.

## 45. Files Changed

NC-FIX-005 changes:

- `types/ai.ts`
- `types/index.ts`
- `lib/ai/types.ts`
- `lib/ai/lmStudio.ts`
- `lib/ai/adapter.ts`
- `lib/ai/deterministic.ts`
- `lib/application/tickets/processTicket.ts`
- `scripts/nc-fix-005-ai-draft-latency-probe.cjs`
- `package.json`
- `docs/NC-FIX-005-AI-DRAFT-LATENCY-MEASUREMENT-REPORT.md`

Existing post-certified NC-FIX and RSS changes remain in the dirty worktree and were preserved.

## 46. Remaining Limitations

The live sample is small and provider conditions can change. Browser p50 is based on two valid renders. The direct live probe isolates the provider adapter; the browser samples cover the complete API/UI path but do not yet expose every server stage directly in the UI. The original NC-20260810-0001 record was not replayed or modified, by design. No failed provider, retry, fallback, rate-limit, or timeout sample was observed, so those distributions remain unmeasured.

## 47. Recommendation

Proceed to `NC-ACCEPT-001 - NC-0001 Learning-Loop Acceptance` with the permanent probe retained in regression. Defer `NC-FIX-005A` unless ongoing telemetry shows a repeated tail above an agreed product threshold or reproduces the original 1-2 minute behavior. If optimization becomes necessary, start with a targeted provider-response investigation because the evidence identifies that stage as the bottleneck.

## 48. Final Verdict

Task: NC-FIX-005 - AI Draft Latency Measurement

Final verdict: `NC_FIX_005_LATENCY_MEASUREMENT_VERIFIED`

Source finding: QC-001

Baseline HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`

Certified tag target: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`

Instrumentation added: YES

Production source changed: YES (metadata-only timing instrumentation)

Schema changed: NO

Migration: NONE

Latency stages measured: user action, request handling, pre-retrieval context/application work, retrieval, prompt construction, provider request, provider response body, structured parsing, draft processing, persistence, API-to-browser completion, frontend visible draft rendering

Deterministic samples: 10 process samples plus 1 mocked parser control

Deterministic p50: 5.707 ms

Live DeepSeek samples: 12 direct samples; 3 browser full-pipeline reproductions

Live DeepSeek successful: 12

Live DeepSeek failed: 0

DeepSeek total min: 1588.433 ms

DeepSeek total p50: 1917.018 ms

DeepSeek total mean: 1999.144 ms

DeepSeek total p90: 2426.435 ms

DeepSeek total p95: 2470.625 ms

DeepSeek total max: 2493.829 ms

Provider p50: 1916.774 ms

Provider p95: 2470.443 ms

Non-provider p50: 0.234 ms (direct adapter overhead)

Retrieval p50: approximately 0.05 ms (deterministic in-memory control)

Prompt construction p50: 0.041 ms

Parsing p50: 0.007 ms

Persistence p50: approximately 0.005 ms (deterministic in-memory control)

Browser perceived p50: 3993.078 ms

Slowest sample: sequential sample 9, 2493.829 ms total; 2269.105 ms response-body time; 601-character completion

Provider attempts: 12/12 succeeded on attempt 1

Retries observed: NO

Fallback observed: NO

Rate limiting observed: NO

Cold-start effect: INCONCLUSIVE

Light concurrency: DEGRADED

Primary bottleneck: PROVIDER_RESPONSE_BODY

Provider share of total: 99.99%

Performance severity: NOTICEABLE

QC-001 classification: MEASUREMENT_COMPLETE_NO_SYSTEMATIC_1_TO_2_MINUTE_DEFECT_CONFIRMED

Immediate optimization required: NO

Recommended optimization task: NONE; defer targeted provider investigation to NC-FIX-005A only if telemetry regresses

Permanent probe: `scripts/nc-fix-005-ai-draft-latency-probe.cjs`

Permanent probe: PASS

NC-FIX-001: PASS

NC-FIX-002: PASS

NC-FIX-003: PASS

NC-FIX-004: PASS

RSS-2.1: PASS

RSS-2.6: PASS

RSS-2.7: PASS

RSS-2.8: PASS

DeepSeek policy unchanged: YES

Claude active: NO

LM Studio activated by this task: NO

TypeScript: PASS

Prisma validation: PASS

Migration status: PASS

Production build: PASS

OIP Benchmark: 1000/1000

Critical security: 100%

Protected mature data changed: NO

Live provider calls: 21

Secret review: PASS

Disposable cleanup: PASS

Report: `docs/NC-FIX-005-AI-DRAFT-LATENCY-MEASUREMENT-REPORT.md`

Commit created: NO

Push performed: NO

Certified tags modified: NO

Remaining blockers: NONE

Recommended next step: NC-ACCEPT-001 - NC-0001 Learning-Loop Acceptance
