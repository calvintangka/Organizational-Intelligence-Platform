# Current Status

This file is the fastest accurate snapshot of the prototype as of 2026-07-15.

## What Changed Most Recently

Implemented TODO-004 Batch 4: explicit server mode now supports database WRITES as well as reads. The write path is `app/page.tsx` -> `ServerPersistenceAdapter` -> API mutation routes (PUT resources, POST `commits/validation`, POST `tickets/allocate`, POST `reset`, DELETE organization) -> transactional `lib/server/persistenceService.ts` -> Prisma -> PostgreSQL. Consequential operations are atomic: the Human Validation / Reflection commit persists candidate lifecycle + ValidationRecord + MemoryChangeRecord + knowledge/trust/version update in ONE Prisma transaction (rollback on any failure), ticket IDs come from a row-locked organization-scoped `TicketSequence` increment (single and bulk), and reset/deletion are single transactions scoped to exactly one organization (deletion relies on verified `onDelete: Cascade`). Knowledge writes use optimistic revisions (new `revision` column); duplicate validation submissions are blocked by new `(organizationId, candidateId)` / `(organizationId, validationRecordId)` unique constraints, and identical replays are idempotent no-ops. Audit records are append-only (snapshot PUT rejected with 405); in server mode knowledge/validation/memory-change state persists only through the commit operation, while candidates, metrics, log, patterns, tickets, and profile/list persist through scoped snapshot upserts. Local mode remains the committed default, server mode never falls back to localStorage, and mature Maesa/FastDrop/Pramana browser data was NOT migrated or touched — Batch 5 still owns safe localStorage -> PostgreSQL migration. Verified against live PostgreSQL (`oip_development`) via `npm run probe:db-writes` (concurrency A–G, isolation, reset, delete, cascade, rollback) plus live dev-server route checks with a disposable organization; both mocked probes, Prisma validate/generate, migrate status (2 migrations applied; new `20260715183000_add_write_concurrency_controls`), typecheck, build, and diff check pass.

Implemented TODO-004 Batch 3: added a GET-only server read path through `ServerPersistenceAdapter` -> organization API routes -> `lib/server/persistenceService.ts` -> lazy server-only Prisma. `NEXT_PUBLIC_OIP_PERSISTENCE_MODE=server` is required to opt in; local mode remains the default. Organization-scoped database queries validate IDs, verify organization existence, and filter directly by `organizationId`; missing organizations return 404 and unavailable/schema-missing databases return safe 503 errors. Server adapter writes fail explicitly and never fall back to localStorage. The server-read probe, local persistence boundary probe, Prisma validation/generation, typecheck, build, diff check, and runtime unavailable-database check pass. No localStorage or mature browser data was touched. Live PostgreSQL verification is pending because `DATABASE_URL` is unavailable; live browser verification was not performed. `graphify update .` remains blocked by the Windows uv trampoline.

Implemented TODO-004 Batch 2: the application now uses `lib/persistence/adapter.ts` through the active `persistence` instance from `lib/persistence/index.ts`. `LocalStorageAdapter` is a thin delegation layer over the hardened `orgMemory`, `ticketRecords`, and `organizationProfile` modules. Page-level hydration, save effects, migration preparation, organization reset/deletion, and ticket ID allocation now use the adapter; profile/list persistence remains the existing two-key browser model. The deterministic persistence probe, `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass. No browser data was touched, no keys were renamed, no v3 keys were introduced, and no Prisma/server code is in the client persistence chain. Live browser verification was not performed. `graphify update .` remains blocked by the Windows uv trampoline.

Implemented TODO-004 Batch 1: added a dormant PostgreSQL + Prisma 7.8 persistence foundation. `prisma/schema.prisma` models organizations and the organization-owned knowledge, candidate, validation, memory-change, ticket, pattern, metric, intelligence-log, and ticket-sequence records. Each organization-owned database record has a required organization relation and organization-oriented indexes; ticket IDs are unique only within their organization. `lib/server/prisma.ts` exposes an intentionally unused server-only PostgreSQL client, so the current client-side runtime remains on the existing localStorage adapters. `npm run prisma:validate`, `npm run prisma:generate`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass. No `DATABASE_URL` is configured locally, so no migration was created or applied; no browser/localStorage data was read, cleared, or overwritten. `graphify query` and `graphify update .` remain blocked by the Windows uv trampoline.

Implemented TODO-004 Batch 0: every organization-owned persistence entry point now requires an explicit non-empty `organizationId` at compile time and runtime. `lib/organizationId.ts` centralizes the guard; `lib/orgMemory.ts` and `lib/ticketRecords.ts` resolve only scoped keys from public operations, while direct legacy `oip.*.v2` reads remain internal to migration/fallback paths. Legacy-compatible domain fields stay optional only for seed and v2 deserialization, and scoped loaders stamp the requested owner before returning data. The deterministic in-memory persistence-boundary probe passed for invalid IDs, Maesa/FastDrop/Pramana isolation, copy-only legacy migration, owner fallback, reset suppression, deletion cleanup, ticket-counter fallback, and scoped self-heal writeback. No browser data was touched; `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass. `graphify update .` remains blocked by the Windows uv trampoline.

