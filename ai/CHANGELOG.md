# Change Log

## Entry Format

## [YYYY-MM-DD] <short title>
**Layer:** coding | docs | governance
**Task/Prompt:** <prompt file or task description>
**Files changed:** <list>
**What changed:**
- <change>
- <change>
**Boundaries touched:** none | <which boundary was relevant and how it was preserved>
**Verification:** <what was tested>
**Open items:** <anything left unverified>

## [2026-07-09] Data-integrity fix — lesson validation was overwriting the generic customer response template
**Layer:** coding
**Task/Prompt:** Diagnose and fix why the "Login Issue" knowledge item's generic `customerResponseTemplate` (Knowledge page "Customer Response Template" section) showed SSO/Okta-specific content despite covering 16 tickets and multiple distinct-root-cause lessons (forgotten password, SSO, etc.).
**Files changed:** `app/page.tsx`, `lib/canonicalProblemEngine.ts`, `lib/orgMemory.ts`
**Root cause (confirmed):** `confirmReflection()` in `app/page.tsx`, `create_version` branch (previously ~line 2199-2265). `types/knowledge.ts` already defines a genuinely separate top-level `KnowledgeItem.customerResponseTemplate` (generic/fallback) vs. each `Lesson.customerResponse` (lesson-specific) — the type shape was correct. The bug was that this branch unconditionally set `customerResponseTemplate: reviewedResponse` and `approvedAnswer: reviewedResponse` on the whole knowledge item using the *current ticket's* reviewed response, even when a `lessonDraft` was also being committed (the "Teach a Lesson" panel in `ReflectionPanel.tsx`). `generateReflection()` in `lib/reflection.ts` routes to `create_version` whenever a human-approved response diverges substantially from the existing template (`responseOverlap < 70%` at similarity ≥ 80, or `< 40%` otherwise) — which is true almost every time a lesson teaches a genuinely distinct root cause. So each new lesson validated against an existing knowledge item clobbered the shared generic template with that lesson's specific response, explaining the observed version history ("human reviewer provided a meaningfully/substantially different response" × 11) and the SSO content sitting in the generic slot. `merge_existing` and `trust_update_only` branches were already correct (never touched `customerResponseTemplate`). `lib/drafting.ts` `findMatchingLesson()` / `draftResponse()` were also already correct — they already prefer a matched lesson's `customerResponse` over the generic template and only fall back to `renderCustomerResponse(item)` (which reads the corrupted field) when no lesson signals match.
**What changed:**
- `app/page.tsx` `confirmReflection()`, `create_version` branch: when `lessonDraft` is present, the commit no longer overwrites `customerResponseTemplate`/`approvedAnswer` and no longer appends a `knowledgeVersions` entry — a lesson addition is not a generic-template edit. Only a reviewer directly rewriting the generic response *without* attaching a lesson now bumps the version history and the template (unchanged prior behavior). Log entries, `knowledgeVersionsCreated` metric, and the version-count org metric are now conditioned on `!lessonDraft` accordingly. `applyLessonToItem()` (lesson-only mutation) is unchanged — lessons still land only in `lessons[]`.
- `lib/canonicalProblemEngine.ts`: added `repairCorruptedCustomerTemplates()` — a one-time self-heal for already-corrupted knowledge items. Flags any item with 2+ lessons whose top-level `customerResponseTemplate` has ≥70% word overlap with any single lesson's `customerResponse` (the signature of this bug), restores the category's genuinely generic baseline via the existing `getCustomerResponseTemplate()`, and appends a `learningHistory` note documenting the correction. Does not touch `lessons[]` or `knowledgeVersions[]` (append-only, per Boundary 7) — history is preserved, not rewritten.
- `lib/orgMemory.ts`: `loadKnowledge()` now runs `repairCorruptedCustomerTemplates()` on every load (alongside the existing dedupe migration) and persists the repair if anything was flagged.
- Chose not to retroactively re-label the existing "meaningfully/substantially different response" version-history entries — Boundary 7 (append-only lineage) applies. The repair adds a new `learningHistory` entry explaining what happened instead of editing the old `knowledgeVersions[].changeReason` text.
**Boundaries touched:** Boundary 2 (validated commit path) — the fix only narrows what `create_version` writes; still flows through `commitValidatedMemoryChange()`/`upsertCanonicalProblem()` unchanged. Boundary 7 (append-only history) — explicitly preserved; see above. No other boundary affected.
**Verification:**
- `npx tsc --noEmit` — passes.
- `npm run build` — passes (production build clean).
- Live in preview (synthetic corrupted "Login Issue" item seeded into `localStorage` to reproduce the reported scenario, since no static seed/pack data ships pre-corrupted — `seedKnowledge.ts` has no items with lessons and starter packs generate `customerResponseTemplate` independently at import time):
  - Reload triggered `repairCorruptedCustomerTemplates()`: generic template restored to the category baseline, both the forgotten-password and SSO lessons' `customerResponse` left untouched, a `learningHistory` note added, `knowledgeVersions` history left intact.
  - Knowledge page "Customer Response Template" section confirmed showing genuinely generic content; "Lessons Learned" confirmed still showing both lessons with their own distinct, correct responses.
  - Submitted "the page just spins and never loads" (matches neither lesson) → draft correctly used the corrected generic template.
  - Submitted an Okta/SSO-worded ticket → draft correctly still used the SSO lesson's specific response (`findMatchingLesson()` regression check passed).
  - Validated a new third lesson (outdated mobile app) on the same knowledge item via `create_version` + "Teach a Lesson" (explicitly selecting "New Lesson" mode) → generic template unchanged afterward, all 3 lessons present with correct distinct responses, no spurious `knowledgeVersions` entry added.
  - Re-ran the same repair against a synthetic "Two-Factor Authentication Issue" item (2 lessons, template clobbered by one lesson) to confirm the fix generalizes beyond Login — repaired correctly to the Two-Factor Auth category baseline.
