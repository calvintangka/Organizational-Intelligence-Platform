# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:36:52.702Z
- Run finished: 2026-09-13T10:40:49.866Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| multi-tenant | PASSED | 5 command(s) |
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

### multi-tenant: probe:membership-authorization

- Command: `npm.cmd run probe:membership-authorization`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:membership-authorization
> node scripts/membership-authorization-probe.cjs

Membership authorization probe passed.

```

### multi-tenant: probe:active-organization

- Command: `npm.cmd run probe:active-organization`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:active-organization
> node scripts/active-organization-probe.cjs

Active organization probe passed.

```

### multi-tenant: probe:organization-switching

- Command: `npm.cmd run probe:organization-switching`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:organization-switching
> node scripts/organization-switching-probe.cjs

Organization switching probe passed.

```

### multi-tenant: probe:todo070-stateless-persistence

- Command: `npm.cmd run probe:todo070-stateless-persistence`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo070-stateless-persistence
> node scripts/todo070-stateless-persistence-probe.cjs

TODO-070 stateless persistence probe: PASS

```

### multi-tenant: probe:todo076-connector-tenancy

- Command: `npm.cmd run probe:todo076-connector-tenancy`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-tenancy
> node scripts/todo076-probe.cjs connector-tenancy

{
  "mode": "connector-tenancy",
  "organizationId": "todo076-probe-1789296043712-sjzqfv",
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