Fixed TODO-003b / D-1 + D-2: ticket records and counters now consume orgMemory's safe runtime fallback state when migration and marker persistence both fail in one session, while ownership, reset suppression, ambiguity, and deletion checks remain enforced. Counter allocation uses a guarded scoped write; failures return no ID, preserve the legacy counter, surface through the existing error path, and recover correctly after quota recovery. Bulk validation reserves its complete contiguous ID range before committing memory, and empty fallback ticket saves cannot orphan readable legacy records.

Targeted probes passed for runtime fallback with marker failure, owner-only isolation, fallback orphan prevention, truly empty organization saves, counter quota failure/retry, contiguous bulk allocation, and legacy-key immutability. `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass. `graphify update .` remains blocked by the Windows uv trampoline.

Fixed TODO-003 Batch 4 / C-DUP-001: canonical KnowledgeItem merges now preserve lessons instead of dropping the secondary item's lessons. Unique lessons retain deterministic order; equivalent same-ID lessons merge additive fields and source-ticket references; materially conflicting same-ID lessons are preserved under deterministic conflict-safe IDs with append-only conflict history. Dedupe/upsert keys include organization scope, and direct cross-organization merges are rejected. Earlier migration, reset, deletion, retry, and ownership fixes remain intact.

Targeted canonical probes passed for distinct lessons, duplicate and additive lesson IDs, conflicting core content, versions, examples, learning history, organization mismatch, and repeated idempotent deduplication. `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass. `graphify update .` remains blocked by the Windows uv trampoline.

Fixed TODO-003 Batch 3 / D1 + E1 + E2: fallback memory-change tail writes now reject visibly on quota/storage failure instead of claiming success, while the caller retains the unsaved records for retry and preserved global history remains read-only. Reset writes a durable per-organization `legacyImportSuppressed` tombstone before clearing scoped state, so reload and migration cannot silently re-import legacy data. Deletion clears only the deleted organization's scoped resources and migration entry; deleting the legacy owner preserves the owner evidence but marks ownership ambiguous and blocks transfer. Cleanup failures propagate through the existing persistence error path. Batch 2 retry/idempotency and B1 ownership behavior remain intact.