- Audited `data/seedKnowledge.ts` and `data/packs/*.json` for the same corruption signature — none found; no shipped/static knowledge item carries this bug (it only arises from live reflection sessions), so the fix is a forward-looking code fix plus a load-time self-heal rather than a static-data patch.
**Open items:** None for this bug. The self-heal in `loadKnowledge()` will correct any other real user's corrupted knowledge items (e.g. Payment Authorization Confusion) the first time they load the app after this fix ships, without manual data intervention.

## [2026-07-08] Remote Gemma 31B tier — four-tier chain, dual-timeout, thinking-disable
**Layer:** coding
**Task/Prompt:** Insert a remote Gemma 4 31B server (ngrok + llama-server) as Tier 2 between local LM Studio and Claude API, using the same OpenAI-compatible request format, then debug why it fell through to Claude despite HTTP 200.
**Files changed:** `app/api/ai/remote-gemma/route.ts` (new), `lib/ai/adapter.ts`, `lib/ai/lmStudio.ts`, `lib/ai/types.ts`, `.env.local` (not committed), `ai/DECISIONS.md`, `ai/CHANGELOG.md`
**What changed:**
- Created `app/api/ai/remote-gemma/route.ts` — server-side proxy forwarding to `REMOTE_GEMMA_BASE_URL` (must include `/v1`; proxy appends `/chat/completions`). Sends the `ngrok-skip-browser-warning: true` header, without which ngrok serves an HTML interstitial instead of forwarding to llama-server. Reads model server-side from `REMOTE_GEMMA_MODEL`. Returns 503 when unconfigured so the chain skips cleanly to Claude.
- Extended the chain in `lib/ai/adapter.ts` to four tiers: LM Studio → Remote Gemma → Claude API → Deterministic. Remote Gemma reuses `createLMStudioProvider` with a `"Remote Gemma"` label override and a `proxyPath` of `/api/ai/remote-gemma`, so all six `AIProvider` methods and every prompt are shared unchanged.
- Fixed a silent fallthrough where the proxy returned HTTP 200 but the chain still fell to Claude. Root causes were downstream of the proxy, in the client-side provider: (1) the 30s default was applied at *two* independent hops and the proxy→ngrok hop still used 30s; (2) `finish_reason=length` truncation; (3) Gemma's thinking phase.
- **Dual-timeout design:** the proxy→ngrok fetch (`app/api/ai/remote-gemma/route.ts`, `DEFAULT_TIMEOUT_MS`) raised to 90s; the client→proxy AbortController (`adapter.ts` Remote Gemma `timeoutMs`) set to 95s so the client outlives the proxy and receives the proxy's structured 504 rather than racing it with its own abort. Both are env-overridable (`REMOTE_GEMMA_TIMEOUT_MS`, `AI_TIMEOUT_MS`).
- Added `minMaxTokens` floor (config-level) and set it to 2048 for Remote Gemma. The 180-token default and even a 1024 floor truncated `draftCustomerResponse` (the longest answer) before its closing JSON.
- **Thinking-disable (the decisive fix):** raising `max_tokens` alone could not work — at 2048 tokens the model spent ~78s on reasoning and *still* truncated, and any higher cap would cross the 90s timeout wall. Added a config-level `extraBody` passthrough (`lib/ai/types.ts`, `lib/ai/lmStudio.ts`) merged into the request body, and set `reasoning_budget: 0` + `chat_template_kwargs: { enable_thinking: false }` on the Remote Gemma tier only. The proxy forwards these fields when present; builds that don't support them ignore them. This cut `draftCustomerResponse` from ~78s (truncated) to ~5s (`ok: true`).
- Added a `reasoning_content` fallback in `callChatCompletion`: thinking models that emit the JSON answer in `reasoning_content` with an empty `content` are now parsed instead of discarded. Added `console.warn` diagnostics (retained) for the 200-OK-but-unparseable paths.
- Added ADR-011 recording the tier insertion, dual-timeout design, and the reasoning-over-tokens diagnosis.
**Boundaries touched:** All nine boundary rules preserved. Remote Gemma drafts carry `source: "ai_advisory"` and route through the F-04 human-review gate (Boundary 1); the provider never writes knowledge, candidates, validation, trust, or memory (Boundary 2). Prompts and `doNotPromise` guardrails are the shared provider-agnostic builders — only the transport and the thinking-disable body fields differ (Boundary 9). Deterministic fallback remains the terminal tier (ADR-008).
**Verification:** `npx tsc --noEmit` passes. Live: all six Tier-2 methods return `ok: true`; `draftCustomerResponse` completes in ~5s and the UI renders the real draft tagged "Drafted via Remote Gemma" instead of falling through to Claude. Confirmed via temporary per-tier debug logs (since removed) that the resolved `max_tokens` and `extraBody` reached the wire.
**Open items:** The thinking-disable relies on the remote `llama-server` honoring the request-level `reasoning_budget` / `enable_thinking` fields; a different server build may require the `--reasoning-budget 0` launch flag instead. `.env.local` holds the live ngrok URL and is intentionally uncommitted, so the tier is inert on any checkout without it (chain degrades to LM Studio → Claude → Deterministic).

