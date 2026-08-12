# NC-FIX-011 — Human-Authored Reflection Lesson Promotion & Customer-Specific Content Safety Reconciliation

## 1. Executive Summary

NC-FIX-011 repaired the Reflection promotion boundary. New reusable response templates are now explicitly human-authored, rather than inheriting the customer-specific reviewed draft. Safety validation covers the normalized reusable problem/lesson fields and extracted source identities, while source tickets, resolution evidence, audit metadata, and opaque provenance remain specific and auditable.

## 2. Final Verdict

`NC_FIX_011_VERIFIED_WITH_FOLLOWUPS`

All NC-FIX-011 product and safety controls passed. The only follow-up is unrelated legacy RSS-1.2S3 harness drift: its old approve-before-evidence expectation receives the current required `409` evidence gate.

## 3. Baseline

- Date/time: 2026-08-12, Asia/Jakarta.
- Branch: `master`; HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- `v0.1.1-certified` resolves to the required commit.
- Existing dirty worktree was preserved; no reset, stash, clean, add, commit, push, tag, or release operation was performed.
- Prisma: 25 migrations, schema up to date.
- TypeScript and production build passed.
- Historical REL-CERT report SHA-256: `7F8325DA431CC7583DA20F5A61F35DCA1E0053B3105AF4B19ACCE0417155711A`.
- Historical candidate manifest SHA-256: `A141278B780642621E99E26F6E9A052A6B838A31EE0B6F2FF1CC5F4F148B4083`.
- New NC-FIX-011 tracked-diff fingerprint measured after production/probe changes and before report finalization: `4260d4e618c4d42594a2095cc750fdda733729b6f83a881159a85abda80d74ea`.

## 4. REL-CERT-001 Source Failure

The preserved certification reported first-attempt `Knowledge promotion was not committed. The review remains retryable and no partial promotion is reported.` and retry `Reflection rejected: customer name before promoting this lesson.` No KnowledgeItem was created. This report treats that as historical evidence and does not edit it.

## 5. Promotion Pipeline Inventory

The path is `ReflectionPanel` → `app/page.tsx` `confirmReflectionApplication` → `validateReflectionCommand` → `promoteKnowledgeCommand` → candidate/lesson/ValidationRecord/MemoryChangeRecord construction → server `commitValidation` transaction → ticket `commit` transition. The server derives actor and organization authority from the authenticated session; source ticket and evidence links are checked inside the transaction.

## 6. Customer-Specific Validator Inventory

`lib/reflectionSafety.ts` rejects email, phone, dates, credentials, ticket identifiers, temporary workarounds, environment-specific instructions, copied ticket text, configured customer/organization names, and now conservative extracted source identities. It validates reusable fields only; source text and provenance are context, not reusable content.

## 7. Exact Failure Reproduction

The clean browser lifecycle was reproduced through signup, organization creation, cold-start ticket, agent response, customer follow-up, resolution evidence, resolved Reflection, human lesson authoring, promotion, retrieval, and reuse. The pre-repair UI showed the generated customer-specific response in the new lesson response field. The repaired run completed the same flow successfully.

## 8. Exact Rejected Value

The browser negative control used the exact literal `Arif Rahman` in the reusable customer-response template. Source field: extracted sender/customer identity from the TicketRecord message. Promotion field: yes. Visible in Reflection: yes. Persisted source/evidence context: yes. Introduced by generated content: the default reviewed draft path. The value was correctly rejected when placed in reusable content and is not rejected merely because it exists in source evidence.

## 9. First Attempt vs Retry State Diff

The historical first generic persistence failure and retry-specific customer-name failure were distinct surfaces of the same unsafe boundary: one surfaced after the transaction path, while the retry exposed validation. The repaired UI prevents generated customer-specific content from entering a new reusable lesson by default; the server revalidates the normalized payload on every attempt, so a corrected retry succeeds without trusting stale UI state.

## 10. Root Cause Classification

Primary: `GENERATED_CONTENT_CONTAMINATION`.

Contributing classifications: `UI_STATE_DEFECT`, `WRONG_VALIDATION_SCOPE`, and `PROMOTION_PAYLOAD_DEFECT`. A new lesson inherited `reviewedResponse`, which is intentionally customer-specific. The old safety context also lacked extracted sender/company and affected-person controls and did not include the reusable problem title.

## 11. Validator Correctness Analysis

The original generic safety rules and literal configured-name checks were correct but incomplete for the actual product boundary. The repaired validator rejects literal customer, affected-person, company, ticket, and title identities in reusable fields; accepts generic lessons and supported placeholders; and does not scan source TicketRecord text or provenance as if they were reusable content.

## 12. Source vs Promotion Field Matrix

| Field | May contain source identity | Reusable content | Safety scan |
|---|---:|---:|---:|
| Customer message / TicketRecord | Yes | No | No |
| Resolution evidence and source message ID | Yes | No | No |
| Ticket ID / audit metadata | Yes | No | No |
| Reflection problem name | No | Yes | Yes |
| Reflection root cause / solution / signals | No | Yes | Yes |
| Reflection response template | No, except supported placeholders | Yes | Yes |
| KnowledgeItem reusable content | No | Yes | Yes |
| Provenance / source-ticket references | Yes | No | No |

