# OIP-V2-E2E-FIX-001 — Organizational Memory Retrieval Pipeline Audit and Repair

Date: 2026-09-07  
Release under test: OIP v0.4.0 (release commit `a86a4e84de3eb6dd4183d172e7e2a5d64d12994e`)  
Working checkout: package version 0.4.1 on the existing QA branch  
Organization: Meridian Field Operations  
Mode: authorized audit, narrow repair, targeted regression

## 1. Executive Summary

The existing deterministic retrieval pipeline had two coupled failures. Neutral operational Memories were loaded but commonly filtered by compatibility because their `OPERATIONAL_EVENT` category had no matching structured facet. Profile-style questions were also classified as `business_inquiry`, and the ticket application discarded a non-`Business Inquiry` Memory even when the query named it exactly. A generic authentication/role signal could then rank the evolved roster Memory above the more specific account-lockout Memory.

The narrow repair keeps the existing lexical architecture. It adds bounded, multi-signal operational facets, recognizes an exact sufficiently descriptive canonical title as direct identity evidence after condition-conflict checks, and keeps retrieval on the original operational understanding while using business/profile classification only for response routing. No embeddings, vector store, RAG, schema, migration, trust formula, or autonomous action was added.

The permanent read-only regression passed 5/5 exact-title cases, 7/7 natural relevant cases, 3/3 negative controls, the ambiguity safety assertion, the wrong-candidate assertion, current revision/scope, provenance, and tenant isolation. Targeted browser checks passed for all required categories: exact lockout, branch DNS, evolved original, natural lockout, natural branch DNS, natural transferred technician, ambiguity, plus additional exact stale-board, exact expired-assignment, natural duplicate-dispatch, and central-outage negative checks. Every browser candidate remained behind human-review/grounding gates.

The retrieval pipeline is repaired and verified. Existing presentation defects E2E-DEFECT-008 and E2E-DEFECT-009 remain separate: the browser still displayed a candidate while the draft said “no organizational knowledge exists yet,” and candidate approval/provenance counts were incomplete. A visible `saveOrgLog` HTTP 500 notice also occurred during the browser pass; ticket creation and retrieval continued, so it is recorded as a separate resilience follow-up and was not repaired here.

## 2. Starting Repository State

- Path: `C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile`
- Branch: `landing/option-c32-release-polish`
- HEAD before repair: `3dd56d5ca8852e3579c4c68e84960ee5abad0dc1`
- Package version: `0.4.1`
- Remote: `calvintangka https://github.com/calvintangka/Organizational-Intelligence-Platform.git`
- Release ancestry: v0.4.0 commit/tag `a86a4e8` is an ancestor of the checkout.
- Working tree before repair contained unrelated user changes (`AGENTS.md`, existing QA/design/audit artifacts). Retrieval source paths were clean. No unrelated changes were reset, stashed, discarded, committed, or rewritten.
- Current authorized changes are limited to `lib/retrievalCompatibility.ts`, `lib/application/tickets/processTicket.ts`, `package.json`, the permanent fixture, the permanent regression script, and this report.

## 3. Starting Environment

Dependencies and the local app were available. Prisma validation passed. `npx prisma migrate status` reported 28 migrations and “Database schema is up to date.” The local Next 15.5.22 app served `http://localhost:3000`; normal browser authentication showed Avery Morgan QA in Meridian Field Operations. The existing corpus contained seven visible active, human-validated Memories. No records were manually created or altered. Browser QA tickets MF-20260907-0025 through MF-20260907-0035 were created once each through the normal UI and left unapproved and unresolved.

## 4. Known E2E Evidence

The prior cumulative reports were read before editing. E2E-002B recorded 13 queries: 0 correct, 1 useful partial, 7 clear misses, 1 wrong candidate, and 4 safe no-match controls. E2E-002C recorded 8 targeted queries: 0/5 exact-title correct, 1/2 distinctive-detail correct, and no multiple-candidate explanation. Existing defects retained were E2E-DEFECT-006 (HIGH retrieval miss), E2E-DEFECT-007 (MEDIUM no Knowledge search input), E2E-DEFECT-008 (HIGH candidate approval/provenance presentation conflict), E2E-DEFECT-009 (MEDIUM contradictory no-knowledge copy); E2E-DEFECT-010 was not reproduced in the preceding dense sweep.

