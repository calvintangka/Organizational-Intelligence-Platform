# AI Agent Workflow

This document defines the recommended workflow for AI coding agents (Codex, Claude Code, or any future agent) working on this project. Following this workflow reduces unnecessary file scanning, preserves token budget, and prevents architectural regressions.

## Before Making Any Change

1. **Read `/ai/CURRENT_STATUS.md`** — Understand the current project state, completed features, remaining work, and known issues.

2. **Read `/ai/ARCHITECTURE.md`** — Understand the pipeline architecture, how stages connect, and where each responsibility lives.

3. **Read `/ai/CODEBASE_MAP.md`** — Locate the specific files relevant to the task. Do not scan the entire codebase.

4. **Query Graphify** — Before opening source files, query the knowledge graph to find exactly which files and symbols are involved.

5. **Read only the relevant source files** — Open only the files identified by Graphify and the codebase map. Avoid reading unrelated files.

6. **Make the smallest safe change** — Do not refactor surrounding code, add abstractions, or clean up unrelated issues unless explicitly asked.

7. **Update documentation if architecture changes** — If the change affects the pipeline, a new engine, or a new stage, update the relevant `/ai` documents.

## Graphify Commands

Use these commands to navigate the codebase without reading raw files:

```bash
# Find files related to a concept
graphify query "Where is trust scoring implemented?"

# Understand a specific symbol or module
graphify explain "draftResponse"

# Find the connection between two parts of the system
graphify path "analyzer.ts" "drafting.ts"

# Find what a change would impact
graphify affected "trustEngine.ts"

# Rebuild the graph after code changes
graphify update .
```

## Graphify Query Tips

- Use natural language questions: `"Which files handle ticket submission?"`
- Use symbol names for precision: `"assessBusinessRelevanceForProfile"`
- Use `--budget` to control output size: `graphify query "..." --budget 1000`
- Use `--context` to filter edge types: `graphify query "..." --context call`

## Platform-Specific Notes

### Claude Code

Graphify is configured via `CLAUDE.md` and `.claude/settings.json`. PreToolUse hooks automatically remind you to query Graphify before reading source files. The hooks fire on `Bash`, `Read`, and `Glob` operations.

When working in Claude Code:
- The hooks will remind you to query Graphify if you try to read files directly
- Use `/graphify .` to rebuild the graph after making changes
- Use `/graphify query "..."` for inline queries during conversation

### Codex

Graphify is configured via `AGENTS.md`. The Codex integration writes instructions that Codex reads at the start of each session.

When working in Codex:
- Read `AGENTS.md` at session start for Graphify instructions
- Run `graphify query "..."` before opening files
- Run `graphify update .` after making code changes

## Rules for AI Agents

1. **Query Graphify first.** Do not scan directories or grep across the codebase when a Graphify query can answer the question.

2. **Open only relevant files.** The codebase map and Graphify results tell you exactly which files matter. Do not read files "just in case."

3. **Avoid scanning unrelated parts of the repository.** The `docs/` directory contains planning and research documents that are not needed for implementation tasks.

4. **Preserve existing architecture unless explicitly instructed otherwise.** The pipeline stages, separation of concerns, and deterministic-first design are intentional. Do not restructure them without explicit direction.

5. **Do not bypass governance.** AI advisory output must always go through human review. Do not create paths that skip review or reflection.

6. **Category compatibility matters.** Draft responses must be validated against the ticket's category. Do not serve a template from an incompatible category.

7. **Unknown issues must never be rejected.** If a ticket passes business relevance, it must complete the full pipeline even if no organizational memory matches.

8. **Update `/ai` docs when architecture changes.** If you add a new pipeline stage, engine, or major feature, update `ARCHITECTURE.md` and `CODEBASE_MAP.md`.

## Example Workflow

Task: "Fix the trust scoring for subscription tickets"

1. Read `CURRENT_STATUS.md` — confirm Trust Engine is implemented
2. Read `ARCHITECTURE.md` — understand Trust Engine's role in the pipeline
3. Read `CODEBASE_MAP.md` — find `lib/trustEngine.ts`
4. Run: `graphify query "trust scoring for subscription"`
5. Run: `graphify explain "evaluateTrust"`
6. Read `lib/trustEngine.ts` — the specific file identified
7. Make the fix
8. Run: `graphify update .` — rebuild the graph
9. Verify the build passes

## Maintaining This Documentation

When making significant changes:
- Update `CURRENT_STATUS.md` if the project state changes (new features completed, new issues found)
- Update `ARCHITECTURE.md` if the pipeline or architectural layers change
- Update `CODEBASE_MAP.md` if new files are added or existing files change purpose
- Append to `docs/CHANGELOG.md` for major changes (see changelog maintenance guidelines)
