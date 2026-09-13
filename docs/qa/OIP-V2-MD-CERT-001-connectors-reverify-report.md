# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:50:48.000Z
- Run finished: 2026-09-13T10:53:54.899Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| connectors | PASSED | 6 command(s) |
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

### connectors: probe:todo076-connector-installation

- Command: `npm.cmd run probe:todo076-connector-installation`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-installation
> node scripts/todo076-probe.cjs installation

{
  "mode": "installation",
  "organizationId": "todo076-probe-1789296671137-x9eg3h",
  "installations": 1,
  "events": 0,
  "mappings": 0,
  "jobs": 0,
  "privacySafe": true
}

```

### connectors: probe:todo076-webhook-security

- Command: `npm.cmd run probe:todo076-webhook-security`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-webhook-security
> node scripts/todo076-probe.cjs webhook-security

{
  "mode": "webhook-security",
  "organizationId": "todo076-probe-1789296696267-fozqxe",
  "installations": 1,
  "events": 0,
  "mappings": 0,
  "jobs": 0,
  "privacySafe": true
}

```

### connectors: probe:todo076-connector-idempotency

- Command: `npm.cmd run probe:todo076-connector-idempotency`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-idempotency
> node scripts/todo076-probe.cjs connector-idempotency

{
  "mode": "connector-idempotency",
  "organizationId": "todo076-probe-1789296720663-l4fc7y",
  "installations": 1,
  "events": 1,
  "mappings": 0,
  "jobs": 1,
  "privacySafe": true
}

```

### connectors: probe:todo076-connector-worker

- Command: `npm.cmd run probe:todo076-connector-worker`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-worker
> node scripts/todo076-probe.cjs connector-worker

{
  "mode": "connector-worker",
  "organizationId": "todo076-probe-1789296760099-3z6uqz",
  "installations": 1,
  "events": 1,
  "mappings": 1,
  "jobs": 1,
  "privacySafe": true
}

```

### connectors: probe:todo076-connector-mapping

- Command: `npm.cmd run probe:todo076-connector-mapping`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-mapping
> node scripts/todo076-probe.cjs connector-mapping

{
  "mode": "connector-mapping",
  "organizationId": "todo076-probe-1789296785820-ffmodx",
  "installations": 1,
  "events": 3,
  "mappings": 1,
  "jobs": 3,
  "privacySafe": true
}

```

### connectors: probe:todo076-connector-tenancy

- Command: `npm.cmd run probe:todo076-connector-tenancy`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-tenancy
> node scripts/todo076-probe.cjs connector-tenancy

{
  "mode": "connector-tenancy",
  "organizationId": "todo076-probe-1789296828504-hcxp0x",
  "installations": 1,
  "events": 2,
  "mappings": 0,
  "jobs": 2,
  "privacySafe": true
}

```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
