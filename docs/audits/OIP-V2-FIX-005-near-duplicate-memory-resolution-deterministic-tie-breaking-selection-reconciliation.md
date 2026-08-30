# OIP-V2-FIX-005 — Near-Duplicate Memory Resolution, Deterministic Tie-Breaking & Selection Reconciliation

## 1. Executive Summary

FIX-005 is implemented as a targeted deterministic retrieval repair. The prior failure was reproduced: several warehouse/scanner memories were relevant and tied at the effective score, while the old fallback selected a lower-ID historical representation. A second defect then dropped the selected candidate from `similarKnowledge` when an advisory discrimination gate rejected it, making the next candidate appear to be rank one.

The repair adds explicit selection evidence and a shared comparator. Hard compatibility remains authoritative; structured scope/condition/problem/causal evidence precedes raw relevance ties; grounding and governance resolve only otherwise equal relevance; equivalent validated representations use a late validation-time tie-break, followed by canonical ID for a same-instant tie. Scope text no longer inflates lexical relevance by quantity. The selected candidate is retained in the retrieval projection when a later safety gate rejects reuse.

No schema change, automatic merge, deletion, embedding, vector search, RAG, or LLM reranking was introduced.

## 2. Final Verdict

`OIP_V2_FIX_005_IMPLEMENTED_WITH_FOLLOWUPS`

The retrieval blocker is closed and the full AUTO sequence is accepted with its existing guardrail follow-up: run the owned-server restart leg when a restart-specific acceptance record is desired.

## 3. Repository State Before

- Branch: `landing/option-c32-release-polish`
- Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Worktree was already dirty with prior product, documentation, migration, audit, and probe work. No reset, clean, restore, stash, stage, commit, push, tag, deploy, or publish operation was performed.
- Prisma migration status before change: 28 migrations found; database schema up to date.

## 4. Latest AUTO QA Baseline

The required baseline reports were read:

- `docs/audits/OIP-V2-QA-001R-R2-AUTO-organizational-memory-core-acceptance.md`
- `docs/audits/OIP-V2-FIX-004-retrieval-candidate-selection-event-time-copy-reconciliation.md`
- `docs/audits/OIP-V2-FIX-003-domain-neutral-retrieval-outcome-trust-reconciliation.md`
- `docs/audits/OIP-V2-QA-001R-R2-organizational-memory-core-acceptance.md`

The latest pre-fix AUTO report was partially accepted because Event B selected an older near-duplicate instead of fresh Event A. It already proved entry, Source, six Evidence records, preparation, validation, persistence, outcomes, Challenge, scope evolution, trust inspection, isolation, restart behavior in the applicable run, and AI boundaries.

## 5. Confirmed Retrieval Defect

Classification: `NEAR_DUPLICATE_SELECTION_DEFECT`.

The original Event B was unchanged:

> At another warehouse, handheld inventory scanners periodically stop synchronizing while employees move between scanning zones. Inventory backend services remain healthy.

Before the repair, the ranking contained equal-score candidates such as `neutral-problem-cmt9xqrpk0018uotm68ty3osz` and the then-fresh `neutral-problem-cmta0420z000c0ktmdc85qpba`, both at score 62 in the failing AUTO record. The lower-ID historical candidate won.

## 6. Exact Failure Reproduction

The reproduction used the existing Merah Putih Operations organization and preserved all historical candidates. The old path showed:

1. candidate family discovered;
2. several candidates tied or nearly tied;
3. canonical ID ordering selected the historical candidate;
4. after advisory discrimination rejected the selected item, the projection omitted that item and exposed the next candidate as apparent rank one;
5. `memoryMatch` became null while the displayed candidate identity no longer represented the selected top candidate.

## 7. Candidate Inventory

The relevant pre-fix family included:

| Candidate | Relationship / state | Before result |
| --- | --- | --- |
| `neutral-memory-cmt9xqrpk0018uotm68ty3osz` | Older validated QA Event A, active/trusted | Score-tied winner in the failing run |
| `neutral-memory-cmt9zfm8e0006xotm2vv1qppz` | Historical near-duplicate, active/trusted | Score-tied competitor |
| `neutral-memory-cmt9zgqre0007cctm561k504c` | Historical near-duplicate, active/trusted | Score-tied competitor |
| `neutral-memory-cmt9zyl9c0008iwtmx4q0b8h3` | Historical near-duplicate, active/trusted | Score-tied competitor |
| `neutral-memory-cmta0420z000c0ktmdc85qpba` | Fresh validated Event A | Entered candidate set but lost the old tie |
| `neutral-memory-cmt8b83mm00177ktm8xbtj0cc` | Earlier roaming lesson with evolved scope | Relevant, slightly different evidence |
| `neutral-memory-cmt7839sv000l7otm6o8fvfic` | Deprecated historical roaming incident | Restricted by lifecycle |

