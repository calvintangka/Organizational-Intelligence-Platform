# OIP Certification Report

- Verdict: **REGRESSION_FAILURE**
- Run started: 2026-09-13T09:59:05.315Z
- Run finished: 2026-09-13T10:09:06.890Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| regression | FAILED | 16 command(s) |
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

### regression: probe:todo058-multilingual

- Command: `npm.cmd run probe:todo058-multilingual`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo058-multilingual
> node scripts/todo058-multilingual-probe.cjs

TODO-058 multilingual foundation probe

  PASS  B: every supported language is detected from a full ticket
  PASS  B: short subjects are still detected
  PASS  B: detection is deterministic and provider-independent
  PASS  B: empty and unusable input falls back without inventing a language
  PASS  B: all ten required languages are supported
  PASS  folding preserves every script and folds diacritics
  PASS  E: one concept carries every language's wording
  PASS  E: aliases in different languages resolve to ONE concept id
  PASS  E: concept normalization drops malformed rows and merges duplicate ids
  PASS  E: organization concepts extend built-ins without duplicating them
  PASS  K: equivalent tickets in ten languages reach the SAME concepts
  PASS  K: concept matching does not fire on unrelated text
  PASS  F: default policy replies in the customer's language
  PASS  F: organization-language mode ignores the detected language
  PASS  F: fixed-language mode always replies in the configured language
  PASS  F: a low-confidence detection never picks the reply language
  PASS  F: malformed stored policy is coerced, never trusted
  PASS  F: the prompt instruction names exactly one language
  PASS  L: a profile with no language settings is unchanged by normalization
  PASS  L: configured language settings survive normalization
  PASS  L: the shipped English signal matcher is untouched
  PASS  058A/B: non-linguistic input never reads as a confident detection
  PASS  058A/B: every detection is finite, bounded, and internally consistent
  PASS  058A/B: the organization default is used only when nothing was detected
  PASS  058A/B: mixed-language input does not confidently pick the minority language
  PASS  058A/C: folding is derived — it never mutates the caller's string
  PASS  058A/C: dakuten and handakuten survive folding as distinct characters
  PASS  058A/C: accented Latin folds to its base letter rather than breaking apart
  PASS  058A/D: alias resolution is deterministic across repeated builds
  PASS  058A/D: unknown text never invents a concept
  PASS  058A/D: no concept id carries a language suffix
  PASS  058A/G: an older client omitting language settings cannot erase them
  PASS  058A/G: an explicit change still overwrites the stored value
  PASS  058A/G: a ticket with no language metadata still loads safely
  PASS  058A/I: detection, concepts, and policy run with every provider unavailable
  PASS  058A/H: the ticket panel labels detected, assumed, and reviewer-set distinctly
  PASS  058A/H: a reviewer override is recorded as a decision, not as a detection
  PASS  058A/H: both intake paths record language metadata
  PASS  058A/F: both provider tiers share one prompt builder

TODO-058 probe passed: detection, concept vocabulary, and response language policy are language-neutral.

```

### regression: probe:todo058b-language-neutral-retrieval

- Command: `npm.cmd run probe:todo058b-language-neutral-retrieval`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo058b-language-neutral-retrieval
> node scripts/todo058b-language-neutral-retrieval-probe.cjs

TODO-058B language-neutral retrieval probe

  PASS  M: "login" reaches ONE canonical across all ten languages
  PASS  M: "invoice" reaches ONE canonical across all ten languages
  PASS  M: "mfa_device" reaches ONE canonical across all ten languages
  PASS  M: "delivery" reaches ONE canonical across all ten languages
  PASS  M: no canonical or category id is language-scoped
  PASS  M: repeated runs are deterministic
  PASS  O: English tickets never take the concept-assist path
  PASS  O: concept assist is recorded only where it was actually used
  PASS  N: non-problem input never becomes relevant or categorized
  PASS  N: identifiers contribute no CONCEPT evidence
  PASS  N: email entities and malformed identifiers remain non-semantic
  PASS  M: mixed-language invoice evidence converges without leaking quoted history
  PASS  M: multiple and whitespace-separated invoice evidence stays deterministic
  PASS  N: generic concepts alone never establish relevance or a category
  PASS  N: a single weak alias does not authorize a category
  PASS  N: unsupported-language text fails closed rather than guessing
  PASS  B: extraction never mutates ticket text and never invents concepts
  PASS  B: repeated aliases do not inflate evidence
  PASS  B: organization aliases are attributed to the organization

TODO-058B probe passed: deterministic retrieval is language-neutral and English behavior is preserved.

```

