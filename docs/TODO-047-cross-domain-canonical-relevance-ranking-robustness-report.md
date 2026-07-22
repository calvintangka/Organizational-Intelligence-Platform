# TODO-047 Cross-Domain Canonical Relevance & Ranking Robustness Report

## Verdict

`COMPLETED_WITH_REMAINING_LESSON_LAYER`

Canonical relevance is complete for this scope. The correct canonical was raw top-1 for 70/70 TODO-041 positives and 30/30 unseen positives. The production lesson/compatibility path still authorizes only the existing 8/70 cases; the remaining 62 are correctly ranked canonicals without strong deterministic lesson evidence and belong to TODO-045.

## Post-TODO-044 Baseline

Using the unchanged TODO-041 fixture with the pre-TODO-047 scorer:

| Metric | Baseline |
|---|---:|
| Category classification | 70/70 |
| Candidate recall | 70/70 |
| Raw top-3 recall | 66/70 |
| Raw top-1 recall | 37/70 |
| Final canonical selected by lesson/compatibility pipeline | 8/70 |
| Strong lesson evidence | 8/70 |
| Final authorization | 8/70 |

The expected canonical was reachable in every case. The remaining pre-fix errors were ranking errors, not candidate-recall errors.

## Canonical Failure Root Causes

The old scorer gave every same-category item 55 points, then allowed generic tag and boilerplate overlap to dominate. Stored internal guidance and response templates contributed words such as `workspace`, `delivery`, and `report` that were not canonical problem evidence. Reuse history could add up to eight relevance points, allowing mature/highly reused items to tie or outrank a more specific sibling. The original ticket subject and description were not part of retrieval input.

## Current Retrieval Scoring

Before TODO-047, the score was:

`category 55 + tags (up to 30) + keywords (up to 12) + exact canonical phrase 20 + session 8 + reuse history (up to 8)`.

After TODO-047, the score is:

`category 55 + tags (up to 30) + canonical title/problem/tag keywords (up to 12) + bounded problem concepts (up to 28) + exact canonical phrase 20 + session 8`.

Broad response/guidance words remain low-weight recall evidence only. Reuse/validation history contributes **0** relevance points. Trust is never read by ranking. Stable item ID ordering remains the final deterministic tie-breaker.

Representative post-fix breakdowns:

| Case | Correct canonical | Category | Tags | Keywords | Concepts | Total | Generic/wrong winner |
|---|---|---:|---:|---:|---:|---:|---|
| Billing duplicate seats | `demo-ki-duplicate-invoice-seat-change` | 55 | 10 | 5 | 14 | 84 | Failed-card sibling: 73 |
| Webhook signature rotation | `demo-ki-webhook-signature-secret-rotation` | 55 | 20 | 8 | 14 | 97 | IPv6 sibling: 86 |
| Guest workspace access | `demo-ki-guest-workspace-access` | 55 | 10 | 15 | 14 | 94 | Custom-role sibling: 84 |
| CSV encoding | `demo-ki-csv-export-encoding` | 55 | 20 | 7 | 14 | 96 | Large-export sibling: 85 |

## Relevance Invariant

Specific problem meaning outranks generic same-category overlap. Category narrows the search space but does not decide the winner. Bounded concepts are explainable, category-scoped, and require multiple supporting aliases in both the ticket and canonical title/problem/tags.

## Production Fix

- Preserve the original ticket subject/description on `Understanding` for relevance input.
- Score canonical-specific title/problem/tag evidence separately from broad response-template vocabulary.
- Add seven bounded, category-scoped concepts: duplicate billing changes, webhook signature validation, guest workspace access, export encoding, mobile offline conflict, notification suppression, and SSO redirect loops.
- Add structured `relevanceEvidence` to each `KnowledgeMatch` for concise diagnostics.
- Remove reuse/validation history from relevance scoring.
- No canonical IDs, fixture sentences, trust scores, AI outputs, lesson thresholds, or authorization bypasses were added.

## TODO-041 Canonical Before / After

| Metric | Before TODO-047 | After TODO-047 |
|---|---:|---:|
| Candidate recall | 70/70 | 70/70 |
| Raw top-3 recall | 66/70 | 70/70 |
| Raw top-1 recall | 37/70 | 70/70 |
| Correct raw canonical selection | 37/70 | 70/70 |
| Strong lesson selection | 8/70 | 8/70 |
| Final authorization | 8/70 | 8/70 |
| Controls | 24/24 | 24/24 |

## Domain-by-Domain Results

Raw canonical ranking after the fix:

| Domain | Classification | Candidate | Top-3 | Top-1 | Strong lesson | Authorization |
|---|---:|---:|---:|---:|---:|---:|
| Billing | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| API & Integrations | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| Permissions & Access | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| Reporting & Exports | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| Mobile Application | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| Notifications & Email | 10/10 | 10/10 | 10/10 | 10/10 | 0/10 | 0/10 |
| Authentication / SSO | 10/10 | 10/10 | 10/10 | 10/10 | 8/10 | 8/10 |

