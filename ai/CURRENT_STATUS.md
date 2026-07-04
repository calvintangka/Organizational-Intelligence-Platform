# Current Status

This file is the fastest accurate snapshot of the prototype as of 2026-07-04.

## What Changed Most Recently

Starter Knowledge Packs now exist as a governed Door 1 / Door 2 intake path. The Knowledge workspace can preview a JSON pack, import it as a proposed `KnowledgeCandidate`, and route human validation through the same candidate -> validation record -> memory change -> knowledge item path already used by bulk upload and reflection.

## What Works Right Now

- Full learning loop
  Single-ticket intake, analysis, memory retrieval, draft generation, human review, reflection, validated memory commit, and trust evolution all exist in code.

- Lessons as first-class learning objects
  `KnowledgeItem.lessons` is live, lessons can be authored during reflection or imported from a starter pack, and `findMatchingLesson()` can drive lesson-grounded drafts.

- Starter Knowledge Pack intake
  The Knowledge page can preview `.json` packs, warn on unknown classifier categories, import a pack as a pending `KnowledgeCandidate`, and validate it into memory through the existing governed commit path.

- Login starter pack shipped
  `data/packs/login-issues-v1.json` now carries 9 distinct Login lessons, including per-lesson signals, escalation guidance, and `doNotPromise` guardrails.

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
- `graphify-out/graph.json` exists, but `graphify query` currently fails locally with `uv trampoline failed to canonicalize script path`, so direct graph CLI use may need repair before relying on it.
- The in-app browser can reach `http://localhost:3000`, but longer automated UI verification remains somewhat flaky around reloads and JavaScript confirm dialogs.

## Known Open Items

- Verify the pipeline stall fix for unclassified yet relevant queries end-to-end.
- Run the F-04 live regression test with Gemma enabled.
- Complete a clean end-to-end live validation pass for the starter-pack flow after the in-app browser control instability is resolved.
- Re-check organization scoping during live browser testing; stored knowledge still appeared to bleed across org switches during this session's manual spot-check.
- Complete live verification for sender-name extraction, tone-change observability, and deterministic fallback behavior with LM Studio toggled on/off.
- Calibrate AI timeout behavior under real Gemma latency rather than the current fixed 30000 ms assumption.
- Add automated regression coverage; the repo still relies on manual verification and build checks.
- The bulk-upload IDs live test remains open from the previous session.
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