### regression: probe:todo060-business-inquiry

- Command: `npm.cmd run probe:todo060-business-inquiry`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo060-business-inquiry
> node scripts/todo060-business-inquiry-probe.cjs

TODO-060 business inquiry probe: PASS

```

### regression: probe:todo061-business-memory

- Command: `npm.cmd run probe:todo061-business-memory`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo061-business-memory
> node scripts/todo061-business-memory-probe.cjs

TODO-061 business memory probe: PASS

```

### regression: probe:todo062d-reflection

- Command: `npm.cmd run probe:todo062d-reflection`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo062d-reflection
> node scripts/todo062d-reflection-probe.cjs

TODO-062D reflection safety probe passed: safe lessons are accepted, unsafe reflections are rejected, and lesson provenance is opaque.

```

### regression: probe:todo064-performance

- Command: `npm.cmd run probe:todo064-performance`
- Exit code: 0

```text
successRate": 1,
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
      "averageMs": 0.031,
      "medianMs": 0.012,
      "p95Ms": 0.028,
      "p99Ms": 0.098,
      "standardDeviationMs": 0.54,
      "throughput": 13.855,
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
        "rows": 1,
        "clusterSize": 1
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
    }
  ]
}

[output truncated]
```

### regression: probe:todo067-atomic-validation

- Command: `npm.cmd run probe:todo067-atomic-validation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo067-atomic-validation
> node scripts/todo067-atomic-validation-probe.cjs

TODO-067 atomic validation probe passed: rollback, delayed bypass prevention, replay, concurrency, stale revision, tenant isolation, and local/server parity.

```

### regression: probe:todo068-ticket-application-service

- Command: `npm.cmd run probe:todo068-ticket-application-service`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo068-ticket-application-service
> node scripts/todo068-ticket-application-service-probe.cjs

TODO-068 ticket application service probe: PASS

```

### regression: probe:todo069-learning-application-service

- Command: `npm.cmd run probe:todo069-learning-application-service`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo069-learning-application-service
> node scripts/todo069-learning-application-service-probe.cjs

TODO-069 learning application service probe: PASS

```

### regression: probe:todo070-stateless-persistence

- Command: `npm.cmd run probe:todo070-stateless-persistence`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo070-stateless-persistence
> node scripts/todo070-stateless-persistence-probe.cjs

TODO-070 stateless persistence probe: PASS

```

### regression: probe:todo072-async-bulk

- Command: `npm.cmd run probe:todo072-async-bulk`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo072-async-bulk
> node scripts/todo072-async-bulk-probe.cjs

{
  "fixtureRows": 100,
  "skippedRows": 0,
  "organizationId": "todo072-probe-bulk-1789293976314",
  "jobId": "cmtznfpub00007whz99itb49k",
  "type": "bulk.analyze",
  "version": 1,
  "idempotencyKey": "bulk-d5ccce9c",
  "inputDigest": "8e63a068",
  "status": "succeeded",
  "progress": {
    "stage": "succeeded",
    "total": 100,
    "percent": 100,
    "completed": 100,
    "updatedAt": "2026-09-13T10:06:33.468Z"
  },
  "attemptCount": 1,
  "leaseOwner": null,
  "resultDigest": "d669963c",
  "ticketCount": 100,
  "entryCount": 100,
  "attempts": [
    {
      "id": "cmtznfr9t00057whzt33wkiw9",
      "jobId": "cmtznfpub00007whz99itb49k",
      "attemptNumber": 1,
      "workerId": "todo072-bulk-worker-1",
      "startedAt": "2026-09-13T10:06:20.213Z",
      "heartbeatAt": "2026-09-13T10:06:33.468Z",
      "finishedAt": "2026-09-13T10:06:33.468Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 13045,
      "safeDiagnostics": {
        "jobType": "bulk.analyze"
      }
    }
  ]
}

