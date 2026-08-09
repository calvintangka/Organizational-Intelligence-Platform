# RSS-1.2C — Retrieval Calibration Report

**Date:** 2026-08-06  
**Parent:** RSS-1.2C — Retrieval Calibration  
**Final verdict:** `RETRIEVAL_CALIBRATED`

## 1. Executive Summary

RSS-1.2C retrieval is calibrated and ready for the next release stage. The audited pipeline now preserves the intrinsic retrieval winner, rejects hard-incompatible candidates, keeps unknown candidates explainable, and fails closed before customer-facing drafting when evidence is weak. The 200-case expanded calibration, 12 genuine SSO paraphrases, negative/contradiction controls, explainability, multilingual, provider-boundary, and deterministic stability checks passed.

The four inherited RSS-1.2B regressions remain resolved. No organization, Organizational Memory, trust, reflection, ticket, session, or persistence data was mutated by the retrieval work.

## 2. Retrieval Pipeline Audit

The verified order is:

`Ticket → Intent Isolation → Category → Intent → Canonical → Candidate Retrieval → Compatibility → Lesson → Draft`

The candidate boundary is now explicit. `isRetrievalCandidateEligible` removes only `incompatible` decisions; `unknown` remains available for diagnostics and semantic evaluation, while `draftResponse` remains the final authorization boundary. Semantic authorization is provider-issued, non-forgeable in-process, requires a real lesson signal, and still rechecks category, contradiction, root cause, lesson identity, and confidence.

## 3. Failure Classification

| Regression | Root Cause | Resolution | Result |
|---|---|---|---|
| RSS-1.2A | Verification fixture omitted required `rationale` from valid structured responses | Corrected fixture; strict schema and bounded retry retained | PASS |
| RSS-1.2S4 | Production probe was run without a valid `.next` artifact | Rebuilt production bundle and reran webhook/header probe | PASS |
| TODO-013 | Stale expectation assumed Billing; Maesa explicitly supports refund requests | Updated verification disposition to profile-aware Refund | PASS |
| TODO-034 | Dataset evolved beyond hard-coded 5,000-ticket total | Used authoritative read-only count oracle; pagination assertions remain strict | PASS |
| TODO-030 | Lower compatible siblings could replace the audited retrieval winner after unknown compatibility was filtered out | Added tri-state retrieval eligibility and preserved the raw winner boundary | PASS |
| TODO-046 | Semantic fallback could be exercised on a candidate with no lesson signal; capped score ties hid exact canonical evidence | Required deterministic lesson signal/provider brand and added specificity tie-break | PASS |
| TODO-039 negative controls | Bare certificate wording was over-classified as SSO | Restricted SSO certificate intent to federation/provider-specific evidence | PASS |
| TODO-053 permissions | Workspace wording caused an over-broad retrieval veto | Applied the veto only to guest/collaborator-specific items | PASS |

Each failure was classified as product regression, fixture regression, or environment/data issue before changing code or expectations.

## 4. Long-form Verification

Long descriptions with historical, quoted, negated, and current clauses were replayed through intent isolation and retrieval. Current evidence remained eligible; quoted/resolved/negated history did not become active retrieval evidence. TODO-051 expanded cases and TODO-083 all passed.

## 5. Paraphrase Verification

TODO-040 passed 12/12 genuine unseen SSO paraphrases and 0/8 ambiguous cases authorized. TODO-037’s stale 45-item fixture expectation was observed against the current 47-item mature profile; no implementation change was made for that fixture drift.

## 6. Weak-overlap Verification

TODO-030 passed the audited M07 address winner, weak lesson rejection, generic billing/login fail-closed cases, contradiction/negation controls, trust independence, and forged-AI rejection. TODO-046 passed its 14-case weak-fallback matrix with zero unsafe authorizations.

## 7. Root Cause Verification

Known root-cause mismatches remain hard vetoes. Unknown root cause is not treated as compatible; it is retained only for explainability and bounded semantic evaluation. Duplicate invoice, invoice correction/address, currency, tax, payment, subscription, seats/plan, and refund distinctions were covered by TODO-051, TODO-053, TODO-058B, and TODO-083.

## 8. Canonical Calibration

Retrieval remains deterministic and organization-scoped. When scores cap at 100, explicit canonical phrase, concept, and specific-keyword evidence now break the tie before stable ID ordering. The exact scheduled-report-timezone canonical therefore outranks the generic reporting fallback. TODO-047 and TODO-053 passed.

| Ticket | Expected Lesson | Retrieved Lesson | Result |
|---|---|---|---|
| M07 weak invoice/address overlap | Invoice PDF stale address candidate, no authorization | `demo-ki-invoice-pdf-stale-address`; weak lesson | PASS |
| TODO-046 C02 tax ambiguity | No validated authorization | Raw winner retained; `no_template` | PASS |
| TODO-053 reporting timezone | Scheduled report timezone | `demo-ki-scheduled-report-timezone` | PASS |
| TODO-053 permissions inheritance | Permission inheritance delay | `demo-ki-permission-inheritance-delay` | PASS |

