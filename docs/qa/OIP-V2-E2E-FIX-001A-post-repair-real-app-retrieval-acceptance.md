# OIP-V2-E2E-FIX-001A — Post-Repair Real-App Retrieval Acceptance

Date: 2026-09-07  
Release: OIP v0.4.0 / FIX-001 post-repair acceptance  
Organization: Meridian Field Operations  
Account: Avery Morgan QA  
Mode: black-box normal UI only

## 1. Executive Summary

The application was reachable, Avery Morgan QA remained signed in to Meridian Field Operations, and Knowledge visibly contained the seven existing validated Memories. All three exact-title checks passed through the normal Tickets workflow, including the evolved roster Memory with visible Trust 15 / v2 / Human review required state.

The required natural-language acceptance did not pass. B1, the supplied authentication-lockout description, returned `No knowledge match — cold start`. B3, the supplied transferred-technician description, also returned `No knowledge match — cold start`. B2 branch DNS and B4 stale dispatch passed. Because the required B1–B4 set is 2/4 rather than 4/4, this is an E2E-DEFECT-006 regression in real-app behavior even though the narrower FIX-001 automated fixtures previously passed.

The ambiguous case remained cautious: the roster Memory was Weak, Human review remained required, and grounded reuse was not authorized. The invoice negative control safely returned no match. No response was approved or sent, no ticket was resolved, and no Memory/Evidence/Outcome/Challenge/scope data was changed.

Known E2E-DEFECT-008 and E2E-DEFECT-009 presentation defects were reproduced. A visible `saveOrgLog` HTTP 500 notice appeared repeatedly, but ticket creation and retrieval completed. The light navigation check reached Home, Tickets, and Knowledge; Cases remained at `Loading cases...` after waiting, which is recorded as a new low-severity navigation finding.

## 2. Test Environment

- Local application: `http://localhost:3000/?auth=signup`
- Existing signed-in account: Avery Morgan QA
- Existing organization: Meridian Field Operations
- Existing seven-Memory corpus preserved
- Normal browser UI via the in-app browser only
- No source inspection, hidden APIs, SQL, Prisma Studio, direct database changes, approvals, sends, resolutions, or Memory mutations

## 3. Starting Application State

The app opened in the existing authenticated Meridian workspace. The account menu identified Avery Morgan QA. The persistent visible issue notice was already present:

`Persistence failed for saveOrgLog: Server persistence could not read intelligence log. (HTTP 500).`

No accidental Memory deletion was visible. The Knowledge route showed seven Memories and `0 awaiting validation`.

## 4. Existing Memory Corpus

Knowledge displayed these seven validated Memories:

1. Dispatch roster access restored after regional group assignment
2. Expired temporary assignment blocks roster access
3. Account lockout blocks portal authentication
4. Stale dispatch board caused duplicate urgent assignment
5. Transferred technician missing from service region
6. Mobile dispatch tablet showed stale data after reconnect
7. Branch Wi-Fi could not resolve scheduling host

The evolved roster Memory visibly showed Reliability 15/100, active lifecycle, Human review required, v2, and validation by Avery Morgan QA. Its bounded lesson states that the regional reader-group check applies to transferred East dispatch coordinators and does not establish the cause of all portal access failures. The Knowledge detail remained accessible after the retrieval run.

## 5. Query Ledger

| Test | Query Type | Expected Memory | Actual Memory | Classification | Relevance | Version/Trust | Human Review | Grounded Reuse | Notes |
|---|---|---|---|---|---|---|---|---|---|
| A1 / MF-20260907-0036 | Exact title | Account lockout blocks portal authentication | Account lockout blocks portal authentication | CORRECT_RETRIEVAL | Strong | v1 / Trust 20 | Required | Not authorized | Candidate title and identity correct; draft still said no organizational knowledge |
| A2 / MF-20260907-0037 | Exact title | Branch Wi-Fi could not resolve scheduling host | Branch Wi-Fi could not resolve scheduling host | CORRECT_RETRIEVAL | Strong | v1 / Trust 20 | Required | Not authorized | Candidate title and identity correct |
| A3 / MF-20260907-0038 | Exact title, profile-style | Dispatch roster access restored after regional group assignment | Dispatch roster access restored after regional group assignment | CORRECT_RETRIEVAL | Moderate | v2 label / Trust 15; current service revision previously verified as 5 | Required | Not authorized | Business intent showed product information; current candidate surfaced |
| B1 / MF-20260907-0039 | Natural lockout | Account lockout blocks portal authentication | None; `No knowledge match — cold start` | MISSED_RELEVANT_MEMORY | None | None | Required for generic draft | Not applicable | Exact supplied query preserved; no retry or rewording |
| B2 / MF-20260907-0040 | Natural branch DNS | Branch Wi-Fi could not resolve scheduling host | Branch Wi-Fi could not resolve scheduling host | CORRECT_RETRIEVAL | Weak | v1 / Trust 20 | Required | Not authorized | Candidate surfaced; no grounded reuse |
| B3 / MF-20260907-0041 | Natural transferred technician | Transferred technician missing from service region | None; `No knowledge match — cold start` | MISSED_RELEVANT_MEMORY | None | None | Required for generic draft | Not applicable | Exact supplied query preserved; no retry or rewording |
| B4 / MF-20260907-0042 | Natural stale dispatch | Stale dispatch board caused duplicate urgent assignment | Stale dispatch board caused duplicate urgent assignment | CORRECT_RETRIEVAL | Weak | v1 / Trust 20 | Required | Not authorized | Candidate surfaced; no grounded reuse |
| C / MF-20260907-0043 | Ambiguous access | Cautious related result | Dispatch roster access restored after regional group assignment | SAFE_AMBIGUOUS_RESULT | Weak | v2 label / Trust 15 | Required | Not authorized | No unsupported certainty; competing causes not shown in UI |
| D / MF-20260907-0044 | Unrelated finance control | None | None; `No knowledge match — cold start` | SAFE_NO_MATCH | None | None | Required for generic draft | Not applicable | No dispatch, DNS, tablet, or auth candidate appeared |

