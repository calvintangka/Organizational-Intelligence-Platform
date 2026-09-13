# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:41:00.726Z
- Run finished: 2026-09-13T10:46:34.249Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| performance | PASSED | 3 command(s) |
| report | GENERATED | artifact generated |

## Benchmark

Benchmark summary was not produced.

## TODO-079 Live Acceptance

TODO-079 acceptance summary was not produced.

## Memory Integrity

- Before snapshot available: yes
- After snapshot available: yes
- Unexpected memory mutations: 0

## Command Evidence

### performance: probe:todo064-performance

- Command: `npm.cmd run probe:todo064-performance`
- Exit code: 0

```text
ssRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "lesson_matching",
      "category": "bulk",
      "unit": "rows",
      "tags": {},
      "sampleCount": 1936,
      "averageMs": 0.011,
      "medianMs": 0.008,
      "p95Ms": 0.02,
      "p99Ms": 0.037,
      "standardDeviationMs": 0.039,
      "throughput": 21.88,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 25,
        "clusterSize": 25
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 50,
        "clusterSize": 50
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 100,
        "clusterSize": 100
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 250,
        "clusterSize": 250
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 500,
        "clusterSize": 500
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    },
    {
      "name": "clustering",
      "category": "bulk",
      "unit": "rows",
      "tags": {
        "rows": 1000,
        "clusterSize": 1000
      },
      "sampleCount": 1,
      "averageMs": 0,
      "medianMs": 0,
      "p95Ms": 0,
      "p99Ms": 0,
      "standardDeviationMs": 0,
      "throughput": 1000,
      "successRate": 1,
      "failureRate": 0,
      "timeoutRate": 0,
      "fallbackRate": 0
    }
  ]
}

[output truncated]
```

### performance: probe:todo075-performance

- Command: `npm.cmd run probe:todo075-performance`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo075-performance
> node scripts/todo075-probe.cjs performance

{
  "mode": "performance",
  "organizationId": "todo075-probe-1789296194342-yyo29",
  "totalJobs": 4,
  "workers": 100,
  "providers": [
    {
      "provider": "disabled",
      "sampleCount": 2,
      "successCount": 2,
      "failureCount": 0,
      "averageJobDurationMs": 2,
      "p95JobDurationMs": 3,
      "providerRequestMetrics": "unavailable",
      "measured": true
    }
  ],
  "runtime": {
    "sampleCount": 2,
    "averageMs": 2,
    "p95Ms": 3
  },
  "deadLetters": 1,
  "privacySafe": true
}

```

### performance: probe:todo025h-scale-responsiveness

- Command: `npm.cmd run probe:todo025h-scale-responsiveness`
- Exit code: 0

```text
tegory": "Billing",
        "canonical": "demo-ki-duplicate-invoice-seat-change",
        "lesson": "demo-les-duplicate-invoice-seat-change-001",
        "authorized": true,
        "draftSource": "deterministic"
      },
      "analysisMs": 50.60560000000987,
      "canonicalMs": 0.29120000000693835,
      "retrievalMs": 386.10010000001057,
      "selectionAuthorizationMs": 82.62210000000778,
      "draftingMs": 29.16140000001178
    },
    {
      "id": "fail-closed-weak-overlap",
      "summary": {
        "category": "Billing",
        "canonical": "demo-ki-invoice-currency-display",
        "lesson": "demo-les-invoice-currency-display-001",
        "authorized": false,
        "draftSource": "no_template"
      },
      "analysisMs": 28.129799999995157,
      "canonicalMs": 0.16179999997257255,
      "retrievalMs": 173.78529999998864,
      "selectionAuthorizationMs": 120.33179999998538,
      "draftingMs": 17.560699999972712
    },
    {
      "id": "paraphrase",
      "summary": {
        "category": "Authentication",
        "canonical": "demo-ki-sso-certificate-redirect-loop",
        "lesson": "demo-les-sso-certificate-redirect-loop-001",
        "authorized": true,
        "draftSource": "deterministic"
      },
      "analysisMs": 43.82740000000922,
      "canonicalMs": 0.17139999999199063,
      "retrievalMs": 269.5002000000095,
      "selectionAuthorizationMs": 160.84900000001653,
      "draftingMs": 26.34790000002249
    },
    {
      "id": "long-tail",
      "summary": {
        "category": "Mobile Application",
        "canonical": "demo-ki-mobile-offline-export-filters",
        "lesson": "demo-les-mobile-offline-export-filters-001",
        "authorized": true,
        "draftSource": "deterministic"
      },
      "analysisMs": 17.61579999999958,
      "canonicalMs": 0.136400000017602,
      "retrievalMs": 156.4539999999979,
      "selectionAuthorizationMs": 17.5,
      "draftingMs": 7.422500000015134
    }
  ],
  "structuralAudit": {
    "counts": {
      "knowledge": 47,
      "lessons": 181,
      "versions": 133,
      "tickets": 5184,
      "candidates": 1805,
      "validations": 1804,
      "changes": 1804,
      "evidence": 4500,
      "patterns": 50
    },
    "issues": [],
    "issueDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
  },
  "growthAudit": {
    "counts": {
      "knowledge": 48,
      "lessons": 182,
      "versions": 134,
      "tickets": 5185,
      "candidates": 1806,
      "validations": 1805,
      "changes": 1805,
      "evidence": 4501,
      "patterns": 51
    },
    "issues": [],
    "issueDigest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
  },
  "replayDeterministic": true,
  "dataSafety": "protected snapshots unchanged"
}
TODO-025H scale/responsiveness audit probe passed. Timings are local direct persistence timings; HTTP transport, browser JSON parsing, and development compilation are intentionally reported separately as measurement limits.

[output truncated]
```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
