# NC-ACCEPT-001 — NC-0001 Learning-Loop Acceptance Report

## 1. Executive Summary

The governed learning loop passed on an exact disposable NusaCloud-style replay: cold-start ticket, human-reviewed response, same-ticket follow-up, durable customer-confirmation evidence, evidence-backed resolution, Reflection, validation, KnowledgeItem creation, provenance, relogin durability, and similar-ticket retrieval. The permanent probe passed without a live provider call. Acceptance is verified with findings because the browser’s synthetic reuse approval path returned HTTP 409 and broad generic-category retrieval showed a weak unrelated-match case.

## 2. Final Verdict

`NC_ACCEPT_001_VERIFIED_WITH_FINDINGS`

## 3. Product Thesis Under Test

Can a new support issue become validated organizational memory that improves later support while preserving evidence, provenance, tenant isolation, human review, and uncertainty? Answer: `PARTIALLY` in the broadest sense; the core first-ticket learning loop and grounded retrieval work, but reuse approval and some weak unrelated retrieval cases require follow-up.

## 4. Baseline

HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`. Branch: `master`. Certified tag `v0.1.1-certified` dereferences to the same SHA.

## 5. Existing NC-FIX Chain

NC-FIX-001 draft persistence, NC-FIX-002 multi-turn lifecycle, NC-FIX-003 evidence/reflection gating, NC-FIX-004 response formatting, and NC-FIX-005 latency measurement were rerun. All required deterministic probes passed.

## 6. NC-0001 Access Decision

NC-0001 was not mutated directly. Read-only discovery found the mature `Nusa Cloud` ticket `NC-20260810-0001` in `in_review` with no final response, no Reflection decision, no validation references, and no evidence. No authorized credential or approved mutation access was available.

## 7. Mature vs Disposable Test Scope

The mature record was protected by read-only inspection. An equivalent disposable replay was executed through the normal browser UI and a separate permanent authenticated HTTP probe using disposable organizations and accounts.

## 8. Protected Baseline

Protected integrity digest before and after: `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`. `protectedOrganizationsUnchanged: true`; release-blocking findings: `0`.

## 9. Initial Organization Memory State

The disposable browser organization started with zero KnowledgeItems. The permanent probe asserted the same empty state before ticket processing.

## 10. Initial Customer Message

Customer Rina Prasetyo of PT Sinar Karya Abadi reported that Andi Wibowo could not clock in through the NusaCloud mobile app because the application requested location access, while other employees could still clock in.

## 11. Understanding

The pipeline extracted Rina Prasetyo, PT Sinar Karya Abadi, Andi Wibowo, mobile clock-in, and location-permission context. The first run was treated as a new/uncategorized issue requiring human review.

## 12. Cold-Start Retrieval

The first ticket displayed `No knowledge match — cold start`; the permanent probe asserted `memoryMatch: null` and an empty initial organization memory.

## 13. Initial AI Draft

DeepSeek produced a cautious troubleshooting draft asking the customer to confirm device permission and provide device/app details. It did not claim a confirmed root cause.

## 14. QC-002 Quality Assessment

QC-002 passed for useful, cautious, customer-specific troubleshooting. No unsupported certainty or invented resolution was observed.

## 15. Response Formatting

NC-FIX-004 passed: multiline drafts, human edits, historical messages, refresh, and server restart preserved formatting exactly.

## 16. Draft Latency Observation

Browser visible draft-generation time was `6100.323 ms` on the first ticket. NC-FIX-005 direct-provider deterministic/live evidence recorded provider p50 `1917.018 ms`, p95 `2470.443 ms`, with provider share `99.99%`; browser tooling did not expose nested provider timing.

## 17. Human Review

The reviewer edited the draft and approved it through the visible human-review workflow. The final response was not treated as authoritative knowledge until the governed Reflection and validation path.

## 18. Draft Persistence

The human-edited response persisted across Cases navigation and Resume in workspace. The exact edited text remained visible and `Human edited: Yes` was shown.

## 19. First Agent Response

The browser sent the first reviewed response through `Send response · Wait for customer`. The permanent probe also verified the sent response in ordered durable message history.

## 20. Waiting for Customer

After the first send, the case entered `Waiting for customer` and exposed the normal next-customer-message control.

## 21. Premature Reflection/Validation Gate

A separate disposable replay opened preliminary Reflection before evidence. The browser displayed `Reflection is preliminary — resolution evidence is still required`, `Resolution evidence is required before validation`, and a disabled Validate control. The permanent probe independently received `RESOLUTION_EVIDENCE_REQUIRED` for unresolved validation.

## 22. Customer Follow-Up

The same case received a second customer message confirming that location permission had been changed from `Don't allow` to `Allow while using the app` and that clock-in worked again.

## 23. Multi-Turn Conversation

The final browser replay preserved Customer #1 → Agent #1 → Customer #2 ordering. NC-FIX-002 and the permanent probe additionally verified a fourth agent message, immutable sequence, draft separation, restart durability, and idempotent retries.

## 24. Resolution Evidence

