# TODO-062A Bulk Upload Reliability Report

## Verdict

**RELIABILITY_DEFECT_FOUND** — root cause identified, reproduced, fixed, and verified.

The pipeline was never actually deadlocked. It was doing real work with **zero progress
reporting**, for a duration that is unbounded and data-dependent. The UI pinned on
`Analyzing csv row 100 (99%)` is therefore indistinguishable from a hang, and until now
there was no cancel path and no wall-clock ceiling, so a slow-enough provider genuinely
never terminated.

## Root Cause

Three defects compound into the reported symptom.

**RC-1 (primary) — the clustering phase emitted no progress events.**
`analyzeBulkEntries` in [lib/bulkUpload.ts](lib/bulkUpload.ts) reported progress only
inside the per-row loop and then once more at the very end. Every AI call in the
post-loop cluster pass ran between those two events. Measured on a live 100-row run:

| | before |
|---|---|
| total runtime | 166,353 ms |
| runtime inside the silent window | **165,484 ms (99.5%)** |
| longest gap with no progress event | 165,484 ms |
| label displayed for that entire window | `Analyzing csv row 100 (99%)` |

The row loop itself finished all 100 rows in **869 ms**. It makes no AI calls at all for
this dataset — `findCanonicalProblem` returns no `existingMatch`, so `discriminateMatch`
is never invoked. **100% of the AI cost lives in the phase that reported nothing.**

**RC-2 — the row loop alone was mapped onto 0-100%.**
Progress was emitted *before* each row with `completed = index`, so for a 100-row file
the terminal row event is `round(99/100 × 100) = 99%`. 99% was structurally unreachable
past — the last row could never display 100% even with clustering removed entirely.
This is why the number is always exactly 99%.

**RC-3 — no wall-clock ceiling, no cancellation, no watchdog.**
Cluster count is data-dependent and unbounded (up to one cluster per row). At a measured
~28-45 s per provider round-trip, a heterogeneous 100-row CSV producing 40 clusters sits
frozen for ~25 minutes; 100 clusters for ~50 minutes. A provider promise that never
settles pinned the run forever. There was no Cancel button and no deadline.

## Pipeline Trace

```
File picker ──► BulkUploadWorkspace.readFile()          components/views/BulkUploadWorkspace.tsx
   │
   ├─► parseBulkUploadFile()                            lib/bulkUpload.ts:388
   │      detectFormat → parseCsv → extractEntriesFromObjectRows → maybeTruncateEntries
   │      (synchronous, no I/O; 100 rows parse in <10 ms)
   │
   └─► startAnalysis() ──► onAnalyze ──► analyzeUploadedQueries()      app/page.tsx:1275
          └─► analyzeBulkEntries()                      lib/bulkUpload.ts:614

              PHASE 1 — row loop (per entry)                    ◄── was 0-100% of the bar
                updateProgress("Analyzing <sourceLabel>")
                buildBulkTicket
                assessBusinessRelevanceForProfile      ─┐
                understandForProfile                    │ deterministic,
                identifyCanonicalProblem                │ ~9 ms/row
                findCanonicalProblem                   ─┘
                [AI] discriminateMatch  ◄── only when existingMatch ≠ null (never, here)
                deriveConfidence
                yield to event loop every 25 rows

              PHASE 2 — bucket + group  (synchronous, instant)

              PHASE 3 — cluster loop (per cluster)             ◄── NO PROGRESS AT ALL
                findMatchingLesson
                [AI] suggestCanonicalProblem  ◄── ~28-45 s each, 1 per cluster
                build BulkCluster

              PHASE 4 — finalize
                failure-rate → analysisMode
                updateProgress("Analysis complete", 100%)   ◄── first event since phase 1

              returns BulkAnalysisResult  (pure — writes nothing)
```

Provider chain per AI call: `withFallback` in [lib/ai/adapter.ts](lib/ai/adapter.ts) →
Tier 1 LM Studio → Tier 2 Claude API → deterministic. In the browser both tiers are
same-origin proxies (`/api/ai/chat`, `/api/ai/claude`); server-side they call upstream
directly.

**Where 99% can occur:** exactly one place — the window between the final
`updateProgress` of phase 1 and the terminal one in phase 4, i.e. the whole of phase 3.

## Reproduction Matrix