Targeted D1/E1/E2 localStorage probes passed for successful and failed tail writes, retry/reload deduplication, reset suppression, inactive and owner deletion, cleanup failure visibility, legacy preservation, and ownership blocking. `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass. `graphify update .` remains blocked by the Windows uv trampoline.

Fixed TODO-003 Batch 2 / A1 + A2 + F1: `lib/orgMemory.ts` now retries resource copies recorded as `fallback` or `error`, preserves scoped values on retry, isolates malformed-resource failures, and keeps migration completion unset while any resource remains unresolved. A centralized resource list replaces the hardcoded completion count, and a valid completed marker now makes reload migration a true no-op without resource or marker writes. B1 owner-only migration/fallback behavior, read-only legacy keys, and BUG-009's intentional memory-change fallback remain unchanged. TODO-003 remains in progress because duplicate prevention, reset/delete semantics, and other residual risks were not changed in this batch.

Targeted in-memory localStorage probes covered quota recovery, malformed-resource isolation, retry convergence, existing scoped-data protection, completion no-op writes, owner gating, and BUG-009 fallback behavior. `npm run build` and `npx tsc --noEmit` pass. `graphify update .` remains blocked by the Windows uv trampoline.

Fixed TODO-003 Batch 1 / B1: legacy ownership safety. `lib/orgMemory.ts` now persists `legacyOwnerOrganizationId` with durable ownership status, binds migration and fallback reads to that owner, and never assigns preserved global `oip.*.v2` data to a later or newly created organization. Existing pre-fix state is handled by accepting the old single-organization marker or one unambiguous migration record; the repository’s original Maesa Tech workspace is the explicit fallback owner when profile evidence is otherwise absent. Multiple pre-fix organization records or missing ownership evidence produce a durable ambiguous-blocked marker and a readable migration warning instead of guessing. Existing scoped data and legacy v2 keys remain untouched, and runtime ownership preserves BUG-009 fallback behavior if the marker write itself is quota-blocked.

Targeted in-memory localStorage probes passed for original-owner migration, second-organization blocking, new-organization isolation across reload, existing scoped-data preservation, owner-only quota fallback, and ambiguous pre-fix state. `npm run build` and `npx tsc --noEmit` pass. TODO-003 remains in progress because the separate retry, duplicate-lesson, reset/delete, and idempotency defects were intentionally not changed in this batch.

Fixed BUG-010: generic KnowledgeItem templates now require root-cause compatibility in addition to category compatibility. `lib/drafting.ts` classifies conservative root-cause families, rejects ambiguous or conflicting evidence, blocks explicit Login contradictions, and allows a strong non-contradicted validated lesson as the only narrow exception. `lib/analyzer.ts` distinguishes credential-unavailable tickets from credential-mismatch tickets, and `app/page.tsx` applies the authorization gate before selection, discrimination, UI provenance, deterministic drafting, AI grounding, and AI-unavailable fallback. Root-cause mismatch now routes to `no_template` Human Review instead of a broad category template. BUG-008’s paraphrase retrieval behavior, organization isolation, and persistence migration are unchanged.

Targeted regression probes passed for the Kevin case, genuine credential mismatch, FastDrop/Maesa laptop lessons, Adrian/Felix-style billing contradictions, and same-category root-cause mismatch. Build and sequential typecheck pass. Mature Pramana/Maesa visual regression remains unavailable in the current browser profile because those records are not present.

Fixed BUG-009: organization-isolation migration no longer crashes startup when a mature `oip.memoryChanges.v2` payload cannot fit beside the new scoped keys. `lib/orgMemory.ts` now records migration state per organization and resource, copies smaller critical datasets first, bounds copied intelligence-log history, and treats memory-change snapshots as a preserved legacy fallback with an optional bounded scoped tail. Ticket records use the same fallback principle when their full copy does not fit. Quota failures are caught inside the migration write path, failed resources are not retried as full copies on later reloads, and `app/page.tsx` surfaces a readable storage notice. Legacy v2 keys remain untouched and migration has no completion timestamp while any resource remains on fallback.

`npx tsc --noEmit` and `npm run build` pass. Local browser startup on the existing profile loaded without a `QuotaExceededError` or console error and showed the fallback notice while switching to Maesa. The current browser profile had no mature Maesa records to compare visually, and raw localStorage inspection was not performed.

Fixed four TODO-002 lifecycle gaps in `app/page.tsx`: reset preserves the active organization profile and reseeds using its id; deleting the active organization clears only that scope and reloads the fallback through the guarded switch path; adding an organization passes the computed list so the new organization actually loads; and switching captures the initial `hydrated` state so failed hydration cannot save defaults into the previous organization. Storage keys, migration behavior, generation guarding, and the validated candidate → validation → memory-change pipeline are unchanged.

Typecheck and production build pass. Live browser verification confirmed FastDrop reset stayed on FastDrop with no validated memory and new organization creation switched to `Isolation Test Org` with seed defaults. Active-Maesa deletion and corrupt-scoped-key recovery remain unverified because the in-app browser became unstable with CDP/page-load timeouts.

Implemented TODO-002 / Phase 2 of A-005 organization isolation. `lib/orgMemory.ts` and `lib/ticketRecords.ts` now use versioned keys in the form `oip.organization.<encoded-org-id>.<resource>.v1` for all organization-owned state, including ticket counters. A durable copy-only migration assigns legacy global `oip.*.v2` data to the active workspace organization exactly once, stamps ownership fields where supported, preserves all legacy keys, and does not overwrite existing scoped keys. `app/page.tsx` saves the current organization before switching, loads the selected organization's complete state, pauses persistence while switching, and uses a generation guard so stale async loads cannot contaminate the newly selected organization. New organizations receive only their own scoped state plus the existing intentional starter knowledge behavior; reset is scoped to the active organization.

Live browser verification on `http://localhost:3001` confirmed FastDrop showed no validated Maesa memory, switching back restored Maesa's Login Issue trust/provenance state, and reload preserved Maesa state. Build and typecheck pass. Raw localStorage inspection and the requested new FastDrop ticket/revalidation scenario remain unverified. `graphify update .` could not run because the Windows uv trampoline failed.

