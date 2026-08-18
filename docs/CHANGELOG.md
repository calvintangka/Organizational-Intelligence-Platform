# Organizational Intelligence Platform

# Developer Changelog

This document records the evolution of the Organizational Intelligence Platform (OIP). It captures architectural evolution, implementation milestones, significant fixes, engineering decisions, migration information, and verification results.

This changelog complements Git history rather than replacing it. Git history captures individual commits and diffs. This document captures the reasoning, context, and architectural trajectory behind those changes. Together they provide a complete engineering record of the platform.

Every significant implementation should append a new dated entry.

---

## Unreleased

- **NC-FIX-012 — Reflection source-provenance validation boundary (recovered and verified):**
  Recovered the stash-only implementation (`effectiveReusablePromotionDraft`) that projects
  the effective reusable payload for every promotion action so identity validation runs
  against exactly what may be persisted. The contract audit found and closed three
  remaining gaps: a blank authored response template on `create_new` now validates the
  `reviewedResponse` fallback it would write; canonical tags persisted from
  `understanding.tags` on `create_new`/`merge_existing`/`trust_update_only` are included in
  the validated payload; and `trust_update_only` now validates persisted tags. The
  permanent regression probe referenced by `probe:nc-fix-012-reflection-provenance-boundary`
  was missing and has been reconstructed from the documented contract
  (`RECONSTRUCTED_FROM_CONTRACT`). Verification (deterministic in-process probe): provenance
  identity preserved, identity rejected in every reusable field, generalized lesson
  accepted, no-authored-lesson fallback validated, blank-template fallback validated,
  validation/write equivalence, atomic rejection, corrected retry, idempotency, and tenant
  isolation. NC-FIX-011 probe and TypeScript pass. This entry records the recovered
  implementation and its executable verification; it does not claim a release, tag, push,
  or deployment.

## Version 0.2.0

Date: 2026-08-12

Release title: **OIP v0.2.0 — NusaCloud Learning Loop**
Release type: Minor pre-1.0 capability release. The `v0.2.0` tag, push, release publication, and deployment remain pending separate authorization.

The entries below retain their historical technical context; statements about pre-release state describe the state at the time of each entry.

- RSS-2.9 HOTFIX CERTIFICATION: technical release gates passed for the RSS-2.1 through RSS-2.8 organization-lifecycle chain, including the exact KnowledgeItem two-tab closure, current RSS-1.2S1â€“S7/TODO-078 security evidence, TypeScript, Prisma, migration status, production build, OIP Benchmark v1 (1000/1000; critical security 100%), and protected mature-state digests. The candidate remains intentionally uncommitted on `master`; no commit, tag, push, or tracker mutation was performed. Final state: `RSS_2_9_READY_FOR_RELEASE_CANDIDATE_COMMIT`; recommended tag after operator review is `v0.1.1-certified`.

- RSS-2.8-FINAL-KNOWLEDGEITEM-TWO-TAB-CLOSURE: completed the exact real-browser KnowledgeItem optimistic-concurrency acceptance through a gated test-only surface using the existing authenticated Knowledge GET/PUT routes. Two tabs loaded revision 2; Tab A saved revision 3; Tab B received HTTP 409 `REVISION_CONFLICT` with `resourceType=knowledge`; newer data remained authoritative; Reload latest loaded revision 3; Tab B intentionally re-saved revision 4. The disposable customer/organizations were cleaned up, protected mature-state integrity was unchanged, and RSS-2.8-FINAL is now verified. No normal production customer behavior changed; RSS-2.9 was not started.

- RSS-2.8-FINAL: completed the controlled-production real-browser reconciliation for a fresh customer: signup, zero-organization onboarding, browser-created Organizations A–E, switching (including rapid switching), refresh/hard-refresh, logout/login, restart persistence, responsive viewport checks, keyboard Escape behavior, clean console, and disposable KnowledgeItem persistence. Reconciled RSS-1.2S4 (stale/missing `.next` artifact) and TODO-078 (uncontrolled-server/fixture lifecycle) by rerunning both against the controlled production server; both final probes pass. The exact customer-facing KnowledgeItem two-tab stale-save/409/Reload-latest rehearsal remains open, so the verdict stays partial; no new product changes were made in this final pass.

- RSS-2.8: completed production-runtime acceptance of a disposable new-customer journey through signup, zero-organization onboarding, server-owned Owner provisioning, durable customer ticket persistence, five-organization lifecycle, isolation, logout/login, and mature-data digest checks. The acceptance pass also fixed two confirmed blockers: reflection now awaits the governed ticket commit, and validation source-ticket lookup is organization-scoped when ticket numbers repeat across tenants. Permanent probe: `probe:rss-2.8-new-customer-e2e`. Browser hard-refresh, two-tab conflict, responsive viewport, and accessibility rehearsals remain explicitly unexecuted and keep the verdict partial.

