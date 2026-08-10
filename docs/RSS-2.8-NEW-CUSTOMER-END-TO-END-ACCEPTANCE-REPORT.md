# RSS-2.8 — New Customer End-to-End Acceptance Report

Run date: 2026-08-10 (Asia/Jakarta)
Runtime: production Next.js on `http://localhost:3510`, real PostgreSQL, in-app browser.
Baseline: `master` HEAD `4792e10ee2ef075b0d7e10287fb4ceff583b3941`; certified tag dereference `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba` (unchanged).

## 1. Executive Summary

The disposable customer journey passed through real signup, zero-org onboarding, Owner provisioning, clean workspace, durable ticket use, multi-organization API lifecycle, isolation, logout/login, and production restart. Two confirmed blockers were fixed and re-verified. Browser operational gaps remain unexecuted, so this release gate is partial.

## 2. Final Verdict

`NEW_CUSTOMER_E2E_ACCEPTANCE_PARTIAL`.

## 3. Background

RSS-2.8 closes the operational gaps left by RSS-2.0 through RSS-2.7 without modifying `v0.1.0-certified` or starting RSS-2.9.

## 4. Documentation Reviewed

Reviewed the complete RSS-2.0, RSS-2.1, RSS-2.2, RSS-2.3, RSS-2.4, RSS-2.5, RSS-2.6, and RSS-2.7 reports, plus security/configuration guidance and the RSS-2.8 brief.

## 5. Baseline

Node `v24.14.1`; npm `11.11.0`; Next `15.5.22`; Prisma `7.9.1`; 23 migrations; schema status up to date. Existing RSS-2 dirty work was preserved.

## 6. Production Runtime

`npm run build` passed, a fresh `next start -p 3510` served the acceptance run, and PostgreSQL-backed HTTP routes returned authoritative state.

## 7. Disposable Customer

The probe generated a unique customer, two customer accounts, five disposable organizations, one durable ticket, and removed only those fixtures during cleanup.

## 8. Signup

PASS — real browser signup succeeded; the permanent probe also received HTTP 201 and an HttpOnly session.

## 9. Zero-Organization State

PASS — new account returned zero organizations and `activeOrganizationId: null`; demo knowledge returned 403.

## 10. First Organization Creation

PASS — customer-facing creation returned a server-generated `org-*` organization and persisted it transactionally.

## 11. First Workspace Cleanliness

PASS — knowledge, candidates, validations, memory changes, metrics, logs, patterns, and tickets were empty for the new tenant before customer activity.

## 12. Owner Verification

PASS — creator authorization returned role `owner`; browser header displayed Owner.

## 13. Customer Data Operation

PASS — the real browser created and processed a customer ticket through human review and governed reflection. PostgreSQL showed a resolved ticket, commit audit, validation, and knowledge evidence.

| Journey Step | Expected | Actual | Result |
|---|---|---|---|
| Signup → first organization → customer action | Durable tenant-scoped state | Ticket and knowledge persisted in the disposable tenant | PASS |

## 14. Refresh

PASS — browser reload restored the authenticated workspace and server-backed organization identity.

## 15. Hard Refresh

NOT_EXECUTED — a cache-busting hard-refresh rehearsal was not run in this acceptance pass.

## 16. Additional Organization Creation

PASS (probe/API) — four additional organizations were created through the public route; browser rehearsal not executed.

## 17. Customer-to-Customer Organization Isolation

PASS — a second customer received 403 for the first customer’s ticket route; no membership was provisioned.

## 18. Organization Switching

PASS (probe/API) — authorized switches updated the server active organization and remained within membership authority.

## 19. Rapid Switching

PASS (probe/API) — rapid authorized switch requests completed without unauthorized active context.

## 20. Five-Organization Verification

PASS (probe/API) — exactly five organizations remained selectable.

## 21. Duplicate Display Names

PASS — duplicate names produced distinct organization IDs.

## 22. Logout / Login

PASS — browser session was retained through production restart reload; probe logout/login restored all five memberships.

## 23. Invalid Active Organization

PASS — unknown target returned 404 and did not corrupt the active authorized context.

## 24. Demo Organization Isolation

PASS — zero-org and second-customer reads of demo/customer resources were denied; no demo fallback occurred.

## 25. Second Customer Isolation

PASS — second disposable account had no access to the first account’s ticket data.

## 26. Two-Tab Concurrency

NOT_EXECUTED — a dedicated real-browser two-tab stale-write rehearsal was not completed. RSS-2.6 API evidence remains supporting coverage.

## 27. Revision Conflict UX

PASS (API/source) — RSS-2.6 structured `REVISION_CONFLICT` and Reload-latest contract remained present; browser conflict rehearsal was not executed here.

## 28. Reload / Retry

PASS (source/API) — controlled Reload latest recovery remains wired; no blind stale retry was observed.

## 29. Production Server Restart

PASS — server was stopped, rebuilt, restarted as a fresh production process, and the browser reloaded successfully.

## 30. Post-Restart Verification

PASS — authenticated customer workspace and server-backed data were restored after restart.

## 31. Responsive Browser Verification

NOT_EXECUTED — desktop/narrow viewport checks were not completed in this run.

## 32. Keyboard / Accessibility Basics