Harness: [scripts/todo062a-bulk-reliability-probe.cjs](scripts/todo062a-bulk-reliability-probe.cjs).
Fixture: 100-row CSV from `scripts/todo062-generate-fixture.cjs`. Org: `profile-oip-developer-demo`
(45 knowledge items, 180 lessons).

### Before the fix

| rows | mode | elapsed | AI calls | longest silent gap | label during it | terminal % |
|---|---|---|---|---|---|---|
| 25 | live | 54,331 ms | 2 (0 ok) | 54,062 ms | `Analyzing csv row 25 (96%)` | 100 |
| 100 | live | 166,353 ms | 6 (0 ok) | **165,484 ms** | **`Analyzing csv row 100 (99%)`** | 100 |
| 10-100 | instant | <1 s | n/a | <25 ms | — | 100 |

The stall scales with **cluster count**, not row count — which is why it looked
nondeterministic across runs.

### After the fix

| rows | elapsed | progress events | last row label | longest gap | reaches 100% |
|---|---|---|---|---|---|
| 1 | 44 ms | 4 | `Analyzing csv row 1 (0%)` | 43 ms | yes |
| 10 | 109 ms | 13 | `Analyzing csv row 10 (72%)` | 15 ms | yes |
| 25 | 213 ms | 29 | `Analyzing csv row 25 (77%)` | 10 ms | yes |
| 50 | 364 ms | 56 | `Analyzing csv row 50 (78%)` | 12 ms | yes |
| 75 | 649 ms | 82 | `Analyzing csv row 75 (79%)` | 21 ms | yes |
| 100 | 821 ms | 108 | `Analyzing csv row 100 (79%)` | 18 ms | yes |

Live 100-row run after the fix: **211,059 ms, longest gap 44,863 ms**, and that gap is
now labelled `Clustering 1 of 6: Login Issue (80%)` — a visible, cancellable, single
provider round-trip instead of a 165-second void.

**Smallest dataset that reproduces the stall:** any dataset producing ≥1 cluster — even
1 row. The 100-row case was simply the first where the silent window (6 clusters ×
~28 s) grew long enough to look permanent.

## Provider Findings

LM Studio, `google/gemma-4-e4b`, measured directly against `http://127.0.0.1:1234/v1`:

| max_tokens | latency | finish_reason | completion tokens | reasoning tokens | JSON parses |
|---|---|---|---|---|---|
| 400 | 27,710 ms | **length** | 400 (capped) | 397 | **no** |
| 400 | 26,151 ms | **length** | 400 (capped) | 397 | **no** |
| 700 | 39,393 ms | stop | 597 | 535 | yes |
| 700 | 37,342 ms | stop | 566 | 500 | yes |
| 1000 | 35,111 ms | stop | 523 | 469 | yes |

- **HTTP status:** 200 throughout. LM Studio was healthy the whole time.
- **`finish_reason=length` does NOT cause the stall.** It fails fast and the chain
  degrades correctly. It was a *quality* defect, not a liveness one — but a total one:
  **6 of 6 cluster advisory calls failed on the pre-fix 100-row run**, each burning a full
  ~27 s round-trip to return nothing. This is a thinking model; 397 of the 400-token
  budget went to reasoning before a single character of JSON was emitted.
- **The stall is inside OIP**, in progress reporting — confirmed by the instant-provider
  runs, which reproduce the terminal-99% behaviour with zero provider latency.
- **Tier 2 Claude API returns HTTP 404 on every call.** The `ANTHROPIC_API_KEY` in
  `.env.local` is not valid for the Messages API, so there is currently **no working
  fallback tier** — every LM Studio failure falls straight through to deterministic. See
  Remaining Findings.
- **Prompt size** is small and not a factor: 586 prompt tokens, ~2,790 chars.
- **The browser proxy discarded the caller's requested timeout.** `suggestCanonicalProblem`
  and `discriminateMatch` request `timeoutMs: 90000`, but in the browser the request goes
  to `/api/ai/chat`, which applied its own `AI_TIMEOUT_MS` (30,000). Against measured
  28-45 s latencies, browser bulk calls were being cut off just short of succeeding while
  the same calls succeeded server-side. This alone made the defect look browser-specific.

## Async Findings

- No deadlock, no unresolved promise chain, no missing `await` in the pre-fix code.
- The row loop yields to the event loop every 25 rows; the browser tab stays responsive.
- **Gap found:** provider calls were unguarded. A provider that *throws* (rather than
  returning `{ok: false}`) propagated out of `analyzeBulkEntries` and discarded the entire
  run. Verified pre-fix: injecting `socket hang up` at the cluster stage killed a 100-row
  run outright (`reached100: false`, no result).