## Unseen Paraphrase Results

Thirty new cases (five per non-SSO domain) passed classification, candidate recall, top-3 recall, and top-1 canonical selection: **30/30 in every metric**. Lesson authorization was intentionally not required.

## Same-Category Competition

Seven competition cases passed across Billing, Integrations, Permissions, Reporting, Mobile, Notifications, and Authentication. Every specific canonical won against generic siblings. Reversing item-array order preserved the winner. Inverting trust scores preserved the winner and raw scores.

## Generic Ticket Safety

All seven generic category tickets remained unauthorized (`no_template`). Retrieval may expose inspection candidates, but the canonical improvement did not weaken TODO-046’s grounded-response boundary.

## Wrong-Domain Controls

All six overlap controls passed. Invoice words inside integration context, webhook words inside permission context, report wording used as “report a bug,” mobile access wording, certificate/API wording, and notification/billing overlap retained the TODO-044 category and did not authorize an unrelated canonical.

## Trust Independence

Competition trust inversion passed. Trust changes did not change raw scores, top-3 ordering, or the winner. Reuse/validation history is also excluded from score computation.

## TODO-027 Preservation

TODO-027 passed. Exact multi-token canonical evidence, stable ID fallback, stopword handling, duplicate-token behavior, and trust-independent ordering remain intact.

## TODO-046 Safety Preservation

TODO-046 passed: unsafe matrix 0/14, positive authorization 7/7, weak same-category fallback blocked, high trust unable to rescue weak relevance, and AI unable to bypass deterministic gates.

## TODO-040 / SSO Preservation

TODO-040 passed. SSO semantic lesson behavior, the HERO canonical, contradiction vetoes, and negation vetoes remain intact. TODO-039 classification and TODO-037 natural paraphrase audit also passed.

## Lesson Boundary

| State | Count |
|---|---:|
| Correct canonical + strong lesson | 8 |
| Correct canonical + lesson evidence failure | 62 |
| Wrong canonical | 0 |
| No canonical | 0 |
| Safety rejection | 62 |

“Safety rejection” here means the expected safe no-template result after a correct raw canonical was found; it is not a TODO-047 ranking failure. Semantic lesson evidence is TODO-045.

## Explainability

Each `KnowledgeMatch` now exposes category, tag, keyword, concept, phrase, session, and reuse-point fields plus matched concept IDs. Representative reasons identify why a specific canonical outranked its sibling without exposing chain-of-thought.

## TODO-041 Overall Impact

Classification was already fixed by TODO-044 (15/70 → 70/70). TODO-047 improves canonical ranking from 66/70 top-3 and 37/70 top-1 to 70/70 for both. Final authorization remains 8/70 because the existing lesson evidence/compatibility boundary correctly rejects 62 paraphrases pending TODO-045.

## Regression Results

- TODO-047 ranking probe: **PASS** (70/70 top-1, 30/30 unseen, competition/generic/wrong-domain pass).
- TODO-041: **PASS controls**, snapshots unchanged; expected downstream verdict remains `CROSS_DOMAIN_RETRIEVAL_WEAKNESS_CONFIRMED` due lesson/authorization layer.
- TODO-044: **PASS** (70/70, 30/30, 18/18, 6/6).
- TODO-046: **PASS** (unsafe 0/14; positive 7/7).
- TODO-040, TODO-039, TODO-037, TODO-032, TODO-030, TODO-029, TODO-028, TODO-027, TODO-043: **PASS**.
- TODO-025F mature retrieval: **PASS**; TODO-025G curated scenarios: **PASS**; TODO-019 lesson ranking: **PASS**.
- BUG-008 retrieval/semantic, BUG-010 pipeline/failover, persistence boundary, server persistence, and organization switching: **PASS**.
- TypeScript, strict unused TypeScript, and production build: **PASS**.

## Mature Data Safety

All five protected organization snapshots were unchanged. No KnowledgeItems, lessons, versions, tickets, TrustEvidence, trust, validations, MemoryChangeRecords, OrgMetrics, or provenance were written.

## TODO-043 Provenance Preservation

The HERO canonical retained source ticket `OIP-20230104-0001`. TODO-043 passed.

## Remaining Findings

Canonical retrieval/ranking is no longer the blocker. Sixty-two natural-language cases still stop at the safe lesson/compatibility boundary because strong semantic lesson evidence is not yet available.

## Recommended Next Step

TODO-045 — Cross-Domain Semantic Lesson Evidence & Paraphrase Matching. Rerun TODO-041 after that layer is implemented.

## TODO-047 Status

Complete for canonical relevance and ranking scope.

## Commit

d9b06ef - Implement TODO-047 canonical relevance ranking
