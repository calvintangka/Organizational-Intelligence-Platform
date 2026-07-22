# TODO-043 Developer Demo Provenance Drift Investigation & Safe Repair Report

## Verdict

**COMPLETED** — **DATA_CORRUPTION_CONFIRMED**, repaired with the authorized TODO-025I deterministic reset/reseed after the write-path fix.

## Current Drift

Before repair, `demo-ki-sso-certificate-redirect-loop` had:

- Top-level `sourceTicketId`: `OIP-20230104-0001` (still correct).
- Authoritative `content.provenance.sourceTicketId`: `ticket-custom-1784697084310` (missing).
- Trust: 95; reuse: 23; lessons: 10; versions: 7.
- HERO validations/memory: 141/141; trust evidence: 300.
- Developer Demo totals: 45 knowledge items, 1,801 candidates/validations/memory changes, 5,004 tickets, 4,500 evidence rows, 46 patterns.

## PostgreSQL Evidence

The custom ID was found in these persisted fields:

- `KnowledgeItem.content.provenance.sourceTicketId`
- `KnowledgeItem.content.provenance.contributingTicketIds[0]`
- `KnowledgeItem.content.exampleTickets[12].ticketId`
- One `KnowledgeCandidate.sourceTicketIds[0]`
- One `MemoryChangeRecord.afterState` provenance/example snapshot
- One user-created `EmergingPattern.exampleTickets` collection (four custom IDs from manual activity)

There was no `TicketRecord` whose `ticketId` was `ticket-custom-1784697084310`. A corresponding durable ticket was persisted as `OIP-20260722-5002` at the same creation time, proving the custom value was a client/UI identity rather than a deleted durable ticket. The custom ID existed in client state and was then written into knowledge/candidate/history payloads.

## Deterministic Baseline Comparison

The TODO-025C simulator and TODO-036 projection establish:

- HERO origin `OIP-20230104-0001`
- HERO provenance created/validated by Sera Kade on `2023-01-13T01:10:30.000Z`
- Trust 95, reuse 23, 10 lessons, 7 versions
- 140 HERO validations, 140 HERO memory changes, 300 trust-evidence rows
- 45 knowledge items, 180 lessons, 130 versions, 5,000 tickets, 1,800 candidates/validations/memory changes, 4,500 evidence rows, 45 patterns

The pre-repair state was **provenance + metadata/history drift** and broader post-demo activity, not a knowledge-content or trust-algorithm mutation. The top-level canonical origin and mature content remained intact; one later validation/memory chain and manual ticket/pattern activity were appended.

## Root Cause

Manual tickets have two identifiers:

- UI identity: `ticket-custom-*` in `Ticket.id`.
- Durable identity: allocated `OIP-*` in `Ticket.ticketId` and `TicketRecord.ticketId`.

Knowledge and pattern persistence used `ticket.id` for source/provenance/supporting references. This wrote a non-durable UI ID into authoritative organizational memory.

## Production Write Path

The exact path was:

`processTicketPipeline` → reflection `merge_existing` → `createCandidate({ sourceTicketIds: [selectedTicket.id] })` → `withValidationMetadata` → `commitValidatedMemoryChange` → `KnowledgeItem.content.provenance`.

The same identity mistake existed in canonical creation/merge, lesson/version/example creation, bulk-upload evidence, and emerging-pattern examples. The server accepted the client provenance payload without reasserting the stored canonical origin.

## Safe Reproduction

`scripts/todo043-provenance-regression-probe.cjs` uses an isolated in-memory fixture:

1. Ticket A creates canonical knowledge.
2. Tickets B–D are processed through merge, lesson, reuse, and trust paths.
3. Final origin remains `OIP-TEST-0001`; later tickets appear only in supporting provenance/examples/lesson sources.

The probe passes and performs no database writes.

## Production Fix

- Added `ticketReferenceId()` and switched durable knowledge/pattern/bulk/reflection references to `ticket.ticketId ?? ticket.id`.
- Added `withStableValidationProvenance()`.
- Existing stored canonical origin now wins over incoming client provenance in the server validation transaction.
- Supporting ticket IDs still accumulate in `contributingTicketIds`, examples, lessons, versions, candidates, and trust evidence.

## Provenance Invariant

The original canonical source may not change during normal reuse, validation, lesson merge, versioning, or trust updates. Later durable tickets may be added as supporting evidence, but they cannot replace the historical origin. New canonical knowledge still uses its creating ticket as origin.

## Developer Demo Repair Strategy

**TODO-025I reset/reseed.** The state had broader integrity drift: orphan custom references, a broken HERO memory chain, unresolved post-demo actor attribution, extra manual tickets, and metric/sequence divergence. A provenance-only edit would leave those findings. The authorized command was run only after the production fix:

`npm run reset:developer-demo -- --confirm-reset`

It targeted only `profile-oip-developer-demo`, preserved organization identity/memberships, and reported protected organizations untouched.

## Post-Repair HERO State

- Source ticket: `OIP-20230104-0001`, resolves successfully.
- Source date: `2023-01-04T05:31:03.000Z`.
- Created/validated provenance: deterministic 2023 history.
- Trust: 95; reuse: 23; lessons: 10; versions: 7.
- Validations: 140; memory changes: 140; trust evidence: 300.
- Supporting examples: 12.

## Post-Repair Dataset State

- KnowledgeItems: 45
- Lessons: 180
- KnowledgeVersions: 130
- Tickets: 5,000
- Candidates: 1,800
- ValidationRecords: 1,800
- MemoryChangeRecords: 1,800
- TrustEvidence: 4,500
- EmergingPatterns: 45
- TicketSequence: 5,000

## Resolution Mode Preservation

Completed: 4,958; Human: 4,899; Automatic: 59; unknown completed: 0; unresolved: 42. TODO-036 `--expect-after` verification passed.

## TODO-025G Result

**PASS.** Historical source ticket/date, multi-year evolution, lessons, versions, validations, trust progression, and persisted provenance all resolve from PostgreSQL. No fabricated “Last reviewed today” text is used.

## Prevention Test

`probe:todo043-provenance` passed. Canonical origin remained Ticket A through multiple supporting tickets, a validated lesson, reuse evidence, and multiple trust updates.

## Regression Results

Passed:

- TODO-025E integrity
- TODO-025F mature retrieval (23/23)
- TODO-025G curated scenarios
- TODO-036 resolution-mode verification
- TODO-037 natural paraphrase audit (expected `CORE_RETRIEVAL_WEAKNESS_CONFIRMED`; no safety regression)
- TODO-039 classification
- TODO-040 semantic lesson matching
- TODO-015 source-ticket idempotency
- TODO-016 lesson deduplication
- TODO-019 lesson ranking
- BUG-009 and BUG-010
- Organization switching
- Persistence boundary and server persistence
- TypeScript and strict-unused TypeScript
- Production build

## Protected Organization Safety

The reset service reported protected organizations untouched. The required protected snapshot checks passed for Maesa, FastDrop, Pramana, and the test organization. Only `profile-oip-developer-demo` was reset/reseeded.

## Remaining Findings

TODO-037’s natural-language retrieval weakness remains intentionally unchanged and is unrelated to provenance integrity. Future UI flows must continue using `Ticket.ticketId` for every durable reference.

## TODO-043 Status

**Completed.** Drift documented, root cause proven, safe reproduction added, production invariant enforced, Developer Demo repaired, and regressions passed.

## Commit

Recorded in the repository commit listed below.
