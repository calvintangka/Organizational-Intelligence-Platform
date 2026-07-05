# Prompt Library

## Repository Scan Result

As of 2026-07-03, this repository does **not** contain any checked-in prompt files matching `oip_*.md`, `*prompt*.md`, or similar reusable prompt artifacts. A hidden-file scan also did not find them.

That means a truthful prompt library cannot index prompt files that are not present. Instead, this document preserves the recoverable precedents from:

- git history
- existing `/ai` and `docs/` artifacts
- the current governance setup prompt that produced this document set

## Recoverable Precedents

- `Current AI governance setup prompt` - Outcome: completed in this session; produced code-grounded `/ai` governance docs, per-task commits, and retroactive changelog backfill.
- `Audit remediation F-01-F-07 prompt lineage` - Outcome: implemented in code, but the original prompt file is not present in the repo; see `ai/CHANGELOG.md` retroactive entry and `AUDIT_REPORT.md`.
- `LLM integration / bounded advisor prompt lineage` - Outcome: implemented in code through `lib/ai/*`, `app/api/ai/chat/route.ts`, and `app/page.tsx`; original reusable prompt file not present.
- `Classifier granularity / 2FA split prompt lineage` - Outcome: implemented in `lib/analyzer.ts` and `lib/drafting.ts`; original reusable prompt file not present.
- `Intent-aware templates + editable review prompt lineage` - Outcome: implemented in deterministic template logic and review UI; original reusable prompt file not present.
- `Bulk upload with cluster validation prompt lineage` - Outcome: implemented in `lib/bulkUpload.ts` and bulk workspace UI; original reusable prompt file not present.
- `Memory network prompt lineage` - Outcome: implemented in `components/MemoryNetworkOverlay.tsx` and the knowledge view; original reusable prompt file not present.
- `Lessons in Reflection prompt lineage` - Outcome: implemented in `types/knowledge.ts`, `lib/drafting.ts`, and `app/page.tsx`; original reusable prompt file not present.
- `Gemma / LM Studio proxy prompt lineage` - Outcome: implemented in the AI proxy/provider stack with diagnostics and fallback behavior; original reusable prompt file not present.
- `Initial AI-doc setup prompt lineage` - Outcome: implemented in `AGENTS.md`, `CLAUDE.md`, `.codex/hooks.json`, and the first `/ai` docs; original reusable prompt file not present.

## Prompt Patterns That Worked Here

- Diagnosis before fix
  The best changes started by locating the actual enforcing function or failure path before proposing code edits.

- Suspected vs confirmed findings
  Prompts that separated hypotheses from verified code behavior reduced rework and prevented incorrect architectural conclusions.

- Phased execution with a working-app invariant
  Large changes worked better when the app stayed runnable after each phase instead of batching many risky edits together.

- Mandatory verification lists
  Explicit verification requirements improved both implementation quality and session handoff quality.

- Per-file change summaries
  Prompts that asked for where behavior lived and which files changed made later sessions faster to resume.

## Recommendation For Future Sessions

If prompt reuse is valuable, start checking reusable prompts into the repo under a stable path such as:

- `ai/prompts/oip_<topic>.md`

Until that exists, use `ai/CHANGELOG.md`, git history, and the `/ai` governance docs as the canonical record of what prior prompt-driven sessions accomplished.
