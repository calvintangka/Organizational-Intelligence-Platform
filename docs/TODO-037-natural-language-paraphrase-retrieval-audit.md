# TODO-037 Natural-Language Paraphrase Retrieval Audit

## Verdict

**CORE_RETRIEVAL_WEAKNESS_CONFIRMED**. The persisted SSO canonical is recalled, but the production deterministic pipeline does not authorize the supplied manual ticket or any of the 20 realistic paraphrases. No production retrieval, ranking, classification, compatibility, lesson, drafting, trust, or AI code was changed in this audit.

## Manual Failure Reproduction

The requested ticket is classified as `Authentication`. `retrieveMemory` returns `demo-ki-sso-certificate-redirect-loop` at rank 1 with score 100. The production lesson matcher returns no matching lesson signal for the natural ticket, so no compatible selected match reaches `draftResponse`; the final path is `no_template`, with no knowledge authorization. Failure layer: **lesson evidence**.

## Test Method

`scripts/todo037-natural-paraphrase-audit.cjs` loads the 45 persisted Developer Demo knowledge items and calls the same production boundaries wired by `app/page.tsx`: `understandForProfile`, `identifyCanonicalProblem`, `retrieveMemory`, `withPreDiscriminationLessonMatches`, `selectPreferredMatch`, `isCompatibleForDrafting`, `findMatchingLesson`, `assessCompatibilityDecision`, and `draftResponse`. It performs no persistence writes. Fixtures are committed in `scripts/fixtures/todo037-natural-paraphrase-fixtures.json`.

## 20-Paraphrase Results

| ID | Category/failure layer | Candidate rank | Selected canonical | Authorized | Result |
|---|---|---:|---|---:|---|
| P01 | lesson evidence | 1 | none | no | FAIL |
| P02 | lesson evidence | 2 | none | no | FAIL |
| P03 | analyzer/category | 14 | none | no | FAIL |
| P04 | analyzer/category | 36 | none | no | FAIL |
| P05 | lesson evidence | 1 | none | no | FAIL |
| P06 | lesson evidence | 1 | none | no | FAIL |
| P07 | analyzer/category | 11 | none | no | FAIL |
| P08 | analyzer/category | 5 | none | no | FAIL |
| P09 | analyzer/category | 36 | none | no | FAIL |
| P10 | analyzer/category | 34 | none | no | FAIL |
| P11 | lesson evidence | 1 | none | no | FAIL |
| P12 | lesson evidence | 3 | none | no | FAIL |
| P13 | analyzer/category | 17 | none | no | FAIL |
| P14 | lesson evidence | 2 | none | no | FAIL |
| P15 | analyzer/category | 36 | none | no | FAIL |
| P16 | analyzer/category | 13 | none | no | FAIL |
| P17 | lesson evidence | 2 | none | no | FAIL |
| P18 | analyzer/category | 4 | none | no | FAIL |
| P19 | analyzer/category | 7 | none | no | FAIL |
| P20 | analyzer/category | 11 | none | no | FAIL |

## Recall Metrics

- Canonical candidate recall: **20/20 (100%)** — the hero item appears somewhere in raw retrieval for every paraphrase.
- Raw top-3 recall: **8/20 (40%)**.
- Final canonical selection recall: **0/20 (0%)**.
- Authorized drafting success: **0/20 (0%)**.
- False negatives: **20/20** genuine paraphrases.
- Control false positives: **0/12**; all 12 controls remained unauthorized.

## Pipeline Failure Breakdown

- Analyzer/category: **12/20** paraphrases did not classify as `Authentication`.
- Lesson evidence: **8/20** classified tickets retrieved the hero but matched no persisted lesson signal strongly enough to authorize drafting.
- Retrieval/recall: **0/20** complete misses; candidate recall is not the limiting layer.
- Selection/ranking: **0/20**; no candidate reached final selection because the compatibility/lesson gates failed first.
- Drafting authorization: **0/20** authorized; the final gate remained fail-closed.

## Exact-Word Dependency Results

The same 20 fixtures were rerun with controlled additions to the description:

- Natural wording: **0/20** authorized.
- Add one stored signal (`authentication certificate`): **0/20** authorized.
- Add multiple stored signals (`authentication certificate`, `redirect timeline`, and the root-cause reference): **20/20** authorized.

This is a strong exact-word/signal dependency finding. The test does not claim the added text is a production fix; it demonstrates the boundary at which the existing lesson evidence gate becomes satisfied.

