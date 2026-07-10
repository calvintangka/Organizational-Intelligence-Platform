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

## [2026-07-10] Fix TODO-002 organization lifecycle regressions
**Layer:** coding
**Task/Prompt:** Fix reset, delete, add, and hydration regressions in organization isolation without changing keys, migration, or the validated write pipeline.
**Files changed:** `app/page.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Reset now clears and reseeds only the active organization while preserving its profile and confirmation gate.
- Active-organization deletion now clears only the deleted scope and reloads the fallback organization before re-enabling persistence.
- New organization creation now switches through the same guarded scoped-load path using the computed organization list.
- Switch pre-save now runs only when hydration was true at switch start, preventing defaults from overwriting state after a failed hydration.
**Boundaries touched:** Boundary 2, Boundary 7, and Boundary 8 preserved; no memory write path or confirmation gate changed.
**Verification:** `cmd /c npx tsc --noEmit` and `cmd /c npm run build` passed. Live browser verified active FastDrop reset stayed FastDrop and showed clean scoped memory, and new organization creation switched to `Isolation Test Org` with seed-default behavior. Active-Maesa deletion and corrupted-key recovery were not completed because the in-app browser hit CDP input/page-load timeouts.
**Open items:** Repeat active deletion and corrupted scoped-key recovery in a stable browser session.

## [2026-07-10] Isolate organizational state by organization
**Layer:** coding
**Task/Prompt:** Implement TODO-002 / Phase 2 of Finding A-005: Organization Isolation.
**Files changed:** `lib/orgMemory.ts`, `lib/ticketRecords.ts`, `app/page.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`, `ai/ARCHITECTURE.md`
**What changed:**
- Added versioned organization-scoped localStorage keys for all organization-owned state and ticket counters.
- Added a durable, copy-only migration from legacy global v2 keys to the active workspace organization; legacy keys remain untouched.
- Made switching persist the old organization, reload all selected-organization state, and guard against stale async loads.
**Boundaries touched:** Boundary 2, Boundary 7, and Boundary 8 were preserved.
**Verification:** `cmd /c npx tsc --noEmit`; `cmd /c npm run build`; live browser check confirmed FastDrop starts without Maesa validated memory, switching back restores Maesa Login Issue state, and reload preserves Maesa state. `graphify update .` failed in the Windows uv trampoline. Raw localStorage inspection and the new FastDrop ticket scenario were not performed.
**Open items:** Complete the remaining ticket submission/revalidation and raw-key checks in a browser surface that exposes localStorage inspection.

## [2026-07-10] Prepare persistence for future organization scoping
**Layer:** coding
**Task/Prompt:** Implement Phase 1 of Finding A-005: prepare OIP persistence for future organization-scoped shared storage without changing current localStorage behavior.
**Files changed:** `types/knowledge.ts`, `types/metrics.ts`, `types/patterns.ts`, `lib/orgMemory.ts`, `lib/organizationProfile.ts`, `lib/ticketRecords.ts`, `app/page.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Added optional `organizationId` ownership to `KnowledgeItem`, `KnowledgeCandidate`, `ValidationRecord`, `MemoryChangeRecord`, `EmergingPattern`, and `OrgMetrics`.
- Converted the persistence adapters in `lib/orgMemory.ts`, `lib/organizationProfile.ts`, and `lib/ticketRecords.ts` to async-compatible signatures, threaded optional org-id parameters through the org-owned load/save surfaces, and intentionally kept every existing `v2`/`v1` localStorage key unchanged for this phase.
- Reworked `app/page.tsx` hydration to load the selected organization profile first, then await all org-owned state loads with that profile id before setting `hydrated`. Load failures now leave hydration incomplete so seeded defaults do not overwrite existing browser storage.
- Wrapped all fire-and-forget save effects in explicit Promise rejection handling, and stamped new candidates, validation records, memory change records, promoted/new knowledge items, reset seed metrics, and new/updated emerging patterns with the active `organizationProfile.id`.
**Boundaries touched:** Boundary 2 and Boundary 8 were preserved. Memory writes still flow only through the governed candidate -> validation -> memory-change path, and no organization-switching or destructive-reset semantics were widened in this phase.
**Verification:** `cmd /c npm run build`; `cmd /c npx tsc --noEmit` (rerun after build regenerated `.next/types`); code search confirmed no `v3` key usage in the modified persistence files; in-app browser smoke test on `http://localhost:3001` confirmed the existing Maesa Tech browser state still hydrated, a lesson-grounded Login reuse ticket still submitted and matched `Login Issue`, and the flow still reached Human Review plus Reflection (`trust update only`) without persistence/hydration regressions.
**Open items:** Direct browser-side inspection of serialized `organizationId` fields was not possible through the available read-only browser evaluation surface because `window.localStorage` was unavailable there; the new stamping was therefore verified by the live write-path code (`createCandidate()` / `applyValidatedMemoryChange()`) plus build/typecheck rather than by reading raw browser storage after a commit. Phase 2 organization isolation and key partitioning remain intentionally deferred.

