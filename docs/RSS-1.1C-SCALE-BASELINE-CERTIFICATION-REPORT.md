# RSS-1.1C Scale Baseline Certification Report

## Executive Summary

TODO-025H is resolved. The failure was caused by a hard-coded historical row-count tuple, not by corruption of the protected Organizational Memory.

The certification now validates structural integrity, referential consistency, provenance, version shape, ticket sequencing, deterministic replay, safe append-only growth, and read-only snapshot stability. The protected dataset remains unchanged.

Current protected counts are `47 knowledge`, `181 lessons`, `133 versions`, `5168 tickets`, `1805 candidates`, `1804 validations`, `1804 memory changes`, `4500 trust-evidence records`, and `50 patterns`. These counts are reported as evidence, not treated as immutable historical requirements.

TODO-025H passes directly and the performance certification stage passes. The full release command remains `NOT READY` because the worktree is intentionally dirty during this stabilization task and TODO-051 has a separate stale semantic fixture failure after the scale stage.

## Root Cause Analysis

The old `verifyCounts()` assertion required this historical snapshot:

| Dataset component | Historical expectation | Protected dataset | Finding |
| --- | ---: | ---: | --- |
| Knowledge | 45 | 47 | obsolete snapshot |
| Lessons | 180 | 181 | obsolete snapshot |
| Versions | 130 | 133 | obsolete snapshot |
| Tickets | 5000 | 5168 | obsolete snapshot |
| Candidates | 1800 | 1805 | obsolete snapshot |
| Validations | 1800 | 1804 | obsolete snapshot |
| Memory changes | 1800 | 1804 | obsolete snapshot |
| Trust evidence | 4500 | 4500 | unchanged, but not sufficient as a baseline |
| Patterns | 45 | 50 | obsolete snapshot |

The deterministic failure was a direct equality assertion against the historical tuple. It did not identify an orphan, broken relationship, missing provenance record, invalid version, or protected-data mutation. Aggregate metrics are historical counters and are not valid substitutes for current row counts.

The correct long-term rule is: counts must be observable, while structural invariants and protected-snapshot integrity are the certification authority.

## Dataset Integrity Audit

The protected Developer Demo organization was audited read-only. The following checks passed:

- unique identifiers for knowledge, lessons, versions, candidates, validations, memory changes, tickets, trust evidence, and patterns;
- organization ownership on all scoped records;
- candidate-to-knowledge references;
- validation-to-candidate, knowledge, and version references;
- memory-change references to knowledge, candidate, and validation records;
- trust-evidence references, provenance, and integer deltas;
- ticket validation references and reflection object shape;
- knowledge provenance and non-negative revisions;
- version provenance and complete numeric version sequences where the representation is present;
- lesson provenance, signals, root cause, and response content;
- pattern examples, confidence range, and non-negative usage counts;
- finite non-negative organization metrics;
- ticket sequence counter greater than or equal to the persisted ticket count.

The audit returned zero integrity issues. A legacy candidate without a reverse validation row was preserved; the audit correctly validates the authoritative validation-to-candidate direction without inventing a new reverse-cardinality rule.

## Certification Modernization

TODO-025H now:

1. Audits the current protected dataset instead of comparing it to a retired count tuple.
2. Accepts valid append-only growth across knowledge, lessons, versions, tickets, candidates, validations, memory changes, trust evidence, and patterns.
3. Rejects an injected orphan validation reference.
4. Replays the audit and requires an identical deterministic audit result.
5. Exercises persistence reads, hydration, organization switching, and deterministic ticket workloads.
6. Compares protected before/after snapshots and requires no persisted mutation.

The scale gate is intentionally separated from semantic fixture identity assertions. Retrieval/coherence probes remain responsible for semantic expectations; TODO-025H certifies current-data integrity and scale behavior without turning historical fixture IDs into a new stale baseline.

## Scale and HTTP Verification

The direct probe passed with six samples per operation. Representative read measurements included:

- knowledge: 47 records, median approximately 5.7 ms;
- candidates: 1805 records, median approximately 88.2 ms;
- tickets: 5168 records, median approximately 146.6 ms;
- full initial hydration set: 2410 records, median approximately 94.5 ms;
- full protected snapshot: unchanged before and after the audit.

The scale probe produced deterministic authorization outcomes for the mature SSO, billing, weak-overlap, paraphrase, and long-tail workloads. Weak or unsupported processing remained `no_template`; no HTTP or persistence exception was produced by TODO-025H.

## Regression Results

| Verification | Result |
| --- | --- |
| TODO-025H direct probe | PASS |
| Structural append-only growth | PASS |
| Orphan-reference rejection | PASS |
| Deterministic audit replay | PASS |
| Protected snapshot immutability | PASS |
| TODO-058B | PASS |
| TODO-080 | PASS |
| TODO-082A | PASS |
| TODO-082C | PASS |
| TODO-083 / expanded calibration | PASS; 200/200 |
| TODO-078 RBAC | PASS after clean app-server restart |
| OIP Benchmark | PASS; 1000/1000 |
| Critical security | PASS; 100% |
| Full performance stage | PASS |
| Prisma validation and production build | PASS |

The release certification run progressed beyond TODO-025H. Later staged checks for regression, multi-tenant, governed, and connectors also passed after restarting the stale development server.

## Remaining Limitations

- `npm run certify -- --release` currently stops at the intentional release working-tree cleanliness gate because this stabilization work and prior user changes are uncommitted.
- The complete non-release command encountered intermittent HTTP 500 responses from the stale Next development process while HTTP probes were running; the affected TODO-078 and membership probes passed after restarting that repository-owned process. This is a certification-runner/environment limitation, not a TODO-025H dataset failure.
- The explainability stage remains blocked by TODO-051: its semantic fixture expects `demo-ki-duplicate-invoice-seat-change`, while the current deterministic pipeline selects `demo-ki-invoice-pdf-stale-address`. This is outside RSS-1.1C’s allowed scale/integrity scope and was not changed here.

No Organizational Memory, ticket, trust, reflection, retrieval, provider, RBAC, or safety data was modified to satisfy TODO-025H.

## Recommendation

```text
NOT READY
```

RSS-1.1C itself is complete and no longer blocks on TODO-025H. Release promotion should wait for the separate TODO-051 explainability fixture decision, a clean release worktree, and a full release-mode rerun with a stable certification server process.
