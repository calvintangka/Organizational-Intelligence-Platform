# NC-FIX-002 — Multi-Turn Case Conversation Lifecycle Report

## 1. Executive Summary

Implemented a durable multi-turn conversation lifecycle for one case. A case now has ordered customer and agent messages, a persisted `waiting_for_customer` state, customer follow-up reopening, a separate current draft, server-authoritative transitions, bounded conversation context for follow-up drafting, resume hydration, idempotent sends, and serialized concurrent appends.

## 2. Final Verdict

**NC_FIX_002_MULTI_TURN_LIFECYCLE_VERIFIED**

The permanent authenticated probe verified Customer #1, Agent #1, Customer #2, and Agent #2 in one case with correct state changes and NC-FIX-001 still passing.

## 3. Source Finding — QC-006

QC-006 identified that the product represented a support case as one initial message plus one mutable response. The fix separates case identity from conversation history without creating a new ticket for each follow-up.

## 4. Relationship to QC-005

This change creates the conversation evidence needed by later resolution/reflection gating. It does not implement final resolution evidence policy, Reflection gating, or knowledge promotion.

## 5. Relationship to NC-FIX-001

NC-FIX-001 remains the draft persistence layer. A sent response is now an immutable message; the next reply cycle starts with a fresh `draftRevision` and editable `resolution.finalResponse`.

## 6. Baseline

- Baseline timestamp: `2026-08-10T23:56:40.9801672+07:00`
- Timezone: `SE Asia Standard Time`
- Branch: `master`
- HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`
- `v0.1.1-certified^{}`: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`
- Database: PostgreSQL `oip_development` on `127.0.0.1:5432`
- Pre-change migrations: 23 up to date
- Existing uncommitted work was preserved, including NC-FIX-001 and the two RSS-2.9 reports.

## 7. Existing Single-Turn Architecture

`TicketRecord.rawMessage` held the initial customer text. `resolution.finalResponse` held the current generated or edited response. `classification`, `memoryMatch`, `draftSource`, `reflection`, `createdAt`, `ticketId`, and `organizationId` were already durable. No existing related conversation model was found.

## 8. Root Workflow Limitation

The workflow assumed intake → analysis → one draft → approval/reflection. It had no durable message direction, message ordering, follow-up command, waiting state, or historical response collection.

## 9. Conversation Domain Model

Added `TicketMessage` with `id`, organization and ticket scope, `sequence`, `direction` (`customer` or `agent`), `content`, `actorId`, `createdAt`, and an optional idempotency key.

## 10. Persistence Design

Conversation storage uses a new normalized `ticket_messages` table because multi-turn history is an ordered, immutable first-class collection. The case remains the single aggregate and retains its original ticket ID.

## 11. Migration Impact

Migration: `prisma/migrations/20260810000000_add_ticket_messages/migration.sql`. It adds the message enum/table, tenant-scoped composite foreign key, unique sequence and idempotency indexes, and the `waiting_for_customer` lifecycle value. No destructive migration was used.

## 12. Backward Compatibility

Historical rows remain readable. Reads synthesize an evidence-based legacy customer message from `rawMessage`; for resolved legacy rows only, an agent message is derived from `resolution.finalResponse` and its recorded `resolvedAt`. Drafts in unresolved legacy rows are not fabricated as sent history.

## 13. Message Identity

Message IDs are server-owned and stable: initial messages use a ticket-scoped server-generated ID; workflow appends use the ticket and locked sequence. Array positions are not durable identity.

## 14. Message Ordering

Messages use a per-case integer sequence with a unique `(organizationId, ticketId, sequence)` constraint. Appends lock the ticket row before reading the maximum sequence, preventing duplicate or nondeterministic sequence allocation.

## 15. Message Immutability

The workflow only creates messages. Later draft saves update the current draft JSON and cannot update prior message content. Idempotency-key reuse returns the existing message when its direction/content match.

## 16. Draft vs Sent Response Separation

`resolution.finalResponse` is the current unsent draft. Sending appends an agent message and clears the draft to `null` with revision zero. A later customer follow-up starts a new draft cycle and cannot overwrite the prior agent message.

## 17. Status Model

The lifecycle now supports `open`, `in_review`, `waiting_for_customer`, `resolved`, `rejected`, and `discarded`. New conversation commands are server-authoritative and audited.

## 18. Waiting for Customer

`send_agent_message` moves an in-review case to `waiting_for_customer`. The state is persisted, shown in the Cases filter/list and workspace, and restored from the database.

## 19. Customer Follow-Up Flow

`append_customer_message` appends a customer message to the same ticket. It is available for a waiting or in-review case, clears the current draft cycle, and makes the case actionable in `in_review`.

## 20. Agent Follow-Up Flow

After a follow-up, the UI builds bounded labeled context from the same case, generates a new draft, applies the NC-FIX-001 save path, and offers `Send response · Wait for customer`. The second response is appended as a second agent message.

## 21. AI Context Changes

Follow-up drafting now accepts bounded, labeled conversation context (`Customer`/`Agent`, latest messages only) in the AI draft input. The prompt explicitly identifies prior context and instructs the provider to answer the latest customer message. No unlimited history or cross-tenant data is included.