## 5. Retrieval Architecture Map

The observed path is:

`Ticket input` → `understandForProfile` / `routeBusinessInquiryUnderstanding` in `lib/analyzer.ts` → `processTicket` in `lib/application/tickets/processTicket.ts` → `retrieveMemory` in `lib/memory.ts` → `withPreDiscriminationLessonMatches` → `isRetrievalCandidateEligible` in `lib/drafting.ts` → `selectPreferredMatch` in `lib/lessonSelection.ts` → optional `discriminate` → grounding/lesson authorization → `mapKnowledge` in `lib/server/persistenceService.ts` and the Tickets/Organizational memory UI.

`loadKnowledge(organizationId)` is organization-scoped and projects current KnowledgeItem data, including current revision, title/problem/body, category, tags, scope, lessons, provenance, validation, and governance. `retrieveMemory` normalizes and scores lexical/category/tag/evidence/phrase/concept signals, then calls `assessIntentCompatibility` and `assessRetrievalCompatibility` in `lib/retrievalCompatibility.ts`. A candidate is not reuse: drafting still requires lesson evidence and the existing human-review gates.

## 6. Query Routing

The classifier can label a question beginning “What does our organization know about …?” as `business_inquiry`. Before repair, the enriched/profile understanding was passed into retrieval and `processTicket` set `effectiveMatch` to null unless a `Business Inquiry` category item existed. Thus an operational Memory named in a profile-style question could be loaded and still disappear at the final application boundary.

After repair, retrieval receives `rawUnderstanding`, while the enriched understanding continues to control profile response mode. An exact canonical operational Memory is allowed to keep its candidate in the application result; ordinary company/product questions remain on the profile path.

## 7. Candidate Pool Eligibility

The candidate pool was not empty. Read-only `loadKnowledge(MERIDIAN)` returned all seven active Memories, including the six v1 neutral operational items and the evolved original. Organization, lifecycle, governance, validation, namespace/source type, and current-scope reachability were not the primary cause. The loss occurred later: unknown/general categories with no shared structured facet were rejected by compatibility/eligibility before they could be selected.

## 8. Memory Projection

Projection was verified healthy for the selected items. The retrieval items contained canonical title, body/problem text, scope note, category, tags, lessons, source ticket/provenance, validation state, organization ID, governance, and current revision. The evolved roster Memory projected revision 5, trusted governance, reliability 15, and its narrowed scope. No old v1 projection was used by the repaired deterministic path. E2E-DEFECT-003/004 proposal/commit mismatch was outside this repair.

## 9. Current Revision Selection

The original roster Memory selected by the regression is revision 5, governance `trusted`, with the scope note excluding expired temporary assignments and authentication failures. The current revision remained authoritative in both the automated result and the browser candidate. Historical v1 semantics were not substituted.

## 10. Normalization

Existing normalization was adequate for exact identity and ordinary token boundaries. One natural stale-session case used “reconnected,” which was absent from the existing offline/synchronization alias list; that generic inflection was added. No QA title, ticket ID, organization name, or test-only phrase was hard-coded into production logic.

## 11. Structured Signals

Neutral operational Memories had no reusable facets in the customer-support vocabulary. The repair adds generic bounded facets for account lockout, branch DNS resolution, dispatch assignment coordination, technician-region transfer, expired assignment entitlement, regional roster access, and mobile stale session. Each except account-lockout requires multiple aliases/signals, so a generic noun such as “branch” or “assignment” cannot authorize a candidate alone.

## 12. Scoring

Before repair, account-lockout situations could receive only broad authentication/role evidence; the roster Memory could therefore become the sole weak candidate. After repair, account-lockout evidence is a distinct facet and the lockout Memory outranks the roster Memory. The deterministic regression reports lockout rank 1 and roster rank 2 for the clear lockout case. Exact-title identity receives bounded direct evidence and still passes condition-conflict checks.

## 13. Thresholds