## [2026-07-09] Prevent contradicted lesson matches from overriding intent
**Layer:** coding
**Task/Prompt:** Fix BUG-006 where strong lesson matching was too permissive and could override explicit negated intent, causing Adrian Santoso's billing-address ticket to reuse a Login password-reset lesson.
**Files changed:** `lib/analyzer.ts`, `lib/drafting.ts`, `app/page.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- Hardened `lib/analyzer.ts` `understandForProfile()` so category ties no longer silently fall to earlier array order. Categories now use intent-evidence scoring, explicit Login contradiction penalties, and an `Uncategorized` fallback when ties remain ambiguous.
- Made `lib/drafting.ts` lesson matching negation-aware. Negation terms are preserved, contradiction helpers now reject polarity mismatches like `I remember my password` vs `never remembered password`, and `ticketContradictsLesson()` blocks login-failure lessons when the ticket explicitly says sign-in works normally.
- Removed category-bypass OR gates from the live pipeline. `app/page.tsx` and `lib/drafting.ts` now treat `isCompatibleForDrafting(...)` as a hard precondition, so lesson signals can only choose a lesson inside a compatible knowledge item instead of reviving an incompatible parent match.
- Tightened the strong-lesson bypass in `requestMatchDiscrimination()`: strong lessons still skip broad discrimination when clean, but contradiction-marked tickets now continue into discrimination instead of treating lesson strength as permission to ignore explicit opposite intent.
**Boundaries touched:** Boundary 1 and Boundary 2 were preserved. The fix only narrows deterministic/validated lesson reuse and contradiction handling; it does not change AI authority, persistence schema, or memory-write governance.
**Verification:** `cmd /c npm run build`; `cmd /c npx tsc --noEmit` (after build regenerated `.next/types`). Targeted `npx tsx` probes confirmed Adrian now classifies as `Billing` with no Login lesson match, while Putri/Stephanie/nameless positives still produce lesson-grounded Login drafts. Manual browser verification on `http://localhost:3001` confirmed: Putri rendered `Hi Putri Lestari,`; Stephanie and a missing-name positive stayed lesson-grounded on `Login Issue`; Adrian classified as `Billing`, produced `No matching knowledge found` for Billing, and showed no validated Login lesson in WHY THIS RESPONSE.
**Open items:** The BUG-006 investigation report was not present anywhere under `ai/` in this workspace, so verification was based on the attachment plus direct code inspection. The persisted browser memory on `localhost:3001` still labels the evolved switched-laptop lesson as `Forgot password`, but the live browser path now matches the corrected laptop/autofill signals and no longer lets contradictory Billing intent route into Login reuse.

