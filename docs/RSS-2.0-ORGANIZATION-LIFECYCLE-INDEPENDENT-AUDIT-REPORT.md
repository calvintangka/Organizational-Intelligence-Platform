# RSS-2.0 — Organization Lifecycle Independent Audit Report

**Audit date:** 2026-08-09
**Scope:** read-only repository and PostgreSQL investigation. No application, production, fixture, membership, revision, or seed data was changed.

## 1. Executive Summary

There is no three-organization product, database, or subscription limit. The configured development account has exactly three memberships because `scripts/seed-development-memberships.cjs` explicitly grants it Maesa Tech, FastDrop Logistics, and OIP Developer Demo.

The product does not implement a safe customer organization-creation lifecycle. A visible **Add organization** form creates a browser object only; its generated ID has no server organization or membership, so `selectOrganization` immediately receives a 404/403-style authorization failure. The persistence service has internal profile `upsert` primitives, but every exposed route is membership/capability-gated and therefore cannot be used to create a first organization.

The observed 409 is an expected optimistic-concurrency rejection, but it is invoked by a defective organization-switch workflow. The switch first changes server active organization, then saves the whole outgoing browser snapshot. That snapshot includes untouched KnowledgeItems. A stale item at revision 53 against the stored revision 54 therefore blocks navigation. The guard prevents a lost update; the switch workflow misuses it.

## 2. Final Verdict

**ORGANIZATION_LIFECYCLE_AUDITED**

The independent evidence is sufficient to begin the switching hotfix as a bounded task, followed by creation/onboarding and demo-isolation work. The precise writer that moved the target from revision 53 to 54 is not forensically attributable from current rows, because KnowledgeItem writes have no durable per-write actor/audit record.

## 3. Trigger / User-Observed Failure

The configured development account sees OIP Developer Demo, Maesa Tech, and FastDrop Logistics; it cannot create a usable new organization; and a switch can fail with `409 CONFLICT` for `demo-ki-sso-certificate-redirect-loop` (`stored revision 54`, `expected 53`). The observed call chain is confirmed in source: `selectOrganization` → `persistOrganizationState` → `session.saveKnowledge` → server `saveKnowledge` → revision-guarded update.

## 4. Documentation Reviewed

Reviewed: `RSS-1.2B-FINAL-SESSION-PERSISTENCE-REPORT`, `RSS-1.2D.1-PERSISTENCE-RUNTIME-REPAIR-REPORT`, `RSS-1.2E.3-DEVELOPER-DEMO-INTEGRITY-PROBE-MODERNIZATION-REPORT`, `RSS-1.2S3-SERVER-OWNED-TICKET-WRITE-CONTRACT-REPORT`, `RSS-1.3-RELEASE-CERTIFICATION-REPORT`, `RSS-1.4-CERTIFIED-RELEASE-BASELINE-REPORT`, `RSS-1.1-RBAC-STABILIZATION-REPORT`, `PRODUCTION_CONFIGURATION.md`, `KNOWN_LIMITATIONS.md`, and `CHANGELOG.md`.

They establish server-authoritative organization data, membership-gated access, active-organization persistence, RBAC/last-owner protections, and the known historical auditability gap for `memory-change-1785206860672-972cue`. They do not document a customer signup, first-organization, or organization-count policy.

## 5. Repository / Database Baseline

| Item | Observed value |
| --- | --- |
| Branch / HEAD | `master` / `4792e10ee2ef075b0d7e10287fb4ceff583b3941` |
| Certified tag | `v0.1.0-certified` remains at `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`; it is an ancestor of HEAD |
| Initial working tree | clean |
| Migration state | 22/22 migrations applied; `prisma migrate status` reported schema up to date |
| Organizations | 4: FastDrop Logistics, Maesa Tech, OIP Developer Demo, OIP Regression Test |
| Users / memberships | 9 users / 11 memberships |
| Configured development user | Calvin (identifier redacted); active organization `profile-fastdrop-logistics`; 8 unexpired sessions |
| Calvin memberships | FastDrop, Maesa, OIP Developer Demo; all effective role `administrator` |
| Persistence authority | first three organizations are `server`; regression test is `local` |