No global threshold was lowered. The previous compatibility gate was retained. Exact canonical identity adds a score of 24 only for a sufficiently descriptive title phrase and only after an operational condition conflict check. Natural cases survive through shared bounded facets. Negative controls still produce no selected Memory.

## 14. Ranking

`compareKnowledgeMatches` and the general selection architecture were preserved. Better facet evidence changes the ordering without using trust as a relevance override. The clear account-lockout case now selects the lockout Memory above the higher-context roster candidate.

## 15. Grounding Boundary

Retrieval remains distinct from applicability and reuse. The automated ambiguity case retained three candidates but `draft.source` was `no_template` and `basedOnKnowledgeIds` was empty. Browser candidates showed “Human review required,” “Not authorized for grounded reuse,” and “Lesson evidence: None.” AI did not validate, promote, send, resolve, or create a Memory. The contradictory draft copy is E2E-DEFECT-009 and remains outside this retrieval repair.

## 16. Root-Cause Classification

`MULTIPLE_ROOT_CAUSES`, consisting of:

- `MEMORY_CANDIDATE_POOL_ELIGIBILITY_DEFECT`
- `STRUCTURED_SIGNAL_EXTRACTION_DEFECT`
- `QUERY_ROUTING_CLASSIFICATION_DEFECT`
- `RANKING_DEFECT`
- `GROUNDING_RETRIEVAL_COUPLING_DEFECT` (limited to final application suppression for profile-style exact queries)

`MEMORY_PROJECTION_DEFECT`, `CURRENT_REVISION_SELECTION_DEFECT`, `THRESHOLD_DEFECT`, and `DETERMINISTIC_RETRIEVAL_CAPABILITY_LIMIT` were not established as root causes.

## 17. Root-Cause Evidence

The seven records were present and organization-scoped, but exact and fact-rich operational requests frequently died in `assessRetrievalCompatibility` because category was unknown and no shared facet existed. The same requests then could be discarded by `isRetrievalCandidateEligible`. Profile-style exact requests additionally reached the profile classifier and were nulled by the `isBusinessInquiry && !businessMemory` branch. The old roster winner in lockout scenarios was a ranking symptom of generic shared auth/role evidence, not trust contamination. The repaired regression exercises each boundary directly.

## 18. Repair Design

The narrow design was to restore the existing deterministic path: add generic multi-signal operational facets, recognize direct canonical identity after safety conflict checks, retain raw operational understanding for retrieval, and permit an exact canonical operational candidate through profile-style response routing. Existing lesson, scope, governance, human-review, and automation gates remain unchanged.

## 19. Files Modified

- `lib/retrievalCompatibility.ts`
- `lib/application/tickets/processTicket.ts`
- `package.json`
- `scripts/fixtures/oip-v2-fix-001-retrieval-fixtures.json`
- `scripts/oip-v2-fix-001-retrieval-regression.cjs`
- `docs/qa/OIP-V2-E2E-FIX-001-organizational-memory-retrieval-pipeline-audit-and-repair.md`

No schema, migration, database record, source Memory, Evidence, or existing QA report was modified.

## 20. Product Safety Invariants

Human authority, one-experience admission, tenant isolation, provenance, retrieval/truth separation, retrieval/reuse separation, trust/relevance separation, current scope, challenge caution, no automation, and outcome semantics remained intact in the tested path. The regression uses an in-memory persistence stub only for transient application assertions; it does not write application data.

## 21. Automated Tests Added/Updated

Added permanent fixture `scripts/fixtures/oip-v2-fix-001-retrieval-fixtures.json` and permanent read-only regression `scripts/oip-v2-fix-001-retrieval-regression.cjs`, exposed as `npm run probe:oip-v2-fix-001-retrieval`. The script reads the existing Meridian and comparison-tenant projections, exercises real retrieval and `processTicket`, and uses transient in-memory persistence for application output checks.

## 22. Positive Regression Results

Exact-title: 5/5 candidate and selected. Natural relevant: 7/7 candidate and selected. The profile-style exact title selected `Account lockout blocks portal authentication` and persisted the same Knowledge ID in the transient ticket result. Browser exact and natural cases all surfaced their expected named Memory.

## 23. Negative-Control Results