- RSS-2.7: completed the scoped organization lifecycle UX pass. Zero-organization accounts now have an explicit onboarding gate; the responsive workspace menu identifies the active organization and role, exposes additional organization creation, disables conflicting switches while loading, and provides visible switching status. Creation failures are retryable inline, bootstrap failures have a Try again action, and the permanent lifecycle probe covers clean onboarding, five-organization retention, switching, invalid targets, validation rollback, logout/login, and mature-data immutability.

- RSS-2.6: preserved optimistic concurrency while making genuine KnowledgeItem conflicts observable and recoverable. Revision mismatches now return structured HTTP 409 `REVISION_CONFLICT` details (resource, expected/current revision, optional request ID), adapter errors preserve those fields, and the UI offers a controlled “Reload latest” recovery action without blind stale retries. A permanent disposable probe covers two clients, reload/retry, a ten-writer burst, authorization ordering, cross-organization isolation, and mature-state immutability.
- RSS-2.5: verified the server-authoritative membership, ownership, role, and limit contract. New RSS-2.2 organizations retain creator-to-Owner assignment, the role mutation API enforces a final-Owner guard while allowing explicit multiple Owners, the composite membership key prevents duplicates, and a disposable account can create and retain five organizations. No arbitrary organization/member limit or production behavior change was introduced; permanent probe coverage documents the existing contract.
- RSS-2.4: audited and permanently probed demo/customer isolation. OIP Developer Demo, FastDrop Logistics, and Maesa Tech remain explicit durable memberships and are never fallback tenants; customer organization reads, active-context changes, and protected resources remain server-authorized by membership. Seed replay is operator-scoped to the configured development account, and no demo classification flag or production lifecycle rewrite was needed.
- RSS-2.3: added server-owned `POST /api/auth/signup` with normalized identity validation, existing scrypt password hashing, transactional session establishment, safe duplicate handling, and shared signup abuse controls. Authenticated zero-membership accounts now render a focused first-organization onboarding gate, which delegates tenant provisioning to RSS-2.2 and enters the clean owned workspace through RSS-2.1 active-context switching.
- RSS-2.2: added authenticated, server-owned `POST /api/organizations` provisioning. A serializable PostgreSQL transaction now creates the organization profile, creator Owner membership and RBAC assignment, empty metrics/ticket sequence/server authority records, provenance audit, and durable per-creator idempotency record. The authenticated UI now waits for that server result, refreshes authoritative memberships, and enters the new tenant through RSS-2.1 switching without client-generated organization IDs or snapshot flushing.
- RSS-2.1: organization switching now changes context without replaying outgoing KnowledgeItems, candidates, metrics, intelligence logs, emerging patterns, or profiles. Explicit pending ticket and profile writes are drained before the server active-organization transition; loaded server state is treated as read-only and is not echoed back through autosave effects. Optimistic KnowledgeItem revision checks remain enforced, including HTTP 409 rejection of stale direct writes.
- Completed RSS-1.2 live acceptance with all required behavioral, security, persistence, integrity, and benchmark gates verified.
- Prepared the v0.1.0-certified release-candidate source with TODO-079 at 580/600, OIP Benchmark v1 at 1000/1000, and critical security at 100%.
- Created and published the annotated `v0.1.0-certified` tag from certified source `f08692fbeb623bd50faf0cc8f1a9dd1fe48607ba` on the `calvintangka` remote.

- Simplified the active AI provider chain to DeepSeek → LM Studio → deterministic fallback; Claude remains outside the current release runtime.

### Post-v0.1.1 NusaCloud Learning-Loop Development

Date range: 2026-08-10 to 2026-08-12

#### Added

- **NC-FIX-002 — Durable multi-turn case conversations:** Added ordered, immutable `TicketMessage` history, the `waiting_for_customer` lifecycle state, same-case customer follow-up reopening, bounded conversation context, server-owned message identity, idempotent sends, serialized appends, and resume hydration. Migration: `20260810000000_add_ticket_messages`.
- **NC-FIX-003 — Resolution evidence:** Added tenant-scoped `TicketResolutionEvidence` records and evidence-backed resolution/validation gates. Supported evidence types are customer confirmation, agent verification, and manual verified resolution. Migration: `20260811010000_add_resolution_evidence`.
- **NC-FIX-005 — AI draft latency observability:** Added metadata-only timing diagnostics across prompt construction, provider request/response, parsing, retrieval, draft processing, persistence, fallback attempts, and browser-visible completion.
- **NC-FIX-007 — Retrieval compatibility guard:** Added deterministic compatibility evaluation between candidate retrieval and grounded drafting, including compatibility, incompatibility, and unknown semantics for category/root-cause evidence.
- **NC-FIX-009 — Grounding presentation reconciliation:** Added a shared presentation-state guard so AI-generated output is not represented as Organizational Memory grounding without authorized grounding evidence.

