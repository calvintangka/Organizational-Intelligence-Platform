# NC-FIX-007 — Cross-Domain Retrieval Compatibility Guard

## 1. Executive Summary

NC-FIX-007 added a deterministic, reusable compatibility guard between candidate retrieval and grounded reuse. The guard preserves strong same-domain and related-category matches, rejects generic/Uncategorized weak overlap, blocks structured cross-domain conflicts, records rejection reasons, and prevents incompatible candidates from reaching grounding metadata. The NC-FIX-007 permanent probe passed all 18 required assertions, and the final production-build browser run passed positive, negative, and compatible-Uncategorized acceptance.

## 2. Final Verdict

`NC_FIX_007_PARTIAL`.

The NC-FIX-007-specific closure gates pass. The verdict remains partial because the older broad TODO-041 audit still reports a safety failure from classification/recall coverage and the repository retains pre-existing TODO-037/TODO-046/TODO-047 audit limitations. Those findings are documented under Existing Retrieval Regressions and Remaining Limitations; the cross-domain false-positive count is zero after the fix.

## 3. NC-ACCEPT-001 Finding

NC-ACCEPT-001 reported that a generic or `Uncategorized` case could retrieve the learned Mobile Clock-In / Location Permission lesson through weak category/keyword overlap. The acceptance report preserves the finding and its impact, but does not preserve the exact exploratory browser ticket text, score, or canonical identifier. This report therefore does not invent an exact ticket; it uses the documented finding plus equivalent controlled billing, login, generic, weak-overlap, location-only, and clock-only reproductions.

## 4. Baseline