## 22. Resume/Hydration

Ticket page/full reads include ordered messages. Resuming an in-review or waiting case restores its ticket identity, conversation messages, analysis metadata, status, and current draft when present.

## 23. Refresh / Restart

The permanent probe restarted the controlled server and re-read the case. The message timeline and current status remained intact. Refresh behavior is covered by the same database-backed read path; the full browser refresh sequence was not separately executed.

## 24. Logout / Login

The permanent probe logged out, logged back in, and reloaded the same case. The five-message third-turn timeline remained available to the authorized user.

## 25. Organization / Case Switching

Case reads are keyed by organization and ticket ID, and the Cases page can resume both in-review and waiting cases. RSS-2.1 passed, confirming organization switching does not snapshot-flush or overwrite loaded state.

## 26. Tenant Isolation

The API route requires the existing organization authorization boundary. A second disposable organization/user received `403` for both case listing/message reads and transition attempts.

## 27. Authorization

Organization route authorization and the existing `ticket.review` capability remain in force. The client supplies content and an idempotency key only; organization, actor, direction, timestamp, status, sequence, and message ID are server-derived.

## 28. Concurrency / Idempotency

The probe issued two simultaneous appends to one waiting case. Both committed with unique IDs and sequences `1..4`. A repeated first send with the same idempotency key returned successfully without a duplicate message.

## 29. Browser UX

Fresh production-browser smoke coverage created a disposable account/workspace, created a case, displayed Customer #1, sent Agent #1, showed the case in Cases with waiting state, and exposed the customer follow-up control. The complete browser four-message scenario was not executed end-to-end.

## 30. NC-0001 Acceptance

Not executed. No NusaCloud HR data or `NC-20260810-0001` record was modified, resolved, reflected, or promoted.

## 31. Permanent Probe

`scripts/nc-fix-002-multi-turn-conversation-probe.cjs` was added and registered as `probe:nc-fix-002-multi-turn-conversation`. It covers one-case four-message lifecycle, third customer turn and third draft, restart, logout/login, idempotency, concurrent appends, unique IDs, deterministic ordering, authorization, and cleanup.

## 32. Regression Results

- NC-FIX-002 permanent probe: PASS
- NC-FIX-001 draft persistence probe: PASS
- RSS-2.1 switch context: PASS
- RSS-2.4 demo organization isolation: PASS
- RSS-2.6 concurrent revision observability: PASS
- RSS-2.7 organization lifecycle UX: PASS on a fresh isolated server; the stale pre-existing port-3000 server was not used for the result
- RSS-2.5: not touched; not rerun
- RSS-2.8: not rerun; existing certified reports preserved
- TypeScript: PASS
- Prisma validation: PASS
- Prisma migration status: PASS, 24 migrations up to date
- Production build: PASS
- OIP Benchmark: NOT RUN

## 33. Protected Data Integrity

Protected mature data changed: NO. No OrgMetrics counting semantics were added; unexpected OrgMetrics delta: `0` in the disposable lifecycle work.

## 34. Cleanup

The permanent probe deletes disposable users, sessions through account cleanup, organizations, cases, messages, and audit rows via cascading organization cleanup. The browser smoke account/workspace was disposable and was not used as a production fixture; no mature organization was touched.

## 35. Remaining Limitations

- Full browser four-message acceptance and browser console/network capture remain unexecuted.
- NC-0001 manual acceptance remains unexecuted.
- Final resolution evidence and Reflection gating remain NC-FIX-003 scope.
- Legacy message fallback is read-time compatibility; it does not backfill old rows.

## 36. Files Changed

- `types/ticket.ts`, `types/index.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260810000000_add_ticket_messages/migration.sql`
- `lib/ticketRecords.ts`
- `lib/server/persistenceService.ts`
- `lib/server/tickets/ticketWorkflow.ts`
- `lib/ai/types.ts`, `lib/ai/prompts.ts`
- `app/api/organizations/[organizationId]/tickets/[ticketId]/transition/route.ts`
- `app/api/organizations/[organizationId]/tickets/[ticketId]/messages/route.ts`
- `app/api/organizations/[organizationId]/tickets/route.ts`
- `app/page.tsx`
- `components/views/TicketWorkspace.tsx`, `components/views/CaseLookupView.tsx`
- `scripts/nc-fix-002-multi-turn-conversation-probe.cjs`
- `package.json`

NC-FIX-001 files and the pre-existing RSS-2.9 reports were preserved and not reverted.

## 37. Recommendation

Proceed to **NC-FIX-003 — Resolution Evidence & Reflection Gating**. Use the durable customer/agent timeline, waiting state, and current reply-cycle draft as the evidence substrate; do not promote the NC-0001 manual scenario until that policy is implemented and separately verified.

## 38. Final Verdict

**NC_FIX_002_MULTI_TURN_LIFECYCLE_VERIFIED**

The required Customer #1 → Agent #1 → Customer #2 → Agent #2 lifecycle is durable inside one case, with historical message preservation, waiting/reopen transitions, draft separation, tenant isolation, concurrency protection, and no NC-FIX-001 regression.