#### Changed

- **NC-FIX-001 — In-review draft persistence:** Generated and human-edited drafts now persist in the existing `TicketRecord.resolution.finalResponse` field with draft revision checks, allowing case resume without losing the current response. No schema migration was required.
- **NC-FIX-004 — Response formatting:** Explicit plain-text paragraph guidance was added to AI drafting and the Cases final-response view now preserves whitespace. The existing persistence and API transport remain lossless for meaningful internal newlines.
- **NC-FIX-006 — Knowledge reuse provenance:** Reuse approvals now create a durable server-owned source TicketRecord, use canonical persisted ticket references, attach reviewer evidence, and use stable idempotent candidate/validation/memory identities. Distinct reuse updates `timesReused` and metrics once; duplicate reuse does not double-count. Reuse is not represented as customer-confirmed success.
- **NC-FIX-008 — Post-resolution Reflection lifecycle:** Evidence-backed resolved cases may prepare/resume Reflection without reopening support history. Validation and promotion remain gated by durable resolution evidence and human validation; resolved-case support evidence and provenance are preserved.
- **NC-FIX-010 — Optimistic-concurrency recovery UX:** Stale KnowledgeItem writes remain revision-guarded, while conflict recovery now preserves the in-progress review, loads the authoritative tenant-scoped revision with an organization-switch race guard, and requires an explicit deliberate retry. No automatic merge or blind stale replay was introduced.
- The server-owned persistence boundary now durably represents organizations, memberships, TicketRecords, conversation messages, resolution evidence, KnowledgeItems, ValidationRecords, MemoryChangeRecords, trust evidence, metrics, audit records, and related workflow state in PostgreSQL through Prisma.

#### Fixed

- **NC-FIX-011 — Human-authored Reflection lesson promotion and customer-specific content safety:** New lessons now require an explicitly authored reusable response template instead of inheriting the customer-specific reviewed draft. The promotion safety boundary validates the normalized reusable problem/lesson fields, including extracted customer and company identities, while leaving source TicketRecords, resolution evidence, audit history, and opaque provenance intact. Literal customer-specific reusable content remains rejected; `{{customerName}}`, `{{organizationName}}`, and `{{ticketId}}` remain supported. Added the permanent `probe:nc-fix-011-reflection-promotion-safety` regression and verified fresh-browser promotion, grounded similar-case retrieval, human reuse, and the unsafe-rejection/corrected-retry path.

- **NC-FIX-007:** Cross-domain and weak generic candidates are rejected before grounded drafting; `Uncategorized` is not treated as compatible with everything, and high trust or reuse count cannot override incompatibility. All-incompatible candidate sets fail closed to cold-start behavior.
- **NC-FIX-009:** A cold-start follow-up no longer displays `AI draft grounded in organizational memory` when persisted memory state is `none` and `basedOnKnowledgeIds` is empty. Resume and positive lesson-grounded paths remain consistent.
- **NC-FIX-010:** Recoverable revision conflicts are presented as expected warnings with structured resource/expected/current revision details; Reload latest reconciles authoritative KnowledgeItems without discarding the local review, and a retry uses the refreshed revision. Unexpected persistence failures remain error-level failures.

#### Safety / Governance

- Reflection drafts remain distinct from validated Organizational Memory. Resolution evidence, server authority, tenant ownership, provenance, human review, and idempotent governed commits remain enforced at the workflow boundaries.
- Retrieval compatibility preserves conservative unknown-category behavior and blocks incompatible candidates before grounding. NC-FIX-007A audit reconciliation confirmed zero cross-domain false-positive authorizations while retaining known recall/classification limitations and stale audit-fixture findings.
- Knowledge reuse preserves the distinction between `KNOWLEDGE REUSED` and `SOLUTION CONFIRMED SUCCESSFUL AGAIN`.

#### Architecture Impact

- The platform remains a modular monolith using the Next.js App Router with server-side application services and ports/adapters, a client review workspace, authenticated organization-scoped API routes, and server-owned PostgreSQL persistence.
- The ticket aggregate now separates immutable conversation messages and durable resolution evidence from the mutable current draft and Reflection state. Knowledge promotion remains a governed candidate -> validation -> memory-change transition.

#### Verification

