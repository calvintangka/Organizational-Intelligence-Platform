# OIP-V2-QA-001R — Organizational Memory Core Acceptance Test Rerun

Date: 2026-08-25 (Asia/Jakarta)

## 1 Executive Summary

This rerun independently exercised the product UI for a fresh domain-neutral Event A, six supporting Evidence items, preparation, human validation, reload persistence, retrieval, negative reuse, Challenge, and scope evolution. Remember and governance behaviors were observable. The exact Event B scenario was not retrieved through the supported Tickets workflow, and outcome retry duplicated an identical negative outcome. The core is therefore only partially accepted.

## 2 Final Verdict

`OIP_V2_QA_001R_ORGANIZATIONAL_MEMORY_CORE_PARTIALLY_ACCEPTED`

Remember and Evolve are materially present. Retrieve is not acceptance-ready, and Trust has state/explanation inconsistencies after trust reaches zero.

## 3 Original QA Baseline

The original QA-001 baseline was `OIP_V2_QA_001_ORGANIZATIONAL_MEMORY_CORE_PARTIALLY_ACCEPTED`. It was blocked in Phase A because the visible product required a ticket and did not expose a practical domain-neutral Source/Evidence path.

## 4 FIX-002 Closure Claims

FIX-002 claimed that a domain-neutral entry path and inspection surface existed and that `QA_001_RERUN_READY` was reached. This rerun independently verified the entry and inspection behavior, but did not treat FIX-002 implementation evidence as acceptance evidence.

## 5 Repository State

Branch: `landing/option-c32-release-polish`

HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`

The worktree was already dirty before this rerun. The only QA-authorized repository mutation in this rerun is this report file. No product/runtime code, schema, migration, test, Canon, or implementation document was modified.

## 6 Runtime Environment

Local Next.js development server at `http://localhost:3000/`, server persistence mode, local PostgreSQL database `oip_development`, organization `Merah Putih Operations`, actor `NC-FIX-017A Repair Browser q1vkz1`, role `Owner`. The development server was restarted because no listener was present; no code change was made.

## 7 Synthetic Organization

All fresh QA records were created in `Merah Putih Operations`. Existing deprecated FIX-002 memory was retained and not used as Event A evidence.

## 8 V2-GAP-001 Recheck

PASS. A normal operator could discover **Add Organizational Experience** from Knowledge without an internal URL, developer tools, or ticket prerequisite.

## 9 Event A

Source title: `QA-001R Event A — Warehouse scanner synchronization`

Type: `OPERATIONAL_EVENT`

Occurred: 2026-08-25 10:00 local form value (displayed by the product as 8/25/2026, 6:54:00 AM due to timezone rendering).

Source description: handheld scanners stopped synchronizing inventory during movement between network bands while the inventory backend remained operational.

## 10 Phase A — Remember

The product recorded Event A as a Source, retained Source identity separately from learning, accepted six Evidence items, prepared a proposed lesson, required human validation, and created an inspectable memory.

## 11 Phase A Evidence

Six evidence records were visible with typed labels, timestamps, and origin attribution: observation, system result, investigation, observation, action taken, and confirmation.

## 12 Phase A Verdict

PASS. Event A completed the Remember path through the product UI.

## 13 Persistence Check A

PASS for normal page reload. After reload and reopening Knowledge, Event A remained active and trusted with Source, six Evidence items, validator/rationale, Revision 1, and provenance. A prior operator-created Event A from the earlier browser run was absent after a later server restart; that observation is recorded as a runtime persistence concern, but the fresh Event A passed the required page-reload check.

## 14 Event B

The exact non-identical scenario was submitted through the supported Tickets workflow: “At another warehouse, handheld inventory scanners periodically stop synchronizing while employees move between scanning zones. Inventory backend services remain healthy.”

## 15 Phase B — Retrieve

FAIL. The supported retrieval workflow returned `No knowledge match — cold start`. Event A was not surfaced, so no legitimate human reuse approval or SUCCESS outcome could be performed from the retrieval result.

## 16 Retrieval Evidence

The Tickets UI showed `No knowledge match — cold start`, `Trust: no match`, and an explicit notice that the draft was not based on organizational memory. This is direct product evidence of under-retrieval for the specified non-identical event.

## 17 Human Reuse Decision

NOT COMPLETED. Because Event B did not retrieve Event A, the rerun did not fabricate a reuse decision or manually inject the memory into the result.

## 18 SUCCESS Outcome

NOT COMPLETED. No SUCCESS was recorded because the product did not retrieve Event A for Event B.

## 19 Outcome Idempotency

FAIL. A repeated identical `Did not work` outcome submission created a second durable outcome. Outcome history increased from one event to two events with duplicate text and duplicate trust effects. The required idempotent retry behavior was not demonstrated.

## 20 Phase B Verdict

