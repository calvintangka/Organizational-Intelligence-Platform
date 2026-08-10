# RSS-2.5 — Membership / Ownership / Limits Report

Date: 2026-08-09
Branch: `master`
Baseline HEAD: `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
Certified baseline: `v0.1.0-certified` dereferences to `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`.

## 1. Executive Summary

RSS-2.5 establishes the current server-authoritative contract. Membership is the composite `(userId, organizationId)` row; effective role and capabilities come from the organization-scoped role assignment; Owner is a persisted role assignment created atomically with a new organization. Multiple Owners are supported, while the last Owner cannot be demoted or removed. No organization, member, or membership-count product limit exists.

## 2. Final Verdict

`MEMBERSHIP_OWNERSHIP_LIMITS_VERIFIED`

## 3. Background

RSS-2.2 created the creator membership and Owner assignment. RSS-2.3 connected signup to that transaction, and RSS-2.4 confirmed demo isolation. RSS-2.5 audits the underlying contract before broader member lifecycle work.

## 4. Documentation Reviewed

Reviewed RSS-2.0 through RSS-2.4, authentication/session, RBAC/authorization, active organization, persistence, audit, security, RSS-1.2S1/S3, RSS-1.3/RSS-1.4, TODO-078, production configuration, changelog, and known limitations.

## 5. Baseline

The certified tag was inspected and not modified. Prisma reported 23 migrations and an up-to-date database. The mature protected-state digest was captured before and after the permanent probe. Current inventory contained 6 organizations and 13 memberships; the three mature demos retained 9/1/1 memberships respectively. Historical role assignments remain untouched.

## 6. Membership Data Model

`OrganizationMembership` has composite primary key `(userId, organizationId)`, required foreign keys to User and Organization, a legacy/string `role`, `createdAt`, and cascade deletion from either parent. It has an optional one-to-one `OrganizationRoleAssignment`. The composite key prevents duplicate logical memberships; there is no status, soft-delete, invitation, or seat field.

| Membership Property | Current Contract | Enforcement |
|---|---|---|
| User reference | Required User FK | PostgreSQL FK |
| Organization reference | Required Organization FK | PostgreSQL FK |
| Logical identity | One `(userId, organizationId)` row | Composite primary key |
| Role fallback | String role if no assignment | `normalizeRoleKey` |
| Effective role | Assignment role when present | Server authorization service |
| Removal | Hard delete only through role service/parent cascade | Final-owner guard plus FK cascade |

## 7. Role / Capability Model

Six persisted system roles exist: owner, administrator, reviewer, operator, support_agent, and viewer. Capabilities are organization-scoped through role assignments and resolved on every authorization request. Owner has 42 capabilities; administrator has 41 and intentionally lacks ownership transfer; reviewer, operator, support_agent, and viewer have narrower capability sets.

| Role | Persisted? | Important Capabilities | Assignment Path |
|---|---|---|---|
| Owner | Yes | All current capabilities, including ownership transfer | RSS-2.2 creator assignment or protected role mutation |
| Administrator | Yes | Organization/member/settings administration without ownership transfer | Protected role mutation/legacy assignment |
| Reviewer | Yes | Review, reflection, knowledge governance | Protected role mutation |
| Operator | Yes | Workers, connectors, operations | Protected role mutation |
| Support Agent | Yes | Tickets, knowledge read, support operations | Protected role mutation |
| Viewer | Yes | Read-only organization/knowledge/ticket/metrics access | Protected role mutation |

## 8. Ownership Semantics

Ownership is represented by an organization membership whose effective role assignment is `owner`; there is no separate organization owner column. RSS-2.2 creates membership, Owner role assignment, and audit record in one serializable transaction. Ownership is organization-scoped and server-authoritative. Owner implies all currently defined capabilities, but capability resolution still requires membership.

## 9. Creator Owner Invariant

The creator is derived from the authenticated session, never from `userId`, `ownerId`, or `role` in the request. A disposable creator received one membership and one Owner assignment for each of five organizations. A second user received no implicit membership. Forged creation claims returned 400.

## 10. Zero-Owner Analysis

For new customer organizations, supported role/membership mutation paths prevent the last Owner from being demoted or removed. There is no account-deletion or disable API. Direct database deletion or historical fixture repair is outside the supported lifecycle and is not treated as a product path. Historical demo organizations can have zero formal Owner assignments; RSS-2.5 preserves that legacy state.

## 11. Multiple-Owner Analysis

Multiple Owners are supported. An Owner explicitly assigned a second existing member the Owner role; both assignments were durable and organization-scoped. One Owner could then demote the other while one Owner remained. The final Owner was rejected for demotion and removal with 409.

## 12. Membership Creation Paths

| Membership Creation Path | Authorized By | Role | Duplicate Safe? |
|---|---|---|---|
| RSS-2.2 organization creation | Authenticated creator; server derives user | Creator `owner` | Yes: serializable transaction and idempotency |
| Development membership seed | Explicit `AUTH_DEVELOPMENT_USER_EMAIL` operator action | `member` with existing role mapping | Yes: `ON CONFLICT DO NOTHING` |
| Developer-demo foundation/test seeds | Explicit server/database operator command | Fixture-defined member | Create-only or fixture-controlled |
| Public invitation/member-add API | Not implemented | N/A | N/A |
| Role PATCH for existing member | Authorized organization member with `organization.members.manage` | Existing member only | Upserted role assignment |

## 13. Membership Mutation Paths

`PATCH /api/organizations/:organizationId/members/:userId` changes an existing member’s role after server capability authorization. `DELETE` removes an existing member after the same authorization and final-owner check. No public endpoint adds an arbitrary new member, so invitation/member onboarding remains future scope. Rate limiting on role mutation is request-abuse protection, not a membership-count policy.

## 14. Client Forgery Analysis

Creation rejects client `userId`, `ownerId`, `role`, and organization identity fields. Role PATCH requires the caller’s current organization capability and a target membership. A non-member could not assign Owner or Administrator, and a demoted Administrator could not grant ownership. Effective actor identity is always taken from the session.

## 15. Duplicate Membership

The composite database primary key rejects a second logical membership with PostgreSQL `23505`; the probe verified the row count remains one. Role assignment has unique `(organizationId, userId)` constraints and uses upsert semantics. No constraint was weakened.

## 16. Cross-Organization Isolation

Owner of Org A was denied access to Org B, and Owner of Org B was denied access to Org A. Active-context selection and organization profile reads both returned 403. The known organization ID alone provided no authority.

## 17. Multi-Organization User Verification

A disposable user created five organizations sequentially through RSS-2.2. All five remained listed, each had its own Owner membership and assignment, and switching succeeded for every organization. No earlier organization disappeared and no demo membership appeared.

## 18. Organization Count Limit

Current policy: `NO_EXPLICIT_PRODUCT_LIMIT`. No schema, service, API, UI, configuration, billing, or documentation rule caps organizations per user. The fourth and fifth creations passed. The creation endpoint has no count check. Signup abuse limits and role-mutation rate limits are request quotas, not organization-count limits.

## 19. Membership Count Limits

Current policy for organizations per user, members per organization, and memberships per user is `NO_EXPLICIT_PRODUCT_LIMIT`. The schema has no seat/quota column or count guard; invitation and billing plans are not implemented. Only duplicate identity constraints and authorization apply.

## 20. Rate Limit vs Product Limit

The existing limiter controls request frequency, such as signup and `admin.mutate.user` role changes. It does not cap the number of organizations, members, or memberships. RSS-2.5 does not reinterpret a rate window as a lifecycle limit.

## 21. Demo Membership Regression

RSS-2.4 guarantees remain intact. Fresh accounts received zero demo memberships and direct demo access was rejected. Existing development memberships were not changed. Strong role authority in one customer organization did not grant demo access.

## 22. Historical Ownership

New RSS-2.2 organizations have a creator Owner assignment. Mature seeded organizations retain their historical role shape; current inventory showed no formal `role_owner` assignment for the mature demo set. RSS-2.5 does not silently rewrite or reconcile those fixtures.

## 23. Account Deletion / Disable Analysis

No supported account deletion or disable API was found. Therefore owner-account disappearance is not currently exposed as a lifecycle operation. Database cascade semantics are documented, but no deletion workflow was added merely to test it.

## 24. Ownership Transfer

Ownership transfer is supported as a server-side role mutation primitive, not as a dedicated UI. An Owner can assign Owner to an existing member; multiple Owners are allowed, and the final Owner cannot be demoted or removed. Administrator lacks `organization.ownership.transfer`. A future dedicated transfer UX may add workflow/audit semantics without changing these guards.

## 25. Invitation / Member Onboarding Status

No invitation or public member-add API exists. The probe uses a disposable database fixture only to exercise role mutation and final-owner invariants. Invitation email flows and member-management UI remain future work.

## 26. Active Organization / Membership Changes

The supported removal path deletes membership and the next request re-evaluates current durable membership. Existing active context cannot preserve server authority after membership removal. The final-owner guard prevents removing the last Owner.

## 27. Session Authority Refresh

Authorization resolves the current database membership and role assignment on each protected request. It does not trust the client’s cached role, active organization, or organization list. RSS-2.1 and TODO-078 probes cover refresh and removed-membership denial behavior.

## 28. Concurrency

RSS-2.2’s serializable organization-creation transaction and idempotency were rerun successfully. Duplicate membership protection is database-enforced. Role assignment uses a unique key and upsert; the probe verified repeated logical assignment does not create duplicate assignment rows. No artificial membership endpoint was added.

## 29. Authorization Auditability

Organization creation writes a durable authorization audit record. Every capability decision, including membership denials and role-management checks, is audited through the existing authorization service. Audit rows contain actor/organization/capability/resource metadata, not secrets. There is no new audit platform; historical fixture role changes remain a documented gap.

## 30. UI Limit Claims

No customer UI copy claims a maximum organization count, member count, seat count, or upgrade requirement. The onboarding UI describes the first organization and the normal organization list renders server-authorized memberships. No stale three-organization claim was found.

## 31. Security Negative Controls

The permanent probe covers non-member denial, cross-organization role isolation, forged user/Owner/Admin claims, known-ID denial, duplicate membership, five-organization creation, all-organization retention, demo isolation, and final-owner protection. TODO-078 additionally covers viewer capability denial, expired/deleted sessions, audit safety, and removed-membership denial.

## 32. Regression Results

Passed: RSS-2.1, RSS-2.2, RSS-2.3, RSS-2.4, RSS-2.5, authentication, active organization, organization switching, TODO-078 RBAC, TypeScript, Prisma validation, migration status, production build, and OIP Benchmark v1 at 1000/1000. RSS-1.2S1/S2/S3/S4, persistence, and Developer Demo integrity were previously rerun in the same post-certified worktree; Developer Demo integrity retains known non-blocking historical findings with zero release-blocking findings.

## 33. Data Integrity

The probe hashes mature organizations, memberships, role assignments, authorities, metrics, sequences, and all mature organization-owned resources before and after execution. The digest remained unchanged. Authorization audit telemetry is append-only expected side effect and excluded from the business-state digest. All disposable users, organizations, memberships, assignments, sessions, and role fixtures were removed in `finally`.

## 34. Remaining Limitations

Invitations/member administration, account deletion/leave, dedicated ownership-transfer UX, historical ownership reconciliation, billing/plan-based limits, cross-tab active-context synchronization, and broader organization lifecycle UX remain outside RSS-2.5.

## 35. Recommendation

Accept RSS-2.5. Keep the explicit no-product-limit policy until billing or a product requirement establishes a limit. Preserve the final-Owner guard and membership-based authorization. Treat invitations, account lifecycle, and historical-owner reconciliation as separately scoped work.

## 36. Final Verdict

`MEMBERSHIP_OWNERSHIP_LIMITS_VERIFIED`

| Concept | Authoritative Source | Current Rule | Enforcement |
|---|---|---|---|
| Membership | `organization_memberships` | One row per user/org | Composite primary key + server authorization |
| Role | `organization_role_assignments` / role catalog | Org-scoped effective role | `requireCapability` on every protected route |
| Ownership | Effective `owner` role assignment | Multiple Owners allowed; final Owner protected | Role service + capability checks |
| Creator | RSS-2.2 transaction | Authenticated creator becomes Owner | Server-derived user ID, serializable transaction |
| Organization count | No product-limit source | No explicit cap | Five-organization acceptance test |
| Member/membership count | No product-limit source | No explicit cap | Schema/API audit; no seat policy |

| Limit | Current Policy | Enforcement | Verified |
|---|---|---|---|
| Organizations per user | `NO_EXPLICIT_PRODUCT_LIMIT` | None | PASS — five created and retained |
| Members per organization | `NO_EXPLICIT_PRODUCT_LIMIT` | None | PASS — no count guard/schema limit |
| Memberships per user | `NO_EXPLICIT_PRODUCT_LIMIT` | Composite uniqueness only | PASS |
| Request abuse | Existing rate policies | Shared rate limiter | PASS; not a product limit |

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Creator membership | One creator membership | One per created organization | PASS |
| Creator Owner authority | Server-derived Owner | Five Owner assignments | PASS |
| Multiple Owners | Supported explicitly | Two Owners, then safe demotion | PASS |
| Final Owner protection | Cannot demote/remove last Owner | 409 for both | PASS |
| Client forgery | Reject identity/role claims | 400/403 | PASS |
| Duplicate membership | One logical row | PK rejects duplicate | PASS |
| Cross-organization access | Denied without membership | 403 | PASS |
| Five organizations | No false cap | All five listed and switchable | PASS |