Automated central outage, dead tablet, and duplicate supplier invoice controls passed 3/3 with no `memoryMatch`, no grounded-reuse IDs, and `no_template` drafts. Browser central-outage ticket MF-20260907-0032 showed “No knowledge match — cold start,” with no Organizational memory candidate.

## 24. Ambiguity Results

The automated transferred-East-roster ambiguity retained three candidates, did not authorize grounded reuse, and required review. Browser MF-20260907-0035 surfaced the evolved roster Memory only as Weak, showed “Not authorized for grounded reuse,” and did not claim a grounded answer. This is cautious enough for the current single-candidate UI, although it does not expose the competing candidates.

## 25. Wrong-Candidate Regression

PASS. The clear account-lockout case selects `Account lockout blocks portal authentication` at rank 1; the evolved roster Memory is rank 2. Higher trust did not outrank specific relevance.

## 26. Current-Revision Regression

PASS. `Dispatch roster access restored after regional group assignment` selected revision 5 with trust/governance and narrowed scope retained. A scope-excluded authentication case selected the dedicated lockout Memory rather than treating the roster Memory as applicable.

## 27. Tenant-Isolation Regression

PASS. `loadKnowledge` remained organization-scoped. Meridian candidates retained Meridian organization IDs. The comparison tenant `profile-maesa-tech` projection contained no Meridian Memory title and no cross-tenant candidate.

## 28. Provenance Regression

PASS. Selected items retained their KnowledgeItem identity, source ticket ID, matching provenance source ticket ID, current revision, organization ID, validation/governance projection, and Memory-specific scope. The repair did not copy provenance between candidates.

## 29. TypeScript / Prisma / Build

- `npx tsc --noEmit`: PASS
- `npm run prisma:validate`: PASS
- `npx prisma migrate status`: PASS; schema up to date, 28 migrations found
- `npm run build`: PASS on Next 15.5.22 after the repair
- `git diff --check`: PASS (only existing line-ending warnings)
- Existing provenance probe `node scripts/todo043-provenance-regression-probe.cjs`: PASS
- Existing category compatibility probe `npm run probe:todo032-category-compatibility`: PASS
- Existing broad `npm run probe:todo047`: failed its pre-existing broad safety-regression assertion; it was not changed or suppressed and is outside FIX-001 scope. The failure was recorded separately rather than used as retrieval acceptance.

## 30. Targeted Browser Regression

Normal UI only, one submission per case, no approval/send/resolve action:

- MF-20260907-0025 exact account lockout: expected Memory surfaced; human review required; grounded reuse denied.
- MF-20260907-0026 exact branch DNS: expected Memory surfaced; human review required; grounded reuse denied.
- MF-20260907-0027 exact stale dispatch board: expected Memory surfaced; human review required; grounded reuse denied.
- MF-20260907-0028 exact evolved roster Memory: current evolved candidate surfaced (browser displayed its v2 label; service projection is revision 5) with Trust 15; review/grounding gate remained.
- MF-20260907-0029 exact expired assignment: expected Memory surfaced; human review required; grounded reuse denied.
- MF-20260907-0030 natural lockout: lockout Memory surfaced Weak; no grounded reuse.
- MF-20260907-0031 natural duplicate dispatch: stale-board Memory surfaced Weak; no grounded reuse.
- MF-20260907-0032 central outage control: “No knowledge match — cold start.”
- MF-20260907-0033 natural branch DNS: branch-DNS Memory surfaced Weak; no grounded reuse.
- MF-20260907-0034 natural transferred technician: technician-region Memory surfaced Weak; no grounded reuse.
- MF-20260907-0035 ambiguous roster access: evolved roster Memory surfaced Weak; no grounded reuse.

The browser also displayed a visible `Persistence failed for saveOrgLog: Server persistence could not read intelligence log. (HTTP 500)` notice during MF-20260907-0029 and later tickets. Ticket creation and retrieval still completed. This is recorded as a separate resilience finding, not repaired or masked.

## 31. Remaining E2E Defects

