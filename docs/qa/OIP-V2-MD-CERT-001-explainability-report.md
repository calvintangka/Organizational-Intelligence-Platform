# OIP Certification Report

- Verdict: **CERTIFIED_WITH_LIMITATIONS**
- Run started: 2026-09-13T10:59:06.771Z
- Run finished: 2026-09-13T11:00:38.638Z
- Release mode: no
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Exact tag: `unavailable`
- Current branch: `landing/option-c32-release-polish`

## Release Gate

| Stage | Status | Checks |
| --- | --- | --- |
| explainability | PASSED | 3 command(s) |
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

### explainability: probe:todo051-match-explainability

- Command: `npm.cmd run probe:todo051-match-explainability`
- Exit code: 0

```text
scription charge","canonical":"demo-ki-duplicate-invoice-seat-change","lesson":"demo-les-duplicate-invoice-seat-change-001","relevance":"Strong","lessonEvidence":"Strong","trust":95,"authorized":true,"draftMode":"lesson_grounded"}
{"label":"Satya duplicate integration events","canonical":"demo-ki-webhook-delivery-replay","lesson":"demo-les-webhook-delivery-replay-001","relevance":"Strong","lessonEvidence":"Strong","trust":68,"authorized":true,"draftMode":"lesson_grounded"}
{"label":"Luna role/access issue","canonical":"demo-ki-guest-workspace-access","lesson":"demo-les-guest-workspace-access-001","relevance":"Strong","lessonEvidence":"Strong","trust":68,"authorized":true,"draftMode":"lesson_grounded"}
{"label":"Rishi dashboard totals","canonical":null,"lesson":null,"relevance":"None","lessonEvidence":"None","trust":null,"authorized":false,"draftMode":"cold_start"}
{"label":"Mark SSO loop","canonical":"demo-ki-sso-certificate-redirect-loop","lesson":"demo-les-sso-certificate-redirect-loop-001","relevance":"Strong","lessonEvidence":"Strong","trust":95,"authorized":true,"draftMode":"lesson_grounded"}

=== TODO-051 EXPANDED RESULTS ===
{"label":"confirmed seat-count change","canonical":"demo-ki-duplicate-invoice-seat-change","lesson":"demo-les-duplicate-invoice-seat-change-001","authorized":true,"source":"deterministic","ignoredTopics":[]}
{"label":"duplicate invoice without seat evidence","canonical":"demo-ki-invoice-currency-display","lesson":"demo-les-invoice-currency-display-001","authorized":false,"source":"no_template","ignoredTopics":[]}
{"label":"old PDF address history only","canonical":"demo-ki-invoice-currency-display","lesson":null,"authorized":false,"source":"no_template","ignoredTopics":[]}
{"label":"current stale invoice PDF","canonical":"demo-ki-invoice-pdf-stale-address","lesson":"demo-les-invoice-pdf-stale-address-001","authorized":true,"source":"deterministic","ignoredTopics":[]}
{"label":"quoted seat history with current tax issue","canonical":"demo-ki-invoice-tax-rounding","lesson":"demo-les-invoice-tax-rounding-001","authorized":true,"source":"deterministic","ignoredTopics":["billing"]}
{"label":"resolved seat history with current tax issue","canonical":"demo-ki-invoice-tax-rounding","lesson":"demo-les-invoice-tax-rounding-001","authorized":true,"source":"deterministic","ignoredTopics":["billing"]}
{"label":"competing invoice issues with explicit priority","canonical":"demo-ki-duplicate-invoice-seat-change","lesson":"demo-les-duplicate-invoice-seat-change-001","authorized":true,"source":"deterministic","ignoredTopics":[]}
{"label":"same category incompatible root cause","canonical":"demo-ki-duplicate-invoice-seat-change","lesson":null,"authorized":false,"source":"no_template","ignoredTopics":[]}
{"label":"higher lexical overlap wrong candidate","canonical":"demo-ki-invoice-tax-rounding","lesson":"demo-les-invoice-tax-rounding-001","authorized":false,"source":"no_template","ignoredTopics":[]}

TODO-051 MATCH EXPLAINABILITY: PASS

[output truncated]
```

### explainability: probe:todo049-reporting-coherence

- Command: `npm.cmd run probe:todo049-reporting-coherence`
- Exit code: 0

```text

> organizational-intelligence-hackathon@0.4.1 probe:todo049-reporting-coherence
> node scripts/todo049-reporting-coherence-probe.cjs

MANUAL authorized=false source=no_template canonical=none
MATRIX PASS E01 (dashboard-total-mismatch) authorized=false canonical=none lesson=none
MATRIX PASS E02 (timezone-boundary) authorized=true canonical=demo-ki-scheduled-report-timezone lesson=demo-les-scheduled-report-timezone-001
MATRIX PASS E03 (csv-encoding) authorized=true canonical=demo-ki-csv-export-encoding lesson=demo-les-csv-export-encoding-001
MATRIX PASS E04 (exported-values-mismatch) authorized=false canonical=none lesson=none
MATRIX PASS E05 (missing-rows) authorized=false canonical=none lesson=none
MATRIX PASS E06 (duplicate-rows) authorized=false canonical=none lesson=none
MATRIX PASS E07 (wrong-aggregation) authorized=false canonical=none lesson=none
MATRIX PASS E08 (date-range) authorized=false canonical=none lesson=none
MATRIX PASS E09 (large-export-timeout) authorized=false canonical=none lesson=none
MATRIX PASS E10 (filter-persistence) authorized=false canonical=none lesson=none
MATRIX PASS E11 (column-order) authorized=false canonical=none lesson=none
MATRIX PASS E12 (timezone-natural) authorized=false canonical=none lesson=none
CONTROL PASS C01 authorized=false canonical=none
CONTROL PASS C02 authorized=false canonical=none
CONTROL PASS C03 authorized=false canonical=none
CONTROL PASS C04 authorized=false canonical=demo-ki-invoice-currency-display
CONTROL PASS C05 authorized=false canonical=none
CONTROL PASS C06 authorized=false canonical=none
CONTROL PASS C07 authorized=false canonical=none
CONTROL PASS C08 authorized=false canonical=none
EXPLAIN PASS E02 canonical=Scheduled Report Timezone Boundary lesson=demo-les-scheduled-report-timezone-001 coherent

=== TODO-049 SUMMARY ===
A_I_originalCase: PASS (fails closed to human review; no incoherent canonical/lesson authorized)
E_reportingMatrix: PASS (12/12; 2 coherent authorizations, 10 safe fail-closed)
F_controls: PASS (0/8 authorize an incoherent reporting lesson)
J_explainability: PASS (coherent authorization: canonical, lesson root cause, and guidance all timezone-aligned)
K_todo048Preservation: PASS (authorized reporting drafts remain POSSIBLE/hedged, no unverified assertion)
CrossDomain: PASS (SSO hero authorization intact)
N_matureDataSafety: PASS (5/5 orgs unchanged; TODO-043 provenance OIP-20230104-0001)

Note: E03 (genuine encoding ticket) authorizes the coherent CSV Export Encoding canonical but tie-breaks to lesson-001's pooled timezone root cause — a residual SYNTHETIC-DATA finding (documented; TODO-048 hedges it). Fixing it requires a generator+fixture repair, deferred.

TODO-049 REPORTING COHERENCE: PASS

```

### explainability: probe:todo080-intent-isolation

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
