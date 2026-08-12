# NC-FIX-006 — Knowledge Reuse Approval & Source-Ticket Integrity

## 1 Executive Summary

NC-FIX-006 is verified. The failure was caused by the reuse UI constructing an ephemeral `ticket-custom-*` object and passing its UI `id` into a governed validation commit that requires a durable organization-scoped `TicketRecord` and resolution evidence. The repair persists reuse tickets through the server processing workflow, canonicalizes the source with `ticketReferenceId`, records durable reviewer evidence, and gives each reuse approval stable idempotent commit identities.

## 2 Final Verdict

`NC_FIX_006_KNOWLEDGE_REUSE_VERIFIED`

## 3 NC-ACCEPT-001 Finding

NC-ACCEPT-001 recorded the browser failure: `Approve reuse (human)` returned HTTP 409 with root error `A validation candidate references a missing source ticket in this organization.` The browser-read KnowledgeItem remained at `timesReused: 0`; the synthetic reuse ticket had not become a durable source TicketRecord.

## 4 Baseline

Baseline evidence is the NC-ACCEPT-001 report and the pre-fix source path in `app/page.tsx`: `makeCustomTicket()` created `ticket-custom-*`, while `applyResolution()` used `evidenceTicket.id`. The server-side validation contract correctly required an organization-owned, resolved, evidence-backed TicketRecord.

## 5 Reproduction

The recorded browser reproduction was reproduced in code audit before the repair: the reuse path submitted the ephemeral UI id, and the validation boundary rejected it with the exact HTTP 409/root error above. The permanent probe preserves that negative contract after the fix with a missing source ticket and receives the same exact root error.

## 6 Existing Reuse Architecture

Retrieval remains deterministic and organization-scoped. The existing path selects a compatible KnowledgeItem, drafts from grounded organizational memory, routes low-trust matches to human review, and commits trust through the existing transactional validation boundary.

## 7 Ticket Identity Model

The UI `Ticket.id` and durable `TicketRecord.ticketId` are distinct. The repair uses `ticketReferenceId(ticket)` at the candidate boundary, so a source is represented by the persisted ticket number rather than an ephemeral UI object id.

## 8 Second-Ticket Persistence

Relevant custom reuse text now enters `/api/organizations/{org}/tickets/process` before reuse analysis. The returned server `ticket` and `persistedTicket` are retained, and the permanent probe proves the second case exists as a real in-review TicketRecord before approval.

## 9 Reuse Candidate Construction

Reuse candidates now contain exactly one canonical source ticket id: the persisted `ticketId`. The related KnowledgeItem id remains the selected organizational memory item; no client-supplied tenant, source, trust, or reuse count is accepted as authority.

## 10 Validation Path Analysis

The existing `commitValidation` transaction still validates candidate ownership, validation ownership, KnowledgeItem ownership, source-ticket existence, resolved status, and durable evidence. The fix prepares the source ticket through the existing ticket workflow before invoking that transaction.

## 11 Root Cause

`MULTIPLE_LAYERS` — the old path both failed to persist the synthetic reuse ticket and passed the wrong identity field (`evidenceTicket.id` instead of `ticketReferenceId(evidenceTicket)`). The server rejection was therefore correct and protective.

## 12 Fix Strategy

Persist the reuse case first; attach `manual_verified_resolution` for human approval or `agent_verification` for automatic reuse; resolve with evidence; commit with the canonical source id; then link the ticket to the committed validation and KnowledgeItem. Stable ids are derived only for the reuse tuple `(organization, knowledge, source ticket, mode)`.

## 13 Implementation

`app/page.tsx` adds durable reuse-ticket processing, authoritative KnowledgeItem reload before reuse trust calculation, evidence-backed source resolution, stable candidate/validation/memory identities, replay-aware local metrics, and protection against echo-saving the aggregate returned by a governed commit. No Prisma schema or migration was required.

## 14 Provenance Integrity

