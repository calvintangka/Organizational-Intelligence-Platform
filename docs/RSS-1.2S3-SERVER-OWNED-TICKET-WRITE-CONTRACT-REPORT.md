# RSS-1.2S3 — Server-Owned Ticket Write Contract Report

**Audit date:** 2026-08-06
**Audit type:** Remediation + independent verification of RSS-1.2S0 Critical Finding #3
**Final verdict:** **SERVER_AUTHORITY_ENFORCED**
**Release recommendation:** **READY TO RESUME RELEASE STABILIZATION**

## 1. Executive Summary

RSS-1.2S0 confirmed that a Support Agent could forge `status=resolved`, `actorId`, `resolutionMode=human`, `resolution`, `reflection`, `validationRecordIds`, `classification`, and `memoryMatch` through the compatibility ticket PUT, and that those values became durable server state. That breaks OIP's core guarantee that every decision is attributable and every audit record represents what actually happened.

RSS-1.2S3 establishes a strict server-owned ticket write contract. The client may write only its own facts (`ticketId`, `orgId`, `rawMessage`, `subject`, and bulk idempotency metadata); every server-owned field is rejected with `AUTHORITY_FIELD_REJECTED` and never reaches the database. All authoritative fields — actor, organization, status, timestamps, resolution mode, classification, memory references, review state, trust links, validation references — are derived server-side from the authenticated session, the authenticated organization, the deterministic workflow, and the server clock. Interactive ticket processing now runs on the server; workflow decisions (approve, discard, reinstate, language review, analysis attachment, governed commit) execute through a server-owned transition endpoint that validates transitions and org-scoped references and writes durable transition-audit evidence.

The RSS-1.2S3 probe verified every forgery target in the audit is rejected with the database unchanged, cross-tenant identifiers are rejected, legitimate writes produce server-derived authority, transitions are validated and audited, and all disposable data is restored. The full regression suite passes.

## 2. Root Cause

The compatibility route `PUT /api/organizations/[organizationId]/tickets` (and the generic `[resource]` tickets writer) accepted a full `TicketRecord[]` from the client and persisted it verbatim through `saveTicketRecords` → `upsertTicketRecordTx` → `toTicketColumns`. Because every `TicketRecord` field mapped straight to a DB column, a client-supplied `status`, `actorId`, `resolutionMode`, `resolution`, `reflection`, `validationRecordIds`, `classification`, or `memoryMatch` became durable state. The RSS-1.2S0 probe persisted a forged `resolved`/`human`/`forged-owner-id` ticket exactly as supplied.

The interactive single-ticket and bulk pipelines also ran client-side, computing and persisting authoritative-looking state through the same raw PUT.

## 3. Ownership Matrix

| Field | Owner | Client writable | Server derived |
| --- | --- | --- | --- |
| `ticketId` | Client | Yes | No (validated) |
| `orgId` | Server | No (must match authenticated org) | Yes (from authenticated organization) |
| `rawMessage` | Client | Yes | No |
| `subject` | Client | Yes | No |
| `bulkUploadKey` / `bulkEntryId` | Client | Yes (idempotency metadata) | No |
| `actorId` | Server | No | Yes (from authenticated session) |
| `status` | Server | No | Yes (from workflow state) |
| `resolutionMode` | Server | No | Yes (from deterministic workflow) |
| `resolution` | Server | No | Yes |
| `reflection` | Server | No | Yes |
| `classification` | Server | No | Yes |
| `memoryMatch` / `knowledgeId` | Server | No | Yes (validated org-scoped reference) |
| `validationRecordIds` | Server | No | Yes (validated org-scoped reference) |
| `labels` | Server | No | Yes |
| `draftSource` | Server | No | Yes |
| `createdAt` / `updatedAt` | Server | No | Yes (server clock) |
| `intakeMode` | Server | No | Yes |
| `bulkClusterId` | Server | No | Yes |
| `processingIdempotencyKey` / `processingPayloadHash` / `processingRequestId` / `processingResult` | Server | No | Yes |
| `reviewedBy` / `validatedBy` | Server | No | Yes (transition audit actor) |
| `trustDelta` / `trustScore` | Server | No | Yes (memory/validation pipeline) |

