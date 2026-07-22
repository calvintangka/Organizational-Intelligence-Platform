# TODO-041 Cross-Domain Natural-Language Retrieval & Lesson Matching Audit Report

## Verdict

**SAFETY_FAILURE**

The audit found a broad non-SSO retrieval/classification weakness and one unsafe same-category Billing authorization. The non-SSO result is also a systemic cross-domain weakness: 0/60 natural paraphrases reached final authorization, despite 60/60 candidate recall. Safety gates, contradiction/negation handling, trust-independent relevance, AI fail-closed behavior, and TODO-043 provenance remained intact except for the observed weak canonical fallback case described below.

## Environment

- Organization: `profile-oip-developer-demo` (OIP Developer Demo)
- Persisted data: 45 KnowledgeItems, 180 lessons, 5,000 tickets, 1,800 candidates, 1,800 validations, 1,800 memory records, 4,500 TrustEvidence rows, 130 versions, 45 patterns
- Audit mode: read-only; all synthetic tickets and trust inversions were in memory
- Production boundaries exercised: analyzer, canonical retrieval, lesson pre-discrimination, canonical/lesson selection, compatibility, semantic authorization, and drafting
- Fixture: [todo041-cross-domain-fixtures.json](C:/Users/Calvin/Documents/My%20Project/Hackathon%202/scripts/fixtures/todo041-cross-domain-fixtures.json)
- Runner: [todo041-cross-domain-audit.cjs](C:/Users/Calvin/Documents/My%20Project/Hackathon%202/scripts/todo041-cross-domain-audit.cjs)

## Domains Tested

Billing, API & Integrations, Permissions & Access, Reporting & Exports, Mobile Application, Notifications & Email, and Authentication / SSO as the repaired control.

Selected canonical items had multiple validated lessons and sibling competition. Representative targets were duplicate invoice after seat changes, webhook signature failure after secret rotation, guest workspace access, CSV export encoding, mobile offline synchronization conflict, email notification suppression, and SSO redirect loop after certificate rotation.

## Test Dataset

- 70 positive paraphrases: 10 per domain, written as customer symptoms, indirect descriptions, technical and non-technical variants, and short/long descriptions without copying stored titles or lesson signals.
- 24 negative/ambiguous controls: same-category siblings, weak overlap, contradiction, negation, missing evidence, unknown issue, and six cross-domain mixtures.
- Exact-word dependency: each positive was run as natural wording, natural wording plus one stored signal, and natural wording plus multiple stored signals.
- SSO control: 10 representative TODO-037/TODO-040 paraphrases were rerun separately.

## Overall Results

| Metric | Result |
|---|---:|
| Positive paraphrases | 70 |
| Correct classification | 15/70 (21.4%) |
| Canonical candidate recall | 70/70 (100%) |
| Top-3 canonical recall | 33/70 (47.1%) |
| Correct canonical final selection | 8/70 (11.4%) |
| Correct lesson selection | 8/70 (11.4%) |
| Strong lesson evidence | 8/70 (11.4%) |
| Final authorization | 8/70 (11.4%) |
| False negatives | 62/70 (88.6%) |
| Negative/ambiguous controls | 24 |
| False-positive authorizations | 1/24 (4.2%) |

## Results Excluding SSO

Across the six non-SSO domains: classification was 5/60 (8.3%), candidate recall was 60/60 (100%), top-3 recall was 23/60 (38.3%), canonical selection was 0/60, lesson selection was 0/60, strong lesson evidence was 0/60, and final authorization was 0/60. This is systemic across the tested non-SSO domains rather than isolated to one fixture.

## Domain-by-Domain Results

| Domain | Positives | Classification | Candidate recall | Top-3 | Canonical | Lesson | Evidence | Authorization |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Billing | 10 | 3/10 | 10/10 | 5/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| API & Integrations | 10 | 0/10 | 10/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| Permissions & Access | 10 | 2/10 | 10/10 | 7/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| Reporting & Exports | 10 | 0/10 | 10/10 | 7/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| Mobile Application | 10 | 0/10 | 10/10 | 2/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| Notifications & Email | 10 | 0/10 | 10/10 | 2/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| Authentication / SSO (new cases) | 10 | 10/10 | 10/10 | 10/10 | 8/10 | 8/10 | 8/10 | 8/10 |

## Classification Results

The analyzer correctly recognized the repaired SSO vocabulary. Non-SSO natural language frequently became `Uncategorized`; Billing and Permissions received partial recognition because generic rules happen to contain invoice/charge/permission vocabulary. Persisted Developer Demo labels such as `API & Integrations`, `Reporting & Exports`, `Mobile Application`, and `Notifications & Email` are not registered as equivalent analyzer categories, so real customer wording cannot enter the corresponding compatibility path.

## Canonical Retrieval Results

Raw candidate recall was 100% across all 70 positives, proving that the persisted memory was reachable. However, only 33/70 targets were in the raw top three and only 8/70 became the final canonical selection. The dominant failure was upstream classification; the remaining seven failures were canonical selection/ranking under competing lexical overlap.

## Lesson Selection Results

Only the 8 successful SSO selections reached lesson matching and selected the expected lesson. The six non-SSO domains reached 0/60 lesson selections because classification/compatibility stopped the pipeline before validated lessons could authorize reuse.

## Lesson Evidence Results

Strong validated lesson evidence was present in 8/70 cases (the successful SSO cases). Generic category overlap did not authorize a lesson. Exact-word probing showed that adding stored signals can restore the deterministic lesson path, which is evidence of lexical dependency rather than proof of semantic generalization.

## Final Authorization Results