## 13. Authoritative Promotion Contract

The normalized reusable promotion object is authoritative. Source evidence can retain customer-specific facts for audit and resolution proof. Reusable knowledge must be generalized, with literal source identities rejected before candidate persistence.

## 14. Placeholder Contract

The supported placeholders are `{{customerName}}`, `{{organizationName}}`, and `{{ticketId}}`. They are rendered only at customer-response time. They are not literal identities and remain allowed. No arbitrary placeholder exemption was added.

## 15. Promotion Payload Authority

The authoritative reusable fields are the normalized `problemName`, lesson `rootCause`, `solution`, `customerResponse`, and `signals`. `reviewedResponse`, source conversation, evidence, and provenance are not substitutes for the reusable template. The server revalidates the submitted normalized lesson.

## 16. Transaction Boundary

Unsafe rejection occurs before persistence. The server transaction keeps candidate lifecycle, ValidationRecord, MemoryChangeRecord, trust evidence, KnowledgeItem writes, and metrics atomic. Negative probe confirmed zero commit calls on rejection; successful duplicate promotion replayed idempotently.

## 17. Repair Design

The minimal repair was to remove the customer-specific generated response default from new lesson state, add a reusable-field safety context builder, include extracted sender/company identities and reusable problem name in safety checks, and preserve the existing transaction/idempotency model.

## 18. Production Changes

- `components/ReflectionPanel.tsx`: new lesson response template starts empty and must be authored explicitly.
- `lib/reflectionSafety.ts`: added reusable problem/title and conservative source-identity context; reusable field scan is explicit.
- `app/page.tsx`, `lib/application/learning/reflectionCommands.ts`, and `lib/application/jobs/registry.ts`: use the shared context builder.
- `scripts/nc-fix-011-human-reflection-promotion-safety-reconciliation-probe.cjs`: permanent regression.
- `package.json`: `probe:nc-fix-011-reflection-promotion-safety` alias.
- `docs/CHANGELOG.md`: mandatory Unreleased post-v0.1.1 entry.

## 19. Safe Generic Promotion

PASS. Generic root cause, solution, signals, and a `{{ticketId}}` template promoted in the permanent probe and fresh browser flow.

## 20. Literal Customer Name Negative Control

PASS. Literal `Rina Prasetyo`/`Arif Rahman` in reusable fields is rejected with an editable safe message.

## 21. Literal Employee Name Negative Control

PASS. Literal affected employee identity such as `Andi Wibowo` in reusable solution is rejected.

## 22. Source Company / Identifier Control

PASS. Literal company and source ticket identifier in reusable fields are rejected. The same values remain valid in source evidence and provenance.

## 23. Placeholder Positive Controls

PASS. `{{customerName}}`, `{{organizationName}}`, and `{{ticketId}}` are accepted and rendered at reuse time.

## 24. Source-Evidence Name Positive Control

PASS. Customer names, company names, affected employees, source message IDs, and source TicketRecords remain present in disposable audit/evidence context without poisoning generic promotion.

## 25. Generated-Draft Contamination Control

PASS. A new Reflection lesson no longer inherits the customer-specific reviewed AI response. The human must author the reusable response template.

## 26. Retry Consistency

PASS. Unsafe promotion remains retryable and editable; replacing the literal identity with a supported placeholder succeeds using the latest safe Reflection values.

## 27. Duplicate Promotion Idempotency

PASS. Permanent probe replayed a successful promotion with `replayed: true` and one persistence commit.

## 28. Provenance Integrity

PASS. Canonical source ticket IDs remain on candidates and knowledge provenance; lesson source IDs remain opaque evidence fingerprints where required.

## 29. Resolution-Evidence Integrity

PASS. Browser and NC-FIX-003/008 probes retained customer-confirmation evidence and prevented validation before durable evidence.

## 30. Human Validation Integrity

PASS. Human approval remained required. Server-side actor attribution was used; client-claimed actor data could not win.

## 31. Authorization / Tenant Isolation

PASS. Permanent probe rejected mismatched organization profile and invalid authority. NC-FIX-006 and security probes preserved cross-tenant isolation.

## 32. Grounding Integrity

PASS. Cold-start UI remained truthful before promotion. After promotion, the second case showed grounded Organizational Memory and lesson evidence.

## 33. Similar-Case Retrieval

PASS. Fresh browser second case `NF-20260812-0002` retrieved `canonical-permissions-access-issue` and the validated location-permission lesson.

## 34. Grounded Response

PASS. Reused response was rendered from the generalized template with `NF-20260812-0002`; it did not contain the first customer identity.

## 35. Human Reuse

PASS. Human reuse approval completed in the browser; trust moved from 20 to 25 and `timesReused` moved from 0 to 1.

## 36. Cross-Customer Data Leak Control

PASS. No literal first-customer identity appeared in the second customer-facing response or persisted reusable template.

## 37. Cross-Domain / Negation Controls