- E2E-DEFECT-006 retrieval misses: conditions reproduced in 002B/002C are resolved for the repaired seven-Memory corpus and targeted cases. Broader semantic coverage remains a future test concern.
- E2E-DEFECT-007 (MEDIUM): Home “Search Knowledge” still opens a list without a query field; this is a separate discoverability/UI task.
- E2E-DEFECT-008 (HIGH): candidate UI still presents incomplete/contradictory approval/provenance information in some cases. The browser candidate showed aggregate counts and truncated Knowledge ID while the Memory detail has named validation/provenance.
- E2E-DEFECT-009 (MEDIUM): retrieved candidates still coexist with draft text saying “no organizational knowledge exists yet.”
- E2E-DEFECT-010 (HIGH): not reproduced in this repaired run; the evolved candidate showed current revision/trust. Its prior evidence remains in the cumulative report.
- Unnumbered resilience observation: visible `saveOrgLog` HTTP 500 during ticket processing. No retrieval data loss was observed; investigate separately.

## 32. RAG Decision

`RAG_NOT_REQUIRED_FOR_THIS_REPAIR`.

The candidate pool, routing, projection, compatibility, ranking, scope, and safety boundaries were the cause of the known failures. Deterministic exact-title and natural operational retrieval now work across the preserved corpus. A future hybrid semantic retrieval task may be considered after broader product requirements are established, but RAG was not justified or implemented by this repair evidence.

## 33. Risks / Limitations

The deterministic vocabulary is intentionally bounded; this repair does not claim universal semantic paraphrase coverage. Browser AI wording and the separate candidate presentation defects remain inconsistent with the selected Memory even though candidate identity and safety gating are correct. Only one authorized Meridian account and one comparison tenant were available, so browser multi-tenant UI isolation was not performed; service-level organization scoping passed. The `saveOrgLog` HTTP 500 needs a separate resilience investigation.

## 34. Recommended Next Task

`OIP-V2-E2E-FIX-002` — align retrieved-candidate presentation with current Memory provenance/approval/version state, remove contradictory “no organizational knowledge” copy, and investigate the visible `saveOrgLog` HTTP 500 without weakening human-review gates.

## 35. Final Verdict

`OIP_V2_E2E_FIX_001_RETRIEVAL_PIPELINE_REPAIRED_AND_VERIFIED`

The authorized retrieval repair is complete. No source/schema/database workaround or broad retrieval architecture was introduced.

## Repair Evidence Table

| Stage | Expected | Actual Before | Root Cause | Repair | Actual After |
|---|---|---|---|---|---|
| Query classification | Operational question remains eligible for Memory retrieval | Profile-style exact title classified `business_inquiry`; application later nulled operational candidate | QUERY_ROUTING_CLASSIFICATION_DEFECT / GROUNDING_RETRIEVAL_COUPLING_DEFECT | Retrieve from raw operational understanding; profile classification controls response mode | Exact profile-style query selected lockout Memory; ordinary profile path preserved |
| Candidate loading | Seven active Meridian Memories available | All seven were loadable in read-only projection; no pool absence established | NOT_CAUSAL | No change to org/lifecycle query | Seven loaded and organization-scoped |
| Memory projection | Current title/body/scope/revision/provenance visible to scoring | Projection contained required fields | NOT_CAUSAL | No projection rewrite | Current revision 5 and scope retained |
| Scoring signals | Distinct operational cause separates candidates | Neutral operational items lacked facets; broad auth/role signals could dominate | STRUCTURED_SIGNAL_EXTRACTION_DEFECT / SCORING_DEFECT | Add bounded generic operational facets | Clear cases receive matching facets |
| Threshold/eligibility | Relevant candidate survives without global threshold weakening | Unknown category plus no shared facet filtered candidate before selection | MEMORY_CANDIDATE_POOL_ELIGIBILITY_DEFECT | Exact canonical identity and facet compatibility admit bounded candidates | Exact 5/5 and natural 7/7 survive |
| Ranking | Specific lockout outranks generic roster | Roster could appear as sole weak/wrong candidate | RANKING_DEFECT | Preserve comparator; improve specificity evidence | Lockout rank 1; roster rank 2 |
| Current revision | Evolved Memory uses current revision/scope | Prior UI evidence showed misses; no current-revision root cause | NOT_CAUSAL | No revision change | Revision 5/trusted/narrowed scope selected |
| Final selected candidate | Candidate surfaced while grounding remains separate | Cold start or profile suppression; when found, reuse remained gated | Coupled routing/eligibility boundary | Keep `effectiveMatch` for exact operational identity; retain lesson gates | Browser and automated candidates surfaced; no unauthorized reuse |