## [2026-07-08] Three-tier AI fallback chain — LM Studio → Claude API → Deterministic
**Layer:** coding
**Task/Prompt:** Add Claude API as a cloud fallback tier between LM Studio and deterministic, replacing the two-tier chain everywhere AI is used.
**Files changed:** `types/ai.ts`, `app/api/ai/claude/route.ts` (new), `lib/ai/claudeApi.ts` (new), `lib/ai/adapter.ts`, `app/page.tsx`, `components/SuggestedResponsePanel.tsx`, `components/HumanReviewEditor.tsx`, `components/views/TicketWorkspace.tsx`, `components/views/BulkUploadWorkspace.tsx`, `ai/DECISIONS.md`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Added `"claude"` to `AIProviderMode` type and `providerLabel` field to `SuggestedResponse`.
- Created `app/api/ai/claude/route.ts` — server-side proxy that translates OpenAI-format requests to Anthropic Messages API and returns OpenAI-compatible responses. Reads `ANTHROPIC_API_KEY` from env (never exposed to client). Returns 503 if key is missing. Uses `claude-haiku-4-5-20251001` model for speed/cost. Rate-limit and quota errors return structured failures.
- Created `lib/ai/claudeApi.ts` — Claude API provider implementing the full `AIProvider` interface (analyzeTicket, suggestCanonicalProblem, suggestPatternName, enrichKnowledge, draftCustomerResponse, discriminateMatch). Reuses all prompt builders from `lib/ai/prompts.ts` unchanged. Includes session call counter with 200-call cap for cost safety. 8-second default timeout (configurable via `CLAUDE_TIMEOUT_MS`).
- Replaced `createAIAdapter()` in `lib/ai/adapter.ts` with a chain provider: when mode is `lmstudio`, each AI method tries LM Studio first, falls through to Claude API on failure, then returns failure for deterministic fallback. No new npm dependency — uses direct `fetch`, consistent with the LM Studio pattern.
- Updated UI labels: `SuggestedResponsePanel` shows "Drafted locally (Gemma)" / "Drafted via Claude" / "Standard template (AI unavailable)". `HumanReviewEditor` badge shows provider-specific label. `BulkUploadWorkspace` shows "Clustered via local AI" / "Clustered via Claude" / "Clustered via pattern matching (AI unavailable)".
- Updated retry button message to reference both tiers, not just LM Studio.
- Added ADR-010 recording the architecture shift from two-tier to three-tier and the hybrid local/cloud decision.
**Boundaries touched:** All nine boundary rules preserved. Claude API drafts carry `source: "ai_advisory"` and route through the F-04 human-review gate (Boundary 1). Claude API never writes to knowledge, candidates, validation, trust, or memory (Boundary 2). Cold-start honesty applies identically (Boundary 4). `doNotPromise` guardrails are passed into Claude API prompts via the shared prompt builders (Boundary 9). Prompts are provider-agnostic — only the transport differs.
**Verification:** `npm run build` passes. Claude API route visible in build output. No new npm dependencies added. Type-checking confirms all `AIProvider` interface methods implemented. Graceful degradation verified in code: missing key → 503 → chain falls through to deterministic.
**Open items:** Live verification requires an `ANTHROPIC_API_KEY` in `.env.local` (not currently available). Bulk clustering quality comparison and wall-clock timing deferred until key is available. Claude API call count and cost reporting deferred to live test.