## 6. Exact-Title Retrieval Results

A1, A2, and A3 were all visibly successful. Each showed `Memory found` with the expected title. A3 was especially important: the profile-style question still surfaced the evolved roster Memory, displayed Trust 15 / v2 and two human approvals, and retained `Human review required` and `Not authorized for grounded reuse`.

## 7. Natural Retrieval Results

B2 and B4 passed. B1 and B3 failed exactly as entered:

- B1: “One employee entered the wrong password several times and now cannot get past the portal login screen. Everyone else can sign in normally. Have we seen something like this before?” The UI showed `No knowledge match — cold start`; the AI draft independently mentioned temporary lockout, but no Organizational Memory candidate was surfaced.
- B3: “A technician recently moved to our West region and is active, but West dispatch cannot find them in the available technician list. Is there something our organization already learned that could help?” The UI showed `No knowledge match — cold start`; no technician-region Memory candidate was surfaced.

These are genuine misses, not semantic reinterpretations or wording retries. They reproduce the repaired defect condition in the actual app and invalidate the required 4/4 natural acceptance criterion.

## 8. Wrong-Candidate Regression

B1 did not select the wrong roster Memory; it returned no candidate. Therefore the specific “lockout must outrank roster” ordering assertion was not exercised successfully in the real UI. The prior FIX-001 automated wrong-candidate regression remains green, but real-app acceptance for the lockout scenario is **FAIL** because the expected Memory was absent.

## 9. Ambiguous Safety Result

C surfaced the evolved roster Memory as Weak, showed Human review required, and explicitly displayed `Not authorized for grounded reuse`. It did not present unsupported certainty or authorize a response based on the candidate. Classification: `SAFE_AMBIGUOUS_RESULT`.

## 10. Negative-Control Result

D safely returned `No knowledge match — cold start` and `Trust: no match`. No existing operational Memory was confidently presented. Classification: `SAFE_NO_MATCH`.

## 11. Current Revision / Scope Verification

Knowledge continued to display the evolved roster Memory with current v2 content, Reliability 15/100, active lifecycle, Human review required, and Avery Morgan QA validation. The visible lesson remained bounded around regional reader-group assignment and did not claim all authentication failures or expired-assignment cases. A3 retrieved that same current candidate state rather than the earlier stale Trust 20 representation. Current scope/version: **PASS**.

## 12. Human Review / Grounding Safety

Every positive candidate showed Human review required. A1–A3, B2, B4, and C all showed `Not authorized for grounded reuse` or an equivalent insufficient-grounding explanation. No AI validation, promotion, reuse outcome, response send, ticket resolution, trust mutation, or automation occurred. Human authority: **PASS**.

## 13. Provenance / Presentation Observations

For A1 and A3, the candidate title and selected Memory identity were correct, but the candidate panel showed aggregate support/approval counts, a truncated Knowledge ID, and `Lesson evidence: None` rather than the complete named Source/Evidence story visible in Knowledge. Classification: `E2E_DEFECT_008_REPRODUCED`.

A3 additionally showed `Memory found` in reasoning while the draft banner said `no organizational knowledge exists yet`; the AI draft claimed the topic was not in the known knowledge base even though the candidate was visible. Classification: `E2E_DEFECT_009_REPRODUCED`.

These presentation defects did not change candidate identity or bypass governance, but they materially confuse the employee experience.

## 14. Existing Defect Reproductions