The permanent probe confirms candidate source ids, ticket validation references, resolution evidence, KnowledgeItem provenance, and organization ownership remain linked. Cross-tenant source tickets are rejected; the client cannot replace the source with an arbitrary UI id.

## 15 First Learned Case

The probe begins with an empty disposable organization, processes a first cold-start ticket, resolves it with evidence, creates a lesson through the learning command, and commits the first KnowledgeItem through the real validation endpoint. No KnowledgeItem or evidence row is seeded.

## 16 Second Similar Case

The second similar ticket is processed through the server ticket-processing endpoint, returns a durable TicketRecord, retrieves the first KnowledgeItem, and is resolved with human reviewer evidence before reuse commit.

## 17 Retrieval

The second and third cases retrieve the expected KnowledgeItem. Unrelated and cross-tenant controls do not authorize the target memory.

## 18 Grounded Draft

The second and third process results include a memory match and grounded draft metadata (`basedOnKnowledgeIds`, grounding label, or lesson-grounded mode). The probe also checks that reuse does not fabricate unsupported certainty.

## 19 Human Reuse Approval

The browser clean rerun reached `Human review required`, displayed `Approve reuse (human)`, and completed with `Human approved -- trust`. The approval creates reviewer verification evidence; it is explicitly not represented as customer confirmation.

## 20 Reuse Persistence

The committed reuse writes the candidate, validation record, memory-change record, trust evidence, KnowledgeItem update, and source-ticket validation link through the existing transaction/workflow boundaries.

## 21 timesReused / Canonical Metric

The permanent probe proves the first reuse changes `timesReused` from 0 to 1, concurrent duplicate submissions do not make it 2, and a distinct third source changes it to 2. Authoritative `OrgMetrics.knowledgeReused` equals 2 for the two distinct persisted reuse tickets.

## 22 Idempotency

The same reuse tuple uses stable candidate, validation, memory-change, and commit identities. Two concurrent identical commits return two successful responses with exactly one replay, and a later identical retry returns `replayed: true` without a second trust event.

## 23 Distinct Reuse

The third similar case has a distinct durable `ticketId` and distinct reuse validation identity. Its commit succeeds and increments the canonical metric exactly once.

## 24 Missing-Source Negative Control

A candidate referencing `ticket-does-not-exist` is rejected with HTTP 409 and exact message: `A validation candidate references a missing source ticket in this organization.`

## 25 Cross-Tenant Controls

A resolved TicketRecord from the second disposable organization cannot be used as an A-organization validation source. The commit is rejected with HTTP 409, and the foreign source does not alter organization A memory.

## 26 Authorization

An authenticated user from the other organization receives HTTP 403 when reading organization A knowledge. Owner-scoped writes and validation commits continue to use the server-authenticated actor.

## 27 Concurrency

Concurrent same-case commits are serialized by the existing transactional validation path and trust-evidence uniqueness. The probe observes one initial commit and one replay, with no double increment.

## 28 Trust Semantics

Human reuse remains a human trust event; automatic reuse remains an agent-verification path. Trust deltas are derived and applied server-side from the stored KnowledgeItem and claimed source-ticket event, not trusted from client arithmetic.

## 29 Outcome Semantics

Reuse approval does not claim customer confirmation. The ticket is resolved with explicit reviewer/agent verification, and the commit transition records the resolution mode and validation reference separately from customer-confirmation evidence.

## 30 OrgMetrics

The probe reads `/metrics` after first learning, concurrent replay, and distinct third reuse. `knowledgeReused` is reconciled to the two distinct resolved reuse tickets; replay does not inflate it.

## 31 Auditability

Each approved reuse has a durable source TicketRecord, resolution evidence, validation record, memory-change record, trust-evidence claim, KnowledgeItem update, and ticket validation reference. The source-to-validation relationship is queryable after the browser/server workflow completes.

## 32 Browser Acceptance

Clean disposable browser acceptance passed: account and organization creation, first cold-start learning, evidence-backed first commit, persisted similar reuse ticket, grounded reuse review, human approval, and successful durable completion. The initial disposable browser attempt exposed a stale snapshot/echo-save race; the final clean rerun after the repair passed.

