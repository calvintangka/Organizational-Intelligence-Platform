# OIP-V2-E2E-FIX-001R — Retrieval Repair Regression Investigation

## 1. Executive Summary

FIX-001A found two real-app cold starts after FIX-001 reported a green natural-language regression: B1 account lockout (`MF-20260907-0039`) and B3 transferred technician (`MF-20260907-0041`). The permanent suite had used easier, two-field inputs and did not include either exact browser string.

The reproduced pipeline traces identified two independent production defects. B1 reached the correct Memory and scored first, then an over-broad login-contradiction rule interpreted *other employees* being able to sign in normally as evidence that the affected employee was not locked out. B3 had no technician-placement facet because its transfer, region, dispatch, and availability language did not meet the prior two exact-phrase aliases.

The repair removes the actorless `sign in normally` contradiction veto and requires a bounded three-signal technician-placement facet (role/location/availability/movement) before compatibility. It adds the exact B1 and B3 browser strings to a production-shaped regression harness. The automated suite passes 5/5 exact-title, 9/9 natural relevant, 3/3 negatives, cautious ambiguity, current revision/scope, provenance, and tenant isolation.

The mandatory final browser acceptance was blocked after a controlled restart: a stale child server was first found on port 3000; after restoring one current server on port 3000, the application logged `Authentication lookup timed out.` and the UI could not reach the authenticated Meridian workspace. No new ticket, Memory, Evidence, validation, or lifecycle record was created. Automated success is therefore not treated as product acceptance.

## 2. Repository Starting State

- Repository: `C:\Users\bboyc\Documents\My Project\OIP-Runtime-Reconcile`
- Branch: `landing/option-c32-release-polish`
- HEAD at investigation start: `3dd56d5ca8852e3579c4c68e84960ee5abad0dc1`
- Package version: `0.4.1`
- FIX-001 files were already uncommitted. Existing unrelated modifications and untracked documentation were preserved.
- Relevant pre-existing modified files: `lib/application/tickets/processTicket.ts`, `lib/retrievalCompatibility.ts`, and `package.json`. `AGENTS.md` was unrelated and untouched.

## 3. Runtime Starting State

The initial server was a current-workspace Next development server started on 2026-09-07. Browser route: `http://localhost:3000/`. The original server’s parent was terminated for a controlled restart, but an orphan child `start-server.js` process remained listening on port 3000. The first replacement server therefore fell back to port 3001. After identifying the listener by PID and stopping it, one current-workspace development server started on port 3000.

The restarted server compiled the application but logged `[auth] identity lookup unavailable { message: 'Authentication lookup timed out.' }` when the browser requested `/?auth=login`. The browser remained unauthenticated and could not reach the Meridian workspace. A second clean retry after all static checks completed reproduced the same log and rendered only the normal sign-in form with blank Email and Password fields; no existing authenticated tab or session remained.

## 4. FIX-001A Regression Evidence

| Case | Ticket | Expected | Observed in FIX-001A |
|---|---|---|---|
| B1 account lockout | `MF-20260907-0039` | `Account lockout blocks portal authentication` | `No knowledge match — cold start` |
| B3 transferred technician | `MF-20260907-0041` | `Transferred technician missing from service region` | `No knowledge match — cold start` |

FIX-001A also showed A1/A2/A3 exact-title and B2/B4 natural retrieval passing, a cautious ambiguous result, and a safe finance no-match. It retained E2E-DEFECT-008 and E2E-DEFECT-009 as separate presentation defects.

## 5. Runtime Identity Verification

The diagnostic and final permanent regression executed from this working tree against Meridian projection `org-2114cd96-cb5f-4905-b445-6e22f24fc361`. The controlled restart exposed a stale child listener, then restored a single server from the same working directory on port 3000. The browser visibly rendered that current server’s landing page. The authenticated ticket route was not reached because its identity lookup timed out.

This rules out stale retrieval module code as the cause of the original B1/B3 behavior. It does not establish a successful current-runtime browser ticket submission.

## 6. B1 Exact Reproduction

Exact B1 fixture text:

> One employee entered the wrong password several times and now cannot get past the portal login screen. Everyone else can sign in normally. Have we seen something like this before?