## [2026-07-07] Stress-test query corpus — 500 bulk queries across 5 domains
**Layer:** coding
**Task/Prompt:** Generate 500 realistic customer support queries to stress-test every knowledge pack
**Files changed:** `data/test-queries/batch-01-login-100.json`, `data/test-queries/batch-02-billing-100.json`, `data/test-queries/batch-03-subscription-100.json`, `data/test-queries/batch-04-shipment-100.json`, `data/test-queries/batch-05-mixed-100.json`
**What changed:**
- 100 login queries covering all 9 lessons (Forgot password through SSO issues)
- 100 billing queries covering all 7 lessons (duplicate charges through tax/VAT)
- 100 subscription queries covering all 7 lessons (trial expiry through auto-renewal)
- 100 shipment queries covering all 8 lessons (tracking gaps through proof of delivery)
- 100 mixed cross-domain queries spanning all 5 packs with ambiguous and multi-domain scenarios
- Each query carries `expectedLesson`, `difficulty` (easy/medium/hard ~40/35/25), and `senderName`
- Difficulty tiers: easy = direct signal match, medium = paraphrased, hard = oblique or multi-issue
- 500 unique messages, 0 cross-file duplicates, diverse global names, varied emotional register and length
**Boundaries touched:** none — test data only, no code changes
**Verification:** automated validation script confirmed 100 entries per file, valid JSON, exact lesson title matches, correct difficulty values, and zero duplicate messages across all 500 entries
**Open items:** none

## [2026-07-07] Pre-demo consolidated fixes — F-1, F-2, F-3, F-4, F-7
**Layer:** coding
**Task/Prompt:** oip_consolidated_predemo_fixes_prompt.md (completed after interrupted run)
**Files changed:** `app/page.tsx`, `components/views/CaseLookupView.tsx`, `components/views/TicketWorkspace.tsx`, `lib/ai/lmStudio.ts`, `lib/bulkUpload.ts`
**What changed:**
- F-1: "Resume in workspace" button on in_review cases in Cases detail view. `resumeTicketFromRecord()` restores pipeline state (classification, memory match, draft) at Human Review step. Warns before clobbering a different in-progress ticket. Button absent on resolved/rejected/discarded/open cases.
- F-2: Extracted sender name used in AI draft greeting. Two-layer fix: (a) prompt already instructs greeting via `preferredGreeting()` with senderName; (b) added `personalizeAIDraftGreeting()` deterministic safety net that substitutes the name when the AI drops it. Fixed a bug where the enriched understanding (with AI-extracted senderName) was not passed to `requestDraftAdvisory()` — the un-enriched deterministic understanding was used instead. Org name was already in signature via `lib/drafting.ts`.
- F-3: Bulk upload routes through LLM when available. Root cause: `suggestCanonicalProblem()` and `discriminateMatch()` had `maxTokens: 180` — too tight for gemma-4-e4b's verbose JSON output. Truncated JSON → parse failure → deterministic fallback even when LM Studio was reachable. Fix: bumped to `maxTokens: 400, timeoutMs: 90000`. Also changed `analyzeBulkEntries()` to use majority-failure threshold (≥50% of AI calls must fail) before downgrading to `deterministic_fallback`.
- F-4: Retry AI draft button visible after fallback in both cold-start and reuse paths. Broadened `showRetryButton` condition to fire when AI mode is enabled and source is not `ai_advisory`, not only when `hasFallback` is set.
- F-7: Ticket reference appended to AI-generated drafts. Prompt instruction in `lib/ai/prompts.ts` already asks the model to include it. Added `appendTicketReference()` post-processing guard in `app/page.tsx` that appends "Your ticket reference is MT-..." if the AI omitted it. Deterministic path already had the guard in `lib/drafting.ts`.
**Boundaries touched:** none — trust engine, validation pipeline, and F-04 gate untouched
**Verification:** browser-verified per E2E_AUDIT_REPORT.md remediation notes. Full happy-path regression: submit → classify → memory → draft → approve → reflect → validate & commit → 1 ValidationRecord + 1 MemoryChangeRecord confirmed in localStorage.
**Open items:** F-3 live bulk LLM path test deferred. F-4 live toggle test (stop/start LM Studio) deferred. F-5 (bulk ticket ID chips), F-6 (sub-issue UI), F-8–F-10 deferred.