The focused FIX-005 fixture additionally included broad scanner, backend outage, certificate, and high-trust less-compatible controls. Incompatible outage and certificate candidates were excluded before tie-breaking.

## 8. Candidate Relationship Classification

- Same generated Event A lesson with equivalent active scope: `EXACT_DUPLICATE_LESSON` or `NEAR_DUPLICATE_SAME_SCOPE`, depending on wording and provenance.
- Earlier roaming lesson with a governed scope note: `NEAR_DUPLICATE_SAME_SCOPE` for Event B, with a distinct historical representation.
- Deprecated affected-warehouse record: `SAME_PROBLEM_DIFFERENT_SCOPE` and lifecycle-restricted.
- Broad scanner record: `RELATED_BUT_DISTINCT`.
- Backend outage and certificate records: `SAME_SYMPTOM_DIFFERENT_CAUSE`.

No canonical duplicate relationship currently exists. There is no persisted `supersedes`, `derived-from`, `same lesson family`, replacement, or merged identity relation among these KnowledgeItems.

## 9. Root Cause

Confirmed classifications:

- `SCORE_COLLISION`
- `MISSING_SPECIFICITY_SIGNAL`
- `MISSING_CURRENT_REVISION_SIGNAL` (no persisted duplicate/current-representation relation exists)
- `RANKING_GROUNDING_DIVERGENCE`
- `PROJECTION_SELECTION_DIVERGENCE`

The old ID fallback itself was deterministic, but it was reached before a sufficiently explicit semantic selection policy. The projection divergence was independently confirmed in `processTicket.ts`.

## 10. Why the Wrong Candidate Won Before

The old path compared final score, capped specificity, then canonical ID. Several candidates had identical effective lexical, compatibility, and evidence-quality values. Trust, reuse, and recency were not supposed to decide relevance, so the historical canonical ID won by fallback. Separately, when a later discrimination safety gate returned no reusable match, `similarKnowledge` removed `topMatch`; the next candidate then looked like rank one.

## 11. Candidate Selection Semantics Before

`retrieveMemory` generated and filtered candidates, then sorted mainly by `matchScore`, specificity, and canonical ID. Scope text participated in ordinary lexical evidence, which allowed evolved historical scope wording to add relevance points. `selectPreferredMatch` operated on the already ordered front of the list. A rejected selected candidate was omitted from the downstream similar-candidate projection.

## 12. Candidate Selection Semantics After

The effective hierarchy is:

1. hard compatibility and contradiction exclusion;
2. structured scope applicability and shared specific facets;
3. operational-condition compatibility;
4. problem/symptom compatibility;
5. causal/intervention compatibility;
6. intrinsic raw relevance and specificity;
7. grounding readiness, only at an otherwise equal relevance level;
8. governance/lifecycle eligibility, without allowing an unrelated active record to replace a materially better relevant record;
9. validation chronology only when the semantic tie key is identical;
10. canonical KnowledgeItem ID as the final same-instant stable fallback.

The same comparator is available to retrieval and lesson selection. A selected candidate is retained in `similarKnowledge` if a later safety gate rejects reuse, so the user-facing explanation does not silently substitute another candidate.

## 13. Near-Duplicate Resolution

Near-duplicates are not merged or rewritten. Candidates first differ by structured applicability and intrinsic evidence. If their semantic tie key, relevance, grounding state, governance state, and lifecycle state are equivalent, the most recently validated equivalent representation wins. This is a late current-representation tie-break, not a global newest-wins policy. Same-instant equivalence falls through to canonical ID.

## 14. Deterministic Tie-Breaking

Diagnostics distinguish `SEMANTIC_WIN` from `DETERMINISTIC_EQUIVALENT_TIE_BREAK`. The focused probe demonstrates the latter for the A/B near-duplicate pair. Array order, database order, trust, and reuse count do not participate.

## 15. Specificity Role

Specific condition and causal/intervention evidence are represented separately from the capped raw score. The roaming transition has more structured applicability than the broad scanner symptom, so the specific candidate wins. Existing category and root-cause gates remain authoritative.

## 16. Scope Role