Before repair, the current retrieval pipeline loaded all seven Meridian Memories. The lockout Memory received `account-lockout` and `authentication` facets, was compatible in `assessRetrievalCompatibility`, entered the raw candidate list with score 54, and ranked first. It was then rejected by `assessCompatibilityDecision` because `ticketContradictsLesson` matched the actorless phrase `sign in normally`. The final eligible-match list was empty, so `effectiveMatch` and the UI projection were null.

## 7. B3 Exact Reproduction

Exact B3 fixture text:

> A technician recently moved to our West region and is active, but West dispatch cannot find them in the available technician list. Is there something our organization already learned that could help?

Before repair, all seven Meridian Memories loaded. The raw understanding was `Uncategorized` with high operational support. No technician-placement facet was extracted because the prior aliases required two exact phrases such as `transferred technician` and `regional dispatch`; B3 instead expresses technician, moved, region, dispatch, and availability separately. The technician-region candidate was rejected before scoring as unknown-category/no concrete shared facet, so no candidate ranked or reached `effectiveMatch`.

## 8. Automated-vs-Browser Comparison

| Stage | Automated Fixture Before | Real Browser Query | Difference | Causal? |
|---|---|---|---|---|
| Input shape | Explicit short subject plus description | UI submits description only; server derives a truncated subject | Yes | Yes |
| B1 language | `temporarily locked out`; `colleagues can still sign in` | `cannot get past ... login screen`; `Everyone else can sign in normally` | Actorless phrase triggered hard veto | Yes |
| B3 language | `transferred technician`; `regional dispatch search` | moved / West region / West dispatch / available technician list | Prior aliases did not recognize the same concept | Yes |
| Analyzer/category | Production analyzer, easier text | Production analyzer, exact UI text | Both `Uncategorized` operational cases | Not primary |
| Candidate eligibility | Candidate survived | B1 vetoed after raw rank; B3 filtered before scoring | Different failure points | Yes |
| Final UI | In-memory application result only | Actual UI cold start in FIX-001A | Harness did not prove UI wording | Yes |

## 9. Test Harness Fidelity Audit

The harness uses the production analyzer and `processTicket`; it does not construct `understanding` manually. It reads actual organization-scoped Knowledge projections and uses a transient in-memory persistence adapter only to inspect the output ticket. That adapter does not change retrieval inputs or write application data.

Before this repair it was insufficient: fixtures supplied a `subject` field the normal UI does not submit, direct retrieval assertions preceded final application assertions, and neither exact B1 nor B3 text existed. The harness therefore had an `AUTOMATED_TEST_FIDELITY_DEFECT`. It now derives the production fallback subject when no subject is present, retains direct retrieval checks, and asserts B1/B3 through `processTicket` at the application result.

## 10. Retrieval Runtime Trace

| Case | Category | Facets before | Raw candidate | Compatibility gate | Final before | Final after |
|---|---|---|---|---|---|---|
| B1 | Uncategorized | account-lockout, authentication | Lockout, score 54, rank 1 | Later lesson contradiction veto | no `effectiveMatch` | lockout Memory selected |
| B3 | Uncategorized | none | technician candidate never scored | unknown/no shared concrete facet | no `effectiveMatch` | technician-region Memory selected |

No post-selection UI suppression was found in either trace. B1 disappeared in candidate eligibility after raw selection; B3 disappeared before scoring.

## 11. B1 Root Cause

`EXPLICIT_LOGIN_CONTRADICTION_PATTERNS` included `/\bsign in normally\b/`. It cannot distinguish an unaffected colleague from the person with the reported login failure. The false contradiction hard-vetoed an otherwise first-ranked, compatible lockout candidate.

## 12. B3 Root Cause

The technician-region facet only recognized two exact multiword aliases. The real phrasing distributed the operational concept across `technician`, `moved`, `region`, `dispatch`, and `available technician list`, resulting in no shared facet and pre-score rejection.

## 13. Root-Cause Classification