PASS. NC-FIX-007 passed 18/18. TODO-080 intent isolation passed. No compatibility or negation regression was observed.

## 38. Optimistic-Concurrency Integrity

PASS. NC-FIX-010 passed; no automatic retry or stale Reflection overwrite was introduced.

## 39. Permanent Regression

PASS. Permanent probe: `probe:nc-fix-011-reflection-promotion-safety`.

Coverage includes safe promotion, customer/employee/company/ticket negatives, placeholders, provenance, atomic rejection, corrected retry, idempotency, tenant mismatch, and authority rejection.

## 40. Fresh Browser Full Loop

PASS. Fresh disposable organization completed cold start → conversation → evidence → resolve → Reflection → human lesson → KnowledgeItem → similar retrieval → grounded response → human reuse. IDs: organization `org-bbcd9338-bc04-4c73-a0b5-faee4e7796c0`, first ticket `NF-20260812-0001`, second ticket `NF-20260812-0002`. Exact disposable data was deleted after inspection.

## 41. Fresh Browser Unsafe Promotion

PASS. Fresh ticket `NF-20260812-0003` rejected a response containing `Arif Rahman`, stayed editable, and succeeded after correction to `{{ticketId}}`.

## 42. Browser Console

PASS. Final browser acceptance had no console errors or warnings. The expected validation rejection was handled in the UI.

## 43. NC-FIX Regression Results

- NC-FIX-001: PASS
- NC-FIX-002: PASS
- NC-FIX-003: PASS
- NC-FIX-004: PASS
- NC-FIX-006: PASS
- NC-FIX-007: 18/18 PASS
- NC-FIX-008: PASS
- NC-FIX-009: PASS
- NC-FIX-010: PASS
- NC-FIX-011: PASS

## 44. Benchmark / Security

OIP Benchmark v1: `1000/1000`, 100% overall, 100% critical security. RSS-1.2S1, S2, S4, and S5 passed. The unrelated RSS-1.2S3 legacy harness remains stale because it expects approval before the current evidence gate and receives the expected HTTP 409.

## 45. Data Integrity

Protected mature-state digests were unchanged by the NC-FIX-011 disposable runs. Exact disposable organizations and users were deleted. No intentional database mutation outside disposable test data was retained.

## 46. Historical Certification Preservation

`docs/REL-CERT-001-POST-V0.1.1-RELEASE-CERTIFICATION-REPORT.md`: PRESERVED. `docs/REL-CERT-001-CANDIDATE-MANIFEST.md`: PRESERVED. The failed candidate fingerprint `521968264109cb392e466222d7b726112131a708456df41c58bd0bfcdcfd0266` remains historical and is not the current candidate after source changes.

## 47. CHANGELOG.md Update

PASS. `docs/CHANGELOG.md` now records NC-FIX-011 under the existing post-v0.1.1 Unreleased NusaCloud development section.

## 48. Changelog Consistency

PASS. The entry describes the repaired human-authored promotion boundary, preserved safety, placeholders, provenance, browser verification, and permanent regression. It does not claim a commit, tag, v0.1.2, release, or certification.

## 49. New Findings

- `TEST_HARNESS_DEFECT`: RSS-1.2S3 legacy approve-before-evidence expectation.
- `KNOWN_LIMITATION`: provider fallback/rate-limit warnings remain outside this fix.
- No new product safety, tenant, provenance, retrieval, grounding, or concurrency blocker.

## 50. Release-Certification Impact

- Safe generalized Reflection promotable: YES.
- Literal customer-specific reusable content blocked: YES.
- Specific source evidence/provenance allowed: YES.
- Supported placeholders accepted: YES.
- Unsafe promotion atomic: YES.
- Corrected retry latest-state safe: YES.
- Canonical provenance preserved: YES.
- Similar-case retrieval and human reuse: YES.
- Cross-customer leakage absent: YES.
- NC-FIX-003/006/007/008/009/010 remain passing: YES.
- Changelog reconciled: YES.
- NC-FIX-011 blocker remains: NO.
- Ready for a full REL-CERT-001 rerun: YES.

## 51. Repository Changes

Production files changed: `components/ReflectionPanel.tsx`, `lib/reflectionSafety.ts`, `app/page.tsx`, `lib/application/learning/reflectionCommands.ts`, `lib/application/jobs/registry.ts`.

Probe/test files changed: `scripts/nc-fix-011-human-reflection-promotion-safety-reconciliation-probe.cjs`, `package.json`.

Documentation changed: `docs/CHANGELOG.md`, this report.

All other pre-existing dirty-worktree files were preserved.

## 52. Recommendation

Run a complete REL-CERT-001 rerun from the beginning against a newly fingerprinted candidate. Do not rewrite the preserved failed certification artifacts. Reconcile RSS-1.2S3 separately if its legacy harness is still required.

## 53. Final Verdict

`NC_FIX_011_VERIFIED_WITH_FOLLOWUPS`

Final output: the customer-specific safety boundary is more precise, safe human-authored learning now promotes and reuses end to end, unsafe reusable content remains blocked atomically, and the only remaining finding is unrelated legacy harness drift.
