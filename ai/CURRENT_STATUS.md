# Current Status

This file is the fastest accurate snapshot of the prototype as of 2026-07-03.

## What Changed Most Recently

Customer-draft safety was tightened across the deterministic and AI-assisted paths. The ticket-understanding layer now carries extracted sender/deadline/sub-issue fields, AI draft prompts explicitly enforce organization tone and response structure, and unsupported commitments are rejected before an AI draft can be shown for review.

## What Works Right Now

- Full learning loop
  Single-ticket intake, analysis, memory retrieval, draft generation, human review, reflection, validated memory commit, and trust evolution all exist in code.

- Lessons as first-class learning objects
  `KnowledgeItem.lessons` is live, lessons can be authored during reflection, and `findMatchingLesson()` can drive lesson-grounded drafts.

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

## Environment Notes

- AI mode is configured in `.env.local` as `NEXT_PUBLIC_AI_MODE=lmstudio`.
- LM Studio base URL is `http://127.0.0.1:1234/v1`.
- Current model is `google/gemma-4-e4b`.
- Current timeout is `AI_TIMEOUT_MS=30000`.
- If Next.js starts behaving strangely after edits, clear the build cache by deleting `.next` and restart the dev server.
- `graphify-out/graph.json` exists, but `graphify query` currently fails locally with `uv trampoline failed to canonicalize script path`, so direct graph CLI use may need repair before relying on it.

## Known Open Items

- Verify the pipeline stall fix for unclassified yet relevant queries end-to-end.
- Run the F-04 live regression test with Gemma enabled.
- Complete live verification for sender-name extraction, tone-change observability, and deterministic fallback behavior with LM Studio toggled on/off.
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
