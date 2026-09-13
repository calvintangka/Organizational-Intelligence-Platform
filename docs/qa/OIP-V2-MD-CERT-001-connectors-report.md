# OIP Certification Report

- Verdict: **NOT_CERTIFIED**
- Run started: 2026-09-13T10:46:57.467Z
- Run finished: 2026-09-13T10:48:29.499Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| connectors | FAILED | 3 command(s) |
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
  "organizationId": "todo076-probe-1789296442375-9rjmvz",
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
  "organizationId": "todo076-probe-1789296463280-i3zy0x",
  "installations": 1,
  "events": 0,
  "mappings": 0,
  "jobs": 0,
  "privacySafe": true
}

```

### connectors: probe:todo076-connector-idempotency

- Command: `npm.cmd run probe:todo076-connector-idempotency`
- Exit code: 1

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo076-connector-idempotency
> node scripts/todo076-probe.cjs connector-idempotency

PrismaClientKnownRequestError: Transaction API error: Unable to start a transaction in the given time.
    at #c (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\node_modules\@prisma\client\runtime\client.js:57:14128)
    at Ut.transaction (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\node_modules\@prisma\client\runtime\client.js:58:1816)
    at runNextTicks (node:internal/process/task_queues:65:5)
    at listOnTimeout (node:internal/timers:549:9)
    at process.processTimers (node:internal/timers:523:7)
    at async Proxy._transactionWithCallback (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\node_modules\@prisma\client\runtime\client.js:99:4678)
    at async receiveWebhook (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\lib\server\connectors\connectorService.ts:151:24)
    at async Promise.all (index 1)
    at async main (C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile\scripts\todo076-probe.cjs:26:26) {
  code: 'P2028',
  meta: {},
  clientVersion: '7.9.1'
}

```

## Limitations

- Release cleanliness was not enforced; rerun with --release before tagging.

## Recommendation

Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.
