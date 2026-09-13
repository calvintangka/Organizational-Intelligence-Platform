# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:23:52.527Z
- Run finished: 2026-09-13T10:34:22.600Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| async | PASSED | 12 command(s) |
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

### async: probe:todo018-async-foundation

- Command: `npm.cmd run probe:todo018-async-foundation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo018-async-foundation
> node scripts/todo018-async-foundation-probe.cjs

TODO-018 async foundation probe passed: idempotency, single-lease ownership, retry scheduling, cancellation, worker completion, and ticket persistence.

```

### async: probe:todo072-worker-recovery

- Command: `npm.cmd run probe:todo072-worker-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo072-worker-recovery
> node scripts/todo072-worker-recovery-probe.cjs

{
  "jobId": "cmtzo3rlu0000vghzb7jv2vy4",
  "firstWorker": "todo072-crashed-worker",
  "restartedWorker": "todo072-restarted-worker",
  "attempts": [
    {
      "id": "cmtzo3rzl0001vghzf7kqvqxc",
      "jobId": "cmtzo3rlu0000vghzb7jv2vy4",
      "attemptNumber": 1,
      "workerId": "todo072-crashed-worker",
      "startedAt": "2026-09-13T10:25:00.589Z",
      "heartbeatAt": "2026-09-13T10:25:06.589Z",
      "finishedAt": "2026-09-13T10:25:06.589Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzo3wd7000mvghzks72g3b4",
      "jobId": "cmtzo3rlu0000vghzb7jv2vy4",
      "attemptNumber": 2,
      "workerId": "todo072-restarted-worker",
      "startedAt": "2026-09-13T10:25:06.656Z",
      "heartbeatAt": "2026-09-13T10:25:10.732Z",
      "finishedAt": "2026-09-13T10:25:10.732Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 3971,
      "safeDiagnostics": {
        "jobType": "bulk.analyze"
      }
    }
  ],
  "finalStatus": "succeeded",
  "tickets": 10
}

```

### async: probe:todo072-bulk-cancellation

- Command: `npm.cmd run probe:todo072-bulk-cancellation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo072-bulk-cancellation
> node scripts/todo072-bulk-cancellation-probe.cjs

{
  "queuedCancellation": "cancelled",
  "runningCancellation": "cancelled",
  "deadLetter": "dead_lettered",
  "operatorRetry": "queued",
  "attempts": [
    {
      "id": "cmtzo4t2i0004yshzb4fc6hsw",
      "jobId": "cmtzo4t110003yshzwv81vpx2",
      "attemptNumber": 1,
      "workerId": "todo072-dead-letter-worker",
      "startedAt": "2026-09-13T10:25:49.059Z",
      "heartbeatAt": "2026-09-13T10:25:49.118Z",
      "finishedAt": "2026-09-13T10:25:49.118Z",
      "outcome": "dead_lettered",
      "errorClass": "permanent_failure",
      "retryable": true
    }
  ]
}

```

### async: probe:todo072-bulk-parity

- Command: `npm.cmd run probe:todo072-bulk-parity`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo072-bulk-parity
> node scripts/todo072-bulk-parity-probe.cjs

{
  "rows": 100,
  "categoryParity": 100,
  "canonicalParity": 100,
  "memoryParity": 100,
  "lessonParity": 100,
  "languageParity": 100,
  "directMatureHits": 25,
  "asyncMatureHits": 25,
  "jobId": "cmtzo7bx3000m9ghzyqkhitqn"
}

```

### async: probe:todo073-reflection-recovery

- Command: `npm.cmd run probe:todo073-reflection-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo073-reflection-recovery
> node scripts/todo073-reflection-recovery-probe.cjs

{
  "jobId": "cmtzo9mip0002swhzqwghmcgc",
  "attempts": [
    {
      "id": "cmtzo9mwe0003swhzridqq13m",
      "jobId": "cmtzo9mip0002swhzqwghmcgc",
      "attemptNumber": 1,
      "workerId": "todo073-crashed-reflection-worker",
      "startedAt": "2026-09-13T10:29:33.984Z",
      "heartbeatAt": "2026-09-13T10:29:39.984Z",
      "finishedAt": "2026-09-13T10:29:39.984Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzo9rbl000vswhzn7xnorep",
      "jobId": "cmtzo9mip0002swhzqwghmcgc",
      "attemptNumber": 2,
      "workerId": "todo073-restarted-reflection-worker",
      "startedAt": "2026-09-13T10:29:40.070Z",
      "heartbeatAt": "2026-09-13T10:29:47.464Z",
      "finishedAt": "2026-09-13T10:29:47.464Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 7305,
      "safeDiagnostics": {
        "jobType": "reflection.generate"
      }
    }
  ],
  "preparedReflections": 1,
  "finalStatus": "succeeded"
}

```

### async: probe:todo073-reflection-cancel

- Command: `npm.cmd run probe:todo073-reflection-cancel`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo073-reflection-cancel
> node scripts/todo073-reflection-cancel-probe.cjs

{
  "queued": "cancelled",
  "running": "cancelled",
  "preparedReflections": 0,
  "unsafeReflectionRejected": true
}

```

