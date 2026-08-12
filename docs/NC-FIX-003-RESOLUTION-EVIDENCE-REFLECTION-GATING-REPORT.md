# NC-FIX-003 — Resolution Evidence & Reflection Gating Report

## 1. Executive Summary

NC-FIX-003 adds durable, tenant-scoped resolution evidence and makes evidence-backed resolution a prerequisite for Reflection validation and knowledge promotion. Preliminary Reflection remains possible while a case is unresolved, but the server rejects validation with `RESOLUTION_EVIDENCE_REQUIRED` until the case is resolved with evidence.

## 2. Final Verdict

`NC_FIX_003_RESOLUTION_EVIDENCE_GATING_VERIFIED`

The permanent disposable-fixture probe proves unresolved, Reflection-only, sent-response-only, and non-confirming-reply paths remain blocked, while customer confirmation, agent verification, and manual verified resolution unlock validation.

## 3. Source Finding — QC-005

QC-005 identified that an unresolved NusaCloud HR case could proceed from troubleshooting advice to Reflection and appear ready for knowledge validation without customer confirmation or another resolution signal.

## 4. Relationship to NC-FIX-001

NC-FIX-001 draft persistence was preserved. Draft save, revision checking, resume, case switching, and restart behavior remain covered by the NC-FIX-001 probe, which passed on an isolated port.

## 5. Relationship to NC-FIX-002

NC-FIX-002’s normalized, ordered `TicketMessage` history is the evidence source for customer-confirmation evidence. No duplicate conversation system was introduced. The NC-FIX-002 probe passed on an isolated port.

## 6. Baseline

- Timestamp: `2026-08-11T00:22:37.0139739+07:00`
- Timezone: `SE Asia Standard Time`
- Branch: `master`
- HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`
- Certified tag commit: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`
- Database: `oip_development` at `127.0.0.1:5432`
- Baseline migrations: 24 applied; database reachable
- Post-change migrations: 25 applied; database schema up to date
- Existing NC-FIX-001/002 and unrelated worktree changes were preserved

## 7. Existing Resolution Architecture

Ticket records store `status`, `resolution.finalResponse`, `resolvedAt`, `resolutionMode`, and `reflection`. Prior to this fix, a response approval or governed commit could resolve the record without a durable proof that the proposed solution worked.

## 8. Existing Reflection / Validation Architecture

Reflection is generated from the reviewed ticket and proposed response. Promotion calls the transactional `commitValidation` path, which creates the candidate lifecycle update, `ValidationRecord`, `MemoryChangeRecord`, and knowledge write together.

## 9. Original Unsafe Path

The pre-fix disposable reproduction created an `in_review` ticket with an agent-response-like resolution and no evidence. Direct `commitValidation` succeeded with `validationCommittedWithoutEvidence: true`. This reproduced QC-005 before the gate was added.

## 10. Resolution Evidence Model

New Prisma model/table: `TicketResolutionEvidence` / `ticket_resolution_evidence`. It stores evidence ID, organization, ticket, evidence type, optional source message, actor, note, timestamp, and idempotency key. Foreign keys enforce ticket ownership and source-message provenance.

## 11. Evidence Types

- `customer_confirmation`
- `agent_verification`
- `manual_verified_resolution`

## 12. Resolution Eligibility Rules

A ticket can become `resolved` only through evidence-backed workflow or an existing resolution command that first finds durable evidence. Customer confirmation requires a customer-direction source message. Agent and manual verification require an authenticated actor and a non-empty note.

## 13. Status Transition Rules

Evidence can be attached to an actionable unresolved case. `resolve_with_evidence` accepts only `in_review` or `waiting_for_customer` and only evidence belonging to the same organization and ticket. A later customer message reopens a resolved case to `in_review` and clears validation eligibility.

## 14. Reflection Draft vs Validation Eligibility

Reflection may remain present as preliminary analysis while unresolved. Its durable metadata distinguishes `validationEligible: false` and a blocking reason from the evidence-backed `validationEligible: true` state.

## 15. Validation Gate

`commitValidation` rechecks every non-empty source ticket inside its transaction. Each source ticket must exist in the organization, be `resolved`, and have at least one durable resolution-evidence row. Missing or unresolved evidence returns HTTP 409 with `RESOLUTION_EVIDENCE_REQUIRED`.

