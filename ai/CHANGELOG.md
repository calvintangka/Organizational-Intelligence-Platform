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