## [2026-07-06] Discard ticket, retry AI draft, and clean error display
**Layer:** coding
**Task/Prompt:** "Fix three UX gaps discovered when LM Studio was off: no way to discard an unwanted ticket, no way to retry the AI draft, and raw HTTP error JSON dumped into user-facing UI."
**Files changed:** `types/ticket.ts`, `types/ai.ts`, `lib/ticketRecords.ts`, `app/page.tsx`, `components/views/TicketWorkspace.tsx`, `components/views/CaseLookupView.tsx`, `components/HumanReviewEditor.tsx`, `components/ProvenancePanel.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Added `"discarded"` to `TicketRecordStatus`. The discard action is available before reflection commit (status open or in_review), preserves the record in Cases, and creates zero knowledge artifacts (no candidate, validation, or memory-change records). "Rejected" remains distinct — it is used for out-of-scope business relevance rejection.
- Added a "Discarded" filter chip to the Cases view with muted badge styling.
- Added `retryAIDraft()` which re-runs only the draft advisory call for the current ticket when AI mode is enabled and a fallback occurred. The button is disabled while in flight to prevent parallel calls. On success the AI draft populates the side-by-side review with ai_advisory labeling. On failure the notice updates to "Still unavailable — check that LM Studio is running."
- Replaced `formatFallbackNotice()` with a clean human message ("AI assistant unavailable — showing standard draft instead.") and moved raw diagnostics into a new `buildFallbackTechnicalDetails()` function. Technical details appear behind a collapsible `<details>` disclosure in the HumanReviewEditor and ProvenancePanel. Cleaned `defaultAvailabilityMessage()` to remove proxy paths. Cleaned the timeline step detail for draft fallback.
- Added `fallbackTechnicalDetails` field to `SuggestedResponse` type. Added retry/discard callback props to TicketWorkspace and HumanReviewEditor.
**Boundaries touched:** The records-never-dropped principle was exercised directly: discarded tickets are preserved in Cases with their pipeline journey up to the point of discard. No memory-write boundary was crossed — discard touches none of the candidate/validation/memory-change path.
**Verification:** `npm run build` passes. Live browser verification: submitted ticket with LM Studio off → clean fallback message (no raw JSON), Technical details collapsible present → clicked Discard ticket → confirmed → workspace reset, Cases shows ticket with status Discarded, localStorage contains zero candidate/validation/memory-change records. Full pipeline with LM Studio running → Discard ticket disappears after reflection commit. Retry AI draft button appears alongside fallback notice when AI is unavailable.
**Open items:** End-to-end retry-then-success verification requires toggling LM Studio mid-session (confirmed code path is correct from reading).

## [2026-07-05] Add five starter knowledge packs and bundled previews
**Layer:** content/coding
**Task/Prompt:** "Author five new Starter Knowledge Packs for Maesa Tech / OIP, validate them through the real loader, browser-import one pack end to end, and update /ai docs."
**Files changed:** `data/packs/billing-invoices-v1.json`, `data/packs/subscription-trial-v1.json`, `data/packs/api-integrations-v1.json`, `data/packs/shipment-issues-v1.json`, `data/packs/client-portal-v1.json`, `components/views/KnowledgeView.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Added five authored starter packs with distinct lessons, signals, escalation criteria, and per-lesson `doNotPromise` guidance for Billing, Subscription, API/Integrations, Shipment Issues, and Client Portal support.
- Extended the Knowledge view's bundled preview affordance so every shipped pack in `data/packs/` can be previewed without using the file picker.
- Kept pack categories aligned with the current analyzer where possible and intentionally shipped fallback-warning packs for `API & Integration`, `Shipment Issue`, and `Client Portal Issue`, relying on lesson signals plus LLM fallback as documented.
**Boundaries touched:** none
**Verification:** Loader validation via `parseKnowledgePack()` for all five JSON files; exact within-pack signal-overlap check confirmed no pair of lessons shares more than one exact signal phrase; `npm.cmd run build`; `npm.cmd run dev`; live browser verification in FastDrop confirmed `shipment-issues-v1` preview -> import -> validate -> reload persistence, plus clean-ticket matches for `my package says delivered but I never got it` -> `Marked delivered but not received` and `the tracking hasn't moved since Monday` -> `Tracking not updating for days`.
**Open items:** none

## [2026-07-05] Remove broken generated-graph workflow steps
**Layer:** governance
**Task/Prompt:** "Clean up the /ai governance folder by removing the broken generated-graph workflow dependency and documenting manual map maintenance as the replacement."
**Files changed:** `ai/CODING_WORKFLOW.md`, `ai/AI_WORKFLOW.md`, `ai/CURRENT_STATUS.md`, `ai/CHANGELOG.md`, `ai/CODEBASE_MAP.md`, `ai/PROMPT_LIBRARY.md`, `.gitignore`
**What changed:**
- Removed the broken generated-graph step from the coding workflow and documented manual `CODEBASE_MAP.md` maintenance as the replacement.
- Removed stale generated-graph references across the `/ai` folder.
- Added the legacy generated-graph output directory to `.gitignore`.
**Boundaries touched:** none
**Verification:** `Select-String` / grep confirms no remaining case-insensitive matches for the retired generated-graph tool name anywhere in the `/ai` folder.
**Open items:** none