FAIL. Retrieval and the downstream SUCCESS proof were unavailable for the required Event B scenario.

## 21 Persistence Check B

NOT PASSED. Event B had no retrieved memory and no SUCCESS outcome to verify. The ticket itself remained represented in the workspace, but this is not a substitute for durable memory reuse proof.

## 22 Event C

Event C was submitted as a distinct ticket: a third warehouse had similar synchronization failures, the network-profile intervention failed, and investigation identified a firmware-specific defect rather than network roaming.

## 23 Negative Outcome

PASS with follow-up. The product recorded `Did not work` with the Event C explanation. After the UI settled, Outcome history showed one event, `Trust -10`, actor, timestamp, and durable evidence. The same submission was then repeated to test idempotency and produced a duplicate.

## 24 Bad Retrieval vs Bad Memory

The product record remains understandable as a scope problem rather than proof that the original Event A lesson was false: Event A concerned Wi-Fi roaming, while Event C identified a firmware-specific defect. The UI did not provide a dedicated structured distinction, so this interpretation depends on the written rationale and evidence.

## 25 Challenge

PASS. The Challenge form accepted rationale and supporting evidence referencing Event C and the negative outcome.

## 26 OPEN Challenge Behavior

PASS. The product displayed `Challenge opened. Automation authority is now fail-closed for this memory.` The memory remained inspectable and its history remained visible. The challenged list state was shown as `Challenged`.

## 27 Human Review

PASS after the authorized review action. The review form required reviewer rationale and a narrowed-scope note. The initial Review button was disabled until those fields were supplied.

## 28 Scope Update

PASS. `SCOPE_UPDATED` was committed. The new scope stated that the lesson applies to Wi-Fi roaming transitions and not to firmware-specific synchronization defects.

## 29 Historical Preservation

PASS with trust-display defect. Version 1 and Version 2 remained visible, the Challenge remained in history as resolved `SCOPE_UPDATED`, both negative outcomes remained, original Source and Evidence remained, and the original validation remained. The current UI still showed `Trusted state` and `Lifecycle: active` when trust projection was 0, which is misleading.

## 30 Phase C Verdict

PARTIAL. Negative outcome preservation, Challenge, fail-closed behavior, human review, scope update, and historical preservation passed. The phase could not prove prior Event B SUCCESS because retrieval failed, and outcome idempotency failed.

## 31 Persistence Check C

PASS for the tested page-reload path. After reload and reopening the memory, Source, six original Evidence items, validation, two negative outcomes, Challenge resolution, Version 1, and Version 2 remained visible.

## 32 Phase D — Trust

Trust was inspectable as a projection with explanatory fields, human validation, outcome counts, and version history. However, trust reached 0 while the UI continued to label the memory `Trusted state` and `active`.

## 33 Trust Inspection Matrix

| Signal | Result |
|---|---|
| Human validation visible | PASS |
| Source/provenance visible | PASS |
| Evidence visible | PASS |
| Trust explained beyond a number | PASS initially; partial after scope update |
| Negative outcome changes trust | PASS, -10 per recorded outcome |
| Challenge fail-closes automation | PASS |
| Trust-zero lifecycle/badge consistency | FAIL |
| Outcome retry idempotency | FAIL |

## 34 Phase D Verdict

PARTIAL. Trust history and explanation are inspectable, but trust-zero presentation and duplicate outcome effects prevent a full Trust pass.

## 35 Organization Isolation

PARTIAL/NOT PROVEN. The test actor remained in `Merah Putih Operations`, and no second organization was available in the visible workspace for a controlled cross-organization mutation/access test. No cross-organization leak was observed.

## 36 AI Authority

PASS for observed guardrails. Event B cold start required human review, and Event C weak retrieval explicitly said the memory was not authorized for grounded reuse. The product did not auto-authorize reuse from the weak match.

## 37 V2-GAP Closure Matrix

| Gap | Result | Evidence |
|---|---|---|
| V2-GAP-001 domain-neutral entry | CLOSED for entry discoverability | Add Organizational Experience path and Source form |
| V2-GAP-002 inspection surface | CLOSED for visible inspection | Source, Evidence, validation, outcomes, Challenge, versions, provenance, trust |
| Non-identical retrieval | OPEN | Event B returned cold start |
| Durable outcome idempotency | OPEN | Identical retry created two events |
| Trust-zero lifecycle clarity | OPEN | Trust 0 still labeled Trusted state/active |

## 38 Product Friction

The entry path is discoverable, but the retrieval path is support-ticket-centric. Event B required the Tickets workflow and did not connect to the domain-neutral memory. Outcome forms do not expose a structured Source/work-context field, and the UI initially lagged before refreshing outcome counts and Revision 2.

## 39 Defects