- Permanent probes for NC-FIX-001 through NC-FIX-009 pass. The NC-FIX-009 browser matrix verified cold-start, follow-up, positive grounding, incompatible, Uncategorized, negation, resume, and isolation behavior.
- The official `NC-ACCEPT-001-FINAL` browser rerun verified the end-to-end NusaCloud learning loop from cold start through support interaction, customer confirmation, evidence-backed resolution, Reflection, human validation, Organizational Memory promotion, similar-case retrieval, grounded response, human reuse approval, and durable reuse accounting. Verdict: `NC_ACCEPT_001_FINAL_VERIFIED_WITH_FOLLOWUPS`.
- The permanent `probe:nc-fix-010-concurrency-recovery` verified normal save, two-client stale rejection, structured HTTP 409 details, authoritative reload, deliberate retry, no auto-retry, authorization ordering, tenant isolation, and single-row revision integrity. The browser rehearsal verified the same recovery contract across two authenticated tabs.
- The earlier final acceptance failure exposed the post-resolution Reflection lifecycle conflict that was subsequently repaired by NC-FIX-008. The failed report remains preserved as forensic history; it is not treated as a product release milestone by itself.
- TypeScript, Prisma validation, migration status, and the production build pass on the current worktree. Protected Developer Demo state remains unchanged with zero release-blocking integrity findings.

#### Known Limitations

- Provider-side rate limiting can still produce transient 429/fallback warnings; NC-FIX-005 measured latency and added attribution but did not claim an AI performance fix.
- Broader retrieval/classification recall and ranking limitations remain documented by TODO-041/TODO-047 and related audit evidence. They do not erase the NC-FIX-007 cross-domain safety guard.
- The pre-release development state was intentionally not a v0.1.2 claim; this metadata commit establishes the selected v0.2.0 identity, while tag, push, release publication, and deployment remain pending.

#### Major Files / Components

- `lib/server/tickets/ticketWorkflow.ts`, `lib/server/persistenceService.ts`, `lib/application/tickets/processTicket.ts`, `lib/ticketRecords.ts`
- `app/page.tsx`, `components/views/TicketWorkspace.tsx`, `components/views/CaseLookupView.tsx`, `components/ProvenancePanel.tsx`, `components/ReflectionPanel.tsx`
- `lib/retrievalCompatibility.ts`, `lib/memory.ts`, `lib/drafting.ts`, `lib/groundingPresentation.ts`
- `prisma/schema.prisma`, `prisma/migrations/20260810000000_add_ticket_messages`, `prisma/migrations/20260811010000_add_resolution_evidence`
- NC-FIX permanent probes and the corresponding reports under `scripts/` and `docs/`

## Current Platform Status

| Item | Status |
|------|--------|
| Current Version / Baseline | **Release identity prepared: v0.2.0; certified product baseline: v0.1.1; tag and publication pending** |
| Architecture | Modular monolith; Next.js App Router with server-side application services and ports/adapters |
| Backend | Next.js server routes and server-owned application workflows |
| Frontend | React/Next.js authenticated support workspace, Cases, Knowledge, Reflection, and organization lifecycle views |
| Database | PostgreSQL (`oip_development` in the development environment) |
| ORM | Prisma 7.9.1 |
| Persistence | Server-authoritative, organization-scoped PostgreSQL persistence with 25 applied migrations; local storage is not the current production persistence path |
| Authentication | Session-based authenticated users with scrypt password hashing, organization memberships, RBAC capabilities, and active-organization authorization |
| Organization / tenancy | Server-owned organization provisioning, memberships, active context, tenant-scoped resources, and authorization audits |
| Current AI provider chain | DeepSeek API -> LM Studio -> deterministic fallback |
| AI Mode | Environment-selected AI advisory chain; current browser mode is DeepSeek with deterministic governance and human review |
| Organizational Memory | Enabled; validated KnowledgeItems and Lessons with provenance, trust, versioning, and human-governed promotion |
| Retrieval | Deterministic organization-scoped retrieval with compatibility/incompatibility/unknown semantics and fail-closed incompatible candidates |
| Human validation | Required for Organizational Memory promotion; ValidationRecords and MemoryChangeRecords are durable and governed |
| Resolution evidence | Durable customer confirmation, agent verification, or manual verified resolution is required before validation/promotion |
| Reflection | Draft Reflection may exist before resolution; evidence-backed resolved cases may prepare/resume Reflection; human validation gates promotion |
| Reuse tracking | Durable source-ticket reuse with evidence, provenance, idempotent commits, `timesReused`, trust evidence, and organization metrics |
| Pattern Discovery | Enabled through the existing deterministic/durable learning workflow |
| Production Ready | Product candidate certified for release-candidate handling; v0.2.0 publication pending |
| Current Development Status | v0.2.0 release metadata reconciled for the NusaCloud learning loop; tag, push, release publication, and deployment pending |

This section provides a quick snapshot of the current implementation state. Update it whenever major architectural milestones are completed.

---

## Version 0.9.0

Date: 2026-07-04

### Added

