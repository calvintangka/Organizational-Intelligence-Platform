# RSS-2.8-FINAL-KNOWLEDGEITEM-TWO-TAB-CLOSURE

Run date: 2026-08-10 (Asia/Jakarta)
Branch: `master`
HEAD: `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
Certified tag dereference: `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba` (unchanged).
Runtime: fresh Next production build, controlled server on port 3529, real PostgreSQL, real in-app browser.

## 1. Executive Summary

The exact KnowledgeItem browser concurrency gap is closed. A gated acceptance surface exercised the existing authenticated Knowledge GET/PUT routes with two real browser tabs and a disposable customer organization. Both tabs loaded the same item at revision 2; Tab A committed revision 3; Tab B submitted its unchanged revision-2 snapshot and received HTTP 409 with `REVISION_CONFLICT` for `resourceType=knowledge`; Reload latest loaded Tab A's data; Tab B intentionally edited and committed revision 4. No silent overwrite occurred, and protected mature data remained unchanged.

## 2. Final Verdict

`KNOWLEDGEITEM_TWO_TAB_CLOSURE_VERIFIED`.

## 3. Relationship to RSS-2.6

RSS-2.6 established the server optimistic-concurrency contract and permanent probe. This closure supplies the missing customer-facing browser evidence without changing that contract. The RSS-2.6 permanent concurrency probe passed after the browser run.

## 4. Relationship to RSS-2.8 / RSS-2.8-FINAL

The prior partial reports remain historical evidence and were not rewritten. The exact KnowledgeItem blocker identified by RSS-2.8-FINAL is now verified, so the parent acceptance state is upgraded to `RSS_2_8_FINAL_VERIFIED` / `NEW_CUSTOMER_E2E_ACCEPTANCE_VERIFIED`.

## 5. Baseline

Node `v24.14.1`; npm `11.11.0`; Next `15.5.22`; Prisma `7.9.1`; 23 migrations up to date. Existing RSS-2 worktree changes were preserved. The certified tag still dereferences to the historical certified commit and was not modified, moved, recreated, or deleted. Protected mature-state digest before and after: `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`.

## 6. KnowledgeItem Edit Surface Audit

Classification: `D — NO BROWSER EDIT SURFACE EXISTS` in the normal customer Knowledge/history view. The existing real write chain is `KnowledgeRevisionHarness → authenticated organization Knowledge GET/PUT → ServerPersistenceAdapter-compatible route contract → persistenceService.saveKnowledge → upsertKnowledgeItemTx → PostgreSQL`. The normal Knowledge view exposed details/history but no direct editor.

## 7. Selected Browser Acceptance Path

The smallest valid path was a test-only browser harness using the real authenticated organization resource routes. It sends the same full KnowledgeItem snapshot and current `revision`/`expectedRevision` semantics as the existing client persistence path, while exposing only a disposable-organization selector. No direct persistence-service call, Prisma code, revision bypass, or last-write-wins behavior was introduced.

## 8. Test Surface / Environment Guarding

Added `/acceptance/knowledge-revision`, gated by `OIP_ENABLE_KNOWLEDGE_CONCURRENCY_HARNESS=1`. The route is not linked from normal customer navigation and returns not-found unless explicitly enabled by the controlled operator. The production build includes the route, but normal production behavior remains unchanged and all reads/writes still require real authentication, membership, capability authorization, and the production API.

## 9. Disposable Customer / Tenant

PASS — real signup created `rss-2-8-ki-closure-1786323905851@example.test`. The customer created `RSS-2.8-FINAL KnowledgeItem Closure 1786323905851` through the supported onboarding UI and received Owner membership. A second disposable organization was also created through the supported Organization UI for the post-conflict switch check. Neither mature/demo tenant was used for mutation.

## 10. Disposable KnowledgeItem

PASS — a KnowledgeItem was created through the supported ticket → human approval → reflection → validation/commit workflow. No PostgreSQL row was inserted manually. The item was removed during cleanup.

KnowledgeItem ID: `canonical-disposable-report-export-timeout-rk-20260810-0001`
Organization ID: `org-564f6ee0-f1ad-4cd6-a83c-75b3d96f34bd`

## 11. Two-Tab Setup

PASS — Tab A and Tab B were separate real browser tabs, authenticated as the same customer, and loaded `/acceptance/knowledge-revision` for the same authorized organization and item.

## 12. Revision N Confirmation

PASS — both visible harness diagnostics showed the same KnowledgeItem ID and `Loaded revision 2` before either save.

| Revision Stage | Revision |
|---|---:|
| Initial server revision N | 2 |
| Tab A loaded revision | 2 |
| Tab B loaded revision | 2 |

## 13. Tab A Save

PASS — Tab A changed the title to a disposable A-save value and clicked the browser `Save KnowledgeItem` control. The targeted request evidence showed `PUT .../knowledge → HTTP 200`.

## 14. Revision N+1 Confirmation

PASS — Tab A's post-save authoritative GET showed the A-save title and `Loaded revision 3`.

## 15. Tab B Stale Save

PASS — without refreshing Tab B, a different title was entered and submitted from its still-loaded revision-2 snapshot. The request was rejected rather than silently overwriting Tab A.

## 16. HTTP 409 Evidence

PASS — the real browser harness displayed `PUT /api/organizations/<disposable-org>/knowledge → HTTP 409`.

## 17. REVISION_CONFLICT Evidence

PASS — the browser-visible targeted evidence and safe diagnostic details showed:

```json
{
  "code": "REVISION_CONFLICT",
  "resourceType": "knowledge",
  "resourceId": "canonical-disposable-report-export-timeout-rk-20260810-0001",
  "expectedRevision": 2,
  "currentRevision": 3
}
```

## 18. Customer Conflict UX

PASS — Tab B displayed the controlled customer message: “This item was updated elsewhere. Reload the latest version before saving again.” SQL, Prisma, stack traces, and raw persistence errors were not shown as the primary user message. Safe diagnostics were available only under an explicit details disclosure.

## 19. Newer Data Preservation

PASS — immediately after the rejected stale request, Tab A still displayed the A-save title at revision 3. Tab B's stale title was not persisted, and the rejected write did not increment the revision.

## 20. Reload Latest

PASS — Tab B clicked the actual `Reload latest` action. The page issued an authoritative Knowledge GET and cleared the conflict state.

## 21. Post-Reload State

PASS — Tab B loaded Tab A's A-save title and revision 3. Its stale revision 2 was gone.

## 22. Re-Save

PASS — Tab B intentionally changed the reloaded title and saved through the same browser control. The request evidence showed `PUT .../knowledge → HTTP 200` followed by an authoritative GET.

## 23. Revision N+2 Confirmation

PASS — Tab B displayed the intentional recovered title at revision 4. The observed sequence was exactly `2 → 3 → 409 (still 3) → 4`.

| Revision Stage | Revision |
|---|---:|
| Initial N | 2 |
| Tab A success | 3 |
| Tab B stale rejection | 3 |
| Tab B post-reload success | 4 |

## 24. Unsaved Local Work Behavior

`PRESERVED` until explicit recovery: Tab B's stale title remained in the editor after the 409. The user then deliberately chose `Reload latest`, which replaced that stale draft with authoritative data. This is documented behavior and does not weaken server data safety.

## 25. Session / Organization Safety

PASS — the session remained authenticated after the conflict; the organization selector, item, save control, and authoritative reads remained available. No logout, authorization corruption, or cross-tenant data appeared.

## 26. Organization Switching After Conflict

PASS — after the conflict and successful revision-4 save, Tab B switched to the second authorized disposable organization, observed an empty KnowledgeItem list, then switched back to the original organization and observed the revision-4 item. No stale snapshot replay or tenant mix occurred.

## 27. Refresh After Conflict

PASS — Tab B received a genuine Ctrl+R refresh after revision 4. The authoritative revision-4 title loaded and no automatic stale write or repeated 409 loop occurred.

## 28. Console Evidence

CLEAN — both browser acceptance tabs returned zero warning/error entries during and after the save, conflict, Reload latest, re-save, switch, and refresh flow.

## 29. Targeted Network Evidence

PASS — the acceptance surface recorded request/status evidence without cookies or tokens:

| Browser Request | Status | Result |
|---|---:|---|
| Tab A Knowledge PUT | 200 | Revision advanced 2 → 3 |
| Tab A authoritative Knowledge GET | 200 | A-save title, revision 3 |
| Tab B stale Knowledge PUT | 409 | `REVISION_CONFLICT`, `resourceType=knowledge`, expected 2/current 3 |
| Tab B Reload latest Knowledge GET | 200 | A-save title, revision 3 |
| Tab B intentional Knowledge PUT | 200 | Revision advanced 3 → 4 |
| Tab B post-save Knowledge GET | 200 | Recovered title, revision 4 |

Full HAR export remained unavailable, but the required targeted statuses were captured; HAR is non-blocking tooling evidence.

## 30. Authorization Negative Control

REJECTED — the focused RSS-2.6 safe concurrency probe used a second non-member disposable caller and confirmed unauthorized Knowledge writes are rejected with HTTP 403 before revision comparison. The same organization/membership boundary protects the Knowledge GET/PUT routes; no revision-conflict metadata is exposed to unauthorized callers.

## 31. RSS-2.6 Regression

PASS — `npm run probe:rss-2.6-concurrency` passed against the controlled runtime.

## 32. RSS-2.1 Regression

PASS — `npm run probe:rss-2.1-switch-context` passed against the controlled runtime.

## 33. RSS-2.8 Probe

PASS — `npm run probe:rss-2.8-new-customer-e2e` passed with its disposable fixtures and cleanup.

## 34. Security Regression

PASS — TODO-078 RBAC, RSS-1.2S1 AI-proxy authorization, and RSS-1.2S3 server-owned ticket writes passed. RSS-1.2S3 rejected all forged authority fields with HTTP 400 and `AUTHORITY_FIELD_REJECTED`, preserved cross-tenant rejection, and restored global/mature counts and digest.

## 35. Quality Gates

PASS — `npx tsc --noEmit`, `npx prisma validate`, `npx prisma migrate status`, fresh `npm run build`, `git diff --check`, and OIP Benchmark v1 (1000/1000, 100% critical security) passed.

## 36. Protected Data Integrity

PASS — Developer Demo integrity remained `PASS_WITH_FINDINGS` with zero release-blocking findings. The protected digest before and after was identical: `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`. OrgMetrics dry-run authoritative differences were zero.

## 37. Cleanup

PASS — after browser finalization, the closure customer, both positively identified disposable organizations, sessions, related rows, and the disposable KnowledgeItem were removed. Read-only verification returned user count 0, no `RSS-2.8-FINAL KnowledgeItem Closure%` organizations, and KnowledgeItem count 0. Port 3529 and temporary server logs were removed/stopped.

## 38. HAR Classification

`G — EXPECTED / TOOLING LIMITATION`, non-blocking. Targeted request/status evidence was available and sufficient; a full HAR archive is not required for this closure.

## 39. Remaining Limitations

The exact KnowledgeItem two-tab browser rehearsal is closed. Remaining unrelated limitations are unchanged: no real-time cross-tab synchronization, no automatic semantic merge, stale local drafts may be replaced by explicit Reload latest, invitation/member-management gaps, ownership transfer UX, organization deletion/leave, billing/plan limits, Enter-key menu polish, full accessibility certification, and full HAR export availability.

## 40. RSS-2.8 Closure Decision

VERIFIED — all release-critical KnowledgeItem browser criteria passed: genuine two-tab same revision, Tab A 200/N+1, Tab B 409/`REVISION_CONFLICT`, preserved newer data, customer conflict UX, Reload latest, intentional N+2 re-save, session/tenant safety, clean console, targeted network evidence, regression gates, mature integrity, and cleanup.

## 41. RSS-2.9 Eligibility

Eligible for RSS-2.9: `YES`. RSS-2.9 was not started automatically.

## 42. Recommendation

Proceed to RSS-2.9 only as a separately authorized task. Retain the gated acceptance surface and manual evidence as the permanent browser closure record; do not commit, tag, or push automatically.

## 43. Final Verdict

```text
RSS-2.8-FINAL-KNOWLEDGEITEM-TWO-TAB-CLOSURE:
KNOWLEDGEITEM_TWO_TAB_CLOSURE_VERIFIED