The customer-confirmation message was explicitly selected with `Use as resolution evidence`. The UI showed durable recorded evidence linked to the customer source message.

## 25. Resolution

The case resolved through `Resolve with evidence`; no anonymous force-resolve or evidence bypass was used.

## 26. Reflection

After evidence-backed resolution, the reviewer authored a new lesson with problem name, root cause, solution, customer response template, and signals.

## 27. Reflection Quality

The lesson stated that the affected device lacked NusaCloud location permission and that enabling permission while using the app restored mobile clock-in. Signals covered mobile clock-in, one employee affected, and other employees unaffected.

## 28. Validation

The Validate control became enabled only after evidence-backed resolution. `Validate & Commit to Organizational Memory` completed through the governed commit path and the browser displayed `Reflection complete` and `Knowledge updated`.

## 29. Organizational Memory Creation

A KnowledgeItem and authored lesson were created through the normal Reflection/validation workflow; no final KnowledgeItem was manually seeded.

## 30. Provenance

The browser-created item was read back after the workflow with exact ID `canonical-mobile-clock-in-location-permission-disabled`, source ticket `NH-20260811-0004`, and revision `2`. The permanent probe independently asserted source-ticket provenance and validation/memory linkage.

## 31. Persistence / Relogin

The permanent probe logged out, logged back in with its runtime-only disposable credential, and reloaded the KnowledgeItem. The item survived. The browser session was intentionally not reused after its runtime password was lost during a tool-kernel reset; this is covered by the permanent probe and prior NC-FIX-003 browser evidence.

## 32. Second Similar Case

The browser submitted a second similar issue and showed `Lesson matched`. The permanent probe submitted a second durable similar ticket through the server processing endpoint and retrieved the validated lesson.

## 33. Memory Retrieval

The browser displayed the lesson title `Mobile Clock-In - Location Permission Disabled`, lesson signals, Knowledge ID/version explanation, and a lesson-grounded draft. The permanent probe asserted that the second ticket’s `memoryMatch.item.id` equaled the created item.

## 34. Grounded Reuse

The second draft used the validated response template and displayed `AI draft grounded in organizational memory`. The permanent probe asserted lesson-grounded draft output without fabricating certainty.

## 35. No-False-Certainty Check

The first and second drafts did not claim the root cause was definitely confirmed. The permanent probe rejects phrases such as `definitely disabled` and `confirmed root cause`.

## 36. Reuse Tracking

Lesson retrieval worked, but browser `Approve reuse (human)` failed with HTTP 409 because the synthetic reuse path attempted to commit a validation candidate referencing a missing source TicketRecord. The browser-read item still showed `timesReused: 0`; reuse approval/trust tracking is therefore a finding, not a pass.

## 37. Negative Retrieval Control

The permanent probe passed a strong unrelated security-incident control with no lesson match. During exploratory browser/probe work, a generic unrelated ticket classified as `Uncategorized` did match the lesson through a weak category/keyword fallback; this is a material retrieval-safety finding requiring stronger cross-domain discrimination.

## 38. Cross-Tenant Isolation

The permanent probe verified the other organization had no KnowledgeItem, could not read the first organization’s Knowledge resource, and could not mutate its ticket/evidence path. RBAC/TODO-078 also passed.

## 39. Browser Acceptance

Browser acceptance passed for cold start, draft, edit, resume, send, waiting, follow-up, evidence, preliminary block, resolution, Reflection, validation, Knowledge update, and lesson retrieval on a disposable account/organization.

## 40. Console / Network Evidence

The normal first-ticket path had no console errors/warnings. Final browser logs contained the expected illegal-order rejection (`A Reflection can only be prepared for an active review case`) and the reuse approval defect (`A validation candidate references a missing source ticket in this organization`, HTTP 409). No secret-bearing console output was observed.

## 41. Permanent Acceptance Probe

Added [`scripts/nc-accept-001-learning-loop-probe.cjs`](../scripts/nc-accept-001-learning-loop-probe.cjs) and alias `probe:nc-accept-001-learning-loop`. It passed all reported assertions and cleans disposable records on exit.

## 42. NC-FIX Regression Results

NC-FIX-001 PASS; NC-FIX-002 PASS; NC-FIX-003 PASS; NC-FIX-004 PASS; NC-FIX-005 deterministic timing PASS. NC-FIX-003 browser closure evidence remains the prior disposable browser acceptance package.

## 43. RSS Regression Results

RSS-2.1 PASS; RSS-2.6 PASS; RSS-2.7 PASS; RSS-2.8 PASS on isolated port 3510 after starting its required temporary server. Port 3510 was closed afterward.

## 44. Security / RBAC

TODO-078 RBAC PASS. Cross-tenant reads/writes were rejected. OIP benchmark critical security was 100%.

## 45. TypeScript / Prisma / Build

TypeScript `tsc --noEmit` PASS. `prisma validate` PASS. `prisma migrate status` reported the database up to date with 25 migrations. Production `next build` PASS.

## 46. OIP Benchmark

OIP Benchmark v1: `1000/1000` checks, `100%` overall, `100%` critical security; thresholds passed.

