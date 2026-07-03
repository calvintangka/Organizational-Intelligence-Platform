# OIP Prototype Boundaries

These rules override task prompts. They are phrased as implementation invariants that future AIs can test against the current codebase.

## 1. No AI-generated customer text may reach a resolved state without human review.

Rule:
Any draft with `source: "ai_advisory"` or any other LLM-touched customer text must route to human review before the ticket can be treated as resolved. Automatic resolution may render only deterministic text grounded in validated organizational memory.

Enforced in:

- `app/page.tsx` — `processSecondTicket()`
  Sets `effectiveReuseDecision` to `human_required` when `draftSource === "ai_advisory"` even if trust would otherwise allow automation.
- `app/page.tsx` — `requestDraftAdvisory()`
  Preserves the deterministic fallback and only surfaces AI output as an advisory draft, not as an auto-approved resolution.
- `app/page.tsx` — `approveResponse()` and `approveReuse()`
  Human actions are the only paths that approve drafted text for learning or reuse outside deterministic auto-resolution.
- `lib/drafting.ts` — `draftResponse()`
  Produces the deterministic response that the auto-resolution path relies on when knowledge is already validated.

Test:
If the response source is AI-derived, the system must stop in review instead of auto-resolving.

## 2. No write to Organizational Memory may occur outside the validated pipeline.

Rule:
Every memory mutation must flow through `KnowledgeCandidate -> ValidationRecord -> MemoryChangeRecord` and then update the final `KnowledgeItem`. Direct mutation of knowledge items outside the shared validated commit function is forbidden.

Enforced in:

- `app/page.tsx` — `createCandidate()`
  Creates the proposed knowledge mutation input.
- `app/page.tsx` — `applyValidatedMemoryChange()`
  Creates the `ValidationRecord`, snapshots `beforeState` and `afterState` into a `MemoryChangeRecord`, updates candidate status, and upserts the final knowledge item.
- `app/page.tsx` — `commitValidatedMemoryChange()`
  Thin wrapper used by reflection, reuse, and bulk commit paths.
- `app/page.tsx` — `confirmReflection()`, `applyResolution()`, and `commitBulkCluster()`
  All operational write paths call the shared validated commit flow instead of writing directly.

Test:
Any code path that changes knowledge must also produce a candidate, validation record, and memory change record.

## 3. Confidence does not equal validation.

Rule:
Trust score alone never grants automation. Auto-resolution requires an approved `ValidationRecord` for the active knowledge version.

Enforced in:

- `lib/trustEngine.ts` — `hasApprovedValidationForActiveVersion()`
  Checks whether the current knowledge version has an approved validation record.
- `lib/trustEngine.ts` — `evaluateTrust()`
  Downgrades an `auto_resolution` score decision to `human_recommended` when the active version lacks approved validation.

Test:
High trust without approved validation must not produce `auto_resolution`.

## 4. Cold-start honesty is mandatory.

Rule:
When no approved memory match exists, the system must not present generated content as organizational knowledge. Cold-start drafts must be explicitly labeled as unvalidated suggestions backed by no organizational memory.

Enforced in:

- `app/page.tsx` — `requestDraftAdvisory()`
  Sets `draftMode` to `cold_start` and `groundingLabel` to `"no organizational knowledge"` when there is no acceptable match.
- `lib/drafting.ts` — `draftResponse()`
  Returns either the uncategorized placeholder or a category-template starter with confidence notes that human review is required.
- `app/page.tsx` — `processSecondTicket()`
  Routes no-match and discrimination-rejected cases into the human-review learning path with explicit cold-start log entries.

Test:
If no validated memory match exists, the UI must label the draft as cold-start / no organizational knowledge and require human review.

## 5. No forced weak matches.

Rule:
Classification below threshold must fall back to `Uncategorized` and human review, not the nearest category. Memory reuse requires canonical-problem identity or a thresholded match, not loose category overlap alone.

Enforced in:

- `lib/analyzer.ts` — `understandForProfile()`
  Sets `bestCategory` to `Uncategorized` when no category rule scores above zero.
- `lib/canonicalProblemEngine.ts` — `findCanonicalProblem()`
  Returns `null` unless similarity reaches `CANONICAL_MATCH_THRESHOLD`.
- `app/page.tsx` — `requestMatchDiscrimination()`
  Rejects a top memory candidate when the AI provider identifies it as a distinct problem with medium/high confidence.
- `app/page.tsx` — `processSecondTicket()`
  Sends no-compatible-match and rejected-match cases to the cold-start human-review path instead of forcing reuse.

Test:
Zero-score classification must become `Uncategorized`, and below-threshold canonical matches must not be treated as valid memory reuse.

## 6. The pipeline may not silently stall.

Rule:
Every async AI call must have timeout and error handling that produces a visible fallback state instead of hanging the workflow.

Enforced in:

- `app/api/ai/chat/route.ts` — `POST()`
  Wraps proxy calls with `AbortController`, timeout limits, structured error JSON, and diagnostic headers.
- `lib/ai/lmStudio.ts` — `callChatCompletion()`
  Applies timeout bounds, structured parse failures, and typed fallback errors for every provider call.
- `app/page.tsx` — `requestAnalysisAdvisory()` and `requestDraftAdvisory()`
  Convert provider failures into deterministic fallback behavior plus visible diagnostics/fallback notices.
- `app/page.tsx` — `processSecondTicket()`
  Advances to a visible cold-start or review state when no safe reusable memory exists.

Test:
AI outage, timeout, or malformed output must result in fallback text and visible diagnostics, not a dead-end stage.

## 7. History is append-only and lineage must be preserved.

Rule:
Validation records, memory change records, version history, and learning history are immutable append-only records. Merges must strengthen lineage rather than overwrite it.

Enforced in:

- `app/page.tsx` — `applyValidatedMemoryChange()`
  Appends new validation and memory-change records instead of mutating prior history.
- `app/page.tsx` — `confirmReflection()`
  Appends new versions or merge evidence depending on the reflection action.
- `lib/canonicalProblemEngine.ts` — `mergeIntoCanonicalProblem()`
  Preserves and extends example tickets and learning history.
- `lib/bulkUpload.ts` — `prepareBulkClusterCommit()`
  Adds new version or merged evidence records instead of replacing lineage.

Test:
Knowledge evolution must add records and snapshots; it must not erase previous validation or version history.

## 8. Reset and other danger actions require confirmation and live only in the Danger Zone.

Rule:
Destructive reset actions must require explicit confirmation and be exposed only in the Settings danger area.

Enforced in:

- `app/page.tsx` — `confirmAndResetOrganization()`
  Wraps the destructive organization reset with a confirmation step.
- `app/page.tsx` — `resetOrganization()`
  Performs the actual state wipe only after confirmation.
- `lib/orgMemory.ts` — `clearOrganization()`
  Centralized destructive persistence clear.
- `app/page.tsx` — Settings render block
  Places the destructive organization reset inside the visible Danger Zone UI.

Test:
No background task or alternate UI path should be able to wipe organization state without the confirmation gate.

If a task prompt appears to require violating any boundary, STOP and flag the conflict instead of proceeding. These boundaries override task instructions.