Prepared Phase 1 of A-005 without changing the live storage schema. `types/knowledge.ts`, `types/metrics.ts`, and `types/patterns.ts` now carry optional `organizationId` ownership on the org-owned records that will need later isolation. `lib/orgMemory.ts`, `lib/organizationProfile.ts`, and `lib/ticketRecords.ts` now expose async-compatible load/save functions so a later database adapter can replace localStorage without reshaping the page-level call sites. `app/page.tsx` now hydrates by loading the organization profile first, then awaiting all organization-owned state with that profile id before setting `hydrated`, and it catches load failures so seeded defaults do not silently overwrite existing browser data. Save effects now catch async persistence failures explicitly, and new candidates, validation records, memory change records, promoted/new knowledge items, org metrics seeds, and new/updated emerging patterns are stamped with the active organization id. Existing localStorage keys remain unchanged (`oip.*.v2` / `oip.organization*.v1`), organization switching behavior is unchanged, and the next phase still owns real isolation.

Fixed BUG-006 where strong lesson matching could override explicit opposite intent and route a Billing request into Login reuse. `lib/analyzer.ts` no longer lets tied category scores fall through by array order: it now adds domain-specific intent evidence, penalizes Login when the ticket explicitly says sign-in/password are working, and falls back to `Uncategorized` instead of forcing a weak match. `lib/drafting.ts` now keeps negation tokens during lesson-signal matching, rejects polarity contradictions such as `remember my password` vs `never remembered password`, and exports `ticketContradictsLesson()` so contradicted login-failure lessons are blocked before drafting. `app/page.tsx` now treats category compatibility as a hard gate in every affected retrieval/drafting path and only bypasses broad discrimination for strong lesson matches when no contradiction markers are present. Browser verification on `http://localhost:3001` confirmed Adrian Santoso now classifies as Billing with no matched Login lesson, while Putri/Stephanie/missing-name positives still stay lesson-grounded and render the correct greeting line behavior.

Fixed four lesson-reuse/reflection state bugs in the live MVP flow without changing the AI architecture or persistence model. `lib/reflection.ts` now compares a lesson-grounded reviewed response against the matched lesson's own `customerResponse` instead of the parent knowledge item's generic template, and `app/page.tsx` now resolves reflection from the actual rendered draft source rather than recomputing a fresh canonical match during approval. That prevents lesson-backed approvals from misfiring into `create_version` and, in `confirmReflection()`, keeps lesson-grounded commits from overwriting `customerResponseTemplate` / `approvedAnswer` or minting a new `KnowledgeVersion` unless the reviewer truly edited the generic template. The manual ticket path also now keeps `similarKnowledge` synchronized with the effective discriminated match, `analyzeTicket()` clears stale discrimination banner state at the top of each run, and `components/ProvenancePanel.tsx` preserves the matched-lesson explanation even when AI is unavailable. Manual browser verification on a disabled-AI instance confirmed a validated Login lesson stayed lesson-grounded in the UI, WHY THIS RESPONSE named the matched lesson, reflection resolved to `trust update only`, trust increased from 20 to 25, and the parent `Login Issue` knowledge item remained at Version 1 with its generic customer template intact.

Fixed the live Putri/Stephanie lesson-reuse failure where the browser pipeline could route to no-match before evaluating validated lessons. The real issue was upstream of Claude/AI availability: `findMatchingLesson()` only ran after `retrieveMemory()` had already returned a parent `KnowledgeMatch`, so child lessons under `Login Issue` were invisible when the parent did not survive retrieval/selection. `app/page.tsx` now adds a deterministic pre-discrimination lesson search for compatible canonical memory items, and `lib/drafting.ts` now scores lesson signals with exact or token-overlap matching so phrases like "new laptop", "saved browser passwords", "autofill", and "never remembered password" resolve to the switched-laptop/browser-saved-password lesson. Strong lesson-grounded drafts now keep the validated template as the rendered response instead of allowing an AI rewrite to replace it, preserving `Hi {{customerName}},` and `{{ticketId}}` output. AI chain diagnostics also summarize provider failures into short plain-text messages instead of surfacing raw HTML error bodies.