- `AUTOMATED_TEST_FIDELITY_DEFECT`: exact browser wording and UI input shape were absent from FIX-001 regression.
- `CANDIDATE_ELIGIBILITY_DEFECT`: B1’s false contradiction veto removed a rank-1 candidate.
- `STRUCTURED_SIGNAL_EXTRACTION_DEFECT`: B3 lacked a technician-placement facet.
- `RUNTIME_STALE_CODE_DEFECT`: not causal for B1/B3. A stale child server was found only during the later restart and then removed.
- `RUNTIME_CONFIGURATION_DIVERGENCE`: observed after repair as a separate browser acceptance blocker (`Authentication lookup timed out`).

## 14. Repair Design

The B1 repair removes only the actorless login-success pattern. Explicit first-person success, account access, password-working, and `not a login issue` contradictions remain hard vetoes.

The B3 repair adds generic technician-placement signals and raises its threshold to three signals. A role, location, availability, or movement term alone cannot establish the facet; B3 must contain a bounded combination. No query text, ticket ID, Memory title, organization ID, or global threshold is special-cased.

## 15. Files Modified

- `lib/drafting.ts`
- `lib/retrievalCompatibility.ts`
- `scripts/fixtures/oip-v2-fix-001-retrieval-fixtures.json`
- `scripts/oip-v2-fix-001-retrieval-regression.cjs`
- this report

No schema, migration, database record, Memory, Evidence, or validated lifecycle data was modified.

## 16. Automated Regression Changes

The fixture now includes both exact FIX-001A strings as `browser-b1-lockout` and `browser-b3-technician-region`. The harness supplies the same description-only production input shape, derives the production fallback subject for direct retrieval, and calls `processTicket` for both exact failures.

## 17. Automated Regression Results

`npm run probe:oip-v2-fix-001-retrieval`: PASS.

- Exact title: 5/5
- Natural relevant: 9/9, including exact B1 and B3
- Negative controls: 3/3 safe no-match
- Ambiguity: cautious; three candidates retained and no grounded reuse
- Wrong candidate: lockout rank 1; roster rank 2
- Current revision/scope: roster revision 5, trusted, scope retained
- Tenant isolation and provenance identity: PASS

## 18. Existing Probe Results

- `npm run probe:todo032-category-compatibility`: PASS.
- `node scripts/todo043-provenance-regression-probe.cjs`: PASS.
- `npm run probe:todo047`: started but produced no assertion or completion after more than six minutes; stopped without modifying it. The known prior assertion failure was therefore not re-observed in this runtime.

## 19. TypeScript / Prisma / Build

- `npx tsc --noEmit`: PASS.
- `npm run prisma:validate`: PASS.
- `npx prisma migrate status`: PASS; PostgreSQL `oip_development`, 28 migrations, schema up to date.
- `git diff --check`: PASS; only pre-existing line-ending warnings were printed.
- `npm run build`: Prisma client generation passed; `next build` remained on `Creating an optimized production build ...` for more than five minutes without diagnostic output and was stopped. Build is NOT VERIFIED in this phase.

## 20. Immediate B1/B3 Browser Regression

NOT EXECUTED / BLOCKED. The restored current server could render the public landing page, but authenticating into Meridian timed out before the ticket UI was available. A clean retry also timed out `/api/auth/me` and left only the normal blank sign-in form. B1 and B3 were not submitted through the real UI after repair.

## 21. Full Nine-Query Real-App Acceptance

NOT EXECUTED / BLOCKED. The required 9/9 UI matrix depends on the authenticated Meridian workspace. No query was submitted in this phase, so no pass is claimed.

## 22. Negative / Ambiguity Safety

Automated safety is PASS: three unrelated controls selected no Memory and authorized no grounded reuse; the ambiguous roster case retained competing candidates and did not authorize grounded reuse. Real-app revalidation is blocked.

## 23. Current Revision / Scope

Automated PASS: the evolved roster Memory selected current revision 5 with its current scope and trusted governance. Real-app revalidation is blocked.

## 24. Human-Review / Grounding Safety

Automated PASS: retrieval selection did not authorize grounded reuse for ambiguity or negatives. The repair did not change human-validation, approval, Challenge, outcome, or promotion logic. Real-app revalidation is blocked.

## 25. Provenance / Tenant Safety

Automated PASS: selected candidate identities retained matching source/provenance IDs and Meridian organization scope. The comparison tenant projection contained no Meridian title or object. No tenant or provenance mutation occurred.

## 26. Existing Defect Reproductions