### async: probe:todo073-reflection-parity

- Command: `npm.cmd run probe:todo073-reflection-parity`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo073-reflection-parity
> node scripts/todo073-reflection-parity-probe.cjs

{
  "english": {
    "jobId": "cmtzob9p80002q4hzu8awp9xr",
    "action": "create_new"
  },
  "indonesian": {
    "jobId": "cmtzobb3v000gq4hzuon2xjzm",
    "action": "create_new"
  },
  "crossLanguageParity": true,
  "promotionRequired": true
}

```

### async: probe:todo074-pattern-recovery

- Command: `npm.cmd run probe:todo074-pattern-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo074-pattern-recovery
> node scripts/todo074-pattern-recovery-probe.cjs

{
  "jobId": "cmtzockj90001iohzf0sfalq9",
  "attempts": [
    {
      "id": "cmtzockq00002iohzfz29kpc7",
      "jobId": "cmtzockj90001iohzf0sfalq9",
      "attemptNumber": 1,
      "workerId": "todo074-crashed-pattern-worker",
      "startedAt": "2026-09-13T10:31:51.319Z",
      "heartbeatAt": "2026-09-13T10:31:57.319Z",
      "finishedAt": "2026-09-13T10:31:57.319Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzocpbg0019iohz3yjt5zhv",
      "jobId": "cmtzockj90001iohzf0sfalq9",
      "attemptNumber": 2,
      "workerId": "todo074-restarted-pattern-worker",
      "startedAt": "2026-09-13T10:31:57.446Z",
      "heartbeatAt": "2026-09-13T10:31:59.353Z",
      "finishedAt": "2026-09-13T10:31:59.353Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 1839,
      "safeDiagnostics": {
        "jobType": "pattern.discover"
      }
    }
  ],
  "patterns": 1,
  "evidence": 1,
  "originalTicketStatus": "in_review",
  "finalStatus": "succeeded"
}

```

### async: probe:todo074-pattern-concurrency

- Command: `npm.cmd run probe:todo074-pattern-concurrency`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo074-pattern-concurrency
> node scripts/todo074-pattern-concurrency-probe.cjs

{
  "organizationA": "todo074-probe-concurrency-a-1789295544368",
  "organizationB": "todo074-probe-concurrency-b-1789295544368",
  "jobs": [
    "cmtzodexf0003gkhzdd9l17j6",
    "cmtzodfsa0004gkhzgygz0shc",
    "cmtzodfuw0005gkhznpnlp7cr"
  ],
  "patternsA": 1,
  "evidenceA": 2,
  "timesSeenA": 2,
  "patternsB": 1,
  "evidenceB": 1,
  "tenantIsolation": true,
  "duplicatePrevention": true
}

```

### async: probe:todo074-pattern-multilingual

- Command: `npm.cmd run probe:todo074-pattern-multilingual`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo074-pattern-multilingual
> node scripts/todo074-pattern-multilingual-probe.cjs

{
  "english": {
    "jobId": "cmtzoe8rh0002bohz0zzbcd7x",
    "action": "created"
  },
  "indonesian": {
    "jobId": "cmtzoe8sc0003bohzwn3nccaf",
    "action": "strengthened"
  },
  "patterns": 1,
  "evidence": 2,
  "languageNeutralIdentity": true,
  "decisionParity": true
}

```

### async: probe:todo075-worker-health

- Command: `npm.cmd run probe:todo075-worker-health`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo075-worker-health
> node scripts/todo075-probe.cjs worker-health

{
  "mode": "worker-health",
  "organizationId": "todo075-probe-1789295615051-cqg55",
  "totalJobs": 4,
  "workers": 100,
  "providers": [
    {
      "provider": "disabled",
      "sampleCount": 2,
      "successCount": 2,
      "failureCount": 0,
      "averageJobDurationMs": 4,
      "p95JobDurationMs": 7,
      "providerRequestMetrics": "unavailable",
      "measured": true
    }
  ],
  "runtime": {
    "sampleCount": 2,
    "averageMs": 4,
    "p95Ms": 7
  },
  "deadLetters": 1,
  "privacySafe": true
}

```

### async: probe:todo075-dead-letter

- Command: `npm.cmd run probe:todo075-dead-letter`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo075-dead-letter
> node scripts/todo075-probe.cjs dead-letter

{
  "mode": "dead-letter",
  "organizationId": "todo075-probe-1789295654366-woewb",
  "totalJobs": 4,
  "workers": 100,
  "providers": [
    {
      "provider": "disabled",
      "sampleCount": 2,
      "successCount": 2,
      "failureCount": 0,
      "averageJobDurationMs": 4,
      "p95JobDurationMs": 6,
      "providerRequestMetrics": "unavailable",
      "measured": true
    }
  ],
  "runtime": {
    "sampleCount": 2,
    "averageMs": 4,
    "p95Ms": 6
  },
  "deadLetters": 1,
  "privacySafe": true
}

```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