## [2026-07-09] Pre-discrimination lesson search for Login lesson reuse
**Layer:** coding
**Task/Prompt:** Fix live browser verification failure where Putri Lestari's new-laptop/saved-browser-password ticket rendered the generic Login fallback instead of the validated switched-laptop/browser-saved-password lesson.
**Files changed:** `app/page.tsx`, `lib/drafting.ts`, `lib/ai/adapter.ts`, `ai/CURRENT_STATUS.md`, `ai/CHANGELOG.md`
**What changed:**
- Added deterministic pre-discrimination lesson search in `app/page.tsx`. After canonical/category classification, compatible memory items with lessons are searched directly and a strong lesson hit is promoted into the `KnowledgeMatch[]` pool before no-match/cold-start routing.
- Hardened `findMatchingLesson()` in `lib/drafting.ts` with token-overlap signal matching so semantically equivalent wording such as "never remembered the password" can match lesson signals like "never remembered password" without relying on exact substring matches only.
- Strong `lesson_grounded` drafts now keep the validated lesson template as the customer-facing response instead of replacing it with an AI rewrite, preserving `Hi {{customerName}},` and `{{ticketId}}` rendering.
- Sanitized AI chain failure summaries in `lib/ai/adapter.ts` so provider attempts show short plain-text messages such as "Remote Gemma failed: ngrok endpoint offline." instead of raw HTML response bodies.
**Boundaries touched:** Boundary 1 and Boundary 2 were preserved. The new search only promotes already-validated lesson memory, and AI remains advisory; it no longer replaces strong validated lesson templates.
**Verification:** `cmd /c npm run build`; `cmd /c npx tsc --noEmit`; browser verification on `http://127.0.0.1:3000` with a validated `Login Issue` lesson. Putri matched the switched-laptop/browser-saved-password lesson in the reuse path and rendered `Hi Putri Lestari`; Stephanie matched the same lesson in the main New Ticket path and the actual review textarea rendered `Hi Stephanie Gunawan,` plus `Your ticket reference is MT-20260709-0002.` WHY THIS RESPONSE named the matched lesson and all four signals.
**Open items:** The in-app browser profile started empty, so the browser verification first created a validated lesson through the app UI before running Putri/Stephanie.

## [2026-07-09] Stabilize lesson reflection and provenance state
**Layer:** coding
**Task/Prompt:** Fix four confirmed MVP defects in the lesson-reuse/reflection pipeline without changing AI architecture, autonomy, organization scoping, or persistence schema.
**Files changed:** `app/page.tsx`, `lib/reflection.ts`, `components/ProvenancePanel.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`
**What changed:**
- `lib/reflection.ts` `generateReflection()` now accepts the current draft grounding source and, when the draft came from a matched lesson, compares the reviewed response against that lesson's own `customerResponse` instead of the parent knowledge item's generic template.
- `app/page.tsx` now resolves reflection from the actual rendered draft source (`suggestedResponse.basedOnKnowledgeIds` / `similarKnowledge`) instead of re-deriving a fresh canonical match at approval time. This keeps reflection tied to the same knowledge item and lesson that produced the draft.
- `confirmReflection()`'s `create_version` path now distinguishes true generic-template edits from lesson-grounded confirmations. Lesson-grounded drafts no longer overwrite `customerResponseTemplate` / `approvedAnswer` and no longer create a new `KnowledgeVersion` unless the reviewer actually changed the generic template path.
- Manual ticket flow now keeps `similarKnowledge` aligned with the selected and discriminated match. `findSimilarKnowledge()` uses the same preferred-match selection logic as the automated pipeline, and `generateSuggestedResponse()` now reorders or strips `similarKnowledge` after discrimination so the Organizational Memory panel and Provenance panel reflect the same source that grounded the rendered draft.
- `analyzeTicket()` now clears `discriminationReasoning` and `discriminatedMatchTitle` up front so a prior rejection banner cannot leak into the next manual ticket.
- `components/ProvenancePanel.tsx` now preserves lesson-grounded "Why this response?" copy even when AI is unavailable. A matched lesson-backed fallback shows `Validated lesson used: ...` instead of replacing the explanation with a generic AI-unavailable message.
- Fallback diagnostics shown in the review/provenance surfaces now prefer sanitized summaries from provider diagnostics, keep the chain-attempt list, and summarize raw reasons before rendering them in the UI.
**Boundaries touched:** Boundary 1 and Boundary 2 were preserved. The fixes only change how validated lesson knowledge is compared, displayed, and committed through the existing governed reflection path; they do not alter AI authority, write around validation, or redesign storage.
**Verification:** `cmd /c npm run build`; `cmd /c npx tsc --noEmit` (after `.next/types` was regenerated by build). Manual browser verification on `http://localhost:3002` with `NEXT_PUBLIC_AI_MODE=disabled` and a validated Login starter pack confirmed: a lesson-backed Stephanie ticket showed `Validated lesson used: Invalid credentials despite correct password` in WHY THIS RESPONSE while AI was unavailable; approving the unchanged lesson-backed draft produced `Reflection: trust update only`; committing the reflection raised trust from 20 to 25 while keeping the knowledge item at `Version 1`; the committed `CUSTOMER RESPONSE TEMPLATE` remained the generic Login template instead of being overwritten by the lesson-specific text. On `http://localhost:3001`, the live retrieval pipeline also showed the validated Login knowledge being found at 89% match before draft generation.
**Open items:** A full browser reproduction of a prior discrimination-rejection banner carrying into a new ticket was not forced end-to-end because the live discrimination tier was not reliably available in this environment. That reset is nevertheless confirmed directly in `analyzeTicket()` and covered by build/typecheck.