## 9. Lesson Compatibility

Lesson selection uses signal count, multi-token evidence, ticket-evidence coverage, retrieval score, and stable ID. Trust, reuse counts, array order, and database order do not decide relevance. TODO-019, TODO-028, TODO-029, TODO-032, TODO-046, and TODO-053 passed.

| Candidate | Compatibility | Reason | Selected |
|---|---|---|---|
| Weak billing sibling | unknown | Category agrees; root cause is insufficient | No; final `no_template` |
| Known root-cause mismatch | incompatible | Distinct classified root-cause family | No; hard veto |
| Strong validated lesson | compatible | Multi-token lesson evidence and no contradiction | Yes |
| Forged semantic object | rejected | Missing provider-issued authorization brand | No |

## 10. Explainability

TODO-051 passed manual and expanded explainability. Draft notes identify the matched canonical/lesson, matched signals, historical root cause, current-case status, guidance, and human-review requirement. Weak or unknown cases explicitly state `NOT_CONFIRMED` and do not claim grounded reuse.

## 11. Multilingual Retrieval

TODO-058B passed language-neutral convergence for login, invoice, MFA, and delivery across ten languages, repeated-run determinism, unsupported-language fail-closed behavior, non-semantic identifier handling, and no mutation of source ticket text. TODO-083 multilingual controls also passed.

## 12. Performance

TODO-064 and TODO-025H passed. Representative local direct timings included retrieval around 2–4 ms, analysis around 5–8 ms, selection/authorization around 4–15 ms, and deterministic replay stability. TODO-025H’s 1,000-row scale checks passed; full read/pagination measurements remain bounded and read-only.

## 13. Regression Results

| Verification | Previous | Current |
|---|---:|---:|
| RSS-1.2B subprobes | Verified | PASS (RSS-1.2B report plus rerun of TODO-013/034 and release gates) |
| RSS-1.2A | PASS after fixture correction | PASS |
| RSS-1.2S1 | PASS | PASS |
| RSS-1.2S2 | PASS | PASS |
| RSS-1.2S3 | PASS | PASS |
| RSS-1.2S4 | FAIL | PASS (webhook 404; headers present) |
| RSS-1.2S5 | PASS | PASS |
| RSS-1.2S6 | PASS | PASS |
| TODO-013 | FAIL | PASS |
| TODO-019 | PASS | PASS |
| TODO-034 | FAIL | PASS |
| TODO-046 | PASS | PASS |
| TODO-051 | PASS | PASS |
| TODO-052 | PASS | PASS |
| TODO-058B | PASS | PASS |
| TODO-078 | PASS | PASS |
| TODO-080 | PASS | PASS |
| TODO-082A | PASS | PASS |
| TODO-082C | PASS | PASS |
| TODO-083 expanded | 200/200 | 200/200 |
| TypeScript | PASS | PASS |
| Prisma validation | PASS | PASS |
| Production build | PASS | PASS |
| OIP Benchmark | 1000/1000 | 1000/1000 |

## 14. Data Integrity

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Developer Demo dataset | Unchanged | Protected digests/counts unchanged across retrieval and RSS probes | PASS |
| Organizational Memory | No mutation or duplicate persistence | No writes from retrieval probes; TODO-030/046/051/052/058B snapshots unchanged | PASS |
| Trust | Relevance independent of trust | TODO-019/029/046/053 trust inversions passed | PASS |
| Reflection | No corruption | No retrieval writes; protected snapshots unchanged | PASS |
| Tickets/sessions | No duplicate or session corruption | RSS-1.2B/RSS-1.2S2/S3 and TODO-034 checks passed | PASS |
| Orphans/duplicates | No new orphan rows or duplicate persistence | Targeted evidence/ticket duplicate checks reported zero; no new rows observed | PASS |

## 15. Remaining Limitations

The broader legacy `developer-demo-integrity` audit reports pre-existing historical after-state/metric drift, four validation/memory-chain anomalies, 15 candidate cross-ticket links, and two unresolved reflection references. Its counts and protected snapshots were unchanged by this work; it is an existing data-audit limitation, not a retrieval mutation. TODO-037 and TODO-025G also contain stale item-count expectations (45 versus the current 47-item mature profile). TODO-041’s larger cross-domain audit retains known fixture/calibration false negatives outside the RSS-1.2C release-gate matrix. These are documented follow-ups and were not hidden by changing production expectations.

## 16. Recommendation

Proceed to RSS-1.2D/next planned stage. Keep the enforced rule that every future failure is first classified as a product regression, verification-fixture regression, or environment/configuration issue before implementation or expectation changes.

## 17. Release Status

**`RETRIEVAL_CALIBRATED`**

The required retrieval calibration matrix passes, weak-overlap and hard-veto safety are intact, explainability and multilingual behavior are verified, deterministic stability is demonstrated, release engineering checks pass, and protected data remains unchanged. No Git tag or automatic commit was created.