Fixed two connected high-severity AI-reuse bugs: lesson-backed match discrimination now treats validated lesson hits as first-class evidence instead of cold-starting a generic template, and reusable lesson responses now normalize stale customer-specific greetings before deterministic rendering. In practice, `requestMatchDiscrimination()` now carries the validated lesson candidate into the AI prompt, can bypass broad discrimination for strong lesson matches, and keeps the draft grounded in the validated lesson instead of rejecting it as a distinct problem; meanwhile `lib/canonicalProblemEngine.ts`, `lib/knowledgePacks.ts`, `lib/orgMemory.ts`, and `app/page.tsx` normalize lesson responses so names like `Hi Jevania suyanto,` become reusable placeholders instead of leaking across customers. AI diagnostics also now surface the actual chain attempts and skip/failure reasons, so the UI shows the full LM Studio → Remote Gemma → Claude path rather than only the final failure.

Fixed a high-severity lesson-reuse bug where deterministic fallback could leak the previous customer's greeting and ticket reference from a stored lesson response. The confirmed root cause was not AI availability and not lesson matching itself: reusable lesson rendering only substituted `{{greetingLine}}`, `{{customerName}}`, and `{{organizationName}}`, so a legacy lesson body that literally began `Hi Grace Adeyemi,` rendered that exact text for Derek Huang when AI drafting was unavailable. `lib/canonicalProblemEngine.ts` now normalizes legacy lesson greetings and literal ticket-reference lines into reusable placeholder form, renders `{{ticketId}}` deterministically alongside the existing placeholders, and `lib/drafting.ts` now appends the ticket reference only when the rendered draft does not already include the current one. `app/page.tsx`, `lib/knowledgePacks.ts`, and `lib/orgMemory.ts` also normalize lesson templates at reflection/import/load boundaries so new lessons stay reusable and existing stored lessons self-heal on load without touching unrelated top-level knowledge templates. Manual Derek/Grace regression probing confirmed `Hi Derek Huang,` and the correct current ticket id, with `Hi there,` as the missing-name fallback and no duplicate ticket reference line. See the 2026-07-09 entry in CHANGELOG.md.

Fixed a contradictory match-state UI bug and a missing-name gap in the deterministic draft, found during a live test where both AI tiers failed on a ticket. (1) `processTicketPipeline()` (`app/page.tsx`) computed the Organizational Memory panel's match (`similarKnowledge`, set once from raw retrieval) separately from the match that actually drives the draft (`effectiveTopMatch`, adjusted by LLM discrimination which can reject a candidate as "distinct"). When discrimination rejected a match, the panel kept showing it while the draft correctly said "no matching knowledge found" — a genuine desync between two state values, not a stale-data or AI-failure-messaging bug (both of those hypotheses were checked and refuted). `setSimilarKnowledge` now drops a discrimination-rejected match so both displays agree. (2) The deterministic greeting-rendering plumbing was already correctly wired to use `understanding.extractedFields.senderName` — the actual gap was upstream: `lib/analyzer.ts`'s sender-name extractor only recognized a sign-off word alone on its own line ("Regards,\nSarah"), missing self-introductions ("This is Grace Adeyemi writing in") and same-line sign-offs ("Best, Grace Adeyemi") that a separate, better extractor (used only on the Cases-resume path) already handled. Extended `lib/analyzer.ts` with the same patterns so fresh tickets get the same extraction quality as resumed ones — the AI-draft path's F-2 personalization was untouched and still works. LM Studio's chain order was also verified live: for the reproduction ticket, LM Studio was genuinely attempted first and timed out, then Remote Gemma (unconfigured, 404), then Claude (missing key, 503) — the chain was not skipping tiers. See the 2026-07-09 entry in CHANGELOG.md.

Fixed two bulk-upload bugs found during a live test. (1) The "Clustered via X" badge was reading the AI adapter's static chain-level label (`"AI Chain (LM Studio → Remote Gemma → Claude API)"`, always containing the substring "Claude") instead of the actual succeeding tier's own label, so any successful AI-assisted bulk run showed "Clustered via Claude" even with no `ANTHROPIC_API_KEY` configured and LM Studio doing the real work. `lib/bulkUpload.ts` now tracks the real `providerLabel` from whichever call genuinely succeeded. (2) A field recognized as query/subject-shaped (e.g. `"subject"`) could be selected as the resolution field — via an ambiguous auto-mapping tie or a direct mapping call — causing a subject line to flow into a cluster's "Proposed Customer Response" as if it were a real answer. `extractEntriesFromObjectRows()` now rejects such fields for the resolution role, the mapping UI no longer offers them, and when a cluster has no real resolutions the proposed response is now grounded via `findMatchingLesson()` against the matched knowledge item before falling back to its generic template. No bad data reached Organizational Memory — the affected test cluster was never committed (confirmed with the user). See the 2026-07-09 entry in CHANGELOG.md.