## Regression Matrix

| Case | Before | After | Expected Memory | Result |
|---|---|---|---|---|
| exact-title account lockout | Cold start/profile path | Selected; browser MF-20260907-0025 found | Account lockout blocks portal authentication | PASS |
| exact-title stale dispatch board | Cold start | Selected; browser MF-20260907-0027 found | Stale dispatch board caused duplicate urgent assignment | PASS |
| exact-title branch DNS | Cold start | Selected; browser MF-20260907-0026 found | Branch Wi-Fi could not resolve scheduling host | PASS |
| exact-title expired assignment | Cold start | Selected; browser MF-20260907-0029 found | Expired temporary assignment blocks roster access | PASS |
| exact-title original roster Memory | Cold start/profile path | Selected current revision; browser MF-20260907-0028 found | Dispatch roster access restored after regional group assignment | PASS |
| natural lockout | Weak expected Memory in one prior case; repeated misses | Selected automated and browser MF-20260907-0030 | Account lockout blocks portal authentication | PASS |
| natural duplicate dispatch | Miss/partial in prior dense sweep | Selected automated and browser MF-20260907-0031 | Stale dispatch board caused duplicate urgent assignment | PASS |
| natural technician-region | Omitted in prior mixed result | Selected automated and browser MF-20260907-0034 | Transferred technician missing from service region | PASS |
| natural stale tablet | Miss/partial in prior mixed result | Selected automated; not duplicated in browser after bounded required set | Mobile dispatch tablet showed stale data after reconnect | PASS (automated) |
| natural branch DNS | Cold start | Selected automated and browser MF-20260907-0033 | Branch Wi-Fi could not resolve scheduling host | PASS |
| ambiguous roster access | Single weak/wrong candidate without explanation | Weak candidate, review required, no reuse; automated competing candidates retained | Cautious, no unsupported certainty | PASS |
| central outage negative | Safe no-match | No match automated and browser MF-20260907-0032 | None | PASS |
| dead-tablet negative | Safe no-match | No match automated | None | PASS |
| finance negative | Safe no-match | No match automated | None | PASS |

## Direct Answers