- **Deterministic Ticket IDs** — Tickets receive a stable, human-readable ID at submission in the format `{OrgPrefix}-YYYYMMDD-NNNN` (e.g., `MT-20260704-0001`). The prefix is derived from the organization name initials. A per-org counter is persisted in localStorage and increments monotonically. The ID is displayed immediately in the UI upon submission and included in the draft closing line.

- **Ticket Records** — Tickets are now first-class persisted records (`TicketRecord`) that capture the full pipeline journey: classification (category, intent, canonical problem, confidence), memory match (knowledge ID, match type, lesson ID), draft source, resolution (final response, human-edited flag, edit distance, resolved-at timestamp), reflection (decision, lesson created/reinforced, knowledge changed), validation record references, and status. Records are updated at each pipeline stage and persisted to localStorage.

- **Case Lookup View** — New "Cases" nav item providing retrospective search and review of ticket records. Features include: search by ticket ID, text, or category; five filter chips (All, Heavily edited, Cold start, Uncategorized, Rejected); paginated list with "Load more" (20 per page); and a detail view showing the full pipeline journey with clickable knowledge item links.

- **Edit Distance Computation** — Levenshtein distance calculation between the original draft and the human-reviewed response, used to populate the "heavily edited" filter chip and the resolution's `editDistanceNote` field. No new analysis or LLM involvement — computed from existing data at approval time.

- **Ticket Reference in Draft Closings** — All draft generation paths (profile template, lesson match, canonical match, AI cold start) now append `Your ticket reference is {ticketId}.` to the closing. A guard in `draftResponse` prevents double-insertion.

- **Bulk Upload Ticket Records** — Bulk-uploaded queries receive deterministic ticket IDs and create ticket records when their cluster is committed through the reflection workflow.

### Changed

- `Ticket` interface extended with optional `ticketId` field.
- `makeCustomTicket` accepts an optional `ticketId` parameter.
- `processTicketPipeline` generates the ticket ID before any pipeline stage and threads it through the ticket object.
- `approveResponse` computes edit distance and updates the ticket record's resolution fields.
- `confirmReflection` updates the ticket record with reflection data and sets final status to `resolved`.
- `clearOrganization` now also clears ticket records and the ticket counter.
- Sidebar `ActiveView` type extended with `"cases"`.

### Fixed

- Draft closing missing ticket reference — `buildTemplate` always includes `{{greetingLine}}`, so the `renderCustomerTemplateForTicket` path was always taken, bypassing `applyProfileTone` which was the only path that added the ticket reference. Fixed by adding a guard after both draft paths in `draftResponse` that appends the reference if not already present.

### Major Files Affected

- `types/ticket.ts` — `TicketRecord`, `TicketRecordStatus`, `TicketRecordClassification`, `TicketRecordMemoryMatch`, `TicketRecordResolution`, `TicketRecordReflection` type definitions; `ticketId` added to `Ticket`
- `lib/ticketRecords.ts` — New module: ID generation, record CRUD, localStorage persistence, search, filter chips, edit distance
- `lib/drafting.ts` — Ticket reference guard for all draft paths
- `lib/ai/prompts.ts` — Cold start prompt includes ticket reference instruction
- `app/page.tsx` — Pipeline integration: record creation, stage updates, persistence, Cases view rendering
- `components/views/CaseLookupView.tsx` — New component: case list, detail view, search, filter chips, pagination
- `components/maesa/Sidebar.tsx` — Cases nav item and icon
- `lib/orgMemory.ts` — `clearTicketRecords()` call in `clearOrganization()`

### Verification

- Production build passes (`next build` completes without errors).
- Submit ticket → ID `MT-20260704-0001` appears immediately in UI; subsequent ticket increments to `MT-20260704-0002`.
- Full pipeline completion → Cases view shows record with all journey sections populated (Classification, Memory, Resolution, Learning).
- Reload app → ticket records survive in localStorage; search by ticket ID returns correct result.
- Filter chips: Cold start filter returns cold-start cases; Rejected filter returns 0 when no tickets were rejected.
- Draft closing includes ticket reference (`Your ticket reference is MT-20260704-0002.`).

### Known Limitations

- Ticket counter is per-org but not per-day — the sequence number does not reset daily.
- Ticket records use localStorage like all other persistence — subject to the same browser storage limits.
- Bulk upload ticket record creation only occurs at cluster commit, not at individual query upload.
- The `extractedFields` and `subIssues` fields from the original spec are not yet included in `TicketRecord`.

---

## Version 0.8.0

Date: 2026-07-03

### Added

- **Organizational Memory** — localStorage-backed knowledge store with versioning, provenance tracking, trust scoring, and example ticket accumulation. Knowledge items progress through Learning, Maturing, and Production lifecycle stages.

- **Canonical Problem Engine** — Deterministic problem identity system that maps incoming tickets to known organizational problems using signal-based matching, similarity scoring, and category rules. Includes customer response templates, internal guidance, and resolution workflows for each canonical problem type.