Scope remains a compatibility gate. Scope exclusions are evaluated by the existing structured compatibility function; they do not get overridden by chronology or ID. Scope notes are no longer treated as a crude source of lexical evidence quantity. Event B remains compatible with the roaming scope; firmware-specific Event D remains fail-closed after narrowing.

## 17. Evidence/Grounding Role

Evidence contributes through direct overlap with the active problem, direct condition support, causal/intervention support, and grounding readiness. Evidence-quality points now require direct support in lessons, workflow, or examples rather than merely counting all records. Ten irrelevant evidence records cannot beat six directly applicable records merely by count. Grounding remains distinct from relevance.

## 18. Reliability Role

Trust, successful resolutions, reuse count, and reliability remain explanatory metadata. They do not outrank compatibility or relevance. The high-trust broad control loses to the lower-trust specific roaming candidate.

## 19. Recency Role

Recency is consulted only after the semantic tie key and relevance dimensions are equal, using validation chronology as the current equivalent-representation tie-break. A newer vague candidate does not beat an older specific candidate.

## 20. Stable Final Fallback

Canonical KnowledgeItem ID ordering is the final fallback when equivalent candidates have the same validation instant. It guarantees repeatability without claiming semantic superiority.

## 21. Ranking-to-Selection Reconciliation

The selected identity is explicit in the returned `KnowledgeMatch`. `selectPreferredMatch` uses the same comparator for its same-canonical candidate pool. The repaired projection keeps `[topMatch, ...remaining]` when a safety gate rejects reuse, preventing rank-one substitution.

## 22. Grounding Identity Reconciliation

The selected match is the candidate passed to lesson matching and grounding. If grounding rejects it, that candidate remains visible as the relevant rejected candidate; an unrelated candidate is not silently substituted.

## 23. memoryMatch Reconciliation

When grounding succeeds, `memoryMatch` carries the selected KnowledgeItem identity. When a safety gate rejects it, `memoryMatch` remains null by design, while the selected candidate remains in the explanation projection. This preserves the relevance-versus-grounding distinction.

## 24. Event B Before/After

Before: the failing AUTO run ranked `neutral-problem-cmt9xqrpk0018uotm68ty3osz` above fresh Event A due score collision and ID fallback.

After: the full AUTO run selected fresh Event A `neutral-memory-cmta1v2vh000gcgtmrayyaa9j`; its canonical retrieval identity was `neutral-problem-cmta1v2vh000gcgtmrayyaa9j`, and `rankOneFreshEventA` was true. Historical competitors remained retained.

## 25. Candidate Ordering Independence

The FIX-005 fixture passed four ordering permutations. The winner was `fix-005-canonical-a` in every run.

## 26. Repeatability

Five repeated retrievals over unchanged FIX-005 fixture state returned the same winner. TODO-053 also passed its 25-repeat determinism check.

## 27. False-Positive Controls

Backend outage and expired certificate candidates were excluded by compatibility conflict. Broad scanner and high-trust broad candidates remained discoverable where applicable but lost to the specific roaming candidate.

## 28. Event D Scope Regression

The FIX-005 probe and FIX-003 regression both confirm firmware-specific Event D is fail-closed after narrowed roaming scope.

## 29. Outcome Idempotency Regression

FIX-003 passed sequential and concurrent exact-once SUCCESS and FAILURE retry checks, including trust effects and outcome context.

## 30. Challenge/Scope Regression

FIX-003 passed human Challenge, OPEN fail-close, `SCOPE_UPDATED`, version preservation, and provenance preservation.

## 31. Trust Regression

FIX-003 passed trust-state reconciliation. Trust remains separate from relevance and automation eligibility.

## 32. Event-Time Regression

FIX-004 passed occurrence-time serialization, timezone round-trip, persistence, and separation of `occurredAt` from `createdAt`.

## 33. Retrieval Copy Regression

FIX-004 passed `NO_CANDIDATE`, weak, ungrounded, scope-incompatible, human-review-required, and grounded-reusable presentation states.

## 34. Organization Isolation

The full AUTO run passed cross-tenant read/write protections and synthetic isolation cleanup. No cross-organization candidate entered the ranking set.

## 35. AI Authority

AI remains advisory. It cannot choose trusted truth, bypass grounding, validate memory, mutate scope, authorize reuse, or resolve challenges. No AI reranker was added.

## 36. Schema/Migration Assessment

No schema or migration change was required. `npx prisma migrate status` passed with 28 migrations and an up-to-date database. A canonical duplicate-identity model remains a future human-governed product decision, not part of FIX-005.

## 37. Files Changed

FIX-005 changes:

- `lib/memory.ts`
- `lib/lessonSelection.ts`
- `lib/application/tickets/processTicket.ts`
- `types/knowledge.ts`
- `package.json`
- `scripts/oip-v2-fix-005-near-duplicate-selection-probe.cjs`
- `docs/ARCHITECTURE_BASELINE.md`
- this report

The required full rerun also refreshed the existing `docs/audits/OIP-V2-QA-001R-R2-AUTO-organizational-memory-core-acceptance.md` artifact; its acceptance criteria were not changed.

Other dirty files shown by `git status --short` predate or belong to prior work and were preserved.

## 38. Tests Added/Changed

Added `probe:oip-v2-fix-005`. It covers the required A–F fixture, hard conflicts, specificity, trust independence, recency control, scope exclusion, evidence role, grounding identity, ordering permutations, repeated retrieval, equivalent tie resolution, and selection reconciliation.

## 39. FIX-005 Acceptance Probe

Focused result: `OIP_V2_FIX_005_FOCUSED_PROBE: PASS`.

The printed table showed A first, B second, broad controls after them, compatibility 17 for surviving candidates, grounding readiness 1 for active lesson candidates, and reliability excluded from tie resolution.

## 40. Full AUTO QA Result

Final rerun result:

`OIP_V2_QA_001R_R2_AUTO_ORGANIZATIONAL_MEMORY_CORE_ACCEPTED_WITH_FOLLOWUPS`

Readiness:

`DESIGN_PARTNER_READY_WITH_GUARDRAILS`

Fresh Event A selected: true. Event B ticket: `MP-20260826-0035`. Event C ticket: `MP-20260826-0039`. Event D ticket: `MP-20260826-0041`. Historical competitors were preserved. The rerun used the existing authenticated harness with an already running QA server; the report’s follow-up recommends an owned-server restart-leg run when that specific record is needed.

## 41. Build/Typecheck/Lint

- `npx tsc --noEmit`: PASS
- `npm run prisma:validate`: PASS
- `npx prisma migrate status`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS; only normal CRLF conversion warnings for pre-existing Windows working-copy files were emitted.
- Repository lint was not run separately because this repository’s existing Next lint command is the known deprecated interactive behavior; the production build’s lint/type validation completed successfully.

## 42. Known Limitations

- Existing persisted duplicate pollution remains inspectable by design.
- No autonomous duplicate consolidation exists.
- The full AUTO report uses `similarKnowledge` to expose a selected relevant candidate even when `memoryMatch` is null after a safety gate; this is intentional and preserves grounding transparency.
- The owned-server restart leg is a follow-up in the latest AUTO record.

## 43. Memory Consolidation Follow-Up

`MEMORY_CONSOLIDATION_FOLLOWUP`: define a human-governed canonical duplicate/supersession identity model with provenance-preserving version and scope semantics. Do not delete or merge these historical memories automatically.

## 44. Git Diff Summary

Targeted FIX-005 diff: 6 existing files modified for implementation/type/selection wiring plus one new focused probe and this report; no migration files changed. HEAD remains unchanged because no commit was authorized.

## 45. Repository State After

- Branch: `landing/option-c32-release-polish`
- Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Worktree remains dirty with the same pre-existing files plus the FIX-005 implementation, focused probe, and report.
- No commit, push, tag, deploy, or publish was performed.

## 46. QA Readiness

`OIP_V2_QA_001R_R2_AUTO_RERUN_READY`

The near-duplicate blocker is closed, tie-breaking is deterministic, Event B selects correctly with competitors preserved, and FIX-003/FIX-004 regressions pass without a HIGH/CRITICAL regression.

## 47. Recommended Next Task

Run the AUTO harness with `OIP_V2_QA_001R_R2_AUTO_START_SERVER=1` to capture the owned-server restart leg, then treat memory consolidation as a separate human-governed product/model decision.

## Defect Closure Matrix

| Defect | Result |
| --- | --- |
| NEAR-DUPLICATE-SELECTION-001 | CLOSED |
| DETERMINISTIC-TIEBREAK-001 | CLOSED |
| RANKING-SELECTION-IDENTITY-001 | CLOSED |
| GROUNDING-SELECTION-IDENTITY-001 | CLOSED |

## FIX-004 Regression Matrix

| Regression | Result |
| --- | --- |
| Candidate specificity | PASS |
| Event-time persistence | PASS |
| Retrieval copy reconciliation | PASS |

## FIX-003 Regression Matrix