## [2026-07-09] Lesson-aware reuse discrimination and chain-attempt diagnostics
**Layer:** coding
**Task/Prompt:** Fix two connected high-severity bugs in the Maesa Tech / OIP prototype: valid lesson matches were being cold-started away from reusable memory, and AI fallback diagnostics only surfaced the final failure instead of the full provider chain.
**Files changed:** `app/page.tsx`, `lib/ai/adapter.ts`, `lib/ai/deterministic.ts`, `lib/ai/prompts.ts`, `lib/ai/types.ts`, `lib/canonicalProblemEngine.ts`, `lib/knowledgePacks.ts`, `types/ai.ts`, `types/index.ts`, `components/AIAdvisoryPanel.tsx`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`, `ai/ARCHITECTURE.md`
**What changed:**
- `requestMatchDiscrimination()` now carries validated lesson context into the AI prompt, bypasses broad discrimination for strong lesson-backed matches, and keeps reusable lesson hits from being rejected as distinct problems when the lesson evidence is already strong.
- `lib/canonicalProblemEngine.ts`, `lib/knowledgePacks.ts`, and `app/page.tsx` now normalize reusable lesson responses before storage/commit so stale customer-specific greetings cannot leak across customers during deterministic reuse.
- `lib/ai/adapter.ts`, `lib/ai/deterministic.ts`, `types/ai.ts`, `types/index.ts`, and `components/AIAdvisoryPanel.tsx` now preserve and display per-tier AI chain attempts, including skipped tiers, so the UI can show the full LM Studio → Remote Gemma → Claude path instead of only the final error.
**Boundaries touched:** Boundary 1 and Boundary 2 were preserved. The reuse fix remains on the deterministic/template side, and the diagnostics change only expands observability of already-existing AI fallbacks.
**Verification:** `cmd /c npm run build`; `cmd /c npx tsc --noEmit`
**Open items:** Live browser verification of the exact Grace/Putri reproduction path is still useful if we want to confirm the behavior in the running UI, but the code path and typecheck are clean.

## [2026-07-09] Lesson-reuse placeholder rendering and legacy lesson-template repair
**Layer:** coding
**Task/Prompt:** Fix a high-severity lesson-reuse bug where Derek Huang's ticket matched a Grace Adeyemi lesson, AI drafting was unavailable, and the deterministic fallback reused Grace's stored greeting instead of substituting Derek's name.
**Files changed:** `lib/canonicalProblemEngine.ts`, `lib/drafting.ts`, `lib/orgMemory.ts`, `lib/knowledgePacks.ts`, `app/page.tsx`, `components/ReflectionPanel.tsx`, `ai/CHANGELOG.md`, `ai/CURRENT_STATUS.md`, `ai/CODEBASE_MAP.md`, `ai/ARCHITECTURE.md`
**Root cause (confirmed):** The deterministic lesson path in `lib/drafting.ts` rendered `lesson.customerResponse` through `renderCustomerTemplateForTicket()`, but that renderer only substituted `{{greetingLine}}`, `{{customerName}}`, and `{{organizationName}}`. If a stored lesson response began with literal customer text such as `Hi Grace Adeyemi,`, nothing rewrote it, so the wrong name survived into the final deterministic draft. A second confirmed gap sat beside it: `{{ticketId}}` was not supported in reusable templates at all, while lesson and matched-memory branches appended a ticket-reference line unconditionally after rendering, which would have created duplicates once placeholder support was added. The prompt's "AI availability" angle was explicitly refuted as the core issue: Claude being unavailable only exposed the bug by forcing deterministic reuse; the wrong-name behavior was entirely in the deterministic template/render path.
**What changed:**
- Added shared reusable-template helpers in `lib/canonicalProblemEngine.ts`: `normalizeReusableResponseTemplate()` repairs legacy lesson greetings like `Hi Grace Adeyemi,` into placeholder form, converts stored literal ticket-reference lines into `{{ticketId}}`, and `renderResponseTemplate()` now deterministically renders `{{customerName}}`, `{{ticketId}}`, `{{organizationName}}`, and `{{greetingLine}}`.
- Wired `renderCustomerTemplateForTicket()` through the new shared renderer so lesson-backed and memory-backed deterministic drafts both get the same placeholder substitution rules.
- Hardened `lib/drafting.ts` with `appendTicketReferenceIfNeeded()` so ticket-reference lines are appended only when the rendered draft does not already include the current ticket id; this prevents duplicate references when a lesson template already contains `{{ticketId}}`.
- Normalized lesson templates at write/import/load boundaries: `app/page.tsx` now sanitizes lesson responses before storing them during reflection, `lib/knowledgePacks.ts` does the same for starter-pack lessons, and `lib/orgMemory.ts` now runs `repairLegacyLessonResponseTemplates()` on load to self-heal already-stored lesson responses without touching unrelated top-level knowledge templates.
- Updated the Reflection UI hint to advertise `{{ticketId}}` alongside the existing placeholders so new lessons are authored in reusable form.
- Normalized lesson grounding passed into `requestDraftAdvisory()` so any future AI advisory draft grounded on a repaired lesson sees the reusable placeholder form rather than stale customer-specific text.
**Boundaries touched:** Boundary 1 and Boundary 2 were both relevant and preserved. The fix changes deterministic rendering and migration/normalization only; it does not let AI text bypass human review and does not create any new write path outside the existing knowledge candidate / validation / memory-change lifecycle. The load-time lesson-template self-heal is a narrow data-integrity migration in the same spirit as the existing generic-template repair and leaves append-only lineage intact by adding a `learningHistory` note instead of rewriting version history.
**Verification:** `cmd /c npm run build` passed. `cmd /c npx tsc --noEmit` failed at first because `tsconfig.json` includes stale `.next/types/**/*` files when `.next` is out of sync; rerunning it after a fresh build passed cleanly. Manual Derek/Grace regression probe via `cmd /c npx tsx -e "..."` confirmed that a lesson stored as `Hi Grace Adeyemi, ... Your ticket reference is MT-20260709-0001.` rendered as `Hi Derek Huang, ... Your ticket reference is MT-20260709-0048.` for Derek's ticket, and the missing-name variant rendered `Hi there,` with the current ticket id and no duplicate reference line.
**Open items:** Greeting normalization intentionally repairs only the opening salutation line and explicit ticket-reference lines on lesson templates. If future data contains other customer-specific content deeper in a lesson body, that would need a more opinionated migration rather than the narrow safe repair added here.

## [2026-07-09] Contradictory match state and missing greeting personalization in the deterministic fallback
**Layer:** coding
**Task/Prompt:** Diagnose and fix a live-test scenario where a Grace Adeyemi ticket ("...I don't actually remember what it is [my password]... help me set up a new password...") simultaneously showed "No matching knowledge found" in the pipeline step text AND "Login Issue, Trust 70, Supported by 48 tickets and 21 human approvals" in the Organizational Memory panel — plus the deterministic draft opened with "Hello," instead of "Hello Grace,". Both AI tiers had failed to produce a draft for this ticket.
**Files changed:** `app/page.tsx`, `lib/analyzer.ts`

**Root cause 1 — match/no-match contradiction (confirmed):** `processTicketPipeline()` in `app/page.tsx` computes retrieval matches once (`matches`/`topMatch`, ~line 2645-2646) and calls `setSimilarKnowledge(matches)` (line 2663) — this is what the "Organizational Memory" panel and the "Memory found"/"Trust evaluated" timeline steps read (`TicketWorkspace.tsx:328`, `similarKnowledge[0]`). Separately, Phase 3 (~line 2682) computes `effectiveTopMatch` by running the raw `topMatch` through `requestMatchDiscrimination()`, an LLM call that can reject a candidate as "distinct" — and this discriminated value, **not** `similarKnowledge`, is what feeds `draftResponse()`'s confidenceNote and the draft itself. Nothing ever wrote a rejection back into `similarKnowledge`, so whenever discrimination rejected a match, the panel kept showing the rejected match while the draft correctly treated the ticket as unmatched. Two prompt hypotheses were checked against this: `requestMatchDiscrimination()` (lines 1580-1622) already fails **open** (returns the original match unchanged) when the AI call itself fails/is unavailable — so a bare AI outage does not, by itself, cause a false rejection; and `requestDraftAdvisory()`'s failure path (line 1856-1876) reuses the caller-supplied deterministic `confidenceNote` rather than inventing separate "no match" copy — refuting the "failed AI draft has its own no-match messaging" hypothesis. Live reproduction confirmed the actual trigger: LM Studio's `discriminateMatch` call *succeeded* (`POST /api/ai/chat → 200`) and judged "Login Issue" distinct from "the customer needs to reset a forgotten password" even though `draftCustomerResponse` subsequently failed on every tier — a real, reproducible LLM discrimination call, not a skipped/stale one.
**Root cause 2 — missing name in deterministic greeting (confirmed, root cause different from hypothesis):** The greeting-rendering plumbing (`lib/drafting.ts` → `renderCustomerResponse`/`renderLessonResponse` → `lib/canonicalProblemEngine.ts`'s `renderCustomerTemplateForTicket`/`buildGreetingLine`/`resolveCustomerAddressingName`) was already correctly threading `understanding.extractedFields.senderName` through **every** deterministic branch of `draftResponse()` — this refutes the prompt's hypothesis that the deterministic path never received an F-2-equivalent fix; the rendering side was always fine. The real gap was upstream: `lib/analyzer.ts`'s `extractSenderNameFromSignature()` (the only deterministic name extractor wired into fresh-ticket analysis) only recognizes a sign-off word alone on its own line followed by a name on the *next* line (`"Regards,\nSarah"`) — it never matches self-introductions ("This is Grace Adeyemi writing in") or a same-line sign-off ("Best, Grace Adeyemi"), both present in the reproduction message, and both already handled by a *different*, better extractor (`extractSenderNameForResume` in `app/page.tsx`) that only runs on the Cases-resume path (F-1). Confirmed via an isolated script: the Grace message produced `senderName: null` from the old extractor and `"Grace Adeyemi"` after the fix.
**What changed:**
- `app/page.tsx` `processTicketPipeline()`: when discrimination rejects the raw top match (`topMatch && !effectiveTopMatch`), `setSimilarKnowledge` now drops that item, so the panel and every timeline step reading `similarKnowledge[0]` agree with what actually drove the draft.
- `lib/analyzer.ts` `extractSenderNameFromSignature()`: added self-introduction patterns (`"my name is X"`, `"this is X"`, `"I'm X"` — mirroring the proven patterns already in `extractSenderNameForResume`) and a same-line sign-off pattern (`"Best, X"` / `"Regards, X"` without a line break), tried after the existing multi-line signature check. No changes to `app/page.tsx`'s AI-draft personalization (`personalizeAIDraftGreeting`, F-2) or to `extractSenderNameForResume` — both untouched.
**Boundaries touched:** none. `requestMatchDiscrimination()`'s decision logic, the trust engine, and the F-04 human-review gate are unchanged — this only makes the *display* of an already-correct decision consistent, and only widens what counts as a detected sender name (still advisory metadata, not a memory-write path).
**Verification:**
- `npx tsc --noEmit` and `npm run build` — pass.
- Live reproduction (LM Studio running, no `ANTHROPIC_API_KEY`, seeded "Login Issue" at Trust 70 / 48 tickets / 21 approvals): submitting the exact Grace Adeyemi message now shows "No knowledge match — cold start" / "Trust: no match" in the timeline **and** "No knowledge match — This ticket doesn't match existing knowledge" in the Organizational Memory panel — both agree (previously the panel showed "Login Issue, Trust 70..." while the draft said "No matching knowledge found"). The deterministic draft opened with "Hello Grace Adeyemi,".
- A ticket with no name ("My login keeps failing...") correctly fell back to "Hello," with no error, and correctly matched "Login Issue" (no contradiction, discrimination confirmed the match this time).
- Regression: a ticket with a name via a pattern the AI-draft path already handled ("Hi, my name is Sarah Johnson...") still produced "Hello Sarah Johnson," through the unmodified AI-draft/F-2 path ("Gemma personalized..." confirmed in the UI) — no regression.
- Step 3 (LM Studio order): confirmed via network inspection that for the Grace ticket's `draftCustomerResponse` call, tiers were attempted **in the correct order and each genuinely attempted**, not skipped — `POST /api/ai/chat → 504 Gateway Timeout` (LM Studio, timed out), then `POST /api/ai/remote-gemma → 404` (unconfigured), then `POST /api/ai/claude → 503` (missing key). The "Mode: lmstudio" + "Claude API key not configured" combination in the original report is accurate diagnostics of a fully-attempted, fully-failed chain, not evidence of skipping — no chain-order fix was needed.
**Open items:** None for this scenario. The underlying LLM discrimination judgment (treating "forgot password" as distinct from "Login Issue") is a model-quality question, not addressed here — the fix only guarantees the UI never contradicts itself about whatever the discrimination decision was.

## [2026-07-09] Two bulk-upload bugs — false "Clustered via Claude" label, and subject line displayed as a customer response
**Layer:** coding
**Task/Prompt:** Diagnose and fix two bugs found during a live bulk upload of 25 login-issue queries: (1) a "Clustered via Claude" badge appeared even though no `ANTHROPIC_API_KEY` exists in this environment; (2) the cluster's "Proposed Customer Response" showed the literal text "Password forgotten after long break" — the subject line of one uploaded query, not a synthesized response.
**Files changed:** `lib/bulkUpload.ts`, `types/bulkUpload.ts`, `components/views/BulkUploadWorkspace.tsx`

**Bug 1 root cause (confirmed):** `lib/bulkUpload.ts` (`analyzeBulkEntries`, previously line 600) set `const providerLabel = aiAdapter.provider.label` — the AI adapter's *static* chain-level label (`lib/ai/adapter.ts:90`, `"AI Chain (LM Studio → Remote Gemma → Claude API)"`), not the label of whichever tier actually produced a successful result. That static string always contains the substring `"Claude"` (and `"LM Studio"`), and `BulkUploadWorkspace.tsx`'s `analysisModeLabel()` checks `.includes("Claude")` before `.includes("LM Studio")` (line 50-51) — so any successful `ai_assisted` bulk run always displayed "Clustered via Claude," regardless of which tier (or whether Claude at all) actually ran. Two prompt-supplied hypotheses were investigated and **refuted**: `lib/ai/claudeApi.ts` and `app/api/ai/claude/route.ts` already correctly fail fast on a missing `ANTHROPIC_API_KEY` (route returns 503 *before* attempting any Anthropic network call — functionally equivalent to a health check) and already validate the HTTP response before reporting success — neither file needed changes. Live verification confirmed the underlying clustering was genuinely LM Studio (`google/gemma-4-e4b`) output (real JSON reasoning text captured over the wire, `finish_reason: "stop"`), just mislabeled.

**Bug 2 root cause (confirmed, but not as literally hypothesized):** The prompt's hypothesis — that the parser "misidentified the shape" for a plain `{subject, message}` file via the default auto-suggestion path — was **refuted** by direct testing (`parseBulkUploadFile` correctly returns `raw_queries` shape with no `resolution` field for such a file when the suggested/default mapping is applied). The actual gap: nothing prevented a field already identified as query/subject-shaped (`"subject"` is an exact entry in `MESSAGE_FIELD_HINTS`, `lib/bulkUpload.ts:29`) from also being accepted as the **resolution** field — whether via a manual mapping mistake (the ambiguous `subject`/`message` tie in `suggestField()` forces a manual "Map file columns" step, and the resolution dropdown offered every field with no guard) or a caller passing that mapping directly. Once `resolutionField` was set to `"subject"`, `shapeForEntries()` correctly-per-its-own-logic saw every row with a non-empty `entry.resolution` and reported `queries_with_resolutions`, and `summarizeResolution()` in `analyzeBulkEntries` then picked the most frequent subject string as `knowledgeDraft.customerResponseTemplate` — exactly reproducing the reported defect (confirmed via an isolated `tsx` repro of `parseBulkUploadFile` with `resolutionField: "subject"`).
**What changed:**
- `lib/bulkUpload.ts` `analyzeBulkEntries()`: added `actualProviderLabel`, updated on every genuinely successful `discriminateMatch`/`suggestCanonicalProblem` call from that result's own `providerLabel` (already accurate per-tier — see `lib/ai/lmStudio.ts`'s relabel-on-override and `lib/ai/claudeApi.ts`'s `providerLabel: "Claude API"`). The final `providerLabel` returned (and attached to every cluster) is `actualProviderLabel ?? aiAdapter.provider.label` — the static chain label is now only ever a fallback for non-`ai_assisted` display, never a false claim of which tier ran.
- Added `isMessageShapedField()` (`lib/bulkUpload.ts`) — true for any field with an exact `MESSAGE_FIELD_HINTS` match (e.g. `"subject"`, `"message"`, `"query"`). `extractEntriesFromObjectRows()` now rejects a `resolutionField` that is message-shaped or identical to `messageField`, falling back to no-resolution rather than accepting it — this is the authoritative parsing function, so the guard holds even for a mapping supplied directly (bypassing the UI).
- Added `resolutionFieldOptions` to `BulkUploadMappingRequest` (`types/bulkUpload.ts`, populated in `buildMappingRequest()`) — `fieldOptions` minus message-shaped fields. `BulkUploadWorkspace.tsx`'s "Resolution field" `<select>` now iterates this filtered list, so `"subject"` is never even offered as a resolution choice in the mapping UI (closes the manual-mistake path, not just the silent-reject path).
- When a cluster has no real resolutions in the source file, `proposedTemplate` now prefers a matching lesson's `customerResponse` (via the existing `findMatchingLesson()` from `lib/drafting.ts`, run against the cluster's representative ticket and matched knowledge item) before falling back to the item's bare generic `customerResponseTemplate`, and finally `""` (which the existing `resolutionNeeded`/"Resolution needed" badge + commit-time gate in `BulkUploadWorkspace.tsx` already handle correctly — no raw input field's contents can reach that slot). No new synthesis logic was written; this reuses the same lesson-matching path single-ticket drafting already relies on.

**Safety-note check:** Asked the user directly whether the specific test cluster ("Login Issue," 25 queries, "Password forgotten after long break" proposed response) was ever committed via "Validate & commit cluster." User confirmed it was **held off, not committed**. No validation records or memory change records exist for it (a fresh session's `oip.validationRecords.v2`/`oip.memoryChanges.v2` were empty during investigation, consistent with that answer). **No data-integrity repair was needed** — the corrupted proposal and the mislabeled badge never reached Organizational Memory.

**Boundaries touched:** none. Both fixes are confined to the bulk parsing/clustering advisory layer (before human validation); `commitValidatedMemoryChange()`/the candidate → validation → memory-change path is untouched. Boundary 5 (no forced weak matches) is unaffected — `findMatchingLesson()` still requires actual signal overlap, it is not a forced match.
**Verification:**
- `npx tsc --noEmit` and `npm run build` — pass.
- Isolated `tsx` repro of `parseBulkUploadFile()` against a synthetic 25-row `{subject, message}` fixture: default mapping → `raw_queries`, no resolution; explicitly forcing `resolutionField: "subject"` → correctly rejected, still `raw_queries`, no `resolution` key on any entry (pre-fix this produced `queries_with_resolutions` with subject text in `resolution`).
- Live in preview (LM Studio running locally, `ANTHROPIC_API_KEY` unset): uploaded a 25-query `{subject, message}` JSON file (one subject repeated 3×: "Password forgotten after long break") against a seeded "Login Issue" knowledge item with a forgotten-password lesson and an SSO lesson. Mapping UI's resolution dropdown showed only "No resolution field" (no `subject`/`message` options). After analysis: badge read **"Clustered via local AI"** (never "Claude"), confirmed via network inspection that only `/api/ai/chat` (LM Studio proxy) calls were made and one response body was real Gemma JSON output. "Proposed Customer Response" showed the forgotten-password lesson's actual grounded text; the subject line "Password forgotten after long break" does not appear anywhere on the page.
- Regression: uploaded a genuine `query,resolution` CSV → correctly detected as `queries_with_resolutions`, and the real resolution text ("Please confirm your registered email...") was used as the proposed response, confirming the new guard doesn't affect legitimate resolution columns.
- Regression: single-ticket drafting for a forgot-password ticket still correctly showed "DRAFTED LOCALLY (GEMMA)" and the lesson-grounded draft — the shared adapter's per-call `providerLabel` mechanism (already correct, unmodified) still works.
**Open items:** None for these two bugs.

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