- **Trust Engine** — Per-knowledge-item trust scoring that accumulates from human approvals. Trust scores determine whether a ticket can be auto-resolved or requires human review. Each organization profile sets its own auto-resolution threshold.

- **Pattern Discovery** — Deterministic emerging pattern detection that groups unresolved or recurring tickets, calculates confidence scores, and supports promotion of discovered patterns into canonical problems.

- **Organization Profile Engine** — Multi-tenant profile system supporting different industries (Software/SaaS, Delivery/Logistics, Legal Services). Each profile defines supported domains, business vocabulary, issue types, out-of-scope topics, customer tone, support boundaries, escalation rules, and auto-resolution thresholds.

- **AI Advisory Layer** — Optional AI-assisted draft generation using connected LLM providers. AI drafts are clearly labeled as advisory and always require human review. The system falls back to deterministic templates when AI is unavailable.

- **LM Studio Provider** — Local LLM integration via LM Studio's OpenAI-compatible API. Supports Gemma and other locally-hosted models with configurable timeouts and token limits.

- **AI Provider Interface** — Pluggable provider architecture supporting LM Studio (local), AMD Cloud (placeholder), and disabled modes. All AI requests route through a Next.js API proxy to avoid CORS issues.

- **Knowledge Candidate Pipeline** — Approved resolutions become knowledge candidates that enter the organizational memory through the reflection workflow. New issues create new knowledge entries; repeat issues merge into or version existing entries.

- **Reflection Workflow** — Post-approval analysis that determines whether a resolution should create new knowledge, merge into existing knowledge, create a new version, or only update trust. Reflection decisions are deterministic and based on category compatibility, similarity scoring, and existing knowledge state.

- **Bulk Knowledge Upload** — CSV-based bulk intake for importing historical knowledge. Uploaded items enter the memory with appropriate provenance tracking and initial trust scores.

- **Three Knowledge Intake Doors** — Knowledge enters the system through three paths: (1) the ticket resolution pipeline (observe, understand, draft, review, reflect), (2) bulk CSV upload, and (3) the reuse/second-ticket flow where similar tickets reuse and strengthen existing knowledge.

- **Business Domain Classification** — New deterministic pipeline stage between Business Relevance Guardrail and Canonical Problem Detection. Classifies tickets into 20 business domains (Authentication, Activation, Two-Factor Authentication, Licensing, Billing, Subscription, Product Version, Installation, Compatibility, Performance, Application Stability, Dashboard, Account Management, Data Sync, API, Shipping, Delivery, Client Portal, Legal Document, Consultation). Supports multi-domain detection with primary domain selection, confidence scoring, and organization profile-aware domain filtering.

- **Email Recovery Intent** — Dedicated handling for "forgot email" and account recovery tickets that were previously misclassified as login issues.

- **AI Diagnostics** — Runtime diagnostics panel showing AI provider status, connection health, model availability, and fallback behavior. Helps operators verify LM Studio connectivity and model loading.

- **Cold Start AI** — When no organizational memory matches a ticket, the system routes to Cold Start AI (Gemma via LM Studio) for an initial draft suggestion. Cold start drafts are explicitly labeled as not backed by organizational knowledge and always require human review.

- **Local Organization Memory** — All organizational knowledge persists to localStorage with automatic migration, deduplication (3-layer: engine merge, load migration, retrieval), and session/organization-scoped reset capabilities.

- **Auto Resolution** — Tickets matching high-trust knowledge items can be auto-resolved without human review. Auto-resolution is gated by the organization profile's threshold and is blocked entirely for unknown/uncategorized issues.

- **Organizational Metrics** — Dashboard tracking open tickets, knowledge reuse count, auto-resolutions, trust growth, out-of-scope dismissals, and learning events.

### Changed

- AI draft generation now uses larger token limits for more complete responses.
- AI provider routes through the Next.js API proxy (`/api/ai/chat`) to avoid browser CORS restrictions.
- Trust scoring improved with per-organization thresholds and human approval accumulation.
- Business relevance assessment is now profile-aware, using each organization's configured vocabulary, domains, issue types, and out-of-scope topics rather than a single global signal list.
- Draft generation validates category compatibility before rendering templates, preventing cross-category template misuse regardless of trust or similarity scores.
- Business Relevance Guardrail expanded with approximately 30 new software support terms (update, crash, install, compatibility, performance, sync, import, export, software, application, launch, startup, loading, freezing, feature, and variants).
- Five new category rules added to the analyzer: Product Version, Installation, Compatibility, Performance, Application Stability.
- Maesa Tech organization profile expanded to 15 supported domains, 26 business vocabulary terms, and 17 supported issue types.
- Out-of-scope ticket rejection now displays a visible error message explaining the rejection reason.