All three live organizations have zero current owners. FastDrop and Maesa each have one administrator member; Developer Demo has nine administrator members. The regression organization has no members. Eight non-development users have no active organization, but none has zero membership.

## 6. Organization Data Model

`Organization` has string primary key and profile fields; tenant-owned operational tables reference it with `ON DELETE CASCADE`. `OrganizationMembership` has composite primary key `(userId, organizationId)`, cascade foreign keys to `User` and `Organization`, and a legacy `role`. `OrganizationRoleAssignment` is one-to-one with membership through unique `(organizationId, userId)`, cascades on user/organization/membership deletion, and references a restricted system `Role`.

`User.activeOrganizationId` is nullable and has `ON DELETE SET NULL`; sessions are separate `AuthSession` rows and cascade on user deletion. Knowledge, candidates, validations, memory changes, tickets, metrics, logs, patterns, jobs, connector data, and persistence authority are organization-scoped. KnowledgeItems carry the integer `revision` guard. No table enforces a minimum owner, an owner at organization creation, or a maximum organization/membership count.

## 7. Organization Count Policy

**NO_ORGANIZATION_COUNT_LIMIT_FOUND.**

Searches found no `MAX_ORGANIZATIONS`, workspace cap, count query, plan entitlement, or “three” organization rule. The `GET /api/organizations` list is the current user's membership projection. The apparent limit of three is data provisioning, not policy.

## 8. Organization Creation Audit

**Backend: PARTIAL; no safe usable creation API exists.** `upsertOrganizationProfile` and `upsertOrganizationProfiles` can create rows as persistence primitives, but all public paths require a membership and capability on the target ID before reaching them. A non-existent organization cannot satisfy that condition. There is no `POST /api/organizations`, create application service, transactional organization+membership+owner operation, creation authorization policy, or audit event.

**UI: PARTIAL/nonfunctional.** `OrganizationView` shows **Add organization** to anyone with `organization.profile.update` (administrators included). It creates a client-only profile with `org-${Date.now()}` and calls `selectOrganization`. The active-organization endpoint requires that generated organization to exist and the user to be its member, so the flow fails before persistence. It also briefly mutates local `organizationList`; it does not add a membership, owner assignment, empty durable tenant, or active organization.

## 9. Account Signup / Onboarding Audit

**Signup: NOT_IMPLEMENTED.** Authentication has login, logout, session lookup, password hashing, and session creation only. There is no registration route, account-creation form, invitation acceptance, or automatic customer provisioning.

A new user can be inserted by an operator or fixture with zero memberships because the schema permits it. On hydration, `GET /api/organizations` returns an empty list and active-organization resolution returns `activeOrganizationId: null`; the client throws “No authorized organization is available for this user.” There is no onboarding screen or first-organization action.

## 10. Demo Organization Membership Analysis

The current account's memberships are proven seed/provisioning data:

- `scripts/seed-development-memberships.cjs` explicitly inserts memberships for `AUTH_DEVELOPMENT_USER_EMAIL` into exactly `profile-maesa-tech`, `profile-fastdrop-logistics`, and `profile-oip-developer-demo`.
- `scripts/seed-developer-demo-foundation.cjs` independently gives the configured development account membership in Developer Demo and creates only synthetic demo-actor memberships there.
- Current database timestamps confirm Calvin's Maesa/FastDrop memberships were created together by the development-memberships process, and the Demo membership was created by its demo foundation path.

Conclusion: **LIMITED_TO_SEEDED_USER**, not automatic for every account. No signup path exists to give a normal account any memberships. The existing synthetic actors are historical/demo users with memberships only in Developer Demo.

## 11. Organization Switching Flow

