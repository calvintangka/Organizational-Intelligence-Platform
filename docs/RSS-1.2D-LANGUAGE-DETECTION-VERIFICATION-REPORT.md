# RSS-1.2D — Language Detection Verification Report

**Date:** 2026-08-07  
**Parent:** RSS-1 Release Stabilization Sprint  
**Prerequisite:** RSS-1.2C Retrieval Calibration  
**Final verdict:** `COMPLETED_WITH_LIMITATIONS`

## 1. Executive Summary

The deterministic multilingual runtime was verified on the current workspace for all ten supported languages: English, Indonesian, Spanish, French, German, Portuguese, Italian, Japanese, Chinese, and Korean. The new read-only `scripts/rss-1.2d-language-detection-probe.cjs` passed its detection, policy, diagnostic, hostile-input, mixed-language, quoted-history, and 1,000-replay checks. Existing production-path probes also passed for language-neutral retrieval (`TODO-058B`) and persisted cross-language learning (`TODO-058E`).

The release gates that were executed passed: TypeScript, Prisma schema validation, production build, TODO-080, TODO-082A, TODO-082C, expanded calibration (200/200), and the OIP benchmark (1000/1000).

The status is intentionally not `LANGUAGE_RUNTIME_VERIFIED`: browser-refresh/restart, server-restart, organization-switching, ticket-reopen, long-document/attachment, and 1,000-run full pipeline checks were not executed in this run. In addition, the legacy TODO-058 foundation probe has one stale client-implementation assertion after the current server-owned transition work moved reviewer-language persistence from `app/page.tsx` to `lib/server/tickets/ticketWorkflow.ts`.

## 2. Language Detection Audit

| Input Language | Detected | Confidence | Result |
|---|---:|---:|---|
| English | en | 0.912 | PASS |
| Indonesian | id | 1.000 | PASS |
| Spanish | es | 1.000 | PASS |
| French | fr | 0.884 | PASS |
| German | de | 1.000 | PASS |
| Portuguese | pt | 1.000 | PASS |
| Italian | it | 0.884 | PASS |
| Japanese | ja | 0.975 | PASS |
| Chinese | zh | 0.953 | PASS |
| Korean | ko | 0.985 | PASS |

The detector is offline and deterministic. Latin languages are identified lexically; Japanese, Chinese, and Korean use script detection. Each full login ticket exceeded the configured 0.60 response-language threshold without fallback.

Unicode text containing Japanese or Chinese plus emoji and an order identifier retained the correct script-language result. Emoji-only text, identifiers, URLs, email addresses, phone numbers, timestamps, OCR-like text, ASCII art, and binary-like strings did not reach the confidence threshold and therefore could not choose a customer-language reply.

## 3. Response Language Verification

The default policy (`customer_language`, 0.60 minimum confidence) selected the detected customer language for every confident single-language ticket. Policy decisions were replay-stable for mixed-language, code-switched, and quoted-history inputs. Low-confidence, unsupported, empty, and non-linguistic input correctly used the organization-language fallback rather than making a speculative reply-language choice.

The shared drafting prompt receives one explicit response-language instruction, including a no-mixing rule. Provider choice is not involved in detection or policy resolution.

## 4. Language-Neutral Retrieval

`scripts/todo058b-language-neutral-retrieval-probe.cjs` passed on the real deterministic retrieval path. Login, duplicate invoice, MFA/device, and delivery-delay tickets expressed in all ten supported languages reached one category and one canonical per family. Canonical/category identifiers were confirmed not to be language-scoped.

| Ticket | Canonical | Lesson | Response Language | Result |
|---|---|---|---|---|
| Login, 10 language variants | One Login canonical | Language-neutral matching path | Customer language by policy | PASS |
| Duplicate invoice, 10 variants | One duplicate-invoice canonical | Language-neutral matching path | Customer language by policy | PASS |
| MFA after device change, 10 variants | One MFA canonical | Language-neutral matching path | Customer language by policy | PASS |
| Delivery delay, 10 variants | One delivery canonical | Language-neutral matching path | Customer language by policy | PASS |

## 5. Mixed Language Verification

The RSS-1.2D probe replayed English–Indonesian and Spanish–English examples. The response decision was deterministic on every replay; if evidence was below the policy threshold, it used the configured organization-language fallback instead of randomly selecting either language. TODO-058B also passed a mixed-language duplicate-invoice retrieval case without allowing quoted/resolved history to alter the canonical.

## 6. Code Switching Verification

Code-switched sentences were replayed through detection and response-policy resolution. Outputs, including confidence and policy reason, were byte-stable across repeated runs. The intent-isolation regression probe (TODO-080) additionally passed its Indonesian–English activation case, confirming that the active issue does not collapse into an unrelated Login category.

## 7. Identifier Handling

Identifiers were tested as sole inputs and alongside Unicode prose. Ticket IDs, invoice/order numbers, URLs, email addresses, phone numbers, and timestamps did not create a confident language decision by themselves. TODO-058B separately verified that identifiers contribute no concept evidence and remain non-semantic during retrieval.

