# TODO-083 Deterministic Reasoning Calibration Report

## Executive Summary

TODO-083 calibration changes were implemented for intent isolation, intent hierarchy, canonical selection, retrieval compatibility, lesson safety, security routing, and explainability boundaries.

The deterministic results improved materially:

| Measure | Baseline | Current verification |
|---|---:|---:|
| Exact TODO-079 semantic cases | 404/600 live | 12/12 deterministic gates |
| Expanded calibration corpus | Not present | 200/200 |
| OIP Benchmark v1 | 1,000/1,000 before calibration | 1,000/1,000 |
| Critical security benchmark | 100% | 100% |

The live authenticated TODO-079 suite was not rerun in this task. Therefore the 560/600 live acceptance requirement is not demonstrated, and the release recommendation remains **NOT READY**.

## Repository and Test Scope

- Branch: `master`
- HEAD: `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb`
- Working tree: dirty before and after calibration; existing changes and generated evidence were preserved.
- No commit or tag was created.
- Calibration probes are pure or read-only. No production ticket, reflection, promotion, trust, connector, or Organizational Memory mutation was intentionally performed by the new probes.

## Calibration Analysis

| Failure group | Baseline evidence | Deterministic cause | Calibration |
|---|---|---|---|
| Permission false positive | TODO-079 Case 3 | The phrase “Reporting Administrator” was treated as an escalation request | Security routing now requires an explicit mutation/elevation verb such as promote, grant, assign, or bypass |
| Activation false positive | TODO-079 Case 11 | Negated credential language was treated as a requested credential action | Security action extraction now rejects negated actions such as “do not send credentials” |
| Security false negative | TODO-079 Case 8 | Indonesian phishing/account-compromise wording was not in the security vocabulary | Added bounded Indonesian unauthorized-access and phishing signals |
| Historical-intent contamination | TODO-079 Cases 6 and 10 | Resolved monthly history remained eligible for active intent | Added month-aware resolved-history detection and kept current-request text authoritative |
| Canonical collapse | TODO-079 Cases 4, 5, 7, and 10 | Intent-specific outcomes fell back to neighboring category canonicals | Added explicit canonical identities for delivery, product information, billing contact, role permission, login, and report timeout |
| Wrong lesson retrieval | TODO-079 Cases 2 and 10 | Category/word overlap allowed incompatible root causes | Added root-cause and stage compatibility vetoes before retrieval/drafting |

## Pipeline Improvements

The calibrated path remains:

`ticket → intent isolation → current-request extraction → security routing → category/intent → canonical selection → compatibility filter → lesson selection → draft`

The changes are deterministic and explainable:

- `lib/intentIsolation.ts` records active text, ignored topics, primary issue hints, contradiction/security metadata, reasons, and requested actions.
- Security actions are rejected when the matching action is explicitly negated.
- `lib/canonicalProblemEngine.ts` maps recognized intent IDs to stable canonical identities before broad category fallbacks.
- `lib/memory.ts` rejects duplicate-invoice lessons that assert an unsupported seat/plan/quantity/headcount change.
- `lib/drafting.ts` repeats the root-cause contradiction veto so an incompatible lesson cannot become a draft source if it survives an earlier stage.
- Existing `IntentCandidate.reason`, evidence, security reasons, and retrieval compatibility reasons provide the explainability surface; no hidden provider state is used by these decisions.

## Exact TODO-079 Deterministic Verification

The exact subjects and messages from the prior live evidence were reused without rewriting. The pure reasoning probe now passes:

- 12/12 category checks
- 12/12 intent checks
- 12/12 canonical checks
- Case 3 security false-positive gate: PASS
- Case 8 critical security gate: PASS
- Case 11 security false-positive gate: PASS

This is not a substitute for the authenticated UI/database/provider acceptance run. The prior live score remains 404/600 until a new live run is completed.

## Expanded Calibration Corpus

`scripts/todo083-expanded-calibration.cjs` generates 200 cases across 20 families with ten contextual variants each. Coverage includes:

- password recovery, email recovery, account lockout, and 2FA;
- activation and SSO infrastructure;
- duplicate invoices, billing-contact changes, refunds, and subscriptions;
- permissions, report timeouts, delivery delay, and lost packages;
- API callbacks, notifications, and mobile offline synchronization;
- phishing/security incidents and business/product inquiries;
- quoted history, resolved history, contradiction, multilingual context, ambiguous context, and human-review boundaries.

Result: **200/200 passed** for expected category, intent where defined, and canonical identity.

## Retrieval and Lesson Safety

The new duplicate-root-cause veto prevents a duplicate-invoice ticket from selecting a seat-change or plan-change lesson unless the active ticket independently establishes that change. Drafting repeats the same veto as a defense in depth.

The existing TODO-019 lesson-ranking probe passes, including weak-overlap rejection, contradiction rejection, sibling specificity, and order-independent selection.

The existing TODO-052 canonical/lesson coherence probe still fails at fixture `BI1` because no coherent lesson is selected. This is recorded as an outstanding regression, not attributed to the new calibration without a focused root-cause audit.

## Security Results

- Benchmark critical security: **10/10; 100%**.
- Exact deterministic Case 3: permission issue, security false-positive gate passed.
- Exact deterministic Case 8: Security Incident, critical escalation gate passed.
- Exact deterministic Case 11: activation failure, security false-positive gate passed.
- Exact deterministic Case 12: unauthorized administrative request, critical security routing passed.

No live false-positive/false-negative rate is claimed because the authenticated twelve-case UI run was not repeated.

## Verification Results

| Check | Result | Evidence |
|---|---|---|
| TypeScript | PASS | `npm.cmd exec -- tsc --noEmit` |
| Prisma schema | PASS | `npm.cmd exec -- prisma validate` |
| Prisma migrations | PASS | `npm.cmd exec -- prisma migrate status` — database up to date |
| Production build | PASS | `npm.cmd run build` |
| TODO-080 intent isolation | PASS | `npm.cmd run probe:todo080-intent-isolation` |
| TODO-019 lesson ranking | PASS | `npm.cmd run probe:todo019-lesson-ranking` |
| OIP Benchmark v1 | PASS | `npm.cmd run benchmark:oip-v1` — 1,000/1,000 |
| TODO-083 exact deterministic probe | PASS | `npm.cmd run probe:todo083-calibration` |
| TODO-083 expanded probe | PASS | `npm.cmd run probe:todo083-expanded` — 200/200 |
| TODO-048 root-cause safety | FAIL | Existing draft confidence-note assertion failure |
| TODO-052 canonical/lesson coherence | FAIL | Existing BI1 coherent-lesson assertion failure |
| TODO-078 RBAC | FAIL | Existing viewer authorization-audit response was 500, expected 403 |
| Live TODO-079 acceptance | NOT RUN | Authenticated live UI run not available in this task |

The package does not expose separate executable probes for every historical TODO number listed in the request. Their prior evidence was not reclassified as a fresh pass.

## Stability and Data Integrity

The 200-case corpus is a pure in-memory stability sample and produced no reasoning drift across variants. The benchmark remained at 1,000/1,000 after calibration. No new probe submitted tickets or invoked reflection, promotion, trust, governed actions, or connectors.

A 100+ live mixed-ticket run was not performed; no claim of live long-run memory integrity is made. That remains part of the live certification gate.

## Remaining Limitations

1. The required authenticated live TODO-079 rerun is outstanding; the prior live result remains 404/600.
2. TODO-048, TODO-052, and TODO-078 still have failures outside the calibration proof set.
3. Provider-independence was not re-established by a new live DeepSeek/LM Studio run in this task; the deterministic probes do not call a provider.
4. UI/API/database persistence consistency, ticket reopenability, and mature Organizational Memory counts were not remeasured because no live tickets were submitted.

## Recommendation

**NOT READY**

The deterministic reasoning layer is substantially better calibrated and passes the expanded pure corpus and benchmark security gates. Do not promote OIP to certified private beta until the live authenticated TODO-079 suite reaches at least 560/600, the outstanding regression probes are resolved or dispositioned, and live persistence, provider, reopen/search, and memory-integrity evidence is captured.

## TODO-083 Status

**COMPLETED_WITH_LIMITATIONS — deterministic calibration implemented and verified; live acceptance gate remains outstanding.**