## [2026-07-04] Starter knowledge pack import and governed validation
**Layer:** coding
**Task/Prompt:** "Add a Starter Knowledge Pack feature so JSON packs import as candidates first, then become memory only after human validation."
**Files changed:** `app/page.tsx`, `components/views/KnowledgeView.tsx`, `components/ProvenancePanel.tsx`, `lib/analyzer.ts`, `lib/drafting.ts`, `lib/knowledgePacks.ts`, `lib/ai/prompts.ts`, `lib/ai/types.ts`, `types/knowledge.ts`, `types/knowledgePack.ts`, `types/index.ts`, `data/packs/login-issues-v1.json`, `ai/ARCHITECTURE.md`, `ai/CODEBASE_MAP.md`, `ai/CURRENT_STATUS.md`, `ai/CHANGELOG.md`
**What changed:**
- Added a JSON knowledge-pack model plus parsing helpers, category-warning logic, and a shipped `login-issues-v1` starter pack with 9 production-quality Login lessons.
- Extended the Knowledge workspace with pack preview, pending-validation cards, editable lesson review, lesson removal, bundled-sample preview, and approve/reject actions.
- Reused the shared candidate-to-validation-to-memory path by importing packs as proposed `KnowledgeCandidate`s first, then validating them through `applyValidatedMemoryChange()` to create the real `ValidationRecord`, `MemoryChangeRecord`, and `KnowledgeItem`.
- Extended `Lesson` with optional `title`, `whenToEscalate`, and `doNotPromise`, and passed lesson-specific `doNotPromise` guidance into lesson-grounded AI draft prompts.
- Updated lesson/provenance copy so the matched lesson name is surfaced more clearly in the review explanation.
**Boundaries touched:** Boundary rule 2 was exercised directly: pack intake stops at the candidate boundary, and final memory writes still flow through the shared validated commit path. The no-unvalidated-commitments rule was extended with per-lesson `doNotPromise` warnings for lesson-grounded AI drafting.
**Verification:** `npm.cmd run build` (twice after the final UI update); `npm.cmd run dev`; live browser spot-check confirmed the Knowledge view shows `Import knowledge pack` and `Preview bundled sample`, and the bundled sample preview path was added specifically to make the governed import flow observable in the app without relying on a native file-picker automation path.
**Open items:** End-to-end browser automation for the full preview -> import -> validate -> reload sequence was partially blocked by flaky in-app browser control around reloads and JS confirm dialogs.

## [2026-07-03] Audit remediation F-01-F-07 (retroactive entry)
**Layer:** coding
**Task/Prompt:** Audit remediation hardening before AI governance setup
**Files changed:** `AUDIT_REPORT.md`, `app/page.tsx`, `lib/trustEngine.ts`, `lib/reflection.ts`, `lib/orgMemory.ts`, `types/knowledge.ts` `(reconstructed from current code and git history)`
**What changed:**
- Introduced the governed memory lifecycle built around `KnowledgeCandidate`, `ValidationRecord`, and `MemoryChangeRecord`.
- Added trust-aware reuse controls, provenance metadata, and append-only learning history on `KnowledgeItem`.
- Separated approval from final memory commit so learning is explicit rather than implicit.
**Boundaries touched:** Candidate/validation/memory-change lineage and trust-vs-validation were established and preserved.
**Verification:** Reconstructed from the current implementation plus `git show 29085dd`. The write path is still visible in `createCandidate()`, `applyValidatedMemoryChange()`, and `evaluateTrust()`. `(retroactive entry)`
**Open items:** Original task-by-task test artifacts were not preserved in git; verification details are reconstructed.

## [2026-07-03] LLM integration with match discrimination (retroactive entry)
**Layer:** coding
**Task/Prompt:** Add bounded AI advisory to analysis and memory reuse
**Files changed:** `app/page.tsx`, `lib/ai/adapter.ts`, `lib/ai/lmStudio.ts`, `lib/ai/prompts.ts`, `lib/ai/types.ts`, `types/ai.ts` `(reconstructed from current code and git history)`
**What changed:**
- Added optional AI analysis, canonical suggestion, draft suggestion, and same-problem-vs-distinct discrimination.
- Kept deterministic labels and deterministic drafts as the fallback baseline.
- Routed AI failures to structured diagnostics instead of silent degradation.
**Boundaries touched:** No AI text bypasses review; false-positive reuse is blocked by discrimination before memory-backed drafting.
**Verification:** Reconstructed from current provider code and the later LM Studio / advisory commits, especially `git show 72ac189`. `(retroactive entry)`
**Open items:** Early intermediate revisions are no longer separable from later AI changes in history.