## Safety Results

- Weak SSO overlap without certificate/loop evidence: blocked.
- Contradiction (“I can sign in normally”): blocked.
- Negation (“no redirect loop”): blocked.
- Wrong sibling controls (provisioning, tenant, clock, conditional access): blocked.
- High trust cannot rescue weak evidence: preserved by the existing compatibility/drafting gates.
- Controlled high-confidence semantic authorization was accepted only for an `unknown` deterministic state, for a real hero lesson, and produced a lesson draft within the item boundary.
- AI hard-gate contradiction test made zero provider calls and produced no authorization.

## AI Independence

The verdict is deterministic and does not depend on Claude or a live provider key. A controlled in-memory provider was used only to verify the existing semantic fallback boundary: one authorized unknown-state case and one zero-call contradiction veto. No API key was read, printed, or sent to the browser.

## Existing QA vs Realistic QA Gap

TODO-025F’s 23/23 matrix and TODO-025G’s curated scenarios use stored signal vocabulary and therefore pass their positive cases. TODO-037’s natural paraphrase corpus keeps the same underlying problem while removing those exact signal phrases; it exposes a material gap between synthetic exact-signal QA and realistic support language.

## Root Cause Findings

1. Analyzer intent/category patterns are vocabulary-dependent: twelve paraphrases fail before a stable `Authentication` category is available.
2. The lesson matcher requires persisted signal overlap; semantic equivalence alone does not satisfy deterministic strong-evidence authorization.
3. The system correctly fails closed after those misses, so this is a recall/coverage weakness rather than a safety bypass.

## Recommended Follow-Up TODOs

- Add a separately scoped natural-language retrieval/alias strategy with explicit precision, contradiction, and negation tests; do not weaken TODO-030 authorization.
- Expand authentication/federation analyzer vocabulary using reviewed organization signals, with category-compatibility regression coverage.
- Add a production-level testability seam for full page orchestration if future audits need to observe advisory invocation without duplicating React glue.
- Keep this audit corpus as a required realistic QA gate alongside the exact-signal mature matrix.

## Regression Results

- TODO-025F mature retrieval QA: **23/23 passed**.
- TODO-025G curated scenarios: **blocked by persisted-data drift**; its hero source-ticket assertion expects the original durable source but the live row now references a missing `ticket-custom-*` record. The probe performed no writes.
- TODO-027 canonical specificity: passed.
- TODO-028 sibling specificity: passed.
- TODO-029 trust-independent selection: passed.
- TODO-030 weak-overlap safety: passed.
- TODO-032 category compatibility: passed.
- TODO-019 lesson ranking: passed.
- BUG-008 retrieval: passed.
- BUG-008 semantic compatibility: passed.
- BUG-010 AI pipeline/failover: passed.
- TypeScript: passed.
- Strict unused TypeScript: passed.
- Production build: passed.

## Mature Data Safety

Before/after protected snapshots were identical for every organization. Developer Demo remained at 45 knowledge items, 1,801 candidates, 1,801 validations, 1,801 memory records, 5,004 tickets, 4,500 evidence records, and 46 patterns during the audit. No KnowledgeItems, Tickets, TrustEvidence, Validations, MemoryChangeRecords, OrgMetrics, or TicketSequence rows were written by TODO-037.

Snapshot digests (before = after):

- Developer Demo: `0d36bde3206e9a9db3600145b9cbf7e3aff1934cc71cac08e71ee5c36acf10c6`
- Maesa Tech: `3a82230507f1c5a7122b9f5c104ab767ae144ec343bd168982ae3e7a91fe86c3`
- FastDrop Logistics: `1e5c6206c1887b74f1dd50e1559cd535414c5e1dc86fb7b4fcd008d60a745622`
- Pramana Consulting: `a82145bf031067249618272ed00a32f95d088cd17966babecdd8f93f00b1c1a6`
- Test organization: `b4b54f35076f9ba48899ca3b5dd8df655f24187a4eb2254b755ef23995c1fb6a`

## Final Assessment

The deterministic safety gates are working, but realistic natural-language paraphrase reuse is materially underpowered. The observed failure is confirmed at analyzer/category and lesson-evidence layers; no remediation was implemented in TODO-037.

## TODO-037 Status

**Audit complete — CORE_RETRIEVAL_WEAKNESS_CONFIRMED.** Follow-up remediation is intentionally deferred to a separate TODO.

## Commit

Pending commit for the fixture, read-only audit probe, package script, and this report.