- E2E-DEFECT-008: previously reproduced in FIX-001A; not re-run because it is outside scope and the workspace was unavailable.
- E2E-DEFECT-009: previously reproduced in FIX-001A; not re-run for the same reason.
- E2E-DEFECT-011 / Cases loading: not re-run; outside scope.

## 27. New Defects

No new retrieval defect was observed. The local runtime’s authenticated identity lookup timed out after restart. This is a test-environment/runtime blocker for the final UI gate; its product root cause was not investigated because authentication repair is outside FIX-001R scope.

## 28. saveOrgLog Observation

NOT OBSERVED in this phase because no ticket submission could complete. FIX-001A’s prior visible HTTP 500 remains `OBSERVED_NO_RETRIEVAL_BLOCK`; it was not repaired or masked.

## 29. Zero-Error Acceptance Gate

FAIL / NOT ATTESTED. The zero-error definition requires a current 9/9 real-app acceptance. Automated evidence does not substitute for the browser final gate.

## 30. Commit-Readiness Recommendation

NO — RETRIEVAL_REPAIR_REQUIRES_MORE_WORK. Commit readiness is prohibited until B1, B3, and the full 9-query browser matrix complete on the authenticated current runtime.

## 31. Remaining Risks

The code-level evidence supports the narrow B1/B3 repair, but real product behavior after repair is unverified. The deterministic signal vocabulary remains bounded. The identity-lookup timeout and build non-completion need a stable local runtime before any acceptance claim. E2E-DEFECT-008/009 and the historical saveOrgLog issue remain separate.

## 32. Final Verdict

`OIP_V2_E2E_FIX_001R_BLOCKED_BY_REPOSITORY_OR_ENVIRONMENT`

## 33. HANDOFF

## HANDOFF — OIP-V2-E2E-FIX-001R

Completed:
Diagnosed B1 and B3 against the production retrieval pipeline; applied a narrow repair; added permanent exact-browser-string regression coverage; passed the targeted regression, TypeScript, Prisma, migration, category, and provenance checks; performed a controlled runtime restart and recorded its auth blocker.

Root cause:
B1 was falsely vetoed by an actorless login-success contradiction pattern after ranking first. B3 lacked a bounded technician-placement facet and was rejected before scoring. FIX-001’s harness used easier two-field language and omitted the exact UI strings.

Repair:
Removed the actorless `sign in normally` veto; added a three-signal technician-placement facet; updated fixtures and application-path assertions for exact B1/B3 browser strings.

Automated regression:
PASS — exact title 5/5, natural relevant 9/9, negatives 3/3, ambiguity cautious, revision/scope, provenance, and tenant safety passed.

Real-app acceptance:
BLOCKED — a current port-3000 server was restored, but the authenticated identity lookup timed out before Meridian ticket retrieval could be exercised.

Zero-error gate:
FAIL

Existing defects reproduced:
None re-run in this phase. E2E-DEFECT-008 and E2E-DEFECT-009 remain previously reproduced; E2E-DEFECT-011 remains outside scope.

New defects:
No new retrieval defect. Runtime authentication timeout blocks acceptance.

Important repository state:
FIX-001 and FIX-001R changes remain uncommitted. Unrelated existing changes and untracked material remain untouched. No source/schema/database workaround was used.

Important browser state:
The local app was restarted from this workspace, but the authenticated workspace was unavailable because the identity lookup timed out on two current-server attempts. The browser has only the blank normal sign-in form; no post-repair UI query, ticket, Memory, Evidence, or validation was created.

Commit recommendation:
NO

Next authorized task:
`OIP-V2-E2E-FIX-001R2 — Continued Retrieval Regression Repair` after the local authenticated runtime is stable. Stop; do not start it automatically.

## Required Root-Cause Comparison Table