No ambiguity remains: client-owned fields are the facts the customer provides; every decision and authority field is server-derived.

## 4. Request DTO Review

New explicit DTOs in `types/ticket.ts`:

- `ClientTicketRecord` — the only shape a client may write (`ticketId`, `orgId`, `rawMessage`, `subject`, `bulkUploadKey`, `bulkEntryId`).
- `TICKET_AUTHORITY_FIELDS` — the server-owned field list (17 fields) used for deterministic rejection.
- `TicketWorkflowCommand` — the bounded, server-executed transition commands.
- `TicketWriteError` — typed write-boundary errors (`AUTHORITY_FIELD_REJECTED`, `CROSS_ORGANIZATION_REJECTED`, `TICKET_NOT_FOUND`, `INVALID_TRANSITION`, `INVALID_TRANSITION_REFERENCE`).

The persistence model (`TicketRecord`) is no longer used as an HTTP request model for writes. `lib/server/tickets/clientTicketWrite.ts` validates client payloads (rejects any authority field, enforces tenant match) and builds server-authoritative records, so the compiler and runtime both prevent accidental authority leakage.

Policy decision (documented): unexpected server-owned fields are **rejected** with 400 `AUTHORITY_FIELD_REJECTED` — never silently ignored — so unexpected authority can never overwrite server-owned state, and forgery attempts fail observably.

## 5. Persistence Changes

- `saveClientTicketRecords(organizationId, actorId, records)` — the only client-facing ticket write. It validates each record, derives authority (actor from session, org from the route, status `open`, timestamps from the server clock, empty resolution/review/memory state), and persists with create/update separation.
- `upsertClientTicketTx` — on create inserts a full server-authoritative row; on update touches **only** `rawMessage`/`subject`, so server-owned columns are never overwritten by a client.
- The authoritative `saveTicketRecords` remains for server-side pipelines (`processTicket`, durable jobs, governed actions) which already pass server-computed data.
- New `ticket_transition_audits` table (migration `20260806020000_add_ticket_transition_audits`) records every server-owned transition: actor, action, previous/new status, summary, source, request/correlation ids, server timestamp.

## 6. Connector Review

Connector ingestion (`receiveWebhook` → `processConnectorInboundEvent` → `processTicket`) already runs server-side through the authoritative persistence port. Connectors provide customer facts (body, subject, external identifiers, event timestamps) and their identity is kept separate from human actor identity (`actorContext` = "Connector: <installation>"). No connector path writes review decisions, trust, knowledge, approval, or server actor; those originate only from the server pipeline or the transition endpoint. No change was required beyond the shared strict boundary already covering all client writes.

## 7. Bulk Upload Review

Bulk upload follows the identical rules:

- `prepareBulkTicketRecords` (server) creates prepared records with server-derived authority (open, server actor/timestamp) from client-provided seeds (`uploadKey`, `entryId`, `rawMessage`, `subject`).
- The bulk **analysis** attachment and **cluster validation commit** previously persisted full client-constructed records with `classification`, `memoryMatch`, `status: resolved`, `resolutionMode: human`, `reflection`, and `validationRecordIds`. These now execute through the server-owned `attach_analysis` and `commit` transitions, which validate structure and org-scoped references server-side and derive workflow state.
- The UI was updated to issue these transitions instead of raw PUTs.
- Imported historical actor/timestamps remain an explicitly governed import pathway (`migrationImportExecutionService` writes rows server-side with the package's original provenance) — not normal client authority.

## 8. Governed Action Review

Governed actions (`actionService`) write ticket labels and execute approved actions through the server-authoritative persistence path, with the approver/executor derived from the authenticated workflow. They were not altered by RSS-1.2S3; their records originate from authenticated workflow decisions, never from client PUT payloads. The new strict PUT cannot reach governed state (labels are a server-owned field and rejected).

## 9. Forgery Test Matrix

Verified by `node scripts/rss-1.2s3-server-owned-ticket-write-contract.cjs` (disposable orgs/users, all fixtures removed):

| Forgery attempt | Expected | Actual | Status | DB effect |
| --- | --- | --- | --- | --- |
| `status=resolved` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none (0 forged rows) |
| `status=approved` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `actorId=forged-admin` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `actorId=<random user>` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `resolutionMode=human` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `resolution={forged...}` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `reflection={approved,...}` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `classification={Forged...}` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `memoryMatch={forged knowledge}` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `validationRecordIds=["forged"]` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `labels=["forged"]` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `createdAt=1970` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `draftSource=ai_advisory` | reject | 400 `AUTHORITY_FIELD_REJECTED` | PASS | none |
| `orgId=<other organization>` | reject | 403 `CROSS_ORGANIZATION_REJECTED` | PASS | none |
| `attach_analysis` with foreign knowledge id | reject | 400 `INVALID_TRANSITION_REFERENCE` | PASS | none |
| `commit` with foreign validation id | reject | 400 `INVALID_TRANSITION_REFERENCE` | PASS | none |
| discard a resolved ticket | reject | 409 `INVALID_TRANSITION` | PASS | none |
| Viewer transition | reject | 403 (RBAC before transition) | PASS | none |
| Cross-tenant transition | reject | 403 | PASS | none |

Legitimate behavior verified: a client-owned write returns 200 and the DB row carries `actorId` = authenticated session user, `status=open`, `resolutionMode=null`, `classification=null`, `draftSource=null`, server-clock `createdAt`; a later fact update changes only `subject`/`rawMessage`; approve → `resolved`/`human` with the final response; attach_analysis → `in_review`; commit → `resolved` with reflection and validated references; language → reviewer override.

## 10. Multi-tenant Verification

- A client payload whose `orgId` differs from the authenticated organization is rejected with `CROSS_ORGANIZATION_REJECTED` (403) before any persistence.
- The transition endpoint scopes every lookup to the authenticated organization: a member of organization B cannot transition organization A's ticket (403 RBAC; and the ticket lookup would 404 if it somehow passed).
- `attach_analysis` and `commit` validate every `knowledgeId` and `validationRecordId` against the organization's own knowledge/validation store, so cross-tenant identifiers are rejected (`INVALID_TRANSITION_REFERENCE`).
- Transition audits record the authenticated actor for every transition.

## 11. Security Review

- **Workflow state:** clients can no longer write `status`/`resolutionMode`; only the server transition endpoint moves tickets, with transition validation against current state.
- **Actor identity:** `actorId` is always the authenticated session user (server-derived); the transition audit also records the acting user.
- **Organization identity:** `orgId` is always the authenticated organization; mismatches are rejected.
- **Approval/review state:** approval, reflection, and review metadata only change through `approve`/`commit`/`language` transitions with server authority.
- **Trust/knowledge/validation references:** every knowledge and validation reference is validated against the organization's own data.
- **Persistence:** the only client-facing write is `saveClientTicketRecords` (strict DTO); authoritative `saveTicketRecords` is reserved for server pipelines.
- **DTO separation:** `ClientTicketRecord` is the compile-time request model; `TicketRecord` is no longer the write request model.
- **Bulk/connector/migration:** all follow the same server-owned rules; historical import remains an explicit governed pathway.
- **Governed actions:** unchanged and server-authoritative.
- **No leak:** rejection responses expose only the safe `{ error: { code, message } }` envelope.

## 12. Performance Impact

The strict boundary adds per-write validation (field allowlist/tenant check, O(1)) and, for existing tickets, one indexed existence lookup before an update of client columns only. Transition commands add one read + one update + one audit insert per transition. Relative to ticket processing, AI latency, and transaction costs, the added work is negligible. Interactive processing moved from the browser to the server, which uses the same deterministic pipeline the durable worker uses.

## 13. Regression Results

| Regression | Result | Evidence |
| --- | --- | --- |
| TypeScript (`npx.cmd tsc --noEmit`) | PASS | Exit 0 |
| Prisma validation | PASS | Schema valid |
| Migration status | PASS | 22 migrations, database up to date |
| Production build (`npm run build`) | PASS | Exit 0 |
| RSS-1.2S0 security verification | PASS | Exit 0, data safety restored |
| RSS-1.2S1 AI authorization probe | PASS | All authorization branches passed |
| RSS-1.2S2 rate-limiting probe | PASS | All abuse-control scenarios passed (ticket writes updated to the client-owned contract) |
| RSS-1.2S3 write-contract probe (new) | PASS | All forgery/multi-tenant/transition/audit scenarios |
| TODO-078 RBAC | PASS | Exit 0 |
| TODO-082A / TODO-082C | PASS | Exit 0 |
| TODO-046 / TODO-080 / TODO-083 | PASS | Exit 0 |
| OIP Benchmark v1 | PASS | 1000/1000, 100% overall, 100% critical security |
| Authentication / membership probes | PASS | Exit 0 |
| Ticket application service (TODO-068), stateless persistence (TODO-070), learning application (TODO-069) | PASS | Exit 0 |
| Bulk parity (TODO-072), reflection parity (TODO-073), pattern concurrency (TODO-074), provider/worker (TODO-075), connector probes (TODO-076) | PASS | Exit 0 |
| Governed action probe (TODO-019) | PASS | Exit 0 |

Pre-existing failures (confirmed not caused by RSS-1.2S3; present in the working tree before this task — the S2 pre-task evidence already showed the Developer Demo at 5,180 tickets while TODO-034 hardcodes 5,000): TODO-012 canonical classification drift and TODO-034 demo-count drift. These are documented separately and not part of the RSS-1.2S3 deliverable.

## 14. Data Integrity

Only the ticket write boundary, its DTOs, the workflow service, and the transition-audit model were modified: `types/ticket.ts`, `lib/server/tickets/*`, `lib/server/persistenceService.ts`, the tickets/`[resource]` routes, the new `process` and `transition` routes, `app/page.tsx` (client updated to the new contract), one migration (`20260806020000_add_ticket_transition_audits`), and the new probe. No changes were made to Organizational Memory, Trust, Reflections, Candidates, Patterns, Governed Actions, or Connectors.

The RSS-1.2S3 probe uses disposable organizations/users/tickets/knowledge/validation fixtures and asserts global counts and the mature Developer Demo digest are identical before and after. Final DB state confirms the baseline counts (users 9, tickets 5302, knowledge 59, …) with zero leftover probe fixtures, zero transition audits, and rate-limit tables cleared.

## 15. Remaining Limitations

- **Interactive processing moved server-side** for the single-ticket flow; the browser no longer computes/persists authority. Deterministic bulk analysis still runs through the browser AI adapter, but its results are persisted only through the `attach_analysis`/`commit` transitions, which validate structure and org-scoped references server-side. Fully server-side bulk analysis exists as the durable `bulk.analyze` job.
- **`resolution.editDistanceNote`** is no longer computed client-side; the server records it as `null` (the diagnostic does not confer authority). A server-side comparison against a stored draft is a follow-up refinement.
- **localStorage prototype mode** remains a client-only compatibility path without server authority; it is outside the server contract and documented as such.
- **Transition audit** is a new durable table; retention/cleanup and any future aggregation into the broader audit UI are follow-ups.

## 16. Recommendation

Approve RSS-1.2S3. With RSS-1.2S1 (authorization), RSS-1.2S2 (abuse controls), and RSS-1.2S3 (server-owned ticket writes) complete, the three RSS-1.2S0 Critical findings (#1, #2, #3) are all resolved; the remaining stabilization items are the High/Medium findings (metrics mutation authorization, role normalization fail-closed migration, aggregate deadline, security headers, connector secret auditing, Claude readiness). Resume release stabilization.

## 17. Release Status

All RSS-1.2S3 success criteria are satisfied:

- Client can no longer forge workflow state. **Verified**
- Client can no longer forge actor identity. **Verified**
- Client can no longer forge organization identity. **Verified**
- Client can no longer forge approval state. **Verified**
- Client can no longer forge trust state. **Verified**
- Client can no longer forge review state. **Verified**
- Server computes every authoritative field. **Verified**
- Persistence accepts only authoritative server data. **Verified**
- DTOs prevent accidental authority leakage. **Verified**
- Bulk upload follows identical rules. **Verified**
- Connectors follow identical rules. **Verified**
- Governed actions remain secure. **Verified**
- Existing ticket workflows continue working. **Verified**
- OIP Benchmark remains 100%. **Verified**
- Mature Organizational Memory unchanged. **Verified**
- RSS-1.2S0 Critical Finding #3 independently verified as resolved. **Verified**

**SERVER_AUTHORITY_ENFORCED**
