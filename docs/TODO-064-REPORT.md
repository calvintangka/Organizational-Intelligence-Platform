# TODO-064 Performance Instrumentation & Telemetry Report

## Verdict

COMPLETED_WITH_LIMITATIONS

The removable instrumentation, statistical aggregation, developer dashboard, and read-only stress probe are implemented. The local probe intentionally uses deterministic AI and does not write production data, so live provider, database-transaction, and browser-interaction samples remain workload-dependent.

## Instrumented Pipeline

```mermaid
flowchart LR
  A[Ticket intake] --> B[Language detection]
  B --> C[Business relevance]
  C --> D[Understanding and domain classification]
  D --> E[Canonical selection]
  E --> F[Memory retrieval]
  F --> G[Lesson matching]
  G --> H[AI analysis and drafting]
  H --> I[Reflection]
  I --> J[Validation commit]
  J --> K[Knowledge promotion]
  K --> L[Memory change commit]
  L --> M[Organization metrics update]
```

Single-ticket total timing is recorded as `ticket_processing`. Bulk parsing, ticket creation, analysis, classification, retrieval, lesson matching, clustering, promotion, progress intervals, and overall runtime are recorded separately.

## Stage Timing

The read-only probe (`npm run probe:todo064-performance`) measured 161 single-ticket samples:

| Stage | Average | Median | P95 | P99 | Stddev | Samples |
|---|---:|---:|---:|---:|---:|---:|
| Business relevance | 1.0 ms | 0.9 ms | 1.7 ms | 2.3 ms | 0.9 ms | 161 |
| Domain classification | 0.3 ms | 0.3 ms | 0.7 ms | 0.8 ms | 0.2 ms | 161 |
| Understanding | 4.4 ms | 4.1 ms | 6.2 ms | 8.3 ms | 1.4 ms | 161 |
| Canonical selection | 0.0 ms | 0.0 ms | 0.0 ms | 0.1 ms | 0.0 ms | 161 |
| Memory retrieval | 0.1 ms | 0.1 ms | 0.1 ms | 0.3 ms | 0.0 ms | 161 |
| AI drafting (deterministic path) | 0.0 ms | 0.0 ms | 0.1 ms | 0.2 ms | 0.0 ms | 161 |

Sub-millisecond values are measured values rounded to one decimal place in this report; the dashboard retains three decimal places.

## Provider Timing

LM Studio and Claude API calls are measured independently at request, response-body, JSON parsing, retry/failover, and fallback boundaries. Provider events include success, failure, timeout, and fallback tags. No live provider call was made by the safe probe, so this report does not claim latency or success values for an unavailable provider.

## Database Timing

The persistence adapters measure ticket, knowledge, candidate, validation, memory, trust, pattern, organization profile, metrics, and transaction operations. Server persistence additionally measures each database read and transaction boundary. The read-only probe did not execute writes and therefore reports no fabricated database values.

## Bulk Processing Results

Measured with deterministic AI disabled and no persistence writes:

| Rows | Runtime | Rows/sec |
|---:|---:|---:|
| 1 | 4.6 ms | 216.6 |
| 10 | 36.9 ms | 271.3 |
| 25 | 77.3 ms | 323.3 |
| 50 | 177.8 ms | 281.2 |
| 100 | 319.0 ms | 313.5 |
| 250 | 757.8 ms | 329.9 |
| 500 | 2,053.6 ms | 243.5 |
| 1,000 | 4,551.7 ms | 219.7 |

Each size was measured once in this smoke run. Consequently its median/P95/P99 equal that measured sample; the dashboard computes those percentiles over all retained production events when repeated workloads are run.

## UI Timing

Measured UI boundaries are present for page load, organization switch, ticket submission, bulk upload, analysis progress, refresh, review commit, and memory commit. UI events contain metadata only and are throttled in the dashboard subscription to avoid render churn during large uploads.

## Performance Dashboard

The existing Dashboard view now exposes live measured values for average ticket time, retrieval, drafting, reflection, promotion, bulk throughput, slowest stage/current bottleneck, provider latency, success/failure/timeout/fallback rates, and latency distribution (minimum, maximum, average, median, P95, P99, standard deviation, sample count).

## Bottleneck Analysis

For the deterministic smoke workload, understanding was the slowest repeated single-ticket stage at 4.4 ms average. At bulk scale, the measured 1,000-row run was the longest supported workload at 4,551.7 ms. These are observations only; no optimization was performed.

## Stress Results

Single-ticket stress workloads of 1, 10, 50, and 100 tickets were executed. Measured total runtimes were 30 ms, 52 ms, 177 ms, and 361 ms respectively in the probe process. Bulk workloads covered 1, 10, 25, 50, 100, 250, 500, and 1,000 rows. Multilingual, business-inquiry, new-knowledge, existing-knowledge, and mixed behavior remain protected by the regression probes; live AI/database timings for those paths are collected when exercised in the app.

## Regression Results

- `tsc --noEmit`: PASS
- `next build`: PASS
- TODO-044 classification/provenance/snapshot probe: PASS
- TODO-058 multilingual probe: PASS
- TODO-062D reflection safety probe: PASS
- TODO-064 read-only performance probe: PASS

## Data Safety

Telemetry is a bounded process-local event store. It records duration, status, unit, quantity, operation, provider/backend labels, and safe numeric progress metadata only. It does not persist ticket text, prompts, knowledge, lessons, trust, versions, organizational memory, or business metrics, and removing `lib/telemetry.ts` hooks does not alter processing results.

## Remaining Findings

No production behavior change was observed. A live provider run and browser interaction run are still required before provider/database/UI rates can be considered representative of deployment conditions. The probe intentionally does not fabricate those values.

## Recommendations

Use the dashboard during representative LM Studio/Claude, server-persistence, multilingual, business-inquiry, and mixed bulk sessions. Treat the measured slowest stage as a diagnostic signal only; optimization is outside TODO-064.

## TODO-064 Status

COMPLETED_WITH_LIMITATIONS

## Commit

No commit created; changes remain in the working tree for review.
