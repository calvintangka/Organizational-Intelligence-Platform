# RSS-2.4 — Demo Organization Isolation Report

Date: 2026-08-09
Branch: `master`
Baseline HEAD: `4792e10ee2ef075b0d7e10287fb4ceff583b3941`
Certified baseline: `v0.1.0-certified` dereferences to `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba`.

## 1. Executive Summary

RSS-2.4 confirms that demo access is explicit and membership-authorized. A fresh RSS-2.3 customer receives no demo membership, cannot read or select any mature demo tenant, and receives only its own server-created organization. Existing development memberships remain usable. No production code rewrite or demo flag was necessary.

## 2. Final Verdict

`DEMO_ORGANIZATION_ISOLATION_VERIFIED`

## 3. Background

RSS-2.0 identified seeded memberships as the historical reason development users saw mature organizations. RSS-2.1, RSS-2.2, and RSS-2.3 supplied server authorization, owned creation, and customer onboarding. RSS-2.4 formalizes the boundary and adds permanent negative coverage.

## 4. Documentation Reviewed

Reviewed the RSS-2.0 through RSS-2.3 reports, authentication/session, RBAC, tenant authorization, persistence, seed/bootstrap, security, RSS-1.2S1/S3, RSS-1.3/RSS-1.4, TODO-078, production configuration, changelog, and known limitations.

## 5. Baseline

The certified tag was not changed. Prisma reported 23 migrations and an up-to-date database. The mature protected-state digest was captured before and after the acceptance probe. The working tree remains intentionally post-certified and uncommitted.

## 6. Demo Organization Inventory

The persistent mature demo set is OIP Developer Demo, FastDrop Logistics, and Maesa Tech. `profile-pramana-legal` is a protected seed-profile identifier without a current persisted organization row; `test-oip-regression` is an explicit regression fixture, not customer bootstrap data.

| Demo Organization | Purpose | Creation Path | Membership Path | Special Logic |
|---|---|---|---|---|
| `profile-oip-developer-demo` | Mature fictional OIP demo | `seed:developer-demo-foundation`, then `seed:developer-demo-mature` | Synthetic actors plus configured development account | Exact-target, create-only mature seed |
| `profile-fastdrop-logistics` | Historical mature development tenant | Existing foundation/fixture provisioning | Explicit development-membership seed | Protected mature ID; no customer fallback |
| `profile-maesa-tech` | Historical mature development tenant | Existing foundation/fixture provisioning | Explicit development-membership seed | Protected mature ID; no customer fallback |
| `profile-pramana-legal` | Seed/profile and protected historical reference | Static profile/fixture paths | No current persisted membership | Protected ID only; not attached automatically |
| `test-oip-regression` | Deterministic test tenant | `seed:test-organization` operator command | Preserves existing/explicit development membership | TEST_ONLY fixture; outside customer onboarding |

## 7. Demo Creation Paths

The developer-demo foundation command is server/database-only, exact-target guarded, create-only, and idempotent. The mature command writes only the exact Developer Demo and aborts if mature rows already exist. The development-membership script inserts only the configured `AUTH_DEVELOPMENT_USER_EMAIL` into named mature IDs with `ON CONFLICT DO NOTHING`. The regression seed is an explicit test command. No API route or application startup hook invokes these commands.

## 8. Demo Membership Provisioning

Membership is the authority. The normal organization list queries `organizations WHERE memberships.some(userId)`, and organization routes call `requireCapability`, which resolves membership and RBAC server-side. Signup, empty organization lists, missing active context, and onboarding failures do not create memberships.

## 9. Development Account Analysis

The configured development account has explicit durable memberships in all three mature organizations. Current database inventory showed 9 Developer Demo memberships and 1 membership each in FastDrop and Maesa; no ownership reconciliation was attempted. Existing role assignments were preserved. The probe creates only a temporary session and verifies switching across all three.

## 10. New Customer Isolation

A fresh signup began with zero memberships and an empty authorized organization list. Direct requests for each demo profile and protected resource returned 403. After first-organization creation, the customer had exactly its own Owner membership and still had no demo access.

## 11. Zero-Organization Fallback Analysis

No customer page source contains a demo organization ID or fallback branch. RSS-2.3 explicitly renders onboarding when `authorizedProfiles.length === 0`. The server returns an empty list and a null active organization for a valid zero-member account; it does not fabricate or select a demo.

## 12. Active-Organization Fallback Analysis

`getActiveOrganizationForCurrentUser` selects only an authorized membership. A null, missing, invalid, or non-member active reference resolves to the first authorized membership, or null when none exists. `setActiveOrganizationForCurrentUser` validates existence, membership, and capability, so a known demo ID without membership returns 403.

## 13. Seed Re-Execution Safety

The permanent probe re-ran the explicit development-membership seed after creating a disposable customer and verified the customer membership set was unchanged. The seed has no query path that assigns memberships to arbitrary signup users. Mature demo seed services are create-only and exact-target guarded; they are not startup hooks.

## 14. Production Environment Analysis

All demo provisioning paths are `EXPLICIT_OPERATOR_ACTION` or `TEST_ONLY`, not automatic production startup behavior. Production signup invokes only the auth and organization APIs and has no dependency on seed state. The probe verifies the built production server independently of seed commands.

## 15. Demo Classification

No schema flag was added. Known demo/protected identifiers and exact-target seed guards already provide reliable operator classification, while authorization remains membership-based. A demo label is not treated as permission.

## 16. Demo Data Copy Audit

RSS-2.2 creates a new server-generated `org-<uuid>` with empty metrics and sequence rows and does not copy mature profiles, knowledge, candidates, validations, memory, evidence, lessons, tickets, patterns, or AI configuration. The probe verified all customer resource counts were zero. A customer display name equal to `OIP Developer Demo` still produced a different durable ID and empty tenant.