Baseline date: 2026-08-11, timezone Asia/Jakarta. Branch: `master`. HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`. Node: `v24.14.1`. npm: `11.11.0`. Prisma CLI/client: `7.9.1`. PostgreSQL was reachable at `127.0.0.1:5432`; `prisma validate` passed and `prisma migrate status` reported 25 migrations with the database up to date. The worktree was already dirty with prior NC-FIX/RSS changes and was preserved. `git diff --check` reported only normal Windows line-ending warnings. The requested tag verification was run; the tag currently resolves to `4792e10ee2ef075b0d7e10287fb4ceff583b3941`, not the certified HEAD named in the task, and the tag was not modified.

## 5. Positive Retrieval Baseline

The pre-fix acceptance evidence showed that a genuinely similar second case retrieved the learned lesson and produced a grounded draft. The final controls preserve that behavior for an exact same-domain case, a paraphrase, a strong `Uncategorized` case, and a related-category case.

## 6. False-Positive Reproduction

The equivalent controlled reproduction used a generic/unknown-category ticket with weak surface overlap against a Mobile Attendance / Location Access lesson. Before the guard, lexical retrieval could keep that candidate eligible. After the guard, the candidate is rejected before selection and grounding. The permanent probe and TODO-041 controls both report zero cross-domain false positives.

## 7. Current Retrieval Architecture

The production sequence is: ticket understanding in `lib/analyzer.ts`; canonical problem identification; deterministic candidate generation and scoring in `lib/memory.ts`; pre-discrimination lesson matching in `lib/lessonSelection.ts`; candidate eligibility and compatibility in `lib/drafting.ts`; trust-based selection; deterministic lesson/root-cause checks; optional AI discrimination only after deterministic gates; and grounded drafting in `draftResponse`. The browser process path in `app/page.tsx` filters through `isRetrievalCandidateEligible` before selecting and drafting.

## 8. Existing Compatibility Logic

Existing logic includes category compatibility, compatible category bridges, root-cause families, lesson signal scoring, negation/contradiction checks, weak-overlap fail-closed behavior, canonical specificity, trust-independent ranking, and semantic lesson evidence. NC-FIX-007 reused these layers and inserted the new facet guard rather than replacing retrieval or adding a parallel engine.

## 9. Root Cause

The candidate survived because a generic category was treated as sufficient bypass evidence while lexical/category overlap was allowed to stand in for problem compatibility. A trusted lesson could then survive downstream checks even when the current problem domain differed. The fix addresses the primary cause at the candidate-eligibility boundary and also hardens the strong-lesson shortcut against a structured conflict.

## 10. Compatibility Contract

The contract is: candidate relevance plus compatible structured problem evidence plus no contradiction equals eligible knowledge. `compatible`, `incompatible`, and `unknown` remain distinct. Unknown-category cases require positive structured compatibility; classified cases retain existing semantic fallback behavior unless a hard incompatibility is found. Trust, reuse count, and source quality do not override compatibility.

## 11. Uncategorized Semantics

`Uncategorized` is treated as category unknown, not as compatible with everything. It is not globally blocked: the permanent probe and browser acceptance show that strong attendance/check-in and location-access evidence keeps a compatible `Uncategorized` case eligible.

## 12. Canonical Problem Compatibility

The guard reads current problem text and candidate canonical/title/summary/problem fields as structured evidence. It does not require exact canonical equality. A shared problem facet can authorize a candidate; incompatible structured facets or insufficient unknown-category evidence reject it before grounded drafting.

## 13. Signal Compatibility

Candidate tags, lesson signals, root cause, solution, and example-ticket text contribute reusable facet evidence. Specific multi-token evidence such as attendance/check-in, location access, guest workspace, billing document, authentication, notification delivery, and integration callback is stronger than generic words such as issue, employee, application, or access alone.

## 14. Generic Token Analysis

No global similarity threshold was raised. Generic lexical scores remain available for candidate generation and diagnostics, but they cannot authorize an unknown-category candidate without structured compatibility. A broad mobile surface overlap is insufficient when the candidate carries a different specific problem facet.

## 15. Contradiction Handling

Structured facet conflicts return `DOMAIN_CONFLICT`. The guard also runs before the strong-validated-lesson shortcut, so high trust or strong historical evidence cannot override a cross-domain veto. A generic permission-state contradiction prevents a lesson requiring a denied/missing permission from being treated as confirmed when the current ticket says the permission is already enabled and working.

## 16. Negation Preservation

Existing negation and contradiction protections remain active. The lesson matcher now correctly treats “stopped working” as a failure phrase rather than suppressing the problem concepts that follow it. Healthy-state language still vetoes confirmed reuse, and the permanent negation control passes with no grounded knowledge IDs.

## 17. Fix Strategy

The smallest general fix was a shared `lib/retrievalCompatibility.ts` facet assessment, applied in retrieval scoring for unknown-category cases and as a hard eligibility gate before selection/drafting. The implementation is domain-general, deterministic, product-agnostic, and does not call an AI compatibility judge.

## 18. Implementation

`lib/retrievalCompatibility.ts` defines reusable problem facets and three-state compatibility results. `lib/memory.ts` incorporates compatibility evidence into unknown-category candidate scoring. `lib/drafting.ts` applies hard vetoes, requires positive structured evidence for unknown categories, protects the strong-lesson shortcut, and preserves classified semantic fallback. Existing ranking, trust, provenance, and reuse approval semantics remain unchanged.

## 19. Rejection Diagnostics

Accepted and rejected candidates retain explainable reasons. Examples include `COMPATIBLE_EVIDENCE`, `DOMAIN_CONFLICT`, `INSUFFICIENT_COMPATIBILITY_EVIDENCE`, and `NO_STRUCTURED_FACET`. Browser-visible explanations remain customer-safe; internal facet details are used for diagnostics and probes.

## 20. Positive Control A

PASS. The exact same-domain attendance/check-in and location-access case selected the learned lesson and produced a lesson-informed grounded draft.

## 21. Positive Control B

PASS. `Attendance check-in stopped working for one Android employee after location access was denied.` matched without exact wording and produced two strong semantic lesson signals.

## 22. Positive Uncategorized Control

PASS. The same paraphrase and the exact learned case remained eligible with `category = Uncategorized`; the browser showed `Intent: Uncategorized`, the learned lesson, matched signals, and `Grounded Organizational Memory authorized`.

## 23. Related-Category Control

PASS. A related Mobile Application / mobile attendance case remained eligible when the problem facets and lesson signals agreed; exact category equality was not required by the guard.

## 24. Billing Negative Control

PASS. `Please change the email address where our monthly invoice is sent.` produced no Mobile Attendance / Location Access match and no grounded knowledge metadata.

## 25. Login Negative Control

PASS. An employee unable to sign into a payroll administrator portal because of a forgotten password was rejected from the target lesson.

## 26. Generic Uncategorized Negative Control

PASS. A vague employee/application help request had insufficient compatibility evidence and followed cold-start behavior.

## 27. Weak-Overlap Negative Control

PASS. A ticket mentioning an employee, mobile application, and workspace access did not authorize the target lesson merely from broad surface overlap.

## 28. Location-Only Negative Control

PASS. An HR office-location update did not authorize a mobile attendance permission lesson.

## 29. Negation Control

PASS. `Location permission is already enabled and GPS works correctly` did not produce a lesson match, selection, or grounded knowledge ID.

## 30. Multiple-Knowledge Ranking

PASS. A compatible item outranked the unrelated item in the disposable candidate pool; incompatible candidates were filtered before final selection.

## 31. All-Incompatible Behavior

PASS. When the candidate pool contained only incompatible lessons, selection returned no match and drafting used safe cold-start behavior.

## 32. Grounding Protection

PASS. An incompatible candidate was absent from `basedOnKnowledgeIds` and could not influence the grounded response path.

## 33. Trust Independence

PASS. A trust score of 100 did not make an incompatible billing/login candidate eligible.

## 34. Reuse-Count Independence

PASS. A candidate with a high reuse count was still rejected for an incompatible problem.

## 35. Determinism

PASS. Repeated identical compatibility inputs produced identical eligible IDs, selected candidate, and compatibility reason. No AI compatibility call is used.

## 36. Retrieval Matrix

The permanent probe covers 4 positive cases (same-domain, paraphrase, strong Uncategorized, related category) and 6 negative cases (billing, login, generic Uncategorized, weak overlap, location-only, clock-only), plus negation, trust, reuse-count, all-incompatible, grounding, tenant, determinism, and reuse controls. Result: 18/18 assertions passed.

## 37. NC-FIX-006 Reuse Regression

PASS. `probe:nc-fix-006-knowledge-reuse` passed retrieval, grounded drafting, human reuse evidence, durable reuse commit, concurrent/idempotent replay, distinct third reuse, provenance, authorization, and cleanup checks.

## 38. NC-ACCEPT-001 Finding Closure

PASS for the reported safety finding. The equivalent generic/cross-domain controls no longer select the target lesson; TODO-041 reports `falsePositives=0`; NC-ACCEPT-001’s own learning-loop probe also passed its unrelated negative control.

## 39. Browser Positive Acceptance

PASS on a clean production build and disposable organization. The browser showed the learned lesson, matched signals, lesson-informed draft, historical provenance, and `Grounded Organizational Memory authorized`.

## 40. Browser Negative Acceptance

PASS. The invoice-recipient ticket showed `No knowledge match — cold start`, no target lesson, and no grounded reuse action.

## 41. Browser Uncategorized Positive Acceptance

PASS. The controlled exact ticket was classified as `Uncategorized` and still showed the learned lesson, strong lesson evidence, and grounded organizational memory authorization.

## 42. Browser Console

PASS. The final clean production-build browser tab reported no error or warning logs. Earlier development-server hot-reload/runtime-overlay output was discarded from acceptance evidence; it was not present in the final production-build run.

## 43. Permanent Probe

`scripts/nc-fix-007-cross-domain-retrieval-compatibility-probe.cjs` is registered as `probe:nc-fix-007-retrieval-compatibility`. It uses disposable in-memory organizations and fixtures, performs zero database writes, and reports cleanup with zero residual rows. Result: PASS, 18/18 assertions.

## 44. Existing Retrieval Regressions

PASS: TODO-027, TODO-028, TODO-029, TODO-030, TODO-032, and TODO-040. TODO-041 remains `SAFETY_FAILURE` because its broader 70-case classification/recall audit has legacy false negatives and AI-safety summary limitations, although its cross-domain control count is now `falsePositives=0`. TODO-037 remains affected by the known mature Developer Demo fixture count drift (45 expected versus 47 observed); TODO-046 and TODO-047 retain their pre-existing safety/competition findings. These are limitations to the full repository audit, not NC-FIX-007 false-positive regressions.

## 45. NC-FIX Regression Results

PASS: NC-FIX-001, NC-FIX-002, NC-FIX-003, NC-FIX-004, NC-FIX-005, and NC-FIX-006. NC-FIX-003 was rerun serially after one concurrent exploratory invocation encountered a transient 404/409 race; the serial permanent probe passed.

## 46. RSS Regression Results

PASS: RSS-2.6 concurrent client revision observability and RSS-2.8 new-customer end-to-end acceptance.

## 47. RBAC

PASS: canonical TODO-078 RBAC, tenant isolation, audit, and last-owner probe.

## 48. TypeScript / Prisma / Build

PASS: `npx tsc --noEmit`; `npm run prisma:validate`; `npx prisma migrate status`; and `npm run build`. The schema was already changed by prior work in the dirty worktree; NC-FIX-007 added no schema or migration change.

## 49. OIP Benchmark

PASS: OIP Benchmark v1 scored `1000/1000` checks, `100%` overall, and `100%` critical security.

## 50. Performance

No obvious interactive regression was observed. The guard is deterministic string/facet analysis over already-loaded ticket and candidate text; no network call, vector lookup, or additional model request was added. NC-FIX-005’s deterministic latency probe passed.

## 51. Protected Data

PASS. Mature organization snapshots in the retrieval and benchmark probes were unchanged. The NC-FIX-007 browser account and organization were disposable and were deleted by exact ID after acceptance.

## 52. Secret Review

PASS. No API keys, passwords, cookies, session tokens, Authorization headers, or database credentials were added to product source, the permanent probe, or this report. Runtime-only browser credentials were synthetic and removed during cleanup.

## 53. Cleanup

PASS. The exact disposable organization, tickets, messages, evidence, reflection/learning rows, KnowledgeItem, validation/history rows, metrics/log rows, sessions, and synthetic account were removed. The permanent probe itself performs no database writes and reports zero residual rows. Controlled browser tabs were finalized.

## 54. Files Changed

NC-FIX-007-attributable files:

- `lib/retrievalCompatibility.ts` — PRODUCT_FIX
- `lib/memory.ts` — PRODUCT_FIX
- `lib/drafting.ts` — PRODUCT_FIX
- `scripts/nc-fix-007-cross-domain-retrieval-compatibility-probe.cjs` — REGRESSION_PROBE
- `package.json` — REGRESSION_PROBE alias
- `docs/NC-FIX-007-CROSS-DOMAIN-RETRIEVAL-COMPATIBILITY-GUARD-REPORT.md` — DOCUMENTATION

Prior dirty-worktree files from NC-FIX-001 through NC-FIX-006, RSS work, and earlier migrations were preserved and not reset, stashed, cleaned, committed, pushed, or retagged.

## 55. Remaining Limitations

The exact exploratory NC-ACCEPT-001 false-positive ticket text and score were not preserved in the source report, so exact pre-fix numeric reproduction is unavailable. The broad TODO-041 audit still has classification/recall failures and reports `SAFETY_FAILURE` despite zero cross-domain false positives. Existing TODO-037, TODO-046, and TODO-047 findings also remain outside this narrow guard task.

## 56. Recommendation

Accept the NC-FIX-007 product guard and permanent regression probe as complete for the reported false-positive finding, while retaining `NC_FIX_007_PARTIAL` at repository-audit level. The next follow-up should reconcile TODO-041’s mature recall/classification dataset and the existing TODO-037/TODO-046/TODO-047 audit findings before claiming a full repository acceptance verdict.

## 57. Final Verdict

`NC_FIX_007_PARTIAL`.

Original NC-ACCEPT-001 false match reproduced as an equivalent controlled case: YES. Root-cause classification: `GENERIC_CATEGORY_TREATED_AS_COMPATIBLE`. Compatibility guard added: YES. AI used for compatibility: NO. Scenario-specific hard coding: NO. Exact category equality required: NO. Uncategorized automatically rejected: NO. NC-ACCEPT-001 false-match finding: FIXED. NC-FIX-006 legitimate reuse: PASS. Permanent probe: PASS. Commit created: NO. Push performed: NO. Certified tags modified: NO.