| Regression | Result |
| --- | --- |
| Non-identical retrieval | PASS |
| Outcome exact-once | PASS |
| Trust-state reconciliation | PASS |
| Outcome context | PASS |

## Final Verification Matrix

| Requirement | Result |
| --- | --- |
| Competing memories preserved | PASS |
| Exact Event B unchanged | PASS |
| Relevant family discovered | PASS |
| Specific memory beats broad memory | PASS |
| Backend outage loses | PASS |
| Certificate memory loses | PASS |
| High-trust irrelevant memory loses | PASS |
| Newest does not automatically win | PASS |
| Highest trust does not automatically win | PASS |
| Evidence count alone does not determine winner | PASS |
| Scope remains authoritative | PASS |
| Near-duplicate resolution deterministic | PASS |
| Ordering independent | PASS |
| Repeat retrieval stable | PASS |
| Selected identity explicit | PASS |
| Ranking → selection identity consistent | PASS |
| Selection → grounding identity consistent | PASS |
| Grounding → memoryMatch identity consistent | PASS when grounded; explicit null with rejection |
| Governed reuse uses selected identity | PASS |
| Grounding rejection preserves relevant-candidate explanation | PASS |
| SUCCESS exact-once preserved | PASS |
| FAILURE exact-once preserved | PASS |
| Challenge fail-close preserved | PASS |
| SCOPE_UPDATED preserved | PASS |
| Event D scope exclusion preserved | PASS |
| Trust-state behavior preserved | PASS |
| Event-time behavior preserved | PASS |
| Retrieval copy preserved | PASS |
| Organization isolation passes | PASS |
| AI authority unchanged | PASS |
| No autonomous memory merge | PASS |
| No embeddings/vector/RAG added | PASS |

## Direct Answers

1. The main tie was older QA Event A `cmt9xqrpk…` versus fresh Event A `cmta0420z…`, with additional same-family duplicates.
2. They were duplicate/near-duplicate lessons, but separate Sources and KnowledgeItems.
3. The old path reached canonical-ID fallback after score collision; projection then dropped the selected candidate after safety rejection.
4. Root cause: `SCORE_COLLISION`, `MISSING_SPECIFICITY_SIGNAL`, `RANKING_GROUNDING_DIVERGENCE`, and `PROJECTION_SELECTION_DIVERGENCE`.
5. Selection now uses explicit semantic selection evidence before late equivalent tie-breaking.
6. A near-duplicate wins through structured applicability and intrinsic evidence; equivalent records use validation chronology, then ID.
7. Yes, specific compatibility beats broad similarity.
8. Yes, scope remains a hard compatibility boundary and contributes structured applicability.
9. Directly applicable Evidence supports relevance and grounding; quantity alone does not win.
10. Grounding readiness resolves only otherwise equal relevance and never authorizes reuse by itself.
11. Reliability explains historical success but does not decide relevance.
12. Recency is only a late tie-break among semantically equivalent validated representations.
13. No, newest cannot automatically win.
14. No, highest trust cannot automatically win.
15. Truly equivalent candidates resolve deterministically without a fabricated semantic claim.
16. Validation chronology, then canonical ID for a same-instant tie.
17. Yes, ordering is independent.
18. Yes, repeated retrieval is deterministic.
19. Yes, selected identity is explicit.
20. Yes, rank one remains selected.
21. Yes, grounding receives that selected identity.
22. Yes when grounding succeeds; rejection remains explicit rather than substituted.
23. Yes, governed reuse targets the selected memory.
24. No silent cold-start substitution occurs; the relevant rejected candidate remains inspectable.
25. Yes, exact Event B now selects fresh Event A with competitors preserved.
26. Yes, outage and certificate controls remain safe.
27. Yes, Event D remains scope-incompatible/fail-closed.
28. SUCCESS remains exact-once.
29. FAILURE remains exact-once.
30. Challenge remains fail-closed.
31. `SCOPE_UPDATED` preserves history and provenance.
32. Trust behavior is unchanged.
33. Event-time behavior is unchanged.
34. Retrieval-copy states are preserved.
35. Organization isolation passes.
36. AI authority did not change.
37. No automatic merging was introduced.
38. No embeddings were added.
39. No vector search was added.
40. No RAG was added.
41. The full automated sequence passed with `ACCEPTED_WITH_FOLLOWUPS`.
42. Only the existing owned-server restart-leg follow-up remains in the AUTO report.
43. Yes: `OIP_V2_QA_001R_R2_AUTO_RERUN_READY`.
44. Capture the owned restart-leg AUTO record, then handle canonical memory consolidation separately under human governance.