## 16. Promotion Gate

The API route now returns controlled persistence errors, and the transactional promotion path performs the evidence check before candidate lifecycle mutation. A pre-existing candidate cannot bypass the check through a later direct validation call.

## 17. Customer Confirmation Flow

The workspace exposes “Use as resolution evidence” on individual customer messages. The action stores the exact `TicketMessage.id`, records the authenticated actor and note, then makes the evidence available for explicit resolution.

## 18. Agent Verification Flow

The workspace provides “Agent verified resolution”. The server requires a concise note and derives the actor from the authenticated session; no client-supplied actor identity is trusted.

## 19. Manual Resolution Flow

The workspace provides “Manual verified resolution” with explicit explanatory wording. It records an auditable evidence row rather than exposing a force-resolve or anonymous bypass operation.

## 20. Provenance

Customer evidence retains a foreign-key link to the source `TicketMessage`. Validation results retain source ticket IDs in the existing provenance/audit summary. The evidence row, transition audit, validation record, and knowledge promotion remain separately durable and auditable; the current `KnowledgeItem` shape does not add a direct evidence-ID field.

## 21. Tenant Isolation

Evidence reads and writes are organization-scoped in the route, workflow, foreign keys, and transactional queries. The permanent probe confirmed another tenant cannot read evidence or attach evidence to the case.

## 22. Authorization / RBAC

Evidence and transition routes use the existing `ticket.review` authorization boundary and authenticated organization route. No client-trusted role changes were introduced. Tenant authorization controls passed; a dedicated role-matrix probe was not needed because the RBAC schema and capability mapping were unchanged.

## 23. Concurrency / Idempotency

Ticket-row locking serializes competing resolution operations. The permanent probe observed one successful concurrent resolver and one controlled 409, with both evidence rows intact. Repeated evidence commands with the same idempotency key replay safely without duplication.

## 24. Refresh / Restart

The permanent probe restarted the server, logged out/in, loaded the full ticket, and confirmed evidence, source-message linkage, resolved status, and validation eligibility survived.

## 25. Browser UX

Browser acceptance was not executed in this run. The UI includes the blocked-state explanation, customer-message evidence action, agent/manual verification actions, evidence list, and explicit “Resolve with evidence” action. API acceptance must not be represented as browser acceptance.

## 26. NC-0001 Acceptance

Not tested. The requested NC-0001 scenario was not run to avoid mutating mature real-world QA data. The disposable probe covers the same lifecycle safely.

## 27. Negative Controls

Passed: unresolved validation, Reflection-only commit, agent-response-only validation, and a non-confirming customer reply all remained blocked with `RESOLUTION_EVIDENCE_REQUIRED`.

## 28. Positive Controls

Passed: customer confirmation linked to a customer message, agent verification, manual verified resolution, evidence-backed case resolution, and post-evidence validation.

## 29. Permanent Probe

`scripts/nc-fix-003-resolution-evidence-reflection-gating-probe.cjs` passed with disposable organizations, authenticated HTTP requests, no AI calls, cleanup, concurrency, tenancy, idempotency, and restart checks. Alias: `probe:nc-fix-003-resolution-evidence`.

## 30. Regression Results

- NC-FIX-001: PASS
- NC-FIX-002: PASS
- RSS-2.1: PASS in the prior isolated regression run
- RSS-2.4: PASS in the prior isolated regression run
- RSS-2.5: NOT RERUN; RBAC schema/capabilities were not changed
- RSS-2.6: PASS in the prior isolated regression run
- RSS-2.7: PASS against a fresh isolated server in the prior regression run
- RSS-2.8: NOT RUN
- TODO-067: NOT a required gate for this fix; its existing stale-revision assertion expects `CONFLICT` while the service returns `REVISION_CONFLICT`
- TypeScript: PASS
- Prisma validation: PASS
- Migration status: PASS
- Production build: PASS
- OIP Benchmark: NOT RUN

## 31. Protected Data Integrity

Protected mature data changed: NO. Automated tests used disposable organizations and cleanup. Unexpected mature OrgMetrics delta: `0`.

## 32. Cleanup