1. The client locates the target in its authorized profile list.
2. It calls `PUT /api/auth/active-organization`; the server checks authentication, target existence, membership, and `organization.read`, then writes `users.activeOrganizationId`.
3. Only after that write, the client clears workflow state, flushes ticket saves, and calls `persistOrganizationState` for the outgoing ID.
4. It separately saves the outgoing profile, loads the target resources, and replaces client state.

The active-organization write is its own operation; the subsequent outgoing snapshot saves are neither part of a database transaction with it nor compensating on failure. Thus a save failure can leave the server's active organization changed while the UI reports that switching was not completed.

## 12. persistOrganizationState Analysis

This is a browser-owned whole-snapshot compatibility pattern carried into server persistence. It writes five outgoing collections concurrently even during navigation. Independent effect hooks already write these collections on state changes, so a normal switch has no reason to replay them.

| Organization Resource | Written During Switch? | Why | Required? |
| --- | --- | --- | --- |
| KnowledgeItems | Yes | legacy whole-state flush | UNRELATED |
| KnowledgeCandidates | Yes | legacy whole-state flush | UNRELATED |
| OrgMetrics | Yes | legacy whole-state flush | UNRELATED |
| IntelligenceLog | Yes | legacy whole-state flush | UNRELATED |
| EmergingPatterns | Yes | legacy whole-state flush | UNRELATED |
| OrganizationProfile | Yes, separately | outgoing profile flush | POTENTIALLY_REQUIRED, but normally redundant |
| Tickets | only queued ticket flush | preserves outstanding ticket work | POTENTIALLY_REQUIRED |

The `saveKnowledge` contract reconciles the submitted whole collection, including scoped deletion of items absent from the snapshot. That makes this navigation write especially high-risk and unsuitable for stale browser state.

## 13. 409 Revision Conflict Root Cause

The target row is currently in OIP Developer Demo at revision 54. Its most recent durable validation/memory event is `validation-1785206860672-r81s2l` / `memory-change-1785206860672-972cue`, a `merge_existing` by the configured development actor at `2026-07-27T19:47:40.672Z`. The existing integrity report also identifies this exact memory change as a historical snapshot/revision auditability gap.

The observed client had a hydrated item revision 53. On switch it submitted that unchanged stale object. `saveKnowledge` issued an update conditioned on revision 53; PostgreSQL held 54 and rejected it. The database contains no per-KnowledgeItem write actor, request ID, revision history, or WAL/audit retention exposed to the app, so it cannot prove which exact request advanced 53→54. The durable validation event is supporting provenance, not conclusive proof of that increment.

## 14. Optimistic Concurrency Contract

`upsertKnowledgeItemTx` creates new items at revision 1. Updates use `UPDATE ... WHERE id AND organizationId AND revision = expectedRevision`, incrementing revision only when one row matches. A mismatch reads the current row and returns `CONFLICT`/HTTP 409 with stored and expected revisions. This correctly prevents lost updates. The guard is **CORRECT**; removing or weakening it would be a data-integrity regression.

## 15. Multi-Tab / Multi-Session Risk

The conflict is possible from stale hydration in two tabs, separate browsers, separate sessions, or any client that keeps an older knowledge snapshot while another interactive workflow promotes/refines it. It is also possible after server-side job/reflection/validation paths update knowledge without a browser reload. The current database has eight active sessions for the configured development user, increasing the plausibility of stale client copies.

Current app logic has profile-specific 409 refresh recovery only. Knowledge snapshots are not refreshed before the switch flush, and switch persistence has no revision-aware merge/reload. Worker jobs are organization scoped and no queued/running Developer Demo jobs were observed at audit time; this rules out a currently active worker as the immediate writer, not historical or future worker-induced staleness.

## 16. Conflict Recovery Behavior

For profile conflicts, the client reloads the profile, replaces state, and asks the user to reapply the change. For `persistOrganizationState` collection conflicts, the error reaches `selectOrganization`'s catch and surfaces “Failed to load the selected organization. The organization switch was not completed.” It does not reload knowledge, merge/retry, restore the old active organization, or complete target hydration. An unrelated KnowledgeItem conflict can therefore block navigation.

