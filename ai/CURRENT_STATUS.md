# Current Status

This file is the fastest accurate snapshot of the prototype as of 2026-07-07.

## What Changed Most Recently

Five pre-demo fixes from E2E_AUDIT_REPORT.md were completed: (F-1) "Resume in workspace" button on in-review cases in Cases view, restoring the pipeline at Human Review; (F-2) AI draft greeting now uses extracted sender name ("Hello Sarah Johnson,") with a deterministic safety net; (F-3) bulk upload now routes through LM Studio when available — root cause was truncated JSON from insufficient maxTokens; (F-4) retry AI draft button broadened to show in both cold-start and reuse paths; (F-7) ticket reference appended to AI drafts via prompt instruction and post-processing guard.

## What Works Right Now

- Full learning loop
  Single-ticket intake, analysis, memory retrieval, draft generation, human review, reflection, validated memory commit, and trust evolution all exist in code.

- Lessons as first-class learning objects
  `KnowledgeItem.lessons` is live, lessons can be authored during reflection or imported from a starter pack, and `findMatchingLesson()` can drive lesson-grounded drafts.

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

- LM Studio proxy and advisory flow
  Browser AI calls route through `app/api/ai/chat/route.ts`, with diagnostics, timeout handling, and deterministic fallback behavior.

- Trust + validation reuse path
  Reuse can route to human review or deterministic auto-resolution depending on validation state, trust score, category safety, and draft source.

- Organization-scoped prototype state
  Knowledge, candidates, validation records, memory changes, metrics, patterns, and org profile state persist in localStorage.

- Lesson-specific AI guardrails
  When an AI draft is grounded in a lesson, any lesson-level `doNotPromise` entries are appended to the no-unvalidated-commitments rule before the model drafts the customer response.

## Environment Notes

- AI mode is configured in `.env.local` as `NEXT_PUBLIC_AI_MODE=lmstudio`.
- LM Studio base URL is `http://127.0.0.1:1234/v1`.
- Current model is `google/gemma-4-e4b`.
- Current timeout is `AI_TIMEOUT_MS=30000`.
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