```

### regression: probe:todo073-reflection-worker

- Command: `npm.cmd run probe:todo073-reflection-worker`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo073-reflection-worker
> node scripts/todo073-reflection-worker-probe.cjs

{
  "organizationId": "todo073-probe-worker-1789294031778",
  "userId": "cmtzngx2w0001xohz11uwcd8c",
  "jobId": "cmtzngxb40002xohz8bkfdqoe",
  "type": "reflection.generate",
  "status": "succeeded",
  "progress": {
    "stage": "succeeded",
    "total": 4,
    "percent": 100,
    "completed": 4,
    "updatedAt": "2026-09-13T10:07:18.341Z"
  },
  "preparedReflectionId": "cmtzngzuh000hxohzmecs35xs",
  "attemptCount": 1,
  "attempts": [
    {
      "id": "cmtzngzcq0009xohz9in49pta",
      "jobId": "cmtzngxb40002xohz8bkfdqoe",
      "attemptNumber": 1,
      "workerId": "todo073-reflection-worker-a",
      "startedAt": "2026-09-13T10:07:17.341Z",
      "heartbeatAt": "2026-09-13T10:07:18.341Z",
      "finishedAt": "2026-09-13T10:07:18.341Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 800,
      "safeDiagnostics": {
        "jobType": "reflection.generate"
      }
    }
  ],
  "before": {
    "knowledge": 0,
    "candidates": 0,
    "validations": 0,
    "memoryChanges": 0,
    "trustEvidence": 0,
    "prepared": 0
  },
  "after": {
    "knowledge": 0,
    "candidates": 0,
    "validations": 0,
    "memoryChanges": 0,
    "trustEvidence": 0,
    "prepared": 1
  },
  "promotionRequired": true
}

```

### regression: probe:todo074-pattern-worker

- Command: `npm.cmd run probe:todo074-pattern-worker`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo074-pattern-worker
> node scripts/todo074-pattern-worker-probe.cjs

{
  "organizationId": "todo074-probe-worker-1789294062745",
  "jobId": "cmtznhok400017khzf9qnsba8",
  "status": "succeeded",
  "action": "created",
  "patternId": "pattern-e1ab24d8",
  "evidenceCount": 1,
  "attempts": [
    {
      "id": "cmtznhqd400067khzly07lw61",
      "jobId": "cmtznhok400017khzf9qnsba8",
      "attemptNumber": 1,
      "workerId": "todo074-pattern-worker",
      "startedAt": "2026-09-13T10:07:52.385Z",
      "heartbeatAt": "2026-09-13T10:07:53.631Z",
      "finishedAt": "2026-09-13T10:07:53.631Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 1087,
      "safeDiagnostics": {
        "jobType": "pattern.discover"
      }
    }
  ],
  "queuedCancellation": "cancelled",
  "noOp": "no_pattern",
  "retry": "succeeded",
  "deadLetter": "dead_lettered",
  "before": {
    "patterns": 0,
    "evidence": 0,
    "outcomes": 0,
    "knowledge": 0,
    "candidates": 0,
    "validations": 0,
    "memoryChanges": 0,
    "trustEvidence": 0
  },
  "after": {
    "patterns": 1,
    "evidence": 1,
    "outcomes": 2,
    "knowledge": 0,
    "candidates": 0,
    "validations": 0,
    "memoryChanges": 0,
    "trustEvidence": 0
  },
  "privacySafe": true,
  "promotionSideEffects": 0
}

```

### regression: probe:todo075-dashboard

- Command: `npm.cmd run probe:todo075-dashboard`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo075-dashboard
> node scripts/todo075-probe.cjs dashboard

{
  "mode": "dashboard",
  "organizationId": "todo075-probe-1789294106159-3zh36",
  "totalJobs": 4,
  "workers": 100,
  "providers": [
    {
      "provider": "disabled",
      "sampleCount": 2,
      "successCount": 2,
      "failureCount": 0,
      "averageJobDurationMs": 3,
      "p95JobDurationMs": 4,
      "providerRequestMetrics": "unavailable",
      "measured": true
    }
  ],
  "runtime": {
    "sampleCount": 2,
    "averageMs": 3,
    "p95Ms": 4
  },
  "deadLetters": 1,
  "privacySafe": true
}

```

### regression: probe:todo076-connector-installation

- Command: `npm.cmd run probe:todo076-connector-installation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-installation
> node scripts/todo076-probe.cjs installation

{
  "mode": "installation",
  "organizationId": "todo076-probe-1789294135429-8uk0uj",
  "installations": 1,
  "events": 0,
  "mappings": 0,
  "jobs": 0,
  "privacySafe": true
}

```

### regression: probe:todo078-rbac

- Command: `npm.cmd run probe:todo078-rbac`
- Exit code: 1

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo078-rbac
> node scripts/todo078-probe.cjs

TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async login (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\scripts\todo078-probe.cjs:35:20)
    at async main (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\scripts\todo078-probe.cjs:62:25) {
  [cause]: AggregateError [ECONNREFUSED]:
      at internalConnectMultiple (node:net:1134:18)
      at afterConnectMultiple (node:net:1715:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}

```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