## 17. Active Organization Authority

The durable authority is `users.activeOrganizationId`; membership is validated before setting it and a stale/invalid value is repaired to the first membership on a later GET. The client holds a separate current profile/state snapshot and browser-local UI preferences. This creates split-brain risk when the server active-org update succeeds but the later client snapshot persistence/load fails. Active organization is not in the session, URL, cookie, or OrganizationProfile.

## 18. Zero-Organization User Behavior

**Not supported as a customer journey.** The schema and active-organization service tolerate zero memberships, but the UI treats the resulting null active context as an error. There is no “create your first organization” onboarding or safe recovery path. No disposable user was created because this audit's explicit no-database-mutation constraint takes precedence over optional fixture testing.

## 19. Ownership / Membership Rules

Owner is a role assignment with key `owner`, not a special Organization column. Multiple owners are permitted. Existing owner-only protections prevent demoting/removing the last owner, and assigning owner requires `organization.ownership.transfer`; normal membership management requires `organization.members.manage`. Membership creation/invitation is absent from the exposed routes.

An organization can exist without an owner, as all four current organizations demonstrate. There is no first-organization transaction to create the tenant, membership, Owner role assignment, active selection, empty metrics/sequence, and audit record atomically. A correct first-organization lifecycle must do all of those in one server-owned transaction.

## 20. Customer Onboarding Gap Analysis

| Lifecycle Step | Current Behavior | Expected Customer Behavior | Gap |
| --- | --- | --- | --- |
| Create account | login only | customer can register/invite/activate | Missing |
| Zero memberships | client error | dedicated onboarding | Missing |
| Create first organization | client-only form fails | server-owned creation | Missing |
| Become Owner | no automatic owner | creator is owner | Missing |
| Empty tenant | no creation transaction | isolated empty operational state | Missing |
| Configure organization | profile editing works for existing members | configure owned new tenant | Blocked by creation |
| Upload knowledge / invite team | tenant features exist selectively | available after ownership/setup | membership invitation path missing |
| Switch organization | snapshot flush can block | atomic context change without unrelated writes | Defective |

## 21. Security / Tenant Isolation Review

Existing organization reads/writes are materially protected by authenticated membership, capability checks, direct organization scoping, and server persistence authority. Ticket writing was further hardened by RSS-1.2S3. These controls can support safe creation only if creation is a separate authenticated but *pre-membership* endpoint, atomically creates an owner membership/assignment, initializes tenant state, records audit evidence, and never exposes demo memberships/data.

Risks: the current UI misleadingly exposes Add organization to administrators; ownerless organizations undermine ownership governance; switching unnecessarily attempts cross-session stale snapshot writes; and there is no audit trail for individual KnowledgeItem revision writers.

## 22. Reproduction Evidence

No live switch or fixture was executed: the task explicitly forbids database/data mutation, while the supplied switch probe creates and removes fixtures. The failure is nevertheless reproduced at the call-path/contract level from current source and persistent evidence:

| Starting organization | Target organization | Resource | Client revision | Server revision | Expected result |
| --- | --- | --- | --- | --- | --- |
| OIP Developer Demo (stale browser) | another authorized organization | `demo-ki-sso-certificate-redirect-loop` | 53 | 54 | `409 CONFLICT`, switch aborts after active-org write |

## 23. Disposable User Test

Not run. A disposable user would require INSERT/DELETE activity, contrary to the audit's explicit read-only directive. Static and DB evidence conclusively shows the predicted behavior: zero memberships is representable; `/api/organizations` returns no organizations; active context resolves null; the client errors; no creation route exists.

## 24. Findings Register