### Breaking Changes

- Business Relevance Guardrail now determines only whether a ticket belongs to the organization. It no longer considers whether the issue exists in Organizational Memory.
- Business Domain Classification now performs domain identification before Canonical Problem Detection. Domain context is available to downstream stages.
- Unknown business issues no longer terminate the pipeline. Any ticket that passes the Business Relevance Guardrail will complete the full pipeline regardless of whether organizational memory contains a match.
- Cold Start AI replaces previous rejection behavior for unknown but relevant issues. Stages that previously returned early with "No reusable knowledge found" now route to AI advisory and human review.
- Auto-resolution is blocked for unknown and uncategorized issues regardless of trust score. Only validated, categorized canonical problems may auto-resolve.

These changes affect future development assumptions. Any new pipeline stage or feature should assume that unknown issues will always flow through the full pipeline rather than being stopped at intermediate stages.

### Developer Notes

This section captures engineering lessons learned during implementation rather than user-facing features.

- Gemma performs better with compact JSON response formats. Requesting structured JSON with explicit field names produces more reliable output than open-ended text generation.
- Long reasoning outputs frequently exceed token limits. AI prompts should request concise analysis rather than detailed explanations.
- AI advisory should remain deterministic-safe. Every AI-generated draft must have a deterministic fallback that produces a usable response when AI is unavailable or returns unusable output.
- Customer-facing drafts should always be category-validated. A template from one category must never be served for a ticket in an incompatible category, even if similarity or trust scores are high.
- AI responses should never bypass governance. All AI output passes through the same human review and reflection pipeline as deterministic drafts. There is no fast path that skips review.
- Signal-based matching is sensitive to vocabulary coverage. Missing a single common term (e.g., "crash", "update") can cause valid business tickets to receive uncertain relevance status. Vocabulary expansion should be tested against realistic ticket samples.
- Mojibake and encoding issues in source files can cause build failures that are difficult to diagnose. Edits to files with BOM markers or mixed encodings should be verified with a production build before committing.

### Fixed

- Duplicate canonical problems caused by ID collisions resolved with 3-layer deduplication (engine merge, load migration, retrieval).
- Duplicate React keys in rendered lists.
- Pipeline stall for unknown business issues — two dead-end early returns in the reuse/second-ticket flow replaced with cold start path continuation.
- Incorrect login draft served for forgot-email requests — email recovery now handled as a distinct intent.
- Activation draft truncation caused by template rendering issues.
- LM Studio timeout handling improved with configurable timeouts and graceful fallback.
- AI fallback diagnostics — clear reporting when AI is unavailable rather than silent failure.
- Category-safe deterministic fallback — when AI is unavailable, the system uses the correct category template rather than a generic fallback.
- Unknown business issues incorrectly rejected — approval gate changed from `!businessRelevance?.isRelevant` to `businessRelevance?.status === "out_of_scope"` so that uncertain-but-valid tickets are not blocked.
- Canonical merge issues where similar but distinct problems were incorrectly merged.
- Auto-resolution safety — unknown and uncategorized issues are now forced to human review regardless of trust score.
- File encoding issues — Unicode smart quotes and mojibake sequences in component files that broke the production build.

### Architecture Impact

```
Knowledge Intake
       |
       v
Business Relevance Guardrail
       |
       v
Business Domain Classification
       |
       v
Canonical Problem Detection
       |
       v
Memory Retrieval
       |
       v
AI Advisory (Cold Start if needed)
       |
       v
Human Review
       |
       v
Knowledge Candidate
       |
       v
Validation
       |
       v
Organizational Memory
       |
       v
Trust Evolution
       |
       v
Pattern Discovery
```

Knowledge always begins at Knowledge Intake. The Business Relevance Guardrail answers a single question: "Does this ticket relate to the organization's responsibilities?" Tickets that pass proceed to Business Domain Classification, which identifies the business domain before any memory lookup occurs.

Canonical Problem Detection determines whether the issue matches a known organizational problem. If a match exists, Memory Retrieval provides the relevant knowledge and trust context. If no match exists, the ticket routes to Cold Start AI for an initial draft suggestion rather than being rejected.

All tickets — whether matched or unmatched — proceed through Human Review. Validation is required before Organizational Memory is updated. After a resolution is validated and stored, Trust Evolution updates the knowledge item's trust score based on successful reuse. Pattern Discovery operates over validated Organizational Memory, detecting emerging patterns across resolved tickets.

Previously, unknown business issues were often rejected because they did not match existing organizational knowledge. The Business Relevance Guardrail conflated "not in our memory" with "not our business." The introduction of Business Domain Classification separates business relevance from organizational memory. This architectural change allows the OIP to continuously learn new organizational knowledge rather than only recognizing existing problems.

