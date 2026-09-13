# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:54:05.401Z
- Run finished: 2026-09-13T10:58:55.019Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| chaos | PASSED | 6 command(s) |
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

### chaos: probe:todo038-claude-failover

- Command: `npm.cmd run probe:todo038-claude-failover`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo038-claude-failover
> node scripts/todo038-claude-failover-probe.cjs

PASS CASE A DeepSeek success skips LM Studio
PASS CASE A diagnostics mark LM Studio skipped
PASS CASE B DeepSeek failure invokes LM Studio only
PASS CASE B LM Studio result identity is accurate
PASS CASE C both provider failures return safe failure
PASS CASE C diagnostics preserve both failed attempts
PASS CASE D malformed LM Studio output fails safely
PASS Claude proxy fails closed before network access when key is absent
PASS Claude proxy calls the Anthropic Messages endpoint
PASS Claude key is injected server-side with required API version
PASS Claude proxy controls model and separates system prompt
PASS Claude proxy returns OpenAI-compatible content and diagnostics
PASS Malformed Anthropic response fails closed
PASS NVIDIA and Nemotron are absent from the active provider surface
PASS Claude key is isolated and not required by the release config
PASS Claude proxy logs never include the API key
PASS Local secret files are not tracked
TODO-038 provider-chain and isolated Claude contract probe passed.

```

### chaos: probe:todo046

- Command: `npm.cmd run probe:todo046`
- Exit code: 0

```text
974e7cb5b58ad6f08302",
        "counts": {
          "knowledge": 11,
          "candidates": 61,
          "validations": 61,
          "memory": 61,
          "tickets": 119,
          "evidence": 0,
          "patterns": 13
        }
      },
      "profile-fastdrop-logistics": {
        "digest": "19cb71c305c4c073100e4e8e7bbaa33e6560a39d86addc70edbb761b7b9794e6",
        "counts": {
          "knowledge": 1,
          "candidates": 2,
          "validations": 2,
          "memory": 2,
          "tickets": 3,
          "evidence": 0,
          "patterns": 1
        }
      },
      "profile-pramana-consulting": {
        "digest": "a82145bf031067249618272ed00a32f95d088cd17966babecdd8f93f00b1c1a6",
        "counts": {
          "knowledge": 0,
          "candidates": 0,
          "validations": 0,
          "memory": 0,
          "tickets": 0,
          "evidence": 0,
          "patterns": 0
        }
      },
      "test-oip-regression": {
        "digest": "103dc1ef5c7dbd57210443e76d7707f43fb663af51eda152aa0415ec57086114",
        "counts": {
          "knowledge": 0,
          "candidates": 0,
          "validations": 0,
          "memory": 0,
          "tickets": 0,
          "evidence": 0,
          "patterns": 0
        }
      }
    },
    "after": {
      "profile-oip-developer-demo": {
        "digest": "dd6cc4925ff2339dac9a7ab0a755844ae5f36cf49b1a52e9266d1157265947ad",
        "counts": {
          "knowledge": 47,
          "candidates": 1805,
          "validations": 1804,
          "memory": 1804,
          "tickets": 5184,
          "evidence": 4500,
          "patterns": 50
        }
      },
      "profile-maesa-tech": {
        "digest": "174e70483496e72720f4df885d6a8346c50036008dfd974e7cb5b58ad6f08302",
        "counts": {
          "knowledge": 11,
          "candidates": 61,
          "validations": 61,
          "memory": 61,
          "tickets": 119,
          "evidence": 0,
          "patterns": 13
        }
      },
      "profile-fastdrop-logistics": {
        "digest": "19cb71c305c4c073100e4e8e7bbaa33e6560a39d86addc70edbb761b7b9794e6",
        "counts": {
          "knowledge": 1,
          "candidates": 2,
          "validations": 2,
          "memory": 2,
          "tickets": 3,
          "evidence": 0,
          "patterns": 1
        }
      },
      "profile-pramana-consulting": {
        "digest": "a82145bf031067249618272ed00a32f95d088cd17966babecdd8f93f00b1c1a6",
        "counts": {
          "knowledge": 0,
          "candidates": 0,
          "validations": 0,
          "memory": 0,
          "tickets": 0,
          "evidence": 0,
          "patterns": 0
        }
      },
      "test-oip-regression": {
        "digest": "103dc1ef5c7dbd57210443e76d7707f43fb663af51eda152aa0415ec57086114",
        "counts": {
          "knowledge": 0,
          "candidates": 0,
          "validations": 0,
          "memory": 0,
          "tickets": 0,
          "evidence": 0,
          "patterns": 0
        }
      }
    }
  }
}

