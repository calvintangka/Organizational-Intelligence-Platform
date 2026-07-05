# AI Agent Workflow

This document defines a lightweight workflow for AI coding agents working on this project. The goal is to keep source reading scoped, preserve token budget, and avoid architectural regressions.

## Before Making Any Change

1. Read `/ai/CURRENT_STATUS.md` to understand the current project state, completed features, remaining work, and known issues.
2. Read `/ai/ARCHITECTURE.md` to understand the pipeline architecture, how stages connect, and where each responsibility lives.
3. Read `/ai/CODEBASE_MAP.md` to locate the specific files relevant to the task. Do not scan the entire codebase.
4. Read only the relevant source files the map points you to. Avoid opening unrelated files "just in case."
5. Make the smallest safe change. Do not refactor surrounding code, add abstractions, or clean up unrelated issues unless explicitly asked.
6. Update documentation if architecture, behavior, or file ownership changes.

## Rules For AI Agents

1. Open only relevant files. The codebase map is the entrypoint for narrowing the evidence set.
2. Avoid scanning unrelated parts of the repository. The `docs/` directory contains planning and research material that is usually not needed for implementation work.
3. Preserve existing architecture unless explicitly instructed otherwise. The pipeline stages, separation of concerns, and deterministic-first design are intentional.
4. Do not bypass governance. AI advisory output must always go through human review. Do not create paths that skip review or reflection.
5. Category compatibility matters. Draft responses must be validated against the ticket's category. Do not serve a template from an incompatible category.
6. Unknown issues must never be rejected. If a ticket passes business relevance, it must complete the full pipeline even if no organizational memory matches.
7. Update `/ai` docs when architecture changes. If you add a new pipeline stage, engine, major feature, or new file cluster, update `ARCHITECTURE.md` and `CODEBASE_MAP.md` manually.

## Example Workflow

Task: "Fix the trust scoring for subscription tickets"

1. Read `CURRENT_STATUS.md` to confirm the Trust Engine is implemented.
2. Read `ARCHITECTURE.md` to understand the Trust Engine's role in the pipeline.
3. Read `CODEBASE_MAP.md` to find `lib/trustEngine.ts`.
4. Read `lib/trustEngine.ts` and any directly related files.
5. Make the fix.
6. Verify the build passes.
7. Update `/ai` docs manually if the structure or behavior changed.

## Maintaining This Documentation

When making significant changes:
- Update `CURRENT_STATUS.md` if the project state changes.
- Update `ARCHITECTURE.md` if the pipeline or architectural layers change.
- Update `CODEBASE_MAP.md` manually if new files are added, files are renamed, or existing files change purpose.
- Append to `ai/CHANGELOG.md` for major governance or implementation changes.
