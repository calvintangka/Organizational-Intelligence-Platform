# RSS-2.3 — Account + First-Organization Onboarding Report

Date: 2026-08-09
Branch: `master`
Baseline HEAD: `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
Certified baseline: `v0.1.0-certified` dereferences to `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`.

## 1. Executive Summary

RSS-2.3 delivers the complete customer entry path: sign up, authenticated zero-organization state, first-organization onboarding, RSS-2.2 tenant provisioning, RSS-2.1 context activation, and entry to an empty workspace. It uses durable PostgreSQL state and existing authentication primitives; no seed or demo organization is involved.

## 2. Final Verdict

`ACCOUNT_AND_FIRST_ORGANIZATION_ONBOARDING_VERIFIED`

## 3. Background

RSS-2.0 audited the lifecycle, RSS-2.1 stabilized context switching, and RSS-2.2 established atomic server-owned tenant creation. RSS-2.3 connects those foundations to a new customer who starts with neither account nor organization.

## 4. Documentation Reviewed

Reviewed the RSS-2.0, RSS-2.1, RSS-2.2 reports; applicable authentication, session, rate-limit, RBAC, persistence, and security-header materials; production configuration; changelog; and known limitations before implementation.

## 5. Baseline

Work began post-certification on `master`; the certified tag was inspected but not moved. Prisma reported 23 migrations applied. The mature-organization integrity digest was captured by the integrity probe and was unchanged after verification.

## 6. Existing Authentication Architecture

The existing login route validates normalized credentials, verifies the stored password hash, creates a random session token whose SHA-256 digest is persisted, and sets the `oip_session` cookie. Sessions are HttpOnly, SameSite=Lax, secure in production, and expire after 30 days. Logout invalidates the stored session.

## 7. Signup Contract

`POST /api/auth/signup` accepts only `name`, `email`, and `password`. Name is normalized and bounded; email is trimmed/lowercased and validated; password is required at 8–256 characters. IDs, roles, organization/membership data, hashes, privileges, and every unknown field are rejected.

## 8. Account Creation Implementation

`lib/server/accountCreationService.ts` owns validation, hashing, user insertion, and session creation. User and session are created in one serializable Prisma transaction. The endpoint returns only `{ id, name, email }` and sets the established session cookie.

## 9. Password Security

The existing `scrypt-v1` hashing primitive is reused. Plaintext passwords are neither persisted nor returned, and hashes/tokens are absent from the JSON response. The permanent probe inspects the persisted representation and verifies it is not plaintext.

## 10. Email Identity / Duplicate Handling

Email comparison uses the existing normalization contract (trim and lowercase) before the database unique constraint. Case/whitespace equivalents collide safely; `P2002` becomes the safe `409 EMAIL_ALREADY_REGISTERED` response. Invalid and oversized addresses are rejected before provisioning.

## 11. Signup Rate Limiting

Signup uses the existing shared rate-limit architecture with `auth.signup.ip` (20/hour, emergency ceiling 5) and `auth.signup.account` (5/hour, emergency ceiling 3) policy keys. No separate limiter or unrelated production policy change was introduced.

## 12. Login Page Integration

The existing login screen now has a compact Sign in/Create account toggle. Signup exposes only name, email, and password and can return to sign-in; customer-facing validation/API errors are displayed without implementation details.

## 13. Zero-Organization State

An authenticated account with `authorizedProfiles.length === 0` is now a supported state. Hydration stops before an active-organization fetch and renders onboarding rather than an application error, fabricated tenant, or demo context.

## 14. First-Organization Onboarding

`FirstOrganizationOnboarding` asks for name, industry, and optional description. A stable client retry key is retained for a logical submit attempt; the client never creates an organization ID or ownership data.

## 15. RSS-2.2 Provisioning Integration

The onboarding form calls RSS-2.2 `POST /api/organizations`. Its serializable transaction remains the source of truth for tenant profile, Owner membership and RBAC assignment, empty initialization, and durable idempotency. The report does not duplicate that provisioning logic.

## 16. RSS-2.1 Switching Integration

After authoritative membership refresh, the existing stabilized selector activates the new organization and loads its server state. It does not revive snapshot flushing or client-owned tenant state.

## 17. Empty Workspace Verification

The permanent probe verifies zero knowledge, tickets, candidates, validations, memory records, evidence, and patterns in the first tenant. Browser verification rendered the normal empty workspace with zero open tickets and no organizational knowledge.

## 18. Session Persistence

A newly signed-up, zero-organization account remains authenticated across refresh-style server reads and retains its empty organization list. The acceptance probe ran against a fresh production Next server, and a separate controlled Next restart preserved the same signed-up session and `{ data: [] }` membership response. Session state is database-backed, not local storage.

## 19. Logout/Login Verification

Before first organization, logout invalidates the session and a later login returns to valid onboarding. After tenant creation, logout/login restores the membership and workspace access. Both paths are permanent-probe assertions; the latter was also exercised in the browser.

## 20. Existing User Regression

Authentication, active organization, organization switching, RSS-2.1 switching, RSS-2.2 creation, and TODO-078 RBAC probes all passed. Existing memberships remain outside the zero-organization gate.

## 21. Demo Organization Leakage Test

New accounts begin with exactly zero memberships. After first provisioning each receives exactly one membership, its own new organization; direct reads of the OIP Developer Demo are rejected. No FastDrop, Maesa, or developer-demo membership was assigned.

## 22. Multi-Account Tenant Isolation

Two disposable accounts independently began empty and created separate organizations. Each was forbidden from reading the other tenant. Probe cleanup removes their sessions, creation requests, organizations, dependent tenant records, and identities.

## 23. Duplicate / Concurrent Signup

Repeated signup returns 409 without modifying the existing credential. Two concurrent requests for one normalized address result in exactly one `201`, one `409`, and one database user.

## 24. Failure / Retry Handling

A temporary `auth_sessions` trigger proved session-provisioning failure rolls back the user. A temporary `organization_memberships` trigger proved first-organization failure rolls back the organization, leaves the account/session valid and zero-member, and permits a same-key retry. RSS-2.2 idempotency replay returns the original first tenant rather than a duplicate.

## 25. Browser Runtime Verification

Using the in-app browser against the production server, a fresh visitor opened the actual sign-in screen, selected Create account, submitted a new identity, saw the onboarding screen, reloaded before creating an organization, created an organization, entered the empty workspace, reloaded it, and signed out/in successfully. The browser session did not separately exercise a new-tab scenario or a browser refresh after a Next.js process restart; those are not claimed as browser assertions.

## 26. Security Review

Signup reuses secure password/session primitives, returns no secrets, rejects privileged fields, preserves cookie protections, and keeps authorization membership-based. A zero-member account has no implicit tenant access; arbitrary tenant requests receive 403.

## 27. Negative Controls

The permanent probe covers unauthenticated tenant creation through the RSS-2.2 probe, forbidden signup ID/role/organization fields, duplicate and concurrent identity, no secret response fields, logout invalidation, demo denial, cross-tenant denial, first-organization failure, and replay/retry behavior.

## 28. Regression Results

Passed: TypeScript, Prisma validation, migration status, production build, authentication, active organization, organization switching, RSS-2.1, RSS-2.2, TODO-078 RBAC, RSS-2.3 permanent probe, RSS-1.2S1/S2/S3/S4, server persistence, persistence boundary, OIP Benchmark v1 (1000/1000), and Developer Demo integrity (PASS_WITH_FINDINGS; zero release-blocking findings).

## 29. Data Integrity

All RSS-2.3 tests use disposable identities and tenant IDs with `finally` cleanup. The browser fixture was removed after verification. Developer Demo integrity reported `protectedOrganizationsUnchanged: true` with identical before/after digest `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`.

## 30. Remaining Limitations

Email verification, password-reset redesign, invitations/member administration, cross-tab active-context synchronization, broad onboarding tutorials, billing/subscription onboarding, and historical ownership reconciliation remain outside RSS-2.3 scope.

## 31. Recommendation

Accept RSS-2.3 and take RSS-2.4 only as a separately scoped follow-up. Do not alter the certified tag or retrofit mature/demo ownership as part of this work.

## 32. Final Verdict

`ACCOUNT_AND_FIRST_ORGANIZATION_ONBOARDING_VERIFIED`

| Lifecycle Step | Expected | Actual | Result |
|---|---|---|---|
| Create account | Durable secure account | User plus hashed password/session transaction | PASS |
| Initial state | Zero organizations | Empty membership list and active context | PASS |
| First tenant | Server-owned Owner provisioning | RSS-2.2 tenant and Owner role | PASS |
| Enter product | Active clean workspace | RSS-2.1 selection and empty workspace | PASS |
| Return visit | Durable lifecycle state | Refresh and logout/login restore correct state | PASS |

| Security Scenario | Expected | Actual | Result |
|---|---|---|---|
| Secret exposure | No password/hash/token in response | Safe user DTO only | PASS |
| Duplicate identity | Safe rejection | 409 and one identity | PASS |
| Concurrent identity | One account | One 201, one 409 | PASS |
| Privileged input | Rejected | ID/role/org fields return 400 | PASS |
| Tenant isolation | Non-member denied | Arbitrary/cross-tenant reads return 403 | PASS |
| Provisioning failure | No partial state, retry possible | Controlled DB failures roll back and retry | PASS |

| New Account Resource | Expected Initial State | Actual | Result |
|---|---|---|---|
| Organizations/memberships | 0 | 0 | PASS |
| Knowledge/tickets/candidates | 0 | 0 | PASS |
| Validations/memory/evidence/patterns | 0 | 0 | PASS |
| Owner membership after first tenant | 1, new tenant only | 1 Owner membership | PASS |