1. **Were all validated Memories actually entering the retrieval candidate pool?** Before repair, all seven were loadable, but many were filtered before selection by compatibility/eligibility. After repair, every named Memory entered and was selected in the permanent exact/natural corpus regression.
2. **Was query classification suppressing Organizational Memory retrieval?** Yes, for profile-style operational questions at the application boundary; `business_inquiry` routing could null a non-profile Memory candidate.
3. **Were exact-title queries reaching the correct retrieval path?** Before, many went through profile routing and cold-started. After, exact operational titles reach retrieval and select the named Memory.
4. **Was retrieval using the correct Memory content/projection?** Yes; projection was verified healthy and current.
5. **Was the current Memory revision being used?** Yes; the evolved roster Memory uses revision 5 with current scope/governance.
6. **Were any Memories being filtered before scoring?** Yes; unknown category/no shared facet compatibility filtered them.
7. **Was scoring itself wrong?** Partly: insufficient operational signals allowed generic auth/role evidence to produce the wrong roster candidate. Specificity now corrects that ordering.
8. **Were thresholds responsible?** The compatibility gate was responsible; no global threshold defect was established and no global threshold was weakened.
9. **Was ranking responsible?** Yes, as a secondary symptom in account lockout; the roster could outrank the specific lockout Memory.
10. **Why did account lockout sometimes retrieve while branch DNS did not?** Lockout happened to share a generic authentication facet; branch DNS had no matching neutral operational facet and was filtered.
11. **Why did the original roster Memory appear for the wrong authentication case?** Broad auth/role overlap and lack of a dedicated lockout facet let the roster candidate win weakly; trust was not used as an authority shortcut.
12. **Why did exact-title queries return cold start?** Exact title was present, but unknown-category compatibility and profile-style final suppression prevented it from surviving to the UI.
13. **Did the repair generalize without hard-coded QA phrases?** Yes. Production changes add generic facets and title identity logic; no Meridian title, ticket ID, or fixture string is embedded.
14. **Do natural paraphrases now retrieve their intended Memory?** Yes for 7/7 preserved natural regression cases, plus the targeted browser cases.
15. **Do negative controls still abstain safely?** Yes, 3/3 automated; central outage also no-match in the browser.
16. **Does ambiguous retrieval remain cautious?** Yes; weak/review-required and no grounded reuse, with competing candidates retained in the automated path.
17. **Did tenant isolation remain intact?** Yes in the service-level regression; all candidates remained organization-scoped.
18. **Did provenance remain intact?** Yes; selected identity, Source ticket, revision, validation/governance, scope, and organization remained bound.
19. **Does retrieval use current scope/version?** Yes; revision 5 and narrowed scope were selected for the evolved original.
20. **Did grounded-reuse/human-review safety remain intact?** Yes; candidates were surfaced but drafts remained ungrounded/no-template or review-required, and no AI promotion occurred.
21. **Are E2E-DEFECT-006 conditions resolved?** Yes for the preserved seven-Memory corpus and tested browser cases; the original cold-start conditions no longer reproduce.
22. **Did FIX-001 incidentally resolve any part of E2E-DEFECT-008/009/010?** It corrected candidate identity availability and E2E-DEFECT-010 was not reproduced, but the approval/provenance conflict (008) and contradictory draft copy (009) remain visible.
23. **Which retrieval/presentation defects remain separate?** E2E-DEFECT-007, 008, and 009 remain; 010 remains historical/not reproduced. The `saveOrgLog` HTTP 500 is a separate resilience observation.
24. **Is deterministic retrieval now fundamentally healthy?** The existing pipeline is healthy for the tested corpus and clear operational cases; universal semantic coverage is not claimed.
25. **Is RAG actually necessary now, or merely a future improvement?** It is not necessary for FIX-001; any hybrid semantic work is a future improvement after broader requirements.
26. **Should broad retrieval testing resume?** Not as another unfocused campaign; first address the separate presentation/logging follow-up, then run a planned semantic coverage suite if needed.
27. **What is the next engineering task?** `OIP-V2-E2E-FIX-002` for candidate provenance/approval UI alignment, contradictory copy, and `saveOrgLog` persistence resilience.

## HANDOFF — OIP-V2-E2E-FIX-001

Completed: Audited the actual retrieval path; repaired query-routing suppression, neutral operational compatibility eligibility, bounded operational signal extraction, and account-lockout ranking; added permanent read-only regression coverage; ran TypeScript, Prisma, build, provenance, category, deterministic, tenant, negative, ambiguity, wrong-candidate, current-revision, and targeted browser checks.

Created/used: Meridian Field Operations organization `org-2114cd96-cb5f-4905-b445-6e22f24fc361`; seven existing validated Memories; evolved roster Memory current revision 5; QA tickets MF-20260907-0025 through MF-20260907-0035, all unapproved/unresolved; fixture `scripts/fixtures/oip-v2-fix-001-retrieval-fixtures.json`; probe `npm run probe:oip-v2-fix-001-retrieval`.

Defects: E2E-DEFECT-006 conditions resolved in the tested corpus. E2E-DEFECT-007 MEDIUM, E2E-DEFECT-008 HIGH, and E2E-DEFECT-009 MEDIUM remain separate. E2E-DEFECT-010 HIGH was not reproduced. Visible `saveOrgLog` HTTP 500 is recorded as a separate follow-up observation; no new defect ID assigned in this retrieval task.

Important current state: Source changes are uncommitted and limited to the authorized retrieval repair. Existing user changes remain untouched. The browser is authenticated in Meridian Field Operations on the last ambiguous ticket; no ticket was approved, sent, resolved, validated, or promoted. Do not rerun broad retrieval testing or alter existing Memory records.

Next authorized phase: `OIP-V2-E2E-FIX-002` (separate engineering follow-up; not started automatically).