Final authorization was 8/70 overall and 0/60 outside SSO. The 10-case TODO-037/TODO-040 SSO control was 10/10 for classification, candidate recall, top-3 recall, canonical selection, lesson selection, strong evidence, and authorization.

## Exact-Word Dependency

Across all 70 positives:

- Natural wording: 8/70 authorized
- Natural wording + one stored signal: 13/70 authorized
- Natural wording + multiple stored signals: 59/70 authorized

The natural → one-signal → many-signal pattern confirms a broad exact-word/lexical-dependency weakness outside the SSO concept groups. No remediation was added in TODO-041.

## Negative & Ambiguous Controls

23/24 controls were correctly blocked. The failing control was C02 (`same-category-tax-rounding`): a Billing ticket with a small tax difference selected `demo-ki-invoice-currency-display`, had no strong lesson evidence, but still produced a canonical template authorization through the weak canonical fallback. This is an unsafe false-positive authorization, not a retrieval false negative.

## Cross-Domain False Positive Results

The six deliberate cross-domain mixtures (billing/access, login/invoice, webhook/permissions, mobile/authentication, reporting/notification, and certificate/API) were blocked. The observed false positive was same-category Billing ambiguity, demonstrating that category compatibility alone is still too permissive when a canonical item has no strong validated lesson evidence.

## SSO Control Results

The repaired SSO control remains healthy: the representative TODO-037/TODO-040 subset passed 10/10, and the existing TODO-037 audit remains 20/20 with no safety failures. New SSO wording in the cross-domain fixture reached 8/10 authorization, with the two misses classified as canonical-selection/lexical edge cases rather than a regression of the control subset.

## Trust Independence

With the expected Billing item at Trust 1 and a competing item at Trust 100, the strong relevance probe still selected the expected item. The high-trust competitor did not overtake it. However, the C02 weak Billing false positive remained authorized under the trust-inverted run, confirming that this is a canonical fallback safety issue and not trust-as-relevance behavior. TODO-029 itself passed.

## AI / Claude Safety

No live Claude call was required. Controlled provider results verified that:

- A valid unknown-state SSO case can be explicitly AI-assisted within the deterministic boundary.
- Contradiction and incompatible-category cases made zero provider calls.
- Weak overlap made zero provider calls.
- Provider failure, malformed confidence, and nonexistent lesson IDs failed closed.
- AI could not override deterministic compatibility or negation gates.

The core cross-domain verdict is deterministic and does not depend on provider availability.

## Failure Layer Breakdown

- `CLASSIFICATION_FAILURE`: 55/70 positive cases
- `CANONICAL_SELECTION_FAILURE`: 7/70 positive cases
- `LESSON_RETRIEVAL_FAILURE`, `LESSON_RANKING_FAILURE`, `LESSON_EVIDENCE_FAILURE`, and `DRAFTING_AUTHORIZATION_FAILURE`: not reached by the failed non-SSO cases because earlier gates stopped them
- `FALSE_POSITIVE_AUTHORIZATION`: 1/24 controls (C02)

## Root Causes

1. **Profile/category vocabulary gap** — the analyzer does not register all persisted Developer Demo domain labels, so natural API, reporting, mobile, and notification language is frequently unclassified.
2. **Cross-domain lexical ranking weakness** — raw retrieval finds the target but sibling and generic terms often displace it from the top three.
3. **Lesson accessibility gap** — without the correct category, validated lesson evidence cannot authorize reuse; adding multiple stored signals restores it in 59/70 cases.
4. **Weak canonical fallback safety gap** — a same-category canonical template can still be authorized without strong lesson evidence (C02).

## TODO-043 Provenance Preservation

Before/after snapshots were identical for Developer Demo, Maesa, FastDrop, Pramana, and `test-oip-regression`. The HERO remains `demo-ki-sso-certificate-redirect-loop` with source ticket `OIP-20230104-0001`. The TODO-043 provenance regression probe passed.

## Regression Results

Passed: TODO-025E integrity, TODO-025F mature retrieval (23/23), TODO-025G curated scenarios, TODO-027 canonical specificity, TODO-028 sibling specificity, TODO-029 trust independence, TODO-030 weak-overlap safety, TODO-032 category compatibility, TODO-037 natural paraphrase audit, TODO-039 classification, TODO-040 semantic lesson matching, TODO-043 provenance, TODO-019 lesson ranking, BUG-008 retrieval, BUG-008 semantic safety, BUG-010 AI pipeline/failover, organization switching (run against a clean port 3100 Next server), persistence boundary, TypeScript, strict unused TypeScript, and production build.

## Mature Data Safety

The TODO-041 probe performed no database writes. All five organization snapshots were unchanged before and after the audit. No KnowledgeItems, lessons, versions, tickets, TrustEvidence, validations, memory/history records, trust scores, metrics, sequence values, or provenance changed.

## Recommended Follow-Up TODOs

- Add a profile-aware category registry for persisted Developer Demo domains, with explicit compatibility mappings and tests for API, reporting, mobile, and notification language.
- Design one shared cross-domain semantic retrieval/lesson-evidence remediation for natural paraphrases; avoid per-fixture synonym patches.
- Tighten the canonical fallback so same-category overlap cannot authorize a customer template without strong validated lesson evidence, including the C02 regression case.
- Extend cross-domain adversarial controls before enabling any broader AI-assisted retrieval behavior.

## TODO-041 Status

Audit complete. Production retrieval, classification, lesson matching, compatibility, trust, drafting, and AI behavior were not modified. Findings are deferred to separate remediation TODOs.

## Commit

Pending commit for the audit fixture, read-only probe, and this report.