[output truncated]
```

### chaos: probe:bug008-semantic

- Command: `npm.cmd run probe:bug008-semantic`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:bug008-semantic
> node scripts/bug008-semantic-probe.cjs

A1 direct: deterministic decision compatible: PASS
A2 direct: semantic fallback refuses to run (state not unknown): PASS
A3 direct: lesson-informed draft via existing path: PASS
B mild paraphrase: lesson retrieved deterministically: PASS
C1 strong paraphrase: deterministic root-cause unknown: PASS
C2 strong paraphrase: deterministic gate yields no compatible match: PASS
C3 strong paraphrase: retrieval still ranks login item first: PASS
C4 strong paraphrase: semantic fallback invoked: PASS
C5 strong paraphrase: correct lesson authorized: PASS
C6 strong paraphrase: lesson-informed draft produced: PASS
C7 strong paraphrase: draft uses the validated lesson response: PASS
D1 incompatible families: deterministic hard veto: PASS
D2 incompatible families: fallback refuses (no LLM calls): PASS
D3 incompatible families: forged authorization ignored: PASS
D4 incompatible families: draft stays safe: PASS
E1 contradiction: deterministic hard veto: PASS
E2 contradiction: fallback refuses (no LLM calls): PASS
E3 contradiction: forged authorization ignored by drafting: PASS
F ambiguous (low confidence): fail closed to no_template: PASS
F ambiguous (medium (malformed default)): fail closed to no_template: PASS
G1 LLM unavailable: no authorization: PASS
G2 LLM unavailable: aborts immediately (single call): PASS
G3 LLM unavailable: safe no_template draft: PASS
H forged authorization (wrong item id): rejected: PASS
H forged authorization (nonexistent lesson id): rejected: PASS
H forged authorization (non-high confidence): rejected: PASS
H sanity: valid authorization on unknown state is honored: PASS
I1 cold start: generic single-word signals are not strong evidence: PASS
I2 cold start: activation item no longer passes the compatibility gate: PASS
I3 cold start: no_template, no lesson reuse: PASS
I4 cold start: semantic fallback refuses the unclassified ticket: PASS
J multi-token lesson evidence remains strong (classified and unclassified): PASS

All semantic compatibility cases passed.
Read-only probe complete; no data was written.

```

### chaos: probe:todo072-worker-recovery

- Command: `npm.cmd run probe:todo072-worker-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo072-worker-recovery
> node scripts/todo072-worker-recovery-probe.cjs

{
  "jobId": "cmtzp9o3k0000ykhzeofxgphm",
  "firstWorker": "todo072-crashed-worker",
  "restartedWorker": "todo072-restarted-worker",
  "attempts": [
    {
      "id": "cmtzp9ohh0001ykhzt2swvwmj",
      "jobId": "cmtzp9o3k0000ykhzeofxgphm",
      "attemptNumber": 1,
      "workerId": "todo072-crashed-worker",
      "startedAt": "2026-09-13T10:57:35.723Z",
      "heartbeatAt": "2026-09-13T10:57:41.723Z",
      "finishedAt": "2026-09-13T10:57:41.723Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzp9t0f0012ykhz6qtp0nl1",
      "jobId": "cmtzp9o3k0000ykhzeofxgphm",
      "attemptNumber": 2,
      "workerId": "todo072-restarted-worker",
      "startedAt": "2026-09-13T10:57:41.859Z",
      "heartbeatAt": "2026-09-13T10:57:45.467Z",
      "finishedAt": "2026-09-13T10:57:45.467Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 3503,
      "safeDiagnostics": {
        "jobType": "bulk.analyze"
      }
    }
  ],
  "finalStatus": "succeeded",
  "tickets": 10
}

```

### chaos: probe:todo073-reflection-recovery

- Command: `npm.cmd run probe:todo073-reflection-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo073-reflection-recovery
> node scripts/todo073-reflection-recovery-probe.cjs

{
  "jobId": "cmtzpaiu400026shz5ebxy1kz",
  "attempts": [
    {
      "id": "cmtzpaj4500036shzhixtqb95",
      "jobId": "cmtzpaiu400026shz5ebxy1kz",
      "attemptNumber": 1,
      "workerId": "todo073-crashed-reflection-worker",
      "startedAt": "2026-09-13T10:58:15.424Z",
      "heartbeatAt": "2026-09-13T10:58:21.424Z",
      "finishedAt": "2026-09-13T10:58:21.424Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzpanml00156shz81l23e4q",
      "jobId": "cmtzpaiu400026shz5ebxy1kz",
      "attemptNumber": 2,
      "workerId": "todo073-restarted-reflection-worker",
      "startedAt": "2026-09-13T10:58:21.556Z",
      "heartbeatAt": "2026-09-13T10:58:22.105Z",
      "finishedAt": "2026-09-13T10:58:22.105Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 478,
      "safeDiagnostics": {
        "jobType": "reflection.generate"
      }
    }
  ],
  "preparedReflections": 1,
  "finalStatus": "succeeded"
}

```

### chaos: probe:todo074-pattern-recovery

- Command: `npm.cmd run probe:todo074-pattern-recovery`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo074-pattern-recovery
> node scripts/todo074-pattern-recovery-probe.cjs

{
  "jobId": "cmtzpb5dm000120hzeae0ijk0",
  "attempts": [
    {
      "id": "cmtzpb5iw000220hzmbvz4tst",
      "jobId": "cmtzpb5dm000120hzeae0ijk0",
      "attemptNumber": 1,
      "workerId": "todo074-crashed-pattern-worker",
      "startedAt": "2026-09-13T10:58:44.621Z",
      "heartbeatAt": "2026-09-13T10:58:50.621Z",
      "finishedAt": "2026-09-13T10:58:50.621Z",
      "outcome": "lease_expired",
      "errorClass": "database_transient",
      "retryable": true
    },
    {
      "id": "cmtzpba31001a20hzgaeaw8pn",
      "jobId": "cmtzpb5dm000120hzeae0ijk0",
      "attemptNumber": 2,
      "workerId": "todo074-restarted-pattern-worker",
      "startedAt": "2026-09-13T10:58:50.680Z",
      "heartbeatAt": "2026-09-13T10:58:51.393Z",
      "finishedAt": "2026-09-13T10:58:51.393Z",
      "outcome": "succeeded",
      "errorClass": null,
      "provider": "disabled",
      "durationMs": 674,
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

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