| Finding | Type | Severity | Evidence | User Impact | Owning Task |
| --- | --- | --- | --- | --- | --- |
| F-01 Switch flushes stale whole knowledge snapshot | BUG | Critical | `app/page.tsx` switch + `saveKnowledge` revision guard | 409 blocks navigation | RSS-2.1 |
| F-02 Active org changes before subsequent switch work | ARCHITECTURE_DEBT | High | independent PUT then collection writes | UI/server active-org split brain | RSS-2.1 |
| F-03 No server-owned organization creation transaction | PRODUCT_GAP | Critical | no POST/service; target routes require membership | no first customer tenant | RSS-2.2 |
| F-04 Add organization UI is nonfunctional | UX_ISSUE | High | generated client ID then authorization failure | misleading action and failed creation | RSS-2.2 / RSS-2.7 |
| F-05 No signup/onboarding zero-org experience | PRODUCT_GAP | Critical | login-only auth; null active context errors | real customer cannot start | RSS-2.3 |
| F-06 Development user has explicit seeded demo memberships | DATA_SEED_ISSUE | Medium | seed script plus current membership rows | dev demo is not customer-isolated | RSS-2.4 |
| F-07 All current organizations have no owner | SECURITY_RISK | High | current RBAC assignment rows/owner counts | weak authority provenance and recovery | RSS-2.2 / RSS-2.5 |
| F-08 No KnowledgeItem revision-writer audit | ARCHITECTURE_DEBT | Medium | row has revision/timestamps but no writer/request history | exact conflicts cannot be attributed | RSS-2.6 |
| F-09 409 rejects stale updates | EXPECTED_BEHAVIOR | Informational | conditional update contract | prevents lost updates | Preserve in RSS-2.1 |

## 25. Recommended RSS-2 Work Breakdown

1. **RSS-2.1 — Switch Context Without Snapshot Flush.** Remove unrelated collection writes from switching; make active selection/load failure-safe; preserve revision guards; prove no split brain.
2. **RSS-2.2 — Server-Owned Organization Creation and Ownership.** Add the transactional tenant/membership/owner/initial-state/audit operation and a pre-membership authorization policy.
3. **RSS-2.3 — Account and First-Organization Onboarding.** Add signup/invitation decision, zero-membership screen, first-org journey, and acceptance tests.
4. **RSS-2.4 — Demo Isolation and Development Provisioning.** Bound developer seeds, prevent accidental demo membership, and define reset/provisioning policy.
5. **RSS-2.5 — Membership, Ownership, and Limits Verification.** Add invariant checks for owner creation/last owner and document intentional no-limit or plan policy.
6. **RSS-2.6 — Revision Observability and Concurrent Clients.** Add knowledge writer/request auditability and multi-tab/session refresh/recovery tests.
7. **RSS-2.7 — Lifecycle UX.** Align menus/forms/errors with supported lifecycle only.
8. **RSS-2.8 — New Customer End-to-End Acceptance.** Test signup/invite → zero org → create → owner → empty tenant → switch/invite.
9. **RSS-2.9 — Hotfix Certification.** Certify all preceding changes with protected demo data and concurrency regression probes.

## 26. Remaining Unknowns

- The exact request/actor that changed the target knowledge row from revision 53 to 54 cannot be proven without historical database/WAL logs or a per-write audit trail.
- No real browser-local stale snapshot was available to inspect, so its retained revision is taken from the reported 409 and verified against the server's current 54.
- Product policy for any future organization quota, invitations, billing/account entity, and signup identity provider has not been decided.

## 27. Recommendation

Start RSS-2.1 only. Treat the 409 as an intentional safety control and eliminate the unnecessary switch-time persistence workflow around it. Do not silently retry or discard stale knowledge. Gate the exposed Add organization UI until RSS-2.2 delivers a safe server-owned lifecycle; then build onboarding and demo isolation in the stated order.

## 28. Final Verdict

**ORGANIZATION_LIFECYCLE_AUDITED**

The lifecycle architecture, defects, demo-data origin, and onboarding gaps are sufficiently understood to begin RSS-2.1. Production data changed: **NO**.
