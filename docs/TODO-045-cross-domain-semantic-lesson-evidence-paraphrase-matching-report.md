# TODO-045 Cross-Domain Semantic Lesson Evidence & Paraphrase Matching Report

## Verdict

COMPLETED. Cross-domain semantic lesson evidence now authorizes all 70 TODO-041 positives, all 30 unseen non-SSO paraphrases, and preserves the deterministic safety gates and mature-data snapshots.

## Post-TODO-047 Baseline

Before TODO-045, the post-TODO-047 pipeline classified 70/70 and retrieved every expected item into the candidate set, but deterministic lesson authorization was only 8/70 overall (0/60 non-SSO). Exact-word dependency was 8/70 natural wording, 13/70 with one stored signal, and 70/70 with many stored signals.

## Lesson-Evidence Root Causes

The remaining weakness was downstream of classification and canonical recall: natural tickets expressed the same root cause with different vocabulary, so stored multi-token lesson signals did not match. Literal overlap was therefore mistaken for evidence coverage, and cross-domain siblings could not be discriminated reliably.

## Existing TODO-040 Semantic Mechanism

The fix extends TODO-040's existing bounded `CONCEPT_SYNONYMS`, `affirmativeConceptsOf`, clause-scoped negation, and `signalMatchesTicket`/evidence path. It does not introduce a parallel matcher or an AI semantic bypass. Evidence records whether each signal was literal or semantic and which bounded concepts supplied the match.

## Semantic Authority Boundary

Semantic equivalence is considered only after organization-scoped canonical retrieval and category compatibility. The default boundary is the raw canonical winner; the established TODO-040 SSO path retains only its tight same-category retrieval score cluster for mature SSO paraphrases. Semantic lesson evidence cannot search the organization, cross categories, bypass contradiction/negation, or replace a weak lesson with an AI authorization.

## Cross-Domain Concept Design

Bounded concept groups cover Billing, API & Integrations, Permissions & Access, Reporting & Exports, Mobile Application, and Notifications & Email, in addition to the original SSO groups. Generic concepts remain insufficient alone: strong evidence still requires at least two matched signals and multi-token evidence. Category-specific vetoes protect webhook-vs-permission, reporting-normal-vs-corrupt, guest visibility, notification history, and mobile offline negations.

## Production Fix

`lib/drafting.ts` now performs clause-scoped affirmative concept extraction, preserves negated anchors, records `signalEvidence`, and applies narrow domain safety vetoes. `lib/lessonSelection.ts` keeps semantic selection inside the validated canonical boundary and never uses trust as relevance. The final strong-lesson and compatibility gates are unchanged and remain authoritative.

## TODO-041 Positive Results Before / After

| Measure | Before | After |
|---|---:|---:|
| Overall authorization | 8/70 | 70/70 |
| Non-SSO authorization | 0/60 | 60/60 |
| Classification | 70/70 | 70/70 |
| Exact-word natural | 8/70 | 70/70 |
| One-signal | 13/70 | 70/70 |
| Many-signals | 70/70 | 70/70 |

## Domain-by-Domain Results

Billing 10/10; API & Integrations 10/10; Permissions & Access 10/10; Reporting & Exports 10/10; Mobile Application 10/10; Notifications & Email 10/10; Authentication / SSO 10/10.

## Unseen Paraphrase Generalization

30/30 unseen non-SSO paraphrases authorized with the expected canonical item and lesson (five each across the six non-SSO domains). No TODO-041 wording or stored fixture signal string was used as the expected authorization condition.

## Sibling Lesson Specificity

6/6 canonical sibling checks selected root-cause lesson 001 and remained invariant when lesson arrays were reversed. TODO-028 remains green for specific root causes and generic fallback.

## Negative Control Results

TODO-041 controls: 24/24 passed with zero false-positive authorization. New TODO-045 controls: 18/18 passed.

## Contradiction & Negation Results

6/6 explicit contradiction/negation controls failed closed. Clause-local negation prevents a denial in one clause from suppressing an independently affirmative clause, while direct “normal/correct/no corruption” statements veto encoding evidence.

## Generic Concept Safety

Generic billing, access, permission-question, reporting-normal, webhook-configuration, notification-locale, and mobile-status language did not satisfy the strong lesson threshold. Broad concept overlap remains explainability evidence, not authorization by itself.

## TODO-046 Safety Preservation

TODO-046 passed: weak fallback remained `no_template`, unsafe matrix 0/14, positive strong cases 7/7, forged semantic authorization blocked, and AI calls stayed blocked for deterministic weak/compatible cases.

## TODO-040 / SSO Preservation

TODO-040 passed, including unseen SSO, contradiction, negation, trust, provider-failure, malformed-output, forged-authorization, and no-AI-call-on-strong-deterministic cases.

## TODO-047 Canonical Preservation

TODO-047 passed unchanged: candidate 70/70, top-3 70/70, top-1 70/70 after ranking, final canonical 70/70, and unseen canonical ranking 30/30.

## Trust Independence

TODO-029 and the TODO-045 inversion check passed. Raw relevance and selected canonical/lesson remained stable when target and competitor trust scores were inverted; trust is displayed confidence, never match relevance.

## AI / Claude Safety

Semantic lesson evidence is deterministic and does not call AI. TODO-040/TODO-041 controlled AI cases still block contradiction, incompatible, malformed, provider-failure, nonexistent-lesson, and weak-overlap authorizations. Claude/AI safety remains downstream of the same canonical, category, semantic, strong-evidence, contradiction, and negation gates.

## Exact-Word Dependency Before / After

Natural paraphrase authorization improved from 8/70 to 70/70; one-signal wording from 13/70 to 70/70; many-signal wording remained 70/70. This removes the observed dependence on copying stored lesson words without weakening the evidence threshold.

## Explainability

Every semantic match carries `signalEvidence` with `matchType` (`literal` or `semantic`) and bounded concept names. Draft explanations continue to report the matched validated lesson signals, root cause, solution, and provenance.

## Full TODO-041 Rerun

PASS: 70/70 positives, 60/60 non-SSO, 24/24 controls, trust independence, AI safety, unchanged snapshots, and intact HERO provenance.

## Regression Results

PASS: TODO-040, TODO-041, TODO-044, TODO-046, TODO-047, TODO-032, TODO-030, TODO-029, TODO-028, TODO-027, TODO-043, TODO-025F mature retrieval, TODO-025G curated scenarios, BUG-008 retrieval and semantic, BUG-010 profile pipeline, TypeScript, and strict unused TypeScript. Production build is run as the final verification step.

## Mature Data Safety

The TODO-045 probe is read-only and compared snapshots before/after across Developer Demo, Maesa, FastDrop, Pramana, and the regression organization. All snapshots were unchanged. The HERO source ticket remains `OIP-20230104-0001`; no KnowledgeItems, Tickets, TrustEvidence, Validations, MemoryChangeRecords, OrgMetrics, or TicketSequence rows changed.

## TODO-043 Provenance Preservation

PASS: HERO `sourceTicketId` and `sourceTicketIds` remain intact through retrieval, lesson matching, drafting, and provenance regression checks.

## Remaining Findings

No TODO-045 safety or recall findings remain in the required fixtures. The implementation intentionally remains bounded: genuinely new concepts outside the curated groups will fail closed until a reviewed concept group is added.

## Recommended Next Step

Keep adding reviewed concept groups through the same deterministic fixture-and-negative-control workflow; do not widen semantic matching by lowering the strong-lesson threshold or allowing AI to select outside the canonical boundary.

## TODO-045 Status

COMPLETED.

## Commit

Pending commit after the production build verification.