- **Gap found:** a provider promise that never settles pinned the pipeline permanently.
  Each tier sets its own `AbortController`, but that only covers requests the tier knows
  about — nothing bounded the call from the pipeline's side.
- Both are now closed by `callAdvisory`, which races every advisory call against a
  watchdog and converts any throw into a graceful "no advisory".
- **Incidental bug fixed:** in the `discriminateMatch` branch, `aiCallAttempts` was
  incremented only on failure while `aiCallFailures` was incremented alongside it, so that
  path's failure rate was pinned at 1.0 regardless of how many calls actually succeeded.
  Attempts are now counted on every call, which is what the F-3 majority-failure threshold
  was written to assume.

## Progress Findings

The bar now spans both phases, so clustering can no longer masquerade as a stalled row:

| phase | range | event label |
|---|---|---|
| `analyzing` | 0 → 80% | `Analyzing csv row N` |
| `analyzing` (phase end) | 80% | `Analyzed 100 queries` |
| `clustering` | 80 → 99% | `Clustering 3 of 6: Login Issue` |
| `complete` | 100% | `Analysis complete` |

`BulkAnalysisProgress` gained a required `phase` field so the UI can distinguish "still
reading rows" from "clustering rows it already read". Verified across 1/10/25/50/75/100
rows: every run reaches 100%, and no run ends on a row-phase label.

## Failure Handling

Controlled failures injected at the provider boundary, 100 rows each, **after** the fix:

| injected failure | elapsed | escaped exception | reaches 100% | rows preserved | resulting mode |
|---|---|---|---|---|---|
| provider timeout | 925 ms | none | yes | 70/100 clustered + 30 unclustered | deterministic_fallback |
| HTTP 500 | 897 ms | none | yes | 70/100 | deterministic_fallback |
| HTTP 502 | 927 ms | none | yes | 70/100 | deterministic_fallback |
| malformed JSON | 888 ms | none | yes | 70/100 | deterministic_fallback |
| truncated (`finish_reason=length`) | 931 ms | none | yes | 70/100 | deterministic_fallback |
| disconnect (throws) | 921 ms | none | yes | 70/100 | deterministic_fallback |
| **never settles** | **180,011 ms** | none | yes | 70/100 | deterministic_fallback |
| operator cancel | 278 ms | `BulkAnalysisCancelledError` | n/a — cancelled | none | n/a |

Pre-fix, `disconnect` lost the whole run and `never settles` never returned at all.

The 180,011 ms figure is the AI advisory budget exactly. Because the per-call watchdog is
clamped to the remaining budget, total AI time is a **hard ceiling**, not "budget plus one
in-flight overrun". Even against a completely dead-but-connected provider, a 100-row
upload now terminates in ~3 minutes with a complete, usable, deterministic result — and
the operator can cancel at any point before that.

## Regression Results

| check | result |
|---|---|
| TypeScript (`tsc --noEmit`) | clean |
| Production build (`next build`) | clean, all 21 routes |
| 1 / 10 / 25 / 50 / 75 / 100-row uploads | all reach 100% |
| TODO-060 business inquiry | PASS |
| TODO-061 business memory | PASS |
| TODO-050 customer context | PASS |
| TODO-052 canonical-lesson coherence | PASS |
| TODO-058 multilingual | PASS |
| TODO-048 root-cause safety | PASS |
| TODO-049 reporting coherence | PASS |
| TODO-044 classification | PASS |
| TODO-045 semantic lesson | PASS |
| TODO-047 canonical ranking | PASS |
| TODO-051 match explainability | PASS |
| TODO-053 tiebreak determinism | PASS |
| TODO-056 controlled threshold | PASS |
| TODO-038 Claude failover | PASS |

Password reset, billing, activation and login categories are all exercised by the
100-row fixture (10 categories × 10 rows, 50 English / 50 Indonesian) and cluster
correctly in every run.

## Performance

| metric | 100 rows |
|---|---|
| CSV parse | <10 ms |
| Row phase (deterministic, 100 rows) | 821-869 ms (~8.7 ms/row) |
| Cluster phase, provider healthy | ~45 s per cluster |
| Heap delta across a run | -32 MB (net negative; GC reclaims more than the run allocates) |
| Peak additional heap | ~13 MB at 75 rows |