Fixed a data-integrity bug where validating a new lesson on an existing knowledge item (the `create_version` reflection path in `confirmReflection()`, `app/page.tsx`) overwrote the item's generic `customerResponseTemplate` with that lesson's specific `customerResponse`. This made the generic fallback template drift to whichever lesson was most recently validated (e.g. "Login Issue" showing SSO-specific content instead of a generic template), even though `Lesson.customerResponse` and `KnowledgeItem.customerResponseTemplate` were always separate fields. `create_version` now only overwrites the generic template when a reviewer edits it directly with no lesson attached; lesson additions land only in `lessons[]` and no longer create a spurious knowledge version. `lib/canonicalProblemEngine.ts` gained `repairCorruptedCustomerTemplates()`, run from `loadKnowledge()`, which self-heals any already-corrupted knowledge item (2+ lessons, template matching one lesson's response) back to a genuinely generic baseline on next load, leaving lessons and version history untouched. See the 2026-07-09 entry in CHANGELOG.md for full diagnosis and verification.

Three-tier AI fallback chain implemented: LM Studio (local Gemma) → Claude API (cloud) → Deterministic (always works). This replaces the previous two-tier chain (LM Studio → Deterministic) everywhere AI is used: single-ticket drafting, match discrimination, bulk clustering, analysis, canonical suggestion, pattern naming, and knowledge enrichment. The chain tries tiers in order and stops at first success. Claude API tier gracefully skips when ANTHROPIC_API_KEY is missing. UI labels now distinguish which provider produced a draft: "Drafted locally (Gemma)" / "Drafted via Claude" / "Standard template (AI unavailable)". All boundary rules (F-04 human review gate, no-unvalidated-commitments, cold-start honesty, memory-write governance) apply to Claude API drafts identically to Gemma drafts. See ADR-010 in DECISIONS.md.

## What Works Right Now

- Full learning loop
  Single-ticket intake, analysis, memory retrieval, draft generation, human review, reflection, validated memory commit, and trust evolution all exist in code.

- Lessons as first-class learning objects
  `KnowledgeItem.lessons` is live, lessons can be authored during reflection or imported from a starter pack, and `findMatchingLesson()` can drive lesson-grounded drafts.

- Lesson templates are now reusable across customers
  Lesson `customerResponse` values support deterministic `{{customerName}}` and `{{ticketId}}` substitution, legacy lesson greetings/ticket references are normalized on load, and deterministic reuse no longer leaks another customer's name when AI drafting is unavailable.

- Starter Knowledge Pack intake
  The Knowledge page can preview `.json` packs, warn on unknown classifier categories, import a pack as a pending `KnowledgeCandidate`, and validate it into memory through the existing governed commit path.

- Login starter pack shipped
  `data/packs/login-issues-v1.json` now carries 9 distinct Login lessons, including per-lesson signals, escalation guidance, and `doNotPromise` guardrails.

- Five additional starter packs shipped
  `billing-invoices-v1`, `subscription-trial-v1`, `api-integrations-v1`, `shipment-issues-v1`, and `client-portal-v1` are now in `data/packs/`. Billing and Subscription use recognized analyzer categories; API/Integrations, Shipment Issues, and Client Portal intentionally surface the category-fallback warning.

- Bundled starter-pack previews are broader
  The Knowledge view no longer previews only the login sample; every bundled pack can be previewed directly from the UI before import.

- Bulk upload with validation
  Historical queries can be parsed, clustered, reviewed, and committed through the same candidate/validation/memory-change path as single tickets.

- Memory network and knowledge views
  The knowledge workspace and full-screen memory network overlay are implemented.

- Three Gemma draft grounding modes
  `lesson_grounded`, `memory_grounded`, and `cold_start` are all represented in `SuggestedResponse` and set in `requestDraftAdvisory()`.

- Structured extracted customer context
  `Understanding` now carries `extractedFields` such as sender name, deadline, sub-issues, and urgency indicators. LM Studio can populate them during the existing analysis call, and deterministic fallback heuristics preserve sender-name extraction when AI is unavailable.

- Tone of voice is wired, not decorative
  `OrganizationProfile.customerTone` already persisted through the Organization view and deterministic drafting. AI drafting now also uses explicit per-tone prompt instructions instead of relying on profile metadata alone.

- Resume in-progress ticket from Cases (F-1)
  "Resume in workspace" button on the case detail panel for in_review tickets. Restores the pipeline at Human Review with stored classification, memory match, and deterministic draft. Warns before clobbering a different in-progress workspace. Button absent on resolved/rejected/discarded cases.

- Personalized AI draft greeting (F-2)
  When sender name is extracted (AI or deterministic), the AI draft greeting uses the name ("Hello Sarah Johnson,"). A deterministic safety net substitutes the name if the AI drops it.

- Bulk upload routes through LLM (F-3)
  Bulk analysis now uses LM Studio when available. The previous silent fallback was caused by insufficient maxTokens for gemma-4-e4b's verbose JSON. Majority-failure threshold prevents single bad responses from flipping the whole run to deterministic.

- Discard ticket before reflection commit
  A "Discard ticket" action is available while the ticket status is open or in_review. It marks the record as discarded, preserves it in Cases (records are never dropped), and creates no knowledge candidates, validation records, or memory changes. The action disappears after a reflection commit.

- Retry AI draft after fallback (F-4)
  When AI mode is enabled and the draft source is not ai_advisory, a "Retry AI draft" button appears in the human review section in both cold-start and reuse paths. It re-runs only the draft advisory call (classification and memory match stand). The button is disabled while in flight.

- Ticket reference in AI drafts (F-7)
  Every AI-generated draft includes the ticket reference (MT-YYYYMMDD-NNNN) in the closing via prompt instruction and a post-processing guard. Deterministic path already had this.

- Clean AI error display
  Raw HTTP diagnostics never render in user-facing UI. The fallback notice shows "AI assistant unavailable — showing standard draft instead." with a collapsible "Technical details" disclosure for debugging.

- Three-tier AI fallback chain
  LM Studio (local Gemma) → Claude API (cloud Haiku) → Deterministic. Implemented in `lib/ai/adapter.ts` as a chain provider. Each tier's failure is logged with the reason. Claude API tier uses `app/api/ai/claude/route.ts` as a server-side proxy (API key never exposed to client). Session call counter caps Claude API at 200 calls per session for cost safety.

- LM Studio proxy and advisory flow
  Browser AI calls route through `app/api/ai/chat/route.ts`, with diagnostics, timeout handling, and deterministic fallback behavior.

- Trust + validation reuse path
  Reuse can route to human review or deterministic auto-resolution depending on validation state, trust score, category safety, and draft source.

- Organization-scoped prototype state
  Knowledge, candidates, validation records, memory changes, metrics, patterns, and org profile state persist in localStorage. The persistence adapters are now async-compatible and accept org ids at the call boundary, but they still intentionally write to the existing `v2`/`v1` keys in this phase.

- Lesson-specific AI guardrails
  When an AI draft is grounded in a lesson, any lesson-level `doNotPromise` entries are appended to the no-unvalidated-commitments rule before the model drafts the customer response.

## Environment Notes

- AI mode is configured in `.env.local` as `NEXT_PUBLIC_AI_MODE=lmstudio`.
- LM Studio base URL is `http://127.0.0.1:1234/v1`.
- Current local model is `google/gemma-4-e4b`.
- Current cloud model is `claude-haiku-4-5-20251001` (configured in `app/api/ai/claude/route.ts`).
- Current timeout is `AI_TIMEOUT_MS=30000` (LM Studio), `CLAUDE_TIMEOUT_MS=8000` (Claude API, configurable via env).
- Claude API requires `ANTHROPIC_API_KEY` in `.env.local`. When missing, the chain skips tier 2 silently.
- If Next.js starts behaving strangely after edits, clear the build cache by deleting `.next` and restart the dev server.
- The in-app browser can reach `http://localhost:3000`, but longer automated UI verification remains somewhat flaky around reloads and JavaScript confirm dialogs.
- Despite the browser flakiness, the shipment pack import flow was completed live this session: preview -> import as candidates -> validate -> reload persistence, followed by two clean ticket spot-checks in FastDrop.

## Known Open Items

- F-3 live bulk LLM path test: upload a 15-query file with LM Studio running to confirm AI-assisted clustering. Code fix verified; live test deferred.
- F-4 live toggle test: stop LM Studio → submit ticket → see fallback → start LM Studio → click Retry → confirm AI draft arrives. Code path verified; live test deferred.
- F-5 (bulk ticket ID chips per query) deferred from audit.
- F-6 (sub-issue enumeration in UI) deferred from audit.
- F-8 (discard flow manual check) — button visible, confirm dialog not exercised by audit driver.
- F-9 (memory network overlay click) — affordance visible but expand behavior not verified.
- Auto-resolution boundary test never live-verified (trust threshold 80 not reached in test sessions).
- Verify the pipeline stall fix for unclassified yet relevant queries end-to-end.
- Run the F-04 live regression test with Gemma enabled.
- Calibrate AI timeout behavior under real Gemma latency rather than the current fixed 30000 ms assumption.
- Add automated regression coverage; the repo still relies on manual verification and build checks.
- Phase 2 of A-005 still needs to isolate storage by organization during load/save and on organization switch; this phase only prepared the signatures, hydration order, and record ownership fields.
- Move beyond client-side persistence when the prototype leaves the demo environment.

## What Is Intentionally Simplified

- Single effective reviewer role in code, not enterprise RBAC.
- Client-side persistence only; no backend database or shared audit store.
- Simplified trust model with bounded numeric scoring.
- Single-file orchestration in `app/page.tsx` rather than distributed services.

## Build / Runtime Snapshot

- Repository: git-backed and active.
- Frontend stack: Next.js 15, React 19, TypeScript, Tailwind CSS.
- Persistence: browser localStorage via `lib/orgMemory.ts`.
- AI provider: LM Studio through same-origin proxy.
- Governance docs: present under `/ai`.

## TODO-004 Batch 5.0–5.1 Export Status

- Export contract: `types/migrationExport.ts`, format `oip-localstorage-export-v1`.
- Read-only exporter: `lib/persistence/migrationExport.ts`, public function `exportOrganizationSnapshot(organizationId)`.
- Export semantics: resolved in-memory organization state, not a raw browser-storage dump. Scoped data wins; permitted legacy fallback is included; memory history merges legacy full history with the scoped tail and deduplicates by ID.
- Knowledge normalization: pure canonicalization and template repair may shape the exported resolved view, but deterministic repair metadata is generated in memory only. No migration preparation, self-healing writeback, marker update, counter allocation, reset, or persistence-mode change occurs.
- Seed rule: displayed seed KnowledgeItems are excluded when no persisted knowledge exists. The package records `source: "seed"` for provenance and exports an empty knowledge resource.
- Ownership: exports require an explicit organization ID. Ambiguous or ownerless legacy storage blocks a migration-ready package; non-owner organizations cannot receive legacy fallback data.
- Digests: per-resource and whole-resource-payload SHA-256 digests use stable key-sorted serialization. `exportedAt` is excluded from content and metadata digests.
- No import path or cutover exists yet. Batch 5.2+ remains intentionally unimplemented.

## TODO-004 Batch 5.2 Import Metadata Status

- Migration applied: `20260715194500_add_migration_import_tracking`.
- Metadata models: `MigrationImportBatch`, `MigrationImportResource`, and `MigrationImportConflict`.
- Batch lifecycle distinguishes pending, importing, conflict, imported, verifying, verified, and failed states. `verified` is not synonymous with `imported`.
- Every batch initializes exactly nine resource checkpoints from the frozen export contract. Checkpoints retain expected/imported/skipped/conflict counts, source/target digests, attempts, timestamps, and errors.
- Idempotency is scoped by `(organizationId, resourcePayloadDigest)`. Conflict evidence is deduplicated by `(batchId, fingerprint)`.
- Conflicts preserve IDs, digests, safe optional JSON evidence, reasons, and resolution status. Open conflicts or incomplete/unverified checkpoints prevent batch verification.
- Organization deletion cascades import metadata consistently with existing organization-owned persistence records. No normal application deletion API for migration history was added.
- `lib/server/migrationImportService.ts` is server-internal metadata infrastructure only. It does not import KnowledgeItems, candidates, audit records, tickets, metrics, patterns, logs, or ticket sequences.
- Batch 5.3 now provides an unauthenticated but organization-scoped `POST /api/organizations/[organizationId]/migration-import` package-intake endpoint.
- Intake accepts only `oip-localstorage-export-v1` version 1, validates ownership/provenance, structural references, counts, and exporter-compatible SHA-256 digests, then creates or reuses a `ready` metadata batch with exactly nine pending checkpoints.
- The validated frozen package is retained in nullable `MigrationImportBatch.packagePayload` for deterministic later retry; arbitrary localStorage dumps are not accepted or stored.
- Intake does not import KnowledgeItems, candidates, validations, memory history, tickets, metrics, patterns, logs, or ticket sequences. Batch 5.4 owns business-data import.
