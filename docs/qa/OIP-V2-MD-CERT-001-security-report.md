# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:34:33.605Z
- Run finished: 2026-09-13T10:36:41.312Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| security | PASSED | 4 command(s) |
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

### security: probe:todo078-rbac

- Command: `npm.cmd run probe:todo078-rbac`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo078-rbac
> node scripts/todo078-probe.cjs

TODO-078 RBAC probe passed.

```

### security: probe:todo076-webhook-security

- Command: `npm.cmd run probe:todo076-webhook-security`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-webhook-security
> node scripts/todo076-probe.cjs webhook-security

{
  "mode": "webhook-security",
  "organizationId": "todo076-probe-1789295739207-ua9lbt",
  "installations": 1,
  "events": 0,
  "mappings": 0,
  "jobs": 0,
  "privacySafe": true
}

```

### security: probe:todo019-action

- Command: `npm.cmd run probe:todo019-action`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo019-action
> node scripts/todo019-action-probe.cjs

{
  "organizationId": "todo019-action-1789295777126-mlfme0",
  "ticketId": "ticket-1789295777126-mlfme0",
  "appliedActionId": "cmtzoicld0005okhzj4zj6ms2",
  "reversalActionId": "cmtzoiftn0012okhzvhc3evzn",
  "finalLabels": [],
  "policyVersion": 1,
  "actionLedgerEntries": 9
}
TODO-019 governed action probe passed.

```

### security: probe:todo080-intent-isolation

- Command: `npm.cmd run probe:todo080-intent-isolation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo080-intent-isolation
> node scripts/todo080-intent-isolation-probe.cjs

TODO-080 intent isolation probe passed: activation isolation, mixed-language routing, security escalation, historical suppression, and entity confidence gates.

```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
