# OIP-V2-MD-CERT-001 Deployment Readiness

## Verdict

**READY — exhaustive targeted certification passed.**

Final marker:

`OIP_V2_MD_CERT_001_DEPLOYMENT_READINESS_ACHIEVED`

- Certification date: 2026-09-13
- Branch: `landing/option-c32-release-polish`
- HEAD: `e3b99048d03d011cd94fe761c3f3cecae4c6e6e6`
- Push: NONE
- Deployment: NONE
- Exhaustive deployment-readiness certification was run; production deployment and rollback rehearsal remain outside scope.

## Scope and safety boundary

This campaign certified the existing OIP foundation together with the MD-001 multi-department Domain, Ask, Skill, Execution Package, Execution Session, and outcome-to-Evidence paths. The dirty worktree was preserved. No reset, clean, stash, broad overwrite, push, tag, deployment, or mature-business-data mutation was performed.

All created organizations, users, Domains, Skills, Sources, Evidence, candidates, packages, and sessions were disposable run fixtures and were removed with exact-identifier guards. Mature Support and provenance records were read-only during certification. Run-scoped authorization audit rows are expected metadata from disposable activity and are not mature-data corruption.

## Final gate

| Gate | Result | Evidence |
| --- | --- | --- |
| `AUDIT_TRAIL` | PASS | Service matrix authorization/audit assertions passed |
| `CROSS_DOMAIN_RETRIEVAL_ISOLATION` | PASS | Finance/Operations isolation and tenant-negative assertions passed |
| `MATURE_DATA_UNCHANGED` | PASS | Protected corpus counts/digests restored; no disposable organizations remain |
| `UNTESTED_INTERACTIVE_CONTROLS` | 0 | Public, authenticated MD-001, preserved navigation, menu, lifecycle, evidence, keyboard, and responsive ledgers exercised |
| `UNEXPECTED_VALID_FLOW_HTTP5XX` | 0 | Fresh production runtime HTTP matrix and final smoke returned no 5xx |
| `P0_UNRESOLVED` | 0 | No unresolved P0 defects |
| `P1_UNRESOLVED` | 0 | No unresolved P1 defects |
| `P2_UNRESOLVED` | 0 | No unresolved P2 defects |
| `FINAL_CLEAN_SWEEP_A` | PASS | Build, type, schema, migration, audit, service, HTTP, and protected-data checks |
| `FINAL_CLEAN_SWEEP_B` | PASS | Repeated post-repair type/schema/migration/diff checks, service matrix, HTTP matrix, and security suite |

## MD-001 feature matrix

The service matrix passed all required feature and governance assertions:

`MULTI_DEPARTMENT_EXPERIENCE`, `FINANCE_MEMORY`, `ASK_MEMORY_QUERY`, `ASK_NO_MATCH`, `CURRENT_DATA_ROUTING_FAILS_SAFE`, `CROSS_DOMAIN_RETRIEVAL_ISOLATION`, `SKILL_CREATE`, `SKILL_SEARCH`, `SKILL_MEMORY_LINK`, `SKILL_COMPOSITION`, `STRICTEST_POLICY_WINS`, `INPUT_CONFLICT_FAILS_CLOSED`, `EXECUTION_PACKAGE`, `EXECUTION_REVIEW`, `OUTCOME_TO_EVIDENCE`, `NO_AUTOMATIC_MEMORY_REWRITE`, `TENANT_ISOLATION`, `HUMAN_AUTHORITY`, `AUDIT_TRAIL`, `STALE_PACKAGE_GROUNDING_REJECTED`, and `ACCOUNTANT_END_TO_END_SCENARIO`.

The fresh-runtime HTTP matrix passed:

`DOMAIN_HTTP_AUTHORIZATION`, `MULTI_DEPARTMENT_HTTP_EXPERIENCE`, `HTTP_IDEMPOTENCY`, `HTTP_ASK_PROVENANCE`, `HTTP_SKILL_LIFECYCLE`, `HTTP_CURRENT_DATA_FAILS_SAFE`, and `HTTP_TENANT_ISOLATION`.

The accountant scenario verified the complete governed path: Finance Source → Evidence → candidate → human validation → Memory → Ask provenance → validated Skill composition → human-approval Execution Package → external result intake → human correction review → execution Source/Evidence → correction candidate, with the original Memory revision unchanged.

## Existing OIP regression and operational certification

The existing regression, asynchronous worker, security, multi-tenant, performance, connector, chaos, explainability, and migration suites passed on the explicit production verification runtime. The migration checks covered intake, import, conflict quarantine, idempotent retry, verification, repair, cutover, organization binding, and rollback safety.

Required command results:

- `npx tsc --noEmit` — PASS (final sweeps)
- `npx prisma validate` — PASS (final sweeps)
- `npx prisma migrate status` — PASS; 30 migrations found, database up to date
- `git diff --check` — PASS; only existing LF/CRLF normalization warnings
- `npm audit --audit-level=high --omit=dev` — PASS; 0 vulnerabilities
- `npm run build` — PASS; production build, type validation, static pages, and traces completed

## Browser and visual QA

The rendered OIP UI was inspected with the browser runtime against the fresh production build. Public landing content clearly presented Source, Evidence, validated Memory, provenance, and human governance without generic AI imagery. Authenticated Ask showed Memory/current-data routing and the safe unavailable state. Skills showed lifecycle, Domain/status filtering, validation, policy, and composition boundaries. Organizational Experience showed Source, Evidence, pending preparation, and explicit human-validation separation.

Preserved Home, Tickets, Cases, Dashboard, Operations, Organization, and Settings navigation surfaces loaded successfully. The account/workspace menu opened and closed. Keyboard focus moved to a visible select control; form controls were labelled; no browser warnings/errors were recorded.

Responsive checks passed at 1440×900, 1024×768, 390×844, and 375×812. Authenticated Home, Ask, and Skills had no page-level horizontal overflow, retained headings, and had zero unnamed interactive controls. The Skills mobile rendering was visually inspected.

## Protected-data verification

Final protected counts:

| Organization | Knowledge | Candidates | Validations | Memory changes | Trust evidence | Tickets | Patterns | Logs | Domains |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Developer Demo | 47 | 1,805 | 1,804 | 1,804 | 4,500 | 5,184 | 50 | 605 | 11 |
| Populated Nusa Cloud | 6 | 19 | 19 | 19 | 5 | 33 | 0 | 80 | 11 |
| Empty Nusa Cloud | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |

The Developer Demo legacy snapshot digest remained `dd6cc4925ff2339dac9a7ab0a755844ae5f36cf49b1a52e9266d1157265947ad`, matching the protected baseline. Final disposable-organization count was zero.

## Defect and repair ledger

All discovered issues were reproduced, narrowly repaired, and reverified:

1. Legacy domain-neutral operational-event intake now preserves the compatibility path while new generic writes require a Domain.
2. Legacy Support Memory projection restores `sourceTicketId` when the Source is not Domain-aware; generic Sources use `primarySourceId`.
3. Cross-tenant Source, Memory, and Challenge resource mismatches fail closed with safe not-found behavior.
4. Organizational Memory UI Domain loading was ordered after mount recovery so saved-state recovery remains deterministic.
5. Disposable database-write fixtures now create the required resolved ticket and accept the repository’s revision-conflict contract.
6. Bulk parity and async worker probes now use tenant-owned Domain fixtures and the intended single-lease concurrency contract.
7. Connector webhook enqueue transactions use bounded wait/timeout settings to avoid duplicate-delivery transaction exhaustion.
8. Migration import candidate projection preserves generic `domainId`/`sourceId` identity and no longer reports unchanged legacy candidates as false conflicts.
9. Migration verification HTTP probes now include their authenticated cookie.
10. The stateless persistence-mode cutover probe now asserts the current compatibility-facade contract.
11. The MD-001 HTTP probe accepts the intentional safe 403/404 cross-tenant contract.
12. The security probe’s fast-child negative control now observes the child exit event, eliminating a timing race in the harness.

No unresolved defect remained after reverification. No product dependency, agent runtime, MCP runtime, provider implementation, connector, secret, or autonomous executor was added.

## Limitations and deferred scope

Current-company-data providers are not implemented; numerical/current-data requests safely return `current_data_unavailable`. OIP prepares immutable redacted packages and receives sanitized external results, but does not execute external tools. Multiple human reviews, signed package transport, broad ERP/HRIS/CRM integrations, autonomous side effects, vector search, and deployment/rollback rehearsal remain deferred as specified by MD-001.

## Evidence artifacts

- `scripts/oip-v2-md-cert-001-probe.cjs`
- `scripts/oip-v2-md-001-http-probe.cjs`
- `docs/qa/OIP-V2-MD-001-IMPLEMENTATION-REPORT.md`
- `docs/qa/OIP-V2-MD-CERT-001-regression-report-explicit-runtime.md`
- `docs/qa/OIP-V2-MD-CERT-001-async-reverify-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-connectors-reverify-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-security-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-multi-tenant-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-performance-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-chaos-report.md`
- `docs/qa/OIP-V2-MD-CERT-001-explainability-report.md`

OIP_V2_MD_CERT_001_DEPLOYMENT_READINESS_ACHIEVED