## 33 Browser Console

The final clean browser run produced no new reuse-approval error. Historical console entries from the discarded first disposable run contained the diagnosed stale-revision failure; that organization was deleted and the browser tabs were finalized.

## 34 Permanent Probe

Permanent probe: [scripts/nc-fix-006-knowledge-reuse-source-ticket-probe.cjs](../scripts/nc-fix-006-knowledge-reuse-source-ticket-probe.cjs). Alias: `npm run probe:nc-fix-006-knowledge-reuse`. It covers first learning, retrieval, grounded draft, persisted second/third tickets, human evidence, durable commit, replay, concurrency, missing source, cross-tenant, authorization, authority spoofing, metrics, and cleanup.

## 35 NC-FIX Regressions

Passed: NC-FIX-001 draft persistence, NC-FIX-002 multi-turn lifecycle, NC-FIX-003 resolution evidence/reflection gating, NC-FIX-004 response formatting, NC-FIX-005 deterministic latency, and NC-ACCEPT-001 learning-loop acceptance.

## 36 RSS Regressions

Passed: RSS-2.1 switch-context, RSS-2.6 concurrency, RSS-2.7 organization lifecycle UX, and RSS-2.8 new-customer E2E acceptance. RSS-2.8 was run with its disposable server on port 3510 and completed with `NEW_CUSTOMER_E2E_ACCEPTANCE_PROBE_PASS`.

## 37 RBAC

`npm run probe:todo078-rbac` passed. No capability or membership boundary was weakened.

## 38 TypeScript / Prisma / Build

Passed `tsc --noEmit`, `npm run prisma:validate`, and `npm run build`. No schema migration was added for NC-FIX-006.

## 39 OIP Benchmark

OIP Benchmark v1 passed 1000/1000 checks, 100% overall, and 100% critical security checks.

## 40 Protected Data

Developer-demo integrity completed `PASS_WITH_FINDINGS` with zero release-blocking findings. Protected state digest was unchanged: before and after `f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`. The pre-existing 70 low and 3 medium historical findings remain documented; no mature organization was mutated.

## 41 Secret Review

No real credential, bearer token, or API secret was added. The probe uses synthetic disposable passwords and explicitly blank provider-key environment values; no secret values are printed.

## 42 Cleanup

The permanent probe reports `cleanup: true`. NC-FIX-006 browser organizations and users were deleted by exact disposable organization ids after acceptance, and browser tabs were finalized with `keep: []`. RSS-2.8 and the other disposable probes also completed cleanup.

## 43 Files Changed

NC-FIX-006-specific changes are:

- `app/page.tsx` — durable reuse ticket persistence, canonical source identity, evidence gating, stable replay identities, authoritative reload, ticket commit linkage, and commit-snapshot echo suppression.
- `package.json` — `probe:nc-fix-006-knowledge-reuse` alias.
- `scripts/nc-fix-006-knowledge-reuse-source-ticket-probe.cjs` — permanent disposable acceptance probe.
- `docs/NC-FIX-006-KNOWLEDGE-REUSE-APPROVAL-SOURCE-TICKET-INTEGRITY-REPORT.md` — this report.

Existing unrelated and prior NC-FIX/RSS worktree changes were preserved.

## 44 Remaining Limitations

The developer-demo integrity probe still reports its pre-existing historical auditability/fixture-drift findings, but none are release-blocking and the protected digest is unchanged. The browser console retains historical first-attempt messages within that discarded tab session; the clean acceptance run itself completed successfully without a new error.

## 45 Recommendation

Accept NC-FIX-006 as verified. Keep the permanent probe in the regression suite and retain the server missing-source/evidence checks as mandatory safety boundaries. Do not relax source-ticket ownership or evidence requirements to support legacy synthetic reuse paths.

## 46 Final Verdict

`NC_FIX_006_KNOWLEDGE_REUSE_VERIFIED`