### Major Files Affected

The following files represent the architectural hotspots for Version 0.8.0. Future developers working on pipeline behavior, knowledge lifecycle, or AI integration should start here.

- `app/page.tsx` — Pipeline orchestration, ticket lifecycle, approval gates, cold start routing
- `lib/analyzer.ts` — Business Relevance Guardrail, signal matching, category rules
- `lib/domainClassifier.ts` — Business Domain Classification engine
- `lib/canonicalProblemEngine.ts` — Canonical problem detection, response templates, resolution workflows
- `lib/trustEngine.ts` — Trust scoring, auto-resolution eligibility
- `lib/memory.ts` — Knowledge storage, retrieval, deduplication, localStorage persistence
- `lib/patternDiscovery.ts` — Emerging pattern detection and grouping
- `lib/drafting.ts` — Draft generation, category compatibility, lesson matching
- `lib/ai/lmStudio.ts` — LM Studio provider, timeout handling, response parsing
- `lib/ai/prompts.ts` — AI prompt construction for analysis and drafting
- `lib/ai/adapter.ts` — AI provider routing and fallback logic
- `data/seedOrganizationProfiles.ts` — Organization profile definitions
- `components/views/TicketWorkspace.tsx` — Ticket UI, OIP reasoning timeline, review workflow

### Migration Notes

- Existing localStorage data automatically migrates to the newest data structures on load. No manual intervention is required.
- Organization Profiles remain backward-compatible. Existing profiles continue functioning. New profiles can be added without affecting existing ones.
- Existing Canonical Problems continue functioning. New canonical rules extend coverage without modifying existing problem identities.
- Existing Trust Scores are preserved across updates. The trust accumulation model is additive.
- No manual migration is currently required. Future versions that introduce breaking storage changes should document migration steps here.

### Verification

- Production build passes successfully (`next build` completes without errors).
- Dev server runs successfully on Next.js 15.5.19.
- Organization Profile switching verified across Maesa Tech, FastDrop Logistics, and Pramana Legal.
- Canonical Problem merging verified — similar tickets strengthen existing knowledge rather than creating duplicates.
- Trust Engine verified — trust accumulates from human approvals and gates auto-resolution.
- Pattern Discovery verified — emerging patterns detected from recurring unresolved tickets.
- Email Recovery intent verified — "forgot email" tickets classified correctly, not misrouted as login issues.
- Activation workflow verified — "Activation code invalid" correctly identifies canonical problem.
- AI proxy verified — LM Studio requests route through `/api/ai/chat` successfully.
- Cold Start AI verified — unknown business issues route to AI draft generation rather than being rejected.
- Business Relevance rejection verified — "My girlfriend left me" correctly rejected with visible error message.
- Multi-domain classification verified — "Dashboard freezes after latest update" correctly classified as Product Version, Performance, Dashboard.

### Known Limitations

- localStorage persistence only — all organizational knowledge is stored in the browser and will be lost if storage is cleared.
- No production database — no server-side persistence layer exists.
- No enterprise authentication — no user accounts, roles, or access control.
- Pattern discovery remains deterministic — no ML-based clustering or semantic grouping.
- AI advisory quality depends entirely on the connected local model (Gemma via LM Studio).
- Manual browser regression testing should continue as new features are added — no automated end-to-end test suite exists.
- Domain classification confidence is signal-count-based, not semantic — tickets with few matching keywords receive low confidence scores.
- Bulk upload does not validate against existing knowledge for duplicates before import.

### Next Steps

- Enterprise storage backend to replace localStorage with a production database.
- Historical Knowledge Import improvements with deduplication and conflict resolution.
- Manual Knowledge Entry workflow for directly authoring knowledge without a ticket.
- Additional organization profiles for other industries and use cases.
- AMD Cloud provider implementation for cloud-hosted AI advisory.
- Advanced semantic retrieval using embeddings and vector similarity rather than keyword matching.
- Knowledge graph evolution to represent relationships between canonical problems, domains, and solutions.
- Multi-tenant architecture with proper data isolation between organizations.
- Automated end-to-end testing for pipeline regression prevention.

---

## Future Maintenance Guidelines

Every significant architectural change, major feature, important bug fix, or implementation milestone should append a new dated entry to this changelog rather than modifying historical entries. This preserves an accurate history of the platform's evolution.

Future entries should follow this structure:

- **Version Number**
- **Date**
- **Added**
- **Changed**
- **Breaking Changes**
- **Fixed**
- **Architecture Impact**
- **Developer Notes**
- **Major Files Affected**
- **Migration Notes**
- **Verification**
- **Known Limitations**
- **Next Steps**

Not every section is required for every entry. Include only sections that are relevant to the changes being documented. At minimum, every entry should include Version Number, Date, and at least one of Added, Changed, or Fixed.
