# Coding Workflow

This workflow is for AIs that edit code or documentation in this repository.

## Mandatory Sequence

1. Read `ai/CURRENT_STATUS.md`, `ai/BOUNDARIES.md`, and the relevant sections of `ai/ARCHITECTURE.md` and `ai/CODEBASE_MAP.md`.
2. For codebase questions or code changes, run `graphify query "<question>"` first when `graphify-out/graph.json` exists. Use `graphify explain "<concept>"` or `graphify path "<A>" "<B>"` when helpful.
3. Read only the files affected by the task. Use `ai/CODEBASE_MAP.md` to narrow the set before opening source.
4. Verify every "suspected" claim in the task prompt against the actual code before acting. Report what was confirmed and what was refuted.
5. Make the smallest safe change that satisfies the task.
6. Never weaken anything in `ai/BOUNDARIES.md`. If the task appears to require that, stop and flag the conflict instead of editing.
7. Build and verify according to the task's verification list. If a build or test cannot be run, say so explicitly.

## File-Reading Discipline

- Start with the orchestrator and the directly referenced module, not the whole repo.
- Prefer the smallest evidence set that can prove the behavior.
- Do not scan `docs/` unless the task is documentation, strategy, or governance work.
- Do not treat old `/ai` docs as truth if the code disagrees. Update the docs to match the code.

## Verification Discipline

When a prompt includes assertions such as:

- "this path is broken"
- "trust already does X"
- "Reflection writes immediately"
- "the classifier is forcing category Y"

you must check the actual implementation before editing. State each result as:

- `confirmed`
- `refuted`

Do not silently inherit prompt assumptions into code changes.

## Safety Rules

- Human review remains the gate for AI-authored customer text.
- Memory writes must go through the validated candidate/validation/memory-change path.
- Trust score alone does not authorize auto-resolution.
- Cold-start output must stay labeled as unvalidated and ungrounded.
- Reset and destructive flows must stay behind explicit confirmation.

If any requested change conflicts with those rules, stop and report the conflict.

## Mandatory Closing Steps

These are never optional.

1. Append an entry to `ai/CHANGELOG.md` using the defined format.
2. Update `ai/CURRENT_STATUS.md` with:
   - what changed
   - what is now true
   - what remains open
3. Update `ai/ARCHITECTURE.md` and/or `ai/CODEBASE_MAP.md` if structure, behavior, or ownership changed.
4. Run `git add -A` and create a descriptive commit.

A task is not complete until all four are done.

## Required Final Summary

The final report for any coding-layer task must explicitly say whether these four closing steps were completed:

- changelog entry
- current status update
- architecture/map update if needed
- git commit

## Suggested Output Template

- Scope: what was changed
- Verification: what was run or spot-checked
- Prompt assumptions: what was confirmed or refuted
- Closing steps: confirm each of the four required close-out actions

## Notes For This Prototype

- `app/page.tsx` is the orchestration hotspot. Most behavioral changes touch it.
- `lib/trustEngine.ts`, `lib/drafting.ts`, `lib/reflection.ts`, `lib/canonicalProblemEngine.ts`, and `lib/bulkUpload.ts` contain the most governance-sensitive logic.
- `lib/orgMemory.ts` is persistence only; do not treat it as the authorization layer.
- If code changes are made, run `graphify update .` afterward when the local Graphify install is healthy.