## 17. API Authorization

For each mature demo, a zero-demo customer was denied the organization profile, knowledge, candidates, validations, memory, metrics, patterns, and tickets endpoints. These are direct HTTP checks; UI hiding is not part of the assertion.

## 18. Switching Authorization

The same customer received 403 from `PUT /api/auth/active-organization` for every demo ID. The explicitly authorized development session switched to Developer Demo, FastDrop, and Maesa successfully and could read the corresponding knowledge endpoint.

## 19. ID / URL Spoofing

Knowing `profile-oip-developer-demo`, `profile-fastdrop-logistics`, or `profile-maesa-tech` provides no authority. Signup rejects injected identity fields, and organization creation ignores client IDs entirely; a same-name customer organization receives a server-generated `org-` ID.

## 20. Customer Tenant Isolation

The first customer tenant had one Owner membership, its own profile, and zero knowledge, candidates, validations, memory, evidence, tickets, or patterns. No demo rows were copied and no demo membership was attached.

## 21. Multi-Customer Verification

RSS-2.3 and RSS-2.4 disposable customers begin with zero memberships, own only explicitly created tenants, and are cleaned in `finally`. Cross-account and cross-tenant authorization remain covered by the RSS-2.3 and RSS-2.2 probes; no shared demo context exists.

## 22. Existing Development Access

The permanent probe used a temporary session for the configured development account, retained all three explicit mature memberships, switched each active context, and read each authorized demo resource successfully. No membership or role was deleted.

## 23. Membership Mutation Analysis

There is no public self-service membership mutation route that lets an ordinary customer add itself to a demo. Organization creation assigns only the authenticated creator to a newly generated organization. Existing role/membership APIs remain capability-protected and were covered by TODO-078/RSS-1.2 probes.

## 24. Name / Identifier Collision

Duplicate display names are allowed as separate tenants. A customer organization named `OIP Developer Demo` did not collide with the durable demo ID and did not inherit demo content. Security never relies on display names.

## 25. Failure Fallback

A controlled membership-insert failure during first-organization provisioning returned a safe 500, left the account valid with zero organizations, returned a null active context, and did not select any demo. RSS-2.3 separately verifies retry after the controlled failure.

## 26. Session / Restart Verification

RSS-2.3 verified zero-organization persistence across a controlled Next.js restart and refresh. RSS-2.4 also verified that the customer/demo boundary is membership-backed rather than browser-local. Logout/login and hard-refresh behavior remain covered by RSS-2.3.

## 27. Security Review

No implicit demo authorization, client-only restriction, seed privilege escalation, active-context bypass, organization-ID spoofing, or demo/customer data copy path was found. Direct API checks and the shared authorization wrapper enforce the boundary server-side.

## 28. Negative Controls

The permanent probe proves zero demo memberships after signup, denial of all three demo APIs, denial of demo active selection, no known-ID authority, empty owned tenant, seed replay safety, invalid active context without fallback, failed onboarding without fallback, display-name separation, and explicit development access.

## 29. Regression Results

RSS-2.1, RSS-2.2, RSS-2.3, authentication, active organization, organization switching, TODO-078 RBAC, RSS-1.2S1/S2/S3/S4, persistence, TypeScript, Prisma validation, migration status, production build, OIP Benchmark v1, and Developer Demo integrity passed. Developer Demo integrity retained its known non-blocking historical findings with zero release-blocking findings.

## 30. Data Integrity

The RSS-2.4 probe hashes organizations, memberships, role assignments, authorities, profiles, metrics, sequences, and all mature organization-owned resource tables before and after execution. The digest was unchanged. Append-only authorization audit telemetry generated by the security checks is intentionally not part of the business-state digest. Disposable users, sessions, organizations, and trigger fixtures were removed; no mature demo organization was deleted or recreated.

## 31. Remaining Limitations

RSS-2.4 does not implement invitations, member administration, historical ownership reconciliation, organization deletion, billing, cross-tab synchronization, or broader lifecycle UX. The static legacy profile catalog remains available to prototype/local paths, but it is not an authorization source or customer bootstrap path.

## 32. Recommendation

Accept RSS-2.4. Keep demo provisioning as explicit operator/test actions and preserve membership-based server authorization. Do not add a redundant demo flag or alter mature ownership as follow-up work.

## 33. Final Verdict

`DEMO_ORGANIZATION_ISOLATION_VERIFIED`

| Demo Organization | Creation Path | Membership Path | Customer Accessible? |
|---|---|---|---|
| OIP Developer Demo | Exact-target foundation + create-only mature seed | Explicit synthetic/development membership | No |
| FastDrop Logistics | Existing mature fixture/foundation path | Explicit development membership | No |
| Maesa Tech | Existing mature fixture/foundation path | Explicit development membership | No |

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Fresh signup | 0 demo memberships | 0 | PASS |
| Zero-org active context | Onboarding/null, never demo | Null | PASS |
| Demo resource URLs | Server denial | 403 for all three demos/resources | PASS |
| Demo active selection | Server denial | 403 | PASS |
| First customer tenant | Own Owner, empty data | One owned empty tenant | PASS |
| Seed replay | No customer mutation | Customer memberships unchanged | PASS |
| Failed onboarding | Valid zero-org account, no fallback | 500 + empty/null state | PASS |
| Explicit development access | Existing memberships continue | All three switch/read checks pass | PASS |
| Protected mature state | Before/after equal | Digest unchanged | PASS |

| Demo Resource | Customer Access | Authorized Dev Access | Result |
|---|---|---|---|
| Organization profile | 403 | 200 | PASS |
| Knowledge | 403 | 200 | PASS |
| Tickets/metrics/audit resources | 403 | Membership/capability authorized | PASS |