1. Exact non-identical Event B was not retrieved from validated Event A.
2. Identical outcome retry duplicated the outcome and trust effect.
3. Trust projection 0 still displayed `Trusted state` and `active`.
4. Outcome display uses generic `REUSE_OUTCOME`/`outcome` labels and does not visibly bind the outcome to a named Event B/Event C source or ticket.
5. Evidence/origin body text had poor contrast on dark cards in the supplied screenshots and live inspection.
6. Outcome commit briefly showed a success toast while the visible history and revision had not yet refreshed.

## 40 Acceptance Matrix

| Criterion | Result |
|---|---|
| Domain-neutral Source | PASS |
| Evidence attachment and inspection | PASS |
| Preparation without trust | PASS |
| Human validation | PASS |
| Reload persistence | PASS |
| Non-identical retrieval | FAIL |
| Retrieval explanation | PARTIAL (Event C weak-match explanation) |
| Human reuse decision | NOT PROVEN |
| SUCCESS outcome | NOT PROVEN |
| Outcome idempotency | FAIL |
| Negative outcome | PASS with duplicate retry defect |
| Challenge and OPEN fail-close | PASS |
| Human SCOPE_UPDATED review | PASS |
| Historical preservation | PASS |
| Trust-state consistency | FAIL |

## 41 Product QA Scores

REMEMBER: 4/5

RETRIEVE: 1/5

EVOLVE: 4/5

TRUST: 3/5

## 42 Core Acceptance Proof

The strongest proof is the fresh Event A lifecycle: Source → six typed Evidence items → preparation marked not trusted → human validation → inspectable trusted memory → reload persistence → Challenge → OPEN fail-closed → SCOPE_UPDATED with preserved versions and evidence. The missing proof is non-identical retrieval followed by successful reuse.

## 43 What Felt Like Organizational Memory

Source identity remained separate from the proposed lesson. Evidence had types, timestamps, and provenance. Human validation was explicit. Outcomes, Challenge rationale, reviewer rationale, scope note, revisions, and trust projection were inspectable and survived reload.

## 44 What Still Felt Like Support

Retrieval remained centered on a customer ticket and did not recognize the domain-neutral Event B. The system exposed a cold-start support response rather than a reusable organizational-memory match. Outcome records lacked clearly structured event/work-context binding.

## 45 Design-Partner Readiness

`NOT_READY` for the full Organizational Memory core. The entry and governance surface is promising, but retrieval and idempotent outcome recording are core design-partner requirements.

## 46 Recommended Next Task

Implement and verify domain-neutral retrieval signals for non-identical organizational events, then add durable idempotency keys and explicit Source/work-context binding to Outcome records. Finally align trust badges and lifecycle with trust-zero and challenged/scope-updated states.

## 47 Repository Mutation Verification

Before the authorized report write, the worktree contained the pre-existing dirty files and untracked FIX-002 implementation artifacts. No QA report existed. No product/runtime file was changed during the rerun. The only new QA artifact is this report.

## 48 Final Conclusion

Final verdict: `OIP_V2_QA_001R_ORGANIZATIONAL_MEMORY_CORE_PARTIALLY_ACCEPTED`.

1. V2-GAP-001 closed? Yes, for domain-neutral entry discoverability.
2. V2-GAP-002 closed? Yes, for the visible inspection surface.
3. Non-Support event without ticket? Yes, Event A was created without a ticket.
4. Attach/inspect Evidence? Yes, six typed Evidence items were attached and inspected.
5. Prepare learning without trust? Yes.
6. Human validate? Yes.
7. Memory survive reload? Yes for the fresh Event A page-reload path; server-restart persistence remains a follow-up concern.
8. Retrieve non-identical event? No for Event B.
9. Understand why retrieved? Partially for Event C weak retrieval; not applicable to Event B cold start.
10. Successful reuse durable evidence? Not proven.
11. Idempotent retry? No; duplicate negative outcomes were created.
12. Negative outcome preserved? Yes.
13. Failure avoids auto invalidation? Yes; Challenge remained human-governed.
14. Human Challenge? Yes.
15. OPEN Challenge fail-close? Yes.
16. Human narrow scope? Yes, `SCOPE_UPDATED`.
17. Original version preserved? Yes.
18. Entire history reconstructable? Mostly yes; Source, Evidence, validation, outcomes, Challenge, and versions were visible.
19. Other organization access/mutate? Not proven; no second visible organization was available.
20. AI unauthorized authority? No unauthorized authority was observed; weak retrieval remained human-gated.
21. Largest remaining product gap? Non-identical domain-neutral retrieval.
22. Strongest observed memory behavior? Evidence-backed, human-validated, versioned, challengeable memory with preserved provenance.
23. Design-partner readiness? `NOT_READY` for the full core.
24. What next? Fix domain-neutral retrieval, outcome idempotency/context binding, and trust-zero state presentation, then rerun the unchanged acceptance test.
