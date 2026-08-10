# RSS-2.2 — Organization Creation & Ownership Report

**Date:** 2026-08-09
**Branch / HEAD:** `master` / `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
**Certified baseline:** `v0.1.0-certified` dereferences to `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba` (unchanged).

## 1. Executive Summary

RSS-2.2 replaces the browser-only Add organization behavior with authenticated, server-owned tenant provisioning. `POST /api/organizations` validates a narrow request DTO and required `Idempotency-Key`, then performs all durable provisioning in one serializable PostgreSQL transaction. The creator receives a membership with legacy role `owner` and the existing RBAC `owner` assignment; that RBAC role already carries every defined organization capability.

## 2. Final Verdict

`ORGANIZATION_CREATION_AND_OWNERSHIP_VERIFIED`

## 3. Background

RSS-2.0 found no organization-count limit and no usable customer creation path. RSS-2.1 repaired context switching so it does not flush stale outgoing organization snapshots. RSS-2.2 builds creation on those two findings without changing mature tenants or expanding into signup/onboarding.

## 4. Documentation Reviewed

Reviewed RSS-2.0, RSS-2.1, RSS-1.2B-FINAL, RSS-1.2S3, RSS-1.2E.3, RSS-1.3, RSS-1.4, `CHANGELOG.md`, `KNOWN_LIMITATIONS.md`, and `PRODUCTION_CONFIGURATION.md`. The existing RBAC role service, persistence boundary, active-organization service, migrations, and tenant probes were also reviewed.

## 5. Baseline

The working branch was `master`; the pre-existing RSS-2.0/RSS-2.1 development changes remained uncommitted and were preserved. `v0.1.0-certified` still resolves to the certified SHA above. Before the new migration, Prisma reported 22 migrations applied; RSS-2.2 adds the 23rd migration. Mature demo organizations and their historical owner irregularity were not rewritten.

## 6. Previous Add Organization Behavior

`OrganizationView` previously constructed an `OrganizationProfile` in React with an `org-${Date.now()}` ID, inserted it only into local state, and called `selectOrganization`. No creation API, organization row, membership, owner role, tenant initialization, or audit was created; the active-organization authorization check rejected the fabricated ID.

## 7. Organization Creation Contract

`POST /api/organizations` requires an authenticated session and an `Idempotency-Key` header. The allowed body is `{ name, industry?, description?, customerTone?, accentColor?, logoInitials? }`. `name` is required (2–160 non-control characters); the remaining fields are bounded/validated server input. IDs, revisions, timestamps, role/owner fields, membership fields, metrics, and arbitrary extra properties are rejected. Names are display data, not identifiers: Unicode and duplicate display names are allowed and inertly rendered; control characters are rejected.

## 8. Ownership Model

Owner remains the existing RBAC model: an `OrganizationRoleAssignment` whose role key is `owner`, plus the compatible membership role value `owner`. This is not a second ownership system. Multiple owners are structurally supported because assignments are unique per `(organizationId, userId)`, not per organization/role; existing last-owner protections continue to apply. Mature organizations were not modified.

## 9. Authorization Model

Creation uses `requireAuthenticatedUser`, not a pre-existing tenant membership or administrator capability. The request does not accept another user as owner and unknown `ownerId`/role fields are rejected. After the transaction, ordinary existing membership/capability middleware governs all organization access.

## 10. Server-Owned Provisioning Transaction

`createOrganizationForUser` uses `prisma.$transaction` at `Serializable` isolation:

| Provisioning Step | Transactional? | Result |
| --- | --- | --- |
| Server-generated Organization/profile row | Yes | Created |
| Creator `OrganizationMembership` | Yes | `owner` |
| Creator Owner RBAC assignment | Yes | Created |
| `OrgMetrics` / `TicketSequence` | Yes | Zero initialized |
| Server persistence authority | Yes | Created |
| Creation provenance audit | Yes | Created |
| Idempotency record | Yes | Created |

A disposable trigger fault after organization creation/membership creation and another at Owner assignment both returned a safe 500 and left no organization, membership, or idempotency row.

## 11. Initial Tenant State

| Initial Resource | Expected State | Actual State | Result |
| --- | --- | --- | --- |
| Organization profile | New request values only | New row | PASS |
| Creator membership / Owner role | Creator only / Owner | Present | PASS |
| OrgMetrics | One zero row | One zero row | PASS |
| TicketSequence | Counter 0 | Counter 0 | PASS |
| Persistence authority | Server | Server | PASS |
| Knowledge, candidates, validations, memory, evidence, lessons, tickets, logs, patterns | Empty | Empty | PASS |

Action policy and other activity-specific records remain lazy; no demo/customer row is copied.

## 12. Identifier Strategy

The server creates `org-${randomUUID()}` only after authenticated validation. Client-supplied `id` is an unknown request property and is rejected. Similar or duplicate display names do not choose, collide with, or impersonate tenant identifiers.

## 13. API Implementation

The API boundary is `app/api/organizations/route.ts`; provisioning lives in `lib/server/organizationCreationService.ts`, not React. It returns the server profile and whether the response is an idempotent replay. A same-key/different-payload replay is HTTP 409; concurrent same-key requests converge on one request record/tenant.

## 14. UI Integration

The authenticated organization form now supplies only allowed customer fields and a retry-stable idempotency key. It does not build a durable profile or ID. On server success, the page re-fetches `/api/organizations`, updates its authorized membership projection, then calls the RSS-2.1 selection path with that authoritative list.

## 15. Audit / Provenance

The transaction creates an existing `AuthorizationDecisionAudit` event with the creator, `owner` role, `organization.create` capability label, `organizations:create` resource, allow decision, safe reason, request ID, and correlation ID when provided. It stores no password, token, or secret.

## 16. Idempotency / Retry Safety

`OrganizationCreationRequest` has unique `(userId, idempotencyKey)` and unique `organizationId`, plus a SHA-256 canonical request digest. Same body/key returns the original tenant; changed body/key returns 409; serializable retry handling plus the unique constraint collapses concurrent duplicate submissions.

## 17. Validation

The permanent probe verifies empty, whitespace-only, overlong, and control-character names reject; normal, Unicode, HTML-like/script-like inert display text, and duplicate display names behave safely. Accent colors, tone, initials, optional strings, JSON shape, and unknown server-only fields are validated at the API boundary.

## 18. Persistence Verification

A disposable zero-membership user created a tenant through HTTP. PostgreSQL contained the organization/profile, creator membership, Owner assignment, metrics, ticket sequence, authority row, audit, and idempotency record. The tenant appeared in the list, was selected through active-organization, remained available after logout/login, and remained available after stopping the compiled Next.js process and starting a fresh one. All disposable fixtures were cleaned in `finally`.

## 19. Four-Organization Limit Test

One disposable user created four distinct tenants with four valid memberships. No three-organization cap was found or enforced.

## 20. Tenant Isolation

The new tenant started empty. A second authenticated disposable user received 403 for both direct tenant read and active-organization selection. No records were initialized in or copied from any mature demo tenant.

## 21. Ownership Negative Controls

Unauthenticated creation returned 401. Client-supplied owner and ID fields returned 400. Non-member access returned 403. Injected membership and Owner-role failures rolled back all prior transaction steps.

## 22. Concurrency

Two simultaneous HTTP requests with the same creator/key/payload returned one organization ID and exactly one idempotency record. Generated IDs are independent UUID material; no orphan membership or ownerless organization was observed.

## 23. RSS-2.1 Regression

RSS-2.1 remains the only context-switch mechanism after creation. The new UI refreshes authoritative membership data and calls `selectOrganization`; it does not invoke `persistOrganizationState` or write outgoing collection snapshots. The RSS-2.1 switch-context probe continued to pass, including stale direct-KnowledgeItem 409 rejection.

## 24. Existing Organization Impact

FastDrop Logistics, Maesa Tech, and OIP Developer Demo were not migrated, reseeded, granted owners, or otherwise changed. Their historical zero-formal-owner state remains a documented later-lifecycle reconciliation concern.

## 25. Security Review

Verified controls cover authenticated-only creation, strict body allow-listing, server IDs, creator-only ownership, membership-scoped post-create access, idempotency conflict detection, serializable provisioning, no secret logging, and cross-tenant negative controls. CSRF assumptions remain consistent with the existing same-origin session-cookie application; no independent CSRF architecture was added or claimed.

## 26. Regression Results

| Scenario | Expected | Actual | Result |
| --- | --- | --- | --- |
| Authenticated create | 201 durable tenant | 201 | PASS |
| Unauthenticated create | 401 | 401 | PASS |
| Same request replay | Same organization | Same ID / 200 | PASS |
| Concurrent duplicate | One tenant | One ID / one request record | PASS |
| Four organizations | No cap | Four created | PASS |
| Creator selection | Authorized | 200 | PASS |
| Logout/login and Next.js restart | Durable membership/tenant | Retained | PASS |
| Non-member read/select | Rejected | 403 | PASS |
| ID/owner spoof | Rejected | 400 | PASS |
| Mid-transaction failure | No partial tenant | None persisted | PASS |

TypeScript, Prisma validation/migration status, production build, RSS-2.1, active-organization, organization-switching, RBAC, server-persistence, persistence-boundary, RSS-1.2S1, RSS-1.2S3, Developer Demo integrity, and OIP Benchmark checks passed in this development run.

## 27. Data Integrity

All automated tenant data used disposable users/organizations and removes sessions, users, tenant rows, audits, and related cascades in `finally`. The Developer Demo integrity probe reported no release-blocking findings and unchanged protected-organization digest. No mature memberships, roles, profiles, or operational data were intentionally modified.

## 28. Remaining Limitations

RSS-2.2 does not add signup, a zero-organization first-run screen, invitations, demo isolation remediation, historical owner reconciliation, or full lifecycle UX. Those limits remain explicitly listed in `KNOWN_LIMITATIONS.md` for later RSS-2 work.

## 29. Recommendation

Proceed to RSS-2.3 for account signup and zero-organization/first-tenant onboarding. Do not automatically retrofit mature demo ownership as part of that work.

## 30. Final Verdict

`ORGANIZATION_CREATION_AND_OWNERSHIP_VERIFIED`