PARTIAL — RSS-2.7 recorded Escape/menu keyboard evidence; a complete RSS-2.8 keyboard/accessibility rehearsal was not run.

## 33. Browser Console

PARTIAL — the stale pre-fix bundle produced the confirmed commit warning; the fresh post-fix browser flow produced no new persistence warning. A clean full-console export was not captured.

## 34. Network Review

PARTIAL — public HTTP routes and status codes were reviewed through the probe; a complete browser network archive was not captured.

## 35. Tier-1 AI Sanity

PASS — the browser production flow displayed a DeepSeek-generated draft and completed human review; provider-specific security probes remain supporting evidence.

## 36. Failure Injection

PASS (supporting) — invalid organization targets, forbidden authority fields, and cross-customer reads were rejected without partial provisioning.

## 37. Automated Acceptance Probe

PASS — `npm run probe:rss-2.8-new-customer-e2e` passed against the fresh production server and cleaned its disposable fixtures.

## 38. Browser Acceptance Matrix

| Browser Scenario | Result | Evidence |
|---|---|---|
| Signup | PASS | Real browser |
| Zero-org onboarding | PASS | Real browser |
| Create first organization | PASS | Real browser |
| Clean workspace | PASS | Real browser + read-only API |
| Active org identity | PASS | Real browser |
| Create second org | NOT_EXECUTED | Probe/API only |
| Switch A→B | NOT_EXECUTED | Probe/API only |
| B→A | NOT_EXECUTED | Probe/API only |
| Rapid switching | NOT_EXECUTED | Probe/API only |
| Five-org switcher | NOT_EXECUTED | Probe/API only |
| Normal refresh | PASS | Real browser reload |
| Hard refresh | NOT_EXECUTED | No dedicated rehearsal |
| Logout | PASS (probe) | Public HTTP route |
| Login again | PASS (probe) | Public HTTP route |
| Two-tab stale write | NOT_EXECUTED | RSS-2.6 API only |
| Conflict UI | NOT_EXECUTED | No dedicated browser rehearsal |
| Reload latest | NOT_EXECUTED | Source/API only |
| Post-restart login | PASS (session reload) | Production restart + browser reload |
| Post-restart switching | NOT_EXECUTED | No browser switch rehearsal |
| Desktop viewport | NOT_EXECUTED | Not captured |
| Narrow viewport | NOT_EXECUTED | Not captured |
| Keyboard basics | PARTIAL | RSS-2.7 Escape evidence |
| Browser console (CLEAN/ISSUES/NOT_EXECUTED) | ISSUES → clean post-fix flow; full export NOT_EXECUTED | Confirmed stale-bundle warning, then fresh flow |

## 39. RSS-2 Regression Results

RSS-2.1 through RSS-2.7 source contracts and permanent probes remained available; the RSS-2.8 probe passed the shared lifecycle assumptions.

| Regression | Result |
|---|---|
| RSS-2.1–2.7 contracts | PASS (supporting probes/source) |

## 40. Security Regression Results

Demo isolation, customer isolation, server-owned ticket authority, and membership-based authorization passed. RSS-1.2S1, S2, S3, and S5 passed. RSS-1.2S4 could not start because its isolated temporary server lacked a copied `.next` build; TODO-078 stopped at a fixture-login 500. These are probe-harness failures, not observed RSS-2.8 tenant regressions, and require follow-up before a stronger security verdict.

| Security Boundary | Expected | Actual | Result |
|---|---|---|---|
| Demo tenant | No customer fallback/read | 403 without membership | PASS |
| Customer tenant | Membership is authority | Second customer denied | PASS |
| Ticket authority | Client cannot set status | 400 authority rejection | PASS |

## 41. Quality Results

TypeScript and production build passed after the fixes. No commit, tag, push, or certified-tag mutation was performed.

## 42. Data Integrity

Read-only mature-organization digest was identical before and after the probe. Disposable customer rows were excluded from the mature set.

## 43. Disposable Cleanup

PASS — probe cleanup deleted only users identified by the generated emails, their memberships/organizations, and sessions. No mature/demo organization was deleted.

## 44. Failures / Classification

Two confirmed blockers were fixed: (1) the UI attempted a governed commit after terminal approval; (2) source ticket lookup was not tenant-scoped when human ticket numbers repeated. Both fixes compiled and the fresh browser/probe re-verification passed. Remaining failures are unexecuted operational scenarios, not observed product regressions.

## 45. Remaining Limitations

Hard refresh, dedicated two-tab conflict UX, responsive viewports, full keyboard/accessibility, and complete browser network/console archives remain operational follow-ups. These are retained as limitations rather than marked PASS from API evidence.

## 46. Recommendation

Do not begin RSS-2.9 yet if a full critical browser gate is mandatory. If the release contract accepts the documented operational follow-ups, RSS-2.8 is eligible for a controlled partial acceptance with a follow-up browser rehearsal.

## 47. Final Verdict

`RSS-2.8: NEW_CUSTOMER_E2E_ACCEPTANCE_PARTIAL`
`Probe: PASS`
`Production build/server: PASS`
`Browser release-critical completeness: PARTIAL`
`Recommended next task: complete the remaining RSS-2.8 browser matrix; do not start RSS-2.9 automatically.`