- **E2E-DEFECT-006 REGRESSION — HIGH:** B1 and B3 required natural descriptions returned cold start despite corresponding validated Memories being visible in Knowledge.
- **E2E-DEFECT-007 — MEDIUM:** Existing Knowledge surface still has no direct natural-language search input; not re-tested beyond normal route access.
- **E2E-DEFECT-008 — HIGH:** Reproduced in A1/A3 candidate presentation.
- **E2E-DEFECT-009 — MEDIUM:** Reproduced in A1–A3, B2, B4, and C candidate/draft states.
- **E2E-DEFECT-010 — HIGH:** Not reproduced; A3 showed current Trust 15 / v2 state.
- **E2E-DEFECT-005:** No refresh was performed; known session behavior was not used as an acceptance condition.

## 15. New Defects

**E2E-DEFECT-011 — LOW — Cases route remains in Loading state during normal navigation sanity check.** The route opened normally but still displayed `Loading cases...` after an initial wait and an additional five seconds. No internal investigation or repeated stress was performed. This was outside retrieval acceptance and did not block Tickets or Knowledge.

## 16. saveOrgLog Observation

`Persistence failed for saveOrgLog: Server persistence could not read intelligence log. (HTTP 500).` was visible before and throughout the ticket run, sometimes repeated in the issue banner. Tickets MF-20260907-0036 through MF-20260907-0044 were still created and retrieval results were rendered. Classification: `OBSERVED_NO_RETRIEVAL_BLOCK`. No internals were investigated and no repair was attempted.

## 17. Navigation Sanity Check

Home opened and showed the existing Memory summaries. Tickets opened and displayed the last query. Cases opened but remained `Loading cases...`. Knowledge opened and displayed all seven Memories, including the evolved roster Memory. Navigation sanity: **PARTIAL** because Cases did not finish loading.

## 18. Acceptance Matrix

| Requirement | Result | Evidence |
|---|---|---|
| Exact-title retrieval 3/3 | PASS | A1 MF-0036, A2 MF-0037, A3 MF-0038 surfaced expected titles |
| Natural relevant retrieval 4/4 | FAIL | B1 MF-0039 and B3 MF-0041 cold-started; B2/B4 passed |
| Lockout wrong-candidate regression | FAIL | B1 had no candidate, so expected lockout Memory was not surfaced |
| Negative control | PASS | D MF-0044 safely no-matched |
| Ambiguous safety | PASS | C MF-0043 Weak, review-required, no grounded reuse |
| Current version/scope | PASS | Knowledge and A3 showed current evolved roster state |
| Human-review safety | PASS | No candidate bypassed review or grounding |
| Provenance identity | PASS with known presentation defect | Candidate identities were correct; E2E-DEFECT-008 presentation reproduced |
| App navigation sanity | PARTIAL | Home/Tickets/Knowledge worked; Cases stayed Loading |

## 19. Commit-Readiness Recommendation

`NO — RETRIEVAL_REPAIR_REQUIRES_MORE_WORK`

FIX-001 should not proceed to commit-readiness audit because two required natural employee queries still miss their validated Memories in the real application. The separate presentation and logging issues do not by themselves fail retrieval acceptance, but E2E-DEFECT-006 regression does.

## 20. Final Verdict

`OIP_V2_E2E_FIX_001A_RETRIEVAL_REPAIR_REGRESSION_FOUND`

The post-repair UI acceptance failed the required natural retrieval criterion. No safety or provenance corruption was observed, and all failures were preserved without retries or data repair.

## 21. HANDOFF

## HANDOFF — OIP-V2-E2E-FIX-001A

Completed: Confirmed authenticated Meridian Field Operations access; verified seven existing Memories in Knowledge; executed exactly nine planned retrieval queries through the normal Tickets UI; checked current evolved roster state; verified human-review/grounding safety; performed light Home → Tickets → Cases → Knowledge navigation.

Existing corpus: Seven validated Memories remain visible and unchanged. The evolved roster Memory remains current v2 / Reliability 15 / active / Human review required, with bounded regional-reader-group scope. Tickets MF-20260907-0036 through MF-20260907-0044 are unapproved and unresolved.

Retrieval result: Exact-title 3/3 correct. Natural relevant 2/4 correct. Ambiguous case safely Weak/review-required/no grounded reuse. Finance negative safely no-match. B1 authentication lockout and B3 transferred technician reproduced E2E-DEFECT-006 as real-app misses.

Existing defects reproduced: E2E-DEFECT-006 REGRESSION, E2E-DEFECT-008, E2E-DEFECT-009. E2E-DEFECT-010 not reproduced. E2E-DEFECT-005 not tested.

New defects: E2E-DEFECT-011 LOW — Cases route remains Loading. `saveOrgLog` HTTP 500 remains an observed separate resilience issue with no retrieval block.

Important current application state: Browser is authenticated on Knowledge showing the seven Memories and the evolved roster detail. No ticket was approved, sent, resolved, validated, promoted, or otherwise used to change organizational learning.

Commit recommendation: `NO — RETRIEVAL_REPAIR_REQUIRES_MORE_WORK`

Next authorized task: `OIP-V2-E2E-FIX-001R — Retrieval Repair Regression Investigation`

STOP. Do not begin FIX-001R automatically.