## [2026-07-03] Deterministic classifier granularity and 2FA split (retroactive entry)
**Layer:** coding
**Task/Prompt:** Tighten deterministic classification to stop category bleed
**Files changed:** `lib/analyzer.ts`, `lib/drafting.ts`, `lib/canonicalProblemEngine.ts`, `types/oip.ts`, `types/index.ts` `(reconstructed from current code and git history)`
**What changed:**
- Split `Two-Factor Auth` into its own explicit category ahead of generic Login handling.
- Added more precise category weighting and intent selection for authentication flows.
- Hardened template compatibility so adjacent categories cannot reuse the wrong customer template.
**Boundaries touched:** No forced weak matches; category safety is preserved through `understandForProfile()` and `isCompatibleForDrafting()`.
**Verification:** Reconstructed from current classifier and drafting rules plus `git show 56eb1ab` and current code comments in `lib/drafting.ts`. `(retroactive entry)`
**Open items:** The original ticket corpus used to tune the split is not checked into the repo.

## [2026-07-03] Intent-aware templates and editable review editor (retroactive entry)
**Layer:** coding
**Task/Prompt:** Improve draft specificity and make human edits first-class
**Files changed:** `lib/canonicalProblemEngine.ts`, `components/HumanReviewEditor.tsx`, `components/SuggestedResponsePanel.tsx`, `components/views/TicketWorkspace.tsx`, `app/page.tsx` `(reconstructed from current code)`
**What changed:**
- Added intent-aware customer templates for categories such as Login, Activation, and billing-related cases.
- Introduced the editable review editor so human reviewers can change the draft before approval.
- Wired reviewed text into reflection so improved answers can create new versions instead of disappearing.
**Boundaries touched:** Human review remained the required gate for customer-facing text and for learning.
**Verification:** Reconstructed from current UI flow and deterministic template helpers. `(retroactive entry)`
**Open items:** Exact prompt artifacts that led to this iteration are not present in the repository.

## [2026-07-03] Bulk upload with cluster validation (retroactive entry)
**Layer:** coding
**Task/Prompt:** Add historical-ticket ingestion without bypassing governance
**Files changed:** `lib/bulkUpload.ts`, `types/bulkUpload.ts`, `components/views/BulkUploadWorkspace.tsx`, `app/page.tsx` `(reconstructed from current code and git history)`
**What changed:**
- Added parsing for `.json`, `.csv`, `.md`, and `.txt` bulk uploads.
- Implemented batch analysis, cluster formation, and cluster-level validation for new and existing canonical problems.
- Reused the validated memory-change commit path for cluster commits.
**Boundaries touched:** Bulk upload preserves the validated pipeline and does not write directly to memory.
**Verification:** Reconstructed from `analyzeBulkEntries()`, `prepareBulkClusterCommit()`, and `commitBulkCluster()`. `(retroactive entry)`
**Open items:** Live regression coverage for mixed-format uploads is still manual.

## [2026-07-03] Full-screen memory network (retroactive entry)
**Layer:** coding
**Task/Prompt:** Expose organizational memory structure visually
**Files changed:** `components/MemoryNetworkOverlay.tsx`, `components/views/KnowledgeView.tsx`, `components/KnowledgeBaseList.tsx`, `components/KnowledgeItemCard.tsx` `(reconstructed from current code)`
**What changed:**
- Added the full-screen memory network visualization and integrated it into the knowledge workspace.
- Surfaced relationships among canonical problems, trust state, and evidence trails in the UI.
- Expanded the knowledge view as the primary inspection surface for organizational memory.
**Boundaries touched:** none
**Verification:** Reconstructed from current knowledge-view components and committed UI assets. `(retroactive entry)`
**Open items:** The graph view is still a prototype visualization, not a source of truth for governance.

## [2026-07-03] Lessons system in Reflection (retroactive entry)
**Layer:** coding
**Task/Prompt:** Capture root-cause-specific learning, not just broader canonical problems
**Files changed:** `types/knowledge.ts`, `lib/drafting.ts`, `app/page.tsx`, `lib/reflection.ts`, `components/ReflectionPanel.tsx` `(reconstructed from current code)`
**What changed:**
- Added `Lesson` and `LessonDraft` types to the knowledge model.
- Enabled reflection to author or improve lessons during validated memory updates.
- Allowed draft generation to prefer lesson-grounded responses when ticket signals match a stored lesson.
**Boundaries touched:** Cold-start honesty and validated memory updates were preserved; lessons are still committed only through reflection.
**Verification:** Reconstructed from `findMatchingLesson()`, `applyLessonToItem()`, and `confirmReflection()`. `(retroactive entry)`
**Open items:** No automated evaluation yet measures lesson-match precision.

