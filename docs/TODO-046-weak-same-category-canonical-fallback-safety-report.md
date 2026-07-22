# TODO-046 Weak Same-Category Canonical Fallback Authorization Safety Report

## Verdict

**COMPLETED**

The C02 authorization bypass is closed at the final drafting boundary. Weak same-category candidates now fail closed without claiming validated Organizational Memory. Remaining cross-domain natural-language recall weaknesses are unchanged and deferred to TODO-044/045/047.

## C02 Before Fix

Fixture: TODO-041 C02 (`same-category-tax-rounding`)

- Subject: `Small difference in tax total`
- Description: `The invoice has a rounding difference on tax, not a repeated charge and not a change in the number of seats.`
- Analyzer category: `Billing`
- Expected behavior: human review / no grounded knowledge authorization
- Raw candidates: `demo-ki-invoice-tax-rounding` (85), `demo-ki-failed-card-retry-schedule` (82), `demo-ki-proration-credit-mismatch` (82), `demo-ki-invoice-currency-display` (81), `demo-ki-annual-renewal-seat-count` (79)
- Selected canonical: `demo-ki-invoice-currency-display`
- Canonical retrieval score: 81
- Selected lesson: none
- Matched lesson signals: none
- Lesson evidence score: 0
- Multi-token evidence: 0
- Ticket evidence coverage: 0
- Compatibility: `compatible` — root-cause evidence agreed only on broad `invoice_question`
- Semantic compatibility: not invoked; deterministic compatibility was already `compatible`
- Old authorization path: canonical customer-template fallback
- Old final result: grounded deterministic draft using the selected canonical item

## Root Cause

The production path was:

`ticket → understandForProfile → retrieveMemory → selectPreferredMatch → isCompatibleForDrafting → draftResponse`

Inside `draftResponse`, TODO-030 correctly rejected weak lesson evidence only when `lessonMatch` existed. C02 had no lesson match, so it skipped that guard. The later branch authorized any compatible candidate with `matchScore > 0`, regardless of validated lesson evidence.

## Authorization Bypass

The bypass was the legacy branch:

```text
compatibleMatch && matchScore > 0
  → renderCustomerResponse(item)
  → basedOnKnowledgeIds.push(item.id)
```

This made category/root-cause compatibility, trust-independent candidate scoring, and template existence sufficient to claim grounded knowledge. TODO-030 did not cover the no-lesson canonical fallback branch.

## Safety Invariant

**Category compatibility is necessary but not sufficient for knowledge authorization.**

Validated Organizational Memory may be claimed only when sufficiently strong relevance evidence exists. Category compatibility, trust, template existence, or AI confidence cannot substitute for that evidence. Otherwise the response is ungrounded human-review authoring.

## Production Fix

Added a final authorization guard in [lib/drafting.ts](C:/Users/Calvin/Documents/My%20Project/Hackathon%202/lib/drafting.ts): when a candidate is compatible but has no validated lesson match, `draftResponse` returns `no_template`, clears `basedOnKnowledgeIds`, and explains that human review must author the response.

No analyzer, retrieval, ranking, trust, category, AI provider, or persisted data logic was changed.

## C02 After Fix

- Candidate remains retrievable and explainable.
- Selected canonical remains `demo-ki-invoice-currency-display` with score 81.
- Compatibility remains `compatible`.
- Lesson evidence remains zero.
- Final authorization: rejected.
- Final draft type: `no_template`.
- Grounded knowledge IDs: empty.
- Explainability explicitly states that no validated lesson supplied sufficient relevance evidence.

## Weak Same-Category Safety Matrix

14/14 cases passed with zero unsafe authorizations:

- Weak and generic Billing
- Weak and generic Login
- Weak and generic API/Integrations
- Weak and generic Permissions
- Weak and generic Reporting
- Weak and generic Mobile
- Weak and generic Notifications

## Positive Match Preservation

7/7 representative strong matches remained authorized:

- TODO-040 natural SSO paraphrase
- TODO-028 specific SSO sibling lesson
- Strong Billing duplicate-invoice lesson
- Strong Integrations webhook lesson
- Strong Permissions lesson
- Strong Reporting lesson
- Strong Notifications lesson

## TODO-030 Preservation

Passed. M07 remains `no_template`; weak lesson evidence, high trust, forged semantic approval, contradiction, and negation remain blocked.

## TODO-040 Preservation

Passed. The representative natural SSO semantic case remains authorized with lesson `demo-les-sso-certificate-redirect-loop-001`.

## Trust Safety

C02-style authorization was rejected at trust scores 1, 50, 95, and 100. A strong Billing match remained selected and authorized with the expected item at Trust 1 and a competing item at Trust 100. TODO-029 passed.

## AI / Claude Safety

Controlled mocks passed without a live provider:

- High-confidence AI compatibility: blocked, zero provider calls
- Provider unavailable: blocked
- Malformed response: blocked
- Forged valid lesson ID: blocked

The final deterministic authorization boundary remains authoritative.

## Explainability

Rejected candidates remain visible to the caller for inspection with category, retrieval score, compatibility, trust, and rejection reason. The final response is `no_template`, has no grounded knowledge IDs, and does not claim that validated Organizational Memory was used.

## TODO-041 Impact

| Metric | Before | After |
|---|---:|---:|
| Controls | 23/24 | 24/24 |
| C02 | unsafe authorization | rejected / `no_template` |
| Non-SSO authorization | 0/60 | 0/60 |
| Non-SSO candidate recall | 60/60 | 60/60 |

TODO-041 now reports `CROSS_DOMAIN_RETRIEVAL_WEAKNESS_CONFIRMED` rather than `SAFETY_FAILURE`: its recall weakness remains, while the safety control is closed.

## Regression Results

Passed: TODO-046 focused probe, TODO-041 cross-domain audit, TODO-030, TODO-029, TODO-028, TODO-027, TODO-032, TODO-037, TODO-039, TODO-040, TODO-043, TODO-025F (23/23), TODO-025G, TODO-019, BUG-008 retrieval, BUG-008 semantic safety, BUG-010 AI failover/safety, organization switching, persistence boundary, server persistence, TypeScript, strict unused TypeScript, and production build.

## Mature Data Safety

The focused probe was read-only. Before/after snapshots for Developer Demo, Maesa, FastDrop, Pramana, and `test-oip-regression` were unchanged. No KnowledgeItems, lessons, versions, tickets, TrustEvidence, trust, validations, memory/history, metrics, sequences, or provenance changed.

## TODO-043 Provenance Preservation

HERO `demo-ki-sso-certificate-redirect-loop` still has source ticket `OIP-20230104-0001`. The TODO-043 regression probe passed.

## Remaining Findings

Cross-domain natural-language classification and recall remain weak outside the repaired SSO path. This fix intentionally does not add synonyms, category mappings, retrieval heuristics, or ranking changes.

## Recommended Next Step

TODO-044 — Cross-Domain Natural-Language Classification Robustness.

## TODO-046 Status

Complete. The weak same-category canonical fallback authorization safety gap is closed.

## Commit

Pending commit for the final drafting guard, focused safety probe, and report.

