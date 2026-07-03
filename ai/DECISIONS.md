# Decisions

This is an ADR-style log of durable implementation decisions already embodied in the prototype.

## ADR-001 — Organizational memory writes use candidate -> validation -> memory-change records

Status:
Accepted

Decision:
The prototype records every memory mutation through `KnowledgeCandidate`, `ValidationRecord`, and `MemoryChangeRecord`, then applies the final `KnowledgeItem` update through the shared validated commit path in `app/page.tsx`.

Why:
This creates an auditable history for create, merge, version, and trust-only updates and directly addresses the audit remediation requirement that memory writes be governed rather than implicit.

Consequence:
Future features must reuse `applyValidatedMemoryChange()` / `commitValidatedMemoryChange()` instead of writing knowledge directly.

## ADR-002 — Automation requires both trust and validation

Status:
Accepted

Decision:
Trust score is not enough. `evaluateTrust()` in `lib/trustEngine.ts` only permits `auto_resolution` when the active knowledge version has an approved validation record.

Why:
This separates empirical reuse confidence from governance approval.

Consequence:
Any future automation feature must preserve the `hasApprovedValidationForActiveVersion()` gate.

## ADR-003 — The LLM is a bounded advisor, not a validator

Status:
Accepted

Decision:
LLM features are limited to discrimination, analysis suggestions, canonical suggestions, enrichment, and grounded draft personalization. They do not validate knowledge or commit memory.

Why:
The prototype is deterministic-first and keeps governance in human-reviewed, code-defined paths.

Consequence:
AI output must always have deterministic fallback behavior and must never bypass review or validation.

## ADR-004 — Drafts use three explicit grounding modes with labels

Status:
Accepted

Decision:
Customer draft suggestions are tagged as `lesson_grounded`, `memory_grounded`, or `cold_start`.

Why:
The UI and reviewers need to know whether a draft came from validated organizational memory, a narrower lesson, or no approved memory at all.

Consequence:
Cold-start drafts must remain explicitly unvalidated suggestions, not implied knowledge.

## ADR-005 — Bulk upload uses cluster-level human validation

Status:
Accepted

Decision:
Historical queries are analyzed into `BulkCluster` groups, then committed only after human validation through the same candidate/validation/memory-change path.

Why:
Bulk ingestion is valuable for bootstrapping memory, but it must not bypass governance.

Consequence:
Unclustered or low-confidence items are held back for individual review rather than forced into memory.

## ADR-006 — Lessons are first-class organizational learning objects

Status:
Accepted

Decision:
`Lesson` objects live on `KnowledgeItem` and can be created or improved during reflection, then reused by `findMatchingLesson()` during drafting.

Why:
Canonical problems alone were too coarse for root-cause-specific reuse. Lessons capture narrower signals and sharper response guidance.

Consequence:
Future knowledge improvements should prefer adding or refining lessons before introducing unnecessary new canonical problems.

## ADR-007 — Uncategorized tickets require human-named canonical problems

Status:
Accepted

Decision:
When `understandForProfile()` cannot classify a ticket, the flow falls back to `Uncategorized`, and reflection requires a human-supplied problem name before creating the first canonical problem.

Why:
This prevents the system from inventing authoritative organizational taxonomy for genuinely new issues.

Consequence:
No uncategorized issue may silently inherit the nearest known label.

## ADR-008 — Every LLM call must have a deterministic fallback

Status:
Accepted

Decision:
Analysis, match discrimination, and drafting all degrade to deterministic behavior when AI is disabled, times out, or returns malformed output.

Why:
The prototype must remain demoable and safe even when Gemma or LM Studio is unavailable.

Consequence:
New AI surfaces must define their fallback behavior before they are considered complete.

## ADR-009 — Match discrimination protects against false-positive reuse

Status:
Accepted

Decision:
The top retrieved memory match can be rejected by the AI discrimination step when it appears to describe a distinct problem.

Why:
Pure similarity and trust are not enough to prevent semantically adjacent but operationally wrong reuse.

Consequence:
A rejected top match routes the flow back to cold-start / human review rather than forcing weak reuse.