## [2026-07-03] Gemma grounded drafts and LM Studio proxy (retroactive entry)
**Layer:** coding
**Task/Prompt:** Tailor AI drafting around Gemma via same-origin proxy
**Files changed:** `app/api/ai/chat/route.ts`, `lib/ai/lmStudio.ts`, `lib/ai/deterministic.ts`, `lib/ai/prompts.ts`, `app/page.tsx`, `components/AIAdvisoryPanel.tsx`, `.env.local` `(reconstructed from current code and git history)`
**What changed:**
- Added the Next.js proxy route for browser-safe LM Studio calls.
- Tuned draft prompting and output handling around Gemma JSON responses and longer draft token budgets.
- Added visible AI diagnostics and deterministic fallback notices in the ticket workflow.
**Boundaries touched:** AI failures fall back visibly; AI drafts stay advisory and cannot silently auto-resolve.
**Verification:** Grounded in current proxy/provider code and `git show 72ac189`. `(retroactive entry)`
**Open items:** Timeout calibration under real Gemma latency remains open.

## [2026-07-03] Initial AI agent docs setup (retroactive entry)
**Layer:** governance
**Task/Prompt:** Install graph navigation and create the first `/ai` agent docs
**Files changed:** `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.codex/hooks.json`, `ai/ARCHITECTURE.md`, `ai/CODEBASE_MAP.md`, `ai/CURRENT_STATUS.md`, `ai/AI_WORKFLOW.md`, `legacy generated graph output/*` `(from git history)`
**What changed:**
- Installed the initial generated graph output and documented graph-first repo navigation expectations.
- Added the first generation of `/ai` architecture, map, status, and workflow docs.
- Wired editor/agent config files to remind future sessions to use the generated graph before broad code scanning.
**Boundaries touched:** none
**Verification:** Confirmed from `git show 2689213`. `(retroactive entry)`
**Open items:** none recorded in this retroactive summary.

## [2026-07-03] AI governance infrastructure refresh
**Layer:** governance
**Task/Prompt:** "Set up AI governance infrastructure so any brain-layer or coding-layer AI can pick up the repo safely."
**Files changed:** `ai/ARCHITECTURE.md`, `ai/CODEBASE_MAP.md`, `ai/BOUNDARIES.md`, `ai/BRAIN_WORKFLOW.md`, `ai/CODING_WORKFLOW.md`, `ai/CURRENT_STATUS.md`, `ai/DECISIONS.md`, `ai/PROMPT_LIBRARY.md`, `ai/CHANGELOG.md`
**What changed:**
- Rewrote the `/ai` docs so they describe the current code rather than the broader OIP blueprint.
- Added explicit boundary rules, split brain-layer vs coding-layer workflows, and recorded durable architecture decisions.
- Backfilled the change log and created a truthful prompt library that distinguishes present artifacts from missing prompt files.
- Added a git baseline marker and per-task documentation commits for this governance setup.
**Boundaries touched:** All boundaries were documented and preserved; no application code was modified.
**Verification:** Spot-checked enforcing functions in `app/page.tsx`, `lib/trustEngine.ts`, `lib/drafting.ts`, `lib/reflection.ts`, `lib/canonicalProblemEngine.ts`, `lib/bulkUpload.ts`, and `app/api/ai/chat/route.ts`; reviewed git history and current file set.
**Open items:** Prompt artifacts named `oip_*.md` are not present in the repository and are therefore documented as absent rather than fabricated.

## [2026-07-03] Safer personalized AI customer drafts
**Layer:** coding
**Task/Prompt:** Improve quality and safety of customer-facing AI drafts without adding a second AI round trip
**Files changed:** `app/page.tsx`, `components/views/TicketWorkspace.tsx`, `lib/ai/lmStudio.ts`, `lib/ai/prompts.ts`, `lib/analyzer.ts`, `lib/canonicalProblemEngine.ts`, `lib/drafting.ts`, `types/ai.ts`, `types/index.ts`, `types/oip.ts`, `ai/BOUNDARIES.md`, `ai/CURRENT_STATUS.md`, `ai/ARCHITECTURE.md`, `ai/CODEBASE_MAP.md`, `ai/CHANGELOG.md`
**What changed:**
- Added `ExtractedTicketFields` to deterministic understanding and AI analysis so sender name, deadline, sub-issues, and urgency signals can flow from intake into drafting and the UI.
- Reused the existing AI analysis call to request structured extraction, while adding a deterministic sender-signature fallback when AI is unavailable.
- Enforced tone-aware greeting/body/closing structure and a named no-unvalidated-commitments rule across `lesson_grounded`, `memory_grounded`, and `cold_start` AI draft prompts.
- Updated deterministic rendering to avoid `Demo User` greetings, prefer extracted sender names, and standardize sign-off as `<Organization name> Support Team`.
- Added a post-prompt rejection gate that blocks invented teams/processes, unsupported timelines, and unconditional refund/credit/invoice commitments before an AI draft can be surfaced.
**Boundaries touched:** Preserved F-04 human review for AI drafts and added explicit enforcement for no unvalidated commitments in AI customer responses.
**Verification:** `npm.cmd run build`; live ticket-flow verification still required for LM Studio on/off behavior, tone-change observability, and the Dewi Rahayu scenario.
**Open items:** End-to-end browser verification remains to be completed.