Real browser used:
YES

KnowledgeItem edit surface:
TEST_ONLY

Production behavior modified:
NO

Disposable organization:
PASS

Disposable KnowledgeItem:
PASS

KnowledgeItem ID:
canonical-disposable-report-export-timeout-rk-20260810-0001

Initial revision:
2

Tab A loaded revision:
2

Tab B loaded revision:
2

Tab A save:
PASS

Revision after Tab A:
3

Tab B stale browser save:
409

Conflict code:
REVISION_CONFLICT

Resource type:
knowledge

Expected revision:
2

Current revision:
3

Newer data preserved:
PASS

Revision incremented by rejected write:
NO

Customer conflict UX:
PASS

Reload latest:
PASS

Revision after reload:
3

Re-save after reload:
PASS

Final revision:
4

Unsaved stale local work:
PRESERVED

Session preserved:
PASS

Tenant context preserved:
PASS

Switch after conflict:
PASS

Refresh after conflict:
PASS

Console:
CLEAN

Targeted network evidence:
PASS

Full HAR:
UNAVAILABLE

HAR release blocker:
NO

Unauthorized KnowledgeItem access:
REJECTED

RSS-2.6:
PASS

RSS-2.1:
PASS

RSS-2.8 permanent probe:
PASS

Security regression:
PASS

TypeScript:
PASS

Prisma validation:
PASS

Migration status:
PASS

Production build:
PASS

OIP Benchmark:
1000/1000

Protected mature data changed:
NO

Disposable cleanup:
PASS

RSS-2.8-FINAL closure:
RSS_2_8_FINAL_VERIFIED

RSS-2.8 closure:
NEW_CUSTOMER_E2E_ACCEPTANCE_VERIFIED

Eligible for RSS-2.9:
YES

Report:
docs/RSS-2.8-FINAL-KNOWLEDGEITEM-TWO-TAB-CLOSURE-REPORT.md

CHANGELOG updated:
YES

Known limitations updated:
YES

Remaining release blockers:
NONE

Recommended next task:
RSS-2.9

Do not start RSS-2.9 automatically.
Do not commit automatically.
Do not tag automatically.
Do not push automatically.
```
