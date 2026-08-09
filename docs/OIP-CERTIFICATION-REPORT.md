# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-08-07T10:01:12.593Z
- Run finished: 2026-08-07T10:01:29.515Z
- Release mode: no
- HEAD: `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb`
- Exact tag: `unavailable`
- Current branch: `master`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| live-acceptance | PASSED | 1 command(s) |
| report | GENERATED | artifact generated |

## Benchmark

Benchmark summary was not produced.

## TODO-079 Live Acceptance

TODO-079: 580/600 across 12 cases, repeated 2 time(s); deterministic execution passed; threshold 560/600.

## Memory Integrity

- Before snapshot available: yes
- After snapshot available: yes
- Unexpected memory mutations: 0

## Command Evidence

### live-acceptance: TODO-079 live acceptance

- Command: `npm.cmd run acceptance:todo079`
- Exit code: 0

```text

              "provider": "Disabled",
              "model": "todo079-deterministic",
              "proxyPath": "/todo079",
              "serverBaseUrl": "",
              "endpointUsed": "/todo079",
              "fallbackReason": "AI advisory is disabled.",
              "latencyMs": 0,
              "completionStatus": "skipped"
            },
            "persisted": true,
            "explainability": true
          },
          "checks": {
            "category": true,
            "intent": true,
            "canonical": true,
            "lesson": true,
            "draft": true,
            "security": true,
            "language": true,
            "diagnostics": true,
            "persistence": true,
            "explainability": true
          }
        }
      ]
    }
  ]
}

[output truncated]
```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