## 8. Quoted History Verification

The RSS-1.2D probe used current Indonesian with quoted English history and current English with quoted Indonesian history. Detection/policy output was deterministic in both cases. TODO-058B verified that mixed-language invoice retrieval does not leak quoted/resolved history into canonical selection. The exact current-message language had sufficient primary evidence in both detector fixtures.

## 9. Long Document Verification

Not executed as a separate multi-page-email, attachment, or meeting-notes matrix. The quoted-history and multiline ticket controls above cover a small multiline subset only. This is a release limitation, not a PASS.

## 10. Explainability

The runtime exposes detected language, confidence, detection method, response language, and a human-readable policy explanation. The application processing path records the same language metadata next to category, intent, canonical, retrieval, and lesson diagnostics. TODO-058B passed canonical/retrieval explainability controls; TODO-082C passed diagnostics controls without leaking provider credentials.

## 11. Persistence

`scripts/todo058e-persisted-multilingual-probe.cjs` used a disposable organization and the real validation transaction. It passed all of the following:

- equivalent English, Spanish, Japanese, Indonesian, and French tickets selected one persisted lesson and one canonical;
- validation rows, memory changes, and trust evidence all remained attached to one knowledge item;
- retry was idempotent;
- a forced transaction failure rolled back completely;
- fixture cleanup completed; and
- mature-organization snapshots were byte-identical before and after the probe.

Browser refresh/restart, server restart, organization switch, ticket reopen, search, history, and audit were not separately executed in this run.

## 12. Performance

The new local detector probe completed six grouped checks in 19.01 ms, with a 14.41 ms maximum group time. The persisted multilingual transaction probe reported a 29.5 ms average and 82 ms worst commit across four commits. These are local, non-load-test measurements; no regression threshold comparison was available in this run.

## 13. Regression Results

| Verification | Previous | Current |
|---|---:|---:|
| RSS-1.2C retrieval calibration coverage | Calibrated | PASS via TODO-058B and expanded calibration |
| RSS-1.2D detector/policy probe | Not present | PASS |
| TODO-058 multilingual foundation | PASS historically | FAIL: one stale client structural assertion |
| TODO-058B language-neutral retrieval | PASS | PASS |
| TODO-058E persisted multilingual learning | PASS | PASS |
| TODO-080 intent isolation | PASS | PASS |
| TODO-082A provider behavior | PASS | PASS |
| TODO-082C diagnostics | PASS | PASS |
| Expanded calibration | 200/200 | 200/200 |
| TypeScript | PASS | PASS |
| Prisma validation | PASS | PASS |
| Production build | PASS | PASS |
| OIP Benchmark | 1000/1000 | 1000/1000 |
| TODO-079 | Not separately runnable in this workspace | NOT EXECUTED |

The TODO-058 failure was classified as a **fixture regression**. Its assertion expects reviewer language metadata to be written inside the client handler. The current server-owned ticket-workflow change performs that authoritative write in `lib/server/tickets/ticketWorkflow.ts` as `method: "reviewer"` with `reviewerOverride: true`; therefore the old source-location assertion no longer reflects the active write boundary. No production code was changed for this verification.

## 14. Data Integrity

| Verification | Previous | Current |
|---|---|---|
| Developer Demo dataset | Must remain unchanged | No mutation performed by RSS-1.2D probe; persisted probe mature snapshots unchanged |
| Organizational Memory | No language fork | One knowledge item, lesson, canonical, and trust-evidence target across fixture languages |
| Trust and reflection | No corruption | Same reflection action; rollback and idempotent retry passed |
| Tickets | No duplicate knowledge | Disposable fixture removed; no mature-org change |
| Cross-language mutation | Must not occur | No language-scoped canonical, lesson, or knowledge IDs found |

## 15. Remaining Limitations

1. The legacy TODO-058 client-location assertion needs to be updated to inspect or exercise the server-owned `language` transition.
2. Long documents, attachments, OCR corpus variation, romanized-language corpus variation, browser/server restart, organization switching, ticket reopening, search/history/audit, and a 1,000-run full pipeline replay were not executed.
3. The detector supports the ten listed languages only. Unsupported or gibberish input safely falls back; it is not translated or identified as an arbitrary language.
4. The persisted probe emitted a Node `pg` deprecation warning about concurrent `client.query()` usage after successful completion. It did not change the pass result, but should be addressed separately before upgrading to pg 9.

## 16. Recommendation

Proceed to RSS-1.2E only after expanding the release probe with browser/server persistence and long-document fixtures, and after updating the TODO-058 reviewer-override assertion for the server-owned workflow. Retain the policy that a low-confidence result may not select a customer-language reply.

## 17. Release Status

**`COMPLETED_WITH_LIMITATIONS`**

The completed, executable multilingual core is deterministic, language-neutral for tested retrieval and persistence paths, and protected by the current build and benchmark gates. The unexecuted persistence/document scenarios and the stale TODO-058 fixture prevent a fully verified language-runtime release status. No Git tag or automatic commit was created.