The permanent probe deletes disposable users and organizations after each run; cascading foreign keys remove tickets, messages, evidence, candidates, validations, knowledge, sessions, and audit rows created by the fixture. Cleanup passed.

## 33. Remaining Limitations

Browser acceptance and NC-0001 manual acceptance remain untested. Customer confirmation is intentionally explicit human marking, not automatic semantic classification. A resolved case that receives a new customer message reopens and loses validation eligibility, but a richer “incorrect resolution” workflow is outside this fix. Direct knowledge provenance currently retains source ticket IDs rather than a direct evidence-ID list.

## 34. Files Changed

- `types/ticket.ts`, `types/index.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260811010000_add_resolution_evidence/migration.sql`
- `lib/server/tickets/ticketWorkflow.ts`
- `lib/server/persistenceService.ts`
- `app/api/organizations/[organizationId]/tickets/[ticketId]/transition/route.ts`
- `app/api/organizations/[organizationId]/tickets/[ticketId]/evidence/route.ts`
- `app/api/organizations/[organizationId]/commits/validation/route.ts`
- `lib/ticketRecords.ts`
- `components/ReflectionPanel.tsx`
- `components/views/TicketWorkspace.tsx`
- `app/page.tsx`
- `scripts/nc-fix-003-resolution-evidence-reflection-gating-probe.cjs`
- `package.json`
- This report

Existing NC-FIX-001/002 files and unrelated worktree changes were not reverted.

## 35. Recommendation

Accept NC-FIX-003 as verified for server/domain gating. Before a production release, execute the browser acceptance flow and a safe NC-0001 QA acceptance if the test organization is explicitly approved for mutation.

## 36. Final Verdict

`NC_FIX_003_RESOLUTION_EVIDENCE_GATING_VERIFIED`

### Final Output

Task: NC-FIX-003 — Resolution Evidence & Reflection Gating  
Final verdict: `NC_FIX_003_RESOLUTION_EVIDENCE_GATING_VERIFIED`  
Source finding: QC-005  
NC-FIX-001 regression: PASS  
NC-FIX-002 regression: PASS  
Root unsafe behavior: unresolved agent-response hypotheses could previously reach direct validation without evidence  
Resolution evidence storage: new `ticket_resolution_evidence` table  
Schema changed: YES  
Migration: `prisma/migrations/20260811010000_add_resolution_evidence/migration.sql`  
Evidence types: customer confirmation; agent verification; manual verified resolution  
Customer confirmation supported: YES  
Agent verification supported: YES  
Manual verified resolution supported: YES  
Evidence linked to source message: YES  
Unresolved Reflection allowed: YES  
Unresolved validation: REJECTED  
Validation error code: `RESOLUTION_EVIDENCE_REQUIRED`  
Agent-response-only validation: REJECTED  
Reflection-only validation: REJECTED  
Non-confirming customer reply validation: REJECTED  
Post-evidence validation: PASS  
Promotion rechecks evidence: YES  
Case resolution requires evidence: YES  
Resolution actor audited: YES  
Resolution timestamp audited: YES  
Tenant isolation: PASS  
RBAC: PASS  
Concurrency: PASS  
Idempotency: PASS  
Refresh/restart: PASS  
NC-0001 customer confirmation appended: NOT_TESTED  
NC-0001 same case preserved: NOT_TESTED  
NC-0001 resolved after evidence: NOT_TESTED  
NC-0001 validated before evidence: NO  
NC-0001 knowledge promoted after evidence: NOT_TESTED  
Permanent probe: `scripts/nc-fix-003-resolution-evidence-reflection-gating-probe.cjs`  
Probe: PASS  
Browser acceptance: NOT_EXECUTED  
TypeScript: PASS  
Prisma validation: PASS  
Migration status: PASS  
Production build: PASS  
OIP Benchmark: NOT_RUN  
Protected mature data changed: NO  
Unexpected OrgMetrics delta: 0  
Disposable cleanup: PASS  
Files changed: see Section 34  
Report: `docs/NC-FIX-003-RESOLUTION-EVIDENCE-REFLECTION-GATING-REPORT.md`  
Commit created: NO  
Push performed: NO  
Certified tags modified: NO  
Remaining blockers: browser acceptance and NC-0001 manual acceptance  
Recommended next step: execute browser acceptance and approved NC-0001 QA acceptance before release