## 47. Protected Final State

Final protected digest remained `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`; protected organizations unchanged; release-blocking integrity findings `0`. Historical low/medium findings remained the known audit/fixture findings.

## 48. Cleanup

The exact browser disposable organization and account were deleted after acceptance. Post-cleanup checks found zero matching organization, ticket, KnowledgeItem, validation, memory, evidence, and acceptance-user rows. The permanent probe also reports cleanup true.

## 49. Secret Review

Secret review was clean. Passwords, session tokens, and provider credentials were generated at runtime or disabled for deterministic probes and were not committed, printed, or persisted in the report.

## 50. New Findings

1. Browser synthetic reuse approval returns HTTP 409 because its candidate references a non-persisted source ticket.
2. Generic `Uncategorized` retrieval can select an unrelated lesson on weak category/keyword overlap; the permanent negative control uses a security-separated case and passes.
3. Attempting to prepare Reflection after evidence-backed resolution is rejected by the intended active-review gate; the correct order is prepare while active, resolve with evidence, then validate.

## 51. Product Thesis Assessment

`PARTIALLY`. The first-ticket support-to-memory-to-grounded-retrieval loop is real and durable. The broader thesis is not fully closed until reuse approval creates a real source-ticket record or routes reuse through a non-validation tracking path, and weak unrelated retrieval is tightened.

## 52. Learning Loop Matrix

| Stage | Evidence | Result |
|---|---|---|
| Intake | Browser + permanent probe | PASS |
| Understanding | Extracted customer/company/sub-issue context | PASS |
| Cold retrieval | Empty initial memory and no match | PASS |
| Human review | Multiline edit and approval | PASS |
| Agent response | Durable ordered message | PASS |
| Follow-up | Same-ticket customer message | PASS |
| Evidence | Customer-confirmation source linkage | PASS |
| Resolution | Evidence-backed transition | PASS |
| Reflection gate | Disabled before evidence | PASS |
| Validation | Governed commit after resolution | PASS |
| Memory | KnowledgeItem + lesson + provenance | PASS |
| Reuse | Similar lesson retrieval and grounded draft | PASS |
| Reuse approval tracking | Synthetic browser approval | FINDING |
| Negative retrieval | Strong unrelated security control | PASS; weak generic fallback finding |
| Tenancy | Other organization read/write isolation | PASS |

## 53. Remaining Limitations

Direct NC-0001 mutation remains intentionally untested. Browser nested provider timing and raw network traces were not exposed by the available browser instrumentation. Browser relogin was covered by the permanent probe rather than repeating with a lost runtime-only password. Reuse tracking and weak generic-category retrieval remain open findings.

## 54. Recommendation

Accept the core evidence-gated learning loop with findings. Before claiming full product-thesis closure, persist a real ticket for synthetic reuse or separate reuse tracking from validation commits, add a regression for missing-source reuse approval, and require stronger semantic/category incompatibility suppression for unrelated retrieval.

## 55. Final Verdict

`NC_ACCEPT_001_VERIFIED_WITH_FINDINGS`

Task: NC-ACCEPT-001 — NC-0001 Learning-Loop Acceptance. Final verdict: verified with findings. Baseline HEAD and certified tag SHA: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`. NC-0001 tested directly: `NO`. Equivalent disposable replay: `YES`. Reason: no authorized direct mutation access; mature record was preserved. Initial target memory existed: `NO`. Initial message: Rina/Andi mobile clock-in location-permission issue. Understanding: customer/company/sub-issue extracted. Cold-start retrieval: `PASS`. Initial draft: cautious DeepSeek troubleshooting. QC-002: `PASS`. Formatting: `PASS`. Browser generation: `6100.323 ms`; provider evidence p50 `1917.018 ms`. Human edit, navigate/resume, refresh persistence, first response, waiting state, same-ticket follow-up, ordering, evidence, resolution, Reflection, validation, KnowledgeItem creation, provenance, and permanent logout/login durability: `PASS`. KnowledgeItem: browser `canonical-mobile-clock-in-location-permission-disabled`, revision `2`; permanent probe creates a unique disposable item and passes. Second case retrieval and grounded reuse draft: `PASS`; human reuse approval/tracking: `FINDING`. Certainty control: `PASS`. Strong unrelated control: `PASS`; weak generic fallback: `FINDING`. Cross-tenant isolation: `PASS`. Browser console: normal path clean; final logs contain expected gate rejection and reuse HTTP 409. Permanent probe: `PASS`. NC-FIX-001/002/003/004/005, RSS-2.1/2.6/2.7/2.8, RBAC, TypeScript, Prisma, migration status, build, benchmark, security, protected integrity, cleanup, and secret review: `PASS`. Production source changed for this acceptance: `NO`; only the permanent probe and package alias were added, with prior dirty worktree changes preserved. No commit, push, or tag changes. Report: this document. Blockers: reuse approval source-ticket defect and weak generic retrieval finding. Next step: fix and add regression coverage for both findings, then rerun NC-ACCEPT-001.