| Stage | Automated Test Before | Real App Before | Difference | Root Cause? | After Repair |
|---|---|---|---|---|---|
| Runtime version | Current working-tree probe | Current app issued FIX-001A tickets | No stale-code evidence for original regression | No | Controlled current server restored; auth then timed out |
| Raw query | Easier subject + description | Exact single UI description | Material wording/input-shape difference | Yes | Exact strings are fixtures; subject is derived like production |
| Analyzer | Production analyzer | Production analyzer | Same component | No | Unchanged |
| Classification | Uncategorized operational | Uncategorized operational | No primary difference | No | Unchanged |
| Normalization | Easier wording | Exact punctuation/suffix | B1/B3 semantic form differed | Contributing | Exact strings covered |
| Facets | Existing aliases found phrases | B3 found none | B3 phrase distribution was not recognized | Yes | Bounded three-signal facet |
| Candidate pool | Meridian projections loaded | Meridian projections loaded | No load failure | No | Unchanged |
| Compatibility | B1 raw-compatible | B1 later veto; B3 pre-score rejection | Eligibility behavior differed | Yes | Both intended candidates survive |
| Scoring | Easy candidates scored | B1 rank 1; B3 not scored | B3 stopped earlier | B3 no | B1/B3 select intended candidate in harness |
| Ranking | Expected selected | B1 rank 1 internally | Ranking was not B1 defect | No | Preserved |
| effectiveMatch | Application only tested exact title | Null for B1/B3 | Eligibility emptied candidates | Yes | `processTicket` B1/B3 passes |
| UI result | No exact browser coverage | Cold starts | Browser wording unrepresented | Yes | Current UI blocked before submission |

## Required Final Acceptance Matrix

| Test | Expected | Actual | Result |
|---|---|---|---|
| A1 exact lockout | Lockout Memory | Not run after repair | BLOCKED |
| A2 exact DNS | DNS Memory | Not run after repair | BLOCKED |
| A3 exact roster | Current roster Memory | Not run after repair | BLOCKED |
| B1 natural lockout | Lockout Memory | Not run after repair | BLOCKED |
| B2 natural DNS | DNS Memory | Not run after repair | BLOCKED |
| B3 natural technician | Technician-region Memory | Not run after repair | BLOCKED |
| B4 natural stale board | Stale-board Memory | Not run after repair | BLOCKED |
| C ambiguity | Cautious | Not run after repair | BLOCKED |
| D finance negative | No match | Not run after repair | BLOCKED |

Current real-app acceptance: 0/9 executed; 9/9 required.

## Direct Answers

1. The browser rendered the current workspace server, but the authenticated ticket flow did not load after restart.
2. Yes. The probe uses direct persistence and transient output ports; the browser encountered a stale child listener and later an authentication lookup timeout.
3. No before FIX-001R; yes now.
4. No before FIX-001R; yes now.
5. The old harness used direct retrieval for most rows and only one application-path assertion. It now runs B1/B3 through `processTicket`.
6. The original B1 wording matched an actorless `sign in normally` hard veto despite a rank-1 lockout candidate.
7. The original B3 wording supplied no matching technician-placement facet, so its candidate was rejected before scoring.
8. Yes. Both target Memories were loaded from Meridian’s seven-Memory projection.
9. B1 disappeared at later candidate eligibility; B3 disappeared at compatibility before scoring.
10. No. Both traces were Uncategorized operational inputs; classification did not cause either disappearance.
11. Yes for B3; no for B1.
12. Yes for both: B1 through a false later veto and B3 through no shared facet.
13. No. B1 scored and ranked first; B3 never reached scoring.
14. No. B1 ranking was correct; B3 was not ranked.
15. No independent suppression was found; `effectiveMatch` was null because eligibility was empty.
16. No for the original defect. A stale child listener was found only during the later restart.
17. Yes. It did not represent production input shape or the exact failed language.
18. The B1 contradiction pattern, technician-placement facet definition, fixture data, and application-path regression assertions.
19. Yes.
20. Not verified; the real UI is blocked by authentication timeout.
21. No; 0/9 was executed after repair.
22. Yes in automated regression, 3/3.
23. Yes in automated regression; no grounded reuse was authorized.
24. Yes in automated regression; revision 5 and retained scope passed.
25. Yes in automated regression; the repair does not change human-review authority.
26. Yes in automated provenance regression.
27. Yes in automated comparison-tenant regression.
28. No. The authorized browser matrix was not executed.
29. No.
30. `OIP-V2-E2E-FIX-001R2 — Continued Retrieval Regression Repair`, starting with stable authenticated local runtime and then the mandated B1/B3 plus 9-query UI acceptance.