No memory growth concern. Runtime is dominated entirely by provider latency in the
cluster phase, and cluster count — not row count — is the scaling factor.

## Data Safety

`analyzeBulkEntries` is pure analysis: it performs no persistence, and clusters are only
written when a human explicitly commits one via `prepareBulkClusterCommit`. Verified by
comparing `docs/TODO-062-BASELINE.json` against a fresh capture after all probe runs
(including 6 failure-injection runs and two full live 100-row runs):

| table | baseline | after | delta |
|---|---|---|---|
| knowledge_items | 45 | 45 | 0 |
| knowledge_candidates | 1802 | 1802 | 0 |
| ticket_records | 5003 | 5003 | 0 |
| validation_records | 1801 | 1801 | 0 |
| memory_change_records | 1801 | 1801 | 0 |
| trust_evidence | 4500 | 4500 | 0 |
| emerging_patterns | 46 | 46 | 0 |
| ticket_sequences.counter | 5003 | 5003 | 0 |

No partial writes, no orphan tickets, no half-created candidates. Cancelling mid-run
changes nothing, because nothing is written during analysis in the first place.

## Remaining Findings

1. **`ANTHROPIC_API_KEY` in `.env.local` is invalid — Tier 2 returns HTTP 404 on every
   call.** The failover chain is effectively one tier deep right now. The key is also
   committed in plaintext in a tracked-adjacent file and is visible in this working tree;
   it should be **rotated and moved out of the repo** regardless of validity. Not fixed
   here — credential handling is outside this task's scope and not something to automate.
2. **AI advisory budget default (180 s) is a product decision.** On the 100-row fixture,
   5 of 6 clusters get AI treatment and the 6th falls back to deterministic reasoning.
   That is the bound working as designed, but if richer clustering matters more than a
   3-minute ceiling, raise `aiBudgetMs`. It is plumbed through `analyzeBulkEntries` input.
3. **`gemma-4-e4b` spends ~500 tokens reasoning per advisory call.** Latency is dominated
   by reasoning, not output. A non-thinking model, or disabling reasoning, would cut
   cluster-phase time by roughly 5×. Out of scope (prompting/model selection).
4. **Not verified in the browser UI.** The app is behind a login form and I do not enter
   credentials. The Cancel button and phase label are covered by `tsc`, the production
   build, and pipeline-level probes driving the same `onProgress`/`signal` contract the UI
   wires up, but the rendered control itself has not been clicked. Worth one manual pass.
5. **Row-phase AI path is untested against real data.** `discriminateMatch` was never
   invoked in any run because `findCanonicalProblem` returned no match for any of the 100
   fixture rows. That is worth a separate look — 100 support tickets against 45 knowledge
   items producing zero existing-memory matches is itself a suspicious retrieval result,
   and it is why the row phase is currently so fast.

## TODO-062A Status

**COMPLETE.** All seven success criteria met:

1. 100-row uploads terminate — verified live (211 s healthy) and under every injected
   failure (≤180 s worst case).
2. No permanent 99% state exists — 99% is no longer reachable as a terminal value; the
   row phase now tops out at 80%.
3. Provider failures exit cleanly — 7/7 failure modes complete with a usable result.
4. Progress always reaches 100% or an explicit cancellation/failure.
5. No orphan persistence — analysis writes nothing; verified against the DB baseline.
6. No mature data changed — all 8 developer-demo counters identical.
7. Developer Mode stable — 14 regression probes pass, production build clean.

TODO-062 is unblocked.

## Commit

See the accompanying commit touching:

- `lib/bulkUpload.ts` — phased progress, cancellation, AI budget, per-call watchdog,
  guarded advisory calls
- `types/bulkUpload.ts` — `BulkAnalysisPhase`, `phase` on `BulkAnalysisProgress`
- `components/views/BulkUploadWorkspace.tsx` — Cancel button, phase-aware label,
  cancellation messaging
- `app/page.tsx` — thread `signal` into `analyzeBulkEntries`
- `lib/ai/lmStudio.ts` — `max_tokens` 400 → 700 for both bulk calls; forward requested
  timeout when proxied
- `app/api/ai/chat/route.ts`, `app/api/ai/claude/route.ts` — honour caller-requested
  timeout (clamped)
- `scripts/todo062a-bulk-reliability-probe.cjs` — reproduction and verification harness
