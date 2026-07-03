# OIP Prototype Architecture

This document describes the architecture that exists in code today in `C:\Users\Calvin\Documents\My Project\Hackathon 2`. It is intentionally descriptive, not aspirational. The current prototype is a single-user, single-role Next.js application with client-side persistence, a deterministic support pipeline, and an optional LM Studio-backed AI advisory layer.

## Runtime Shape

The application is a Next.js App Router project, but almost all product logic runs inside the client component in `app/page.tsx`. That file owns the long-lived state for:

- active tickets and workflow steps
- organizational knowledge, validation records, and memory change records
- organization profiles and metrics
- AI advisory diagnostics
- view routing between Home, Tickets, Knowledge, Dashboard, Organization, and Settings

The app has one lightweight server-side surface: `app/api/ai/chat/route.ts`. That route proxies browser-origin AI calls to LM Studio, adds timeout handling and diagnostic headers, and keeps the browser on the same-origin Next.js endpoint.

## Main Ticket Pipeline

The primary ticket flow starts in `processTicketPipeline()` in `app/page.tsx`. The orchestration is linear and visible in UI state:

1. Ticket intake
   `makeCustomTicket()` creates a `Ticket` from the user-entered text.

2. Business relevance guardrail
   `assessBusinessRelevanceForProfile()` in `lib/analyzer.ts` checks whether the request belongs to the selected organization. Only explicit `out_of_scope` tickets stop early. Uncertain tickets continue.

3. Business domain classification
   `classifyBusinessDomain()` in `lib/domainClassifier.ts` tags the ticket with one or more supported domains before knowledge matching.

4. Deterministic understanding
   `observe()` and `understandForProfile()` in `lib/analyzer.ts` build the initial `Observation` and `Understanding`. This is where category selection, intent detection, urgency, tags, and detected signals are produced.

5. Canonical problem identity
   `identifyCanonicalProblem()` in `lib/canonicalProblemEngine.ts` maps the understanding to a canonical problem title, summary, category, and tags.

6. AI analysis advisory
   `requestAnalysisAdvisory()` in `app/page.tsx` calls the provider methods exposed by `lib/ai/*` for optional ticket analysis and canonical-problem suggestions. Deterministic labels remain the baseline.

7. Memory retrieval
   `retrieveMemory()` in `lib/memory.ts` ranks existing `KnowledgeItem` records by category overlap, tag overlap, keyword overlap, prior reuse, and trust. This produces `KnowledgeMatch[]`.

8. Human-readable reasoning and confidence
   `buildReasoning()` and `buildConfidence()` in `lib/analyzer.ts` convert the deterministic analysis and top memory match into UI-ready explanations.

9. Match discrimination
   `requestMatchDiscrimination()` in `app/page.tsx` optionally asks the LM Studio provider whether the best memory match is actually the same problem or a distinct one. A medium/high-confidence rejection forces the flow back to no-match behavior.

10. Draft generation
   `draftResponse()` in `lib/drafting.ts` produces the deterministic response candidate. `requestDraftAdvisory()` in `app/page.tsx` may layer an AI advisory draft on top, but the deterministic draft always remains the fallback and grounding source.

11. Human review
   `approveResponse()` in `app/page.tsx` is the gate from drafted text to approved response. This step creates the reflection decision but does not yet write to organizational memory.

12. Reflection and memory update
   `generateReflection()` in `lib/reflection.ts` decides whether the result should create new knowledge, merge into existing knowledge, create a new version, or only update trust. `confirmReflection()` in `app/page.tsx` applies the chosen path and commits the validated change.

## Reuse / Second-Ticket Pipeline

The prototype also has a reuse pipeline in `processSecondTicket()` in `app/page.tsx`. It replays the same analysis stages, then:

- filters retrieved matches through `isCompatibleForDrafting()` in `lib/drafting.ts`
- optionally rejects a false-positive top match through `requestMatchDiscrimination()`
- evaluates the strongest remaining candidate with `evaluateTrust()` in `lib/trustEngine.ts`
- routes either to human review or to automatic resolution

Automatic resolution is intentionally narrow. It only happens when the selected knowledge item is validated, trusted, category-compatible, and rendered from deterministic organizational memory. If the resulting draft source is `ai_advisory`, or the issue is `General` / `Uncategorized`, `processSecondTicket()` forces the flow back to human review.

When reuse is approved or auto-resolved, `applyResolution()` in `app/page.tsx` calls `recordResolution()` in `lib/trustEngine.ts`, then commits the trust update through the same validated memory-change path used everywhere else.

## Bulk Upload Pipeline

Bulk intake is implemented in `lib/bulkUpload.ts` and orchestrated from `app/page.tsx`:

- `parseBulkUploadFile()` parses `.json`, `.csv`, `.md`, and `.txt`
- `analyzeBulkEntries()` runs each entry through business relevance, understanding, canonical-problem identity, and optional AI discrimination
- queries are grouped into `BulkCluster` objects representing new, existing, or unclustered knowledge
- `prepareBulkClusterCommit()` turns a validated cluster into a memory mutation draft
- `commitBulkCluster()` in `app/page.tsx` converts that draft into a `KnowledgeCandidate`, `ValidationRecord`, and `MemoryChangeRecord`

This means bulk upload does not bypass governance. It uses cluster-level human validation, then the same validated commit machinery as single-ticket learning.

## Knowledge and Learning Lifecycle

The write path is centralized in `app/page.tsx`:

- `createCandidate()` creates a `KnowledgeCandidate`
- `applyValidatedMemoryChange()` creates the `ValidationRecord`, snapshots `beforeState` and `afterState` into a `MemoryChangeRecord`, updates the candidate status to `validated`, and upserts the final `KnowledgeItem`
- `commitValidatedMemoryChange()` is the thin wrapper used by reflection, reuse, and bulk flows

Reflection decisions come from `generateReflection()` in `lib/reflection.ts`:

- `create_new`
- `merge_existing`
- `create_version`
- `trust_update_only`

Canonical-problem mutation logic lives in `lib/canonicalProblemEngine.ts`:

- `createCanonicalProblem()`
- `mergeIntoCanonicalProblem()`
- `upsertCanonicalProblem()`
- `withCanonicalProblemDefaults()`

Lessons are first-class learning objects stored on `KnowledgeItem.lessons`. `findMatchingLesson()` in `lib/drafting.ts` can override the generic template path with a lesson-grounded response. `confirmReflection()` can also attach or improve lessons during memory commit.

## Data Model

The core types live in `types/knowledge.ts`, `types/ai.ts`, `types/bulkUpload.ts`, `types/oip.ts`, and `types/ticket.ts`.

### Ticket and understanding types

- `Ticket`: the runtime support request object
- `Observation`: raw observed ticket facts
- `Understanding`: deterministic interpretation of category, intent, urgency, tags, and detected signals

### Knowledge and validation types

- `KnowledgeItem`: canonical organizational memory entry with trust, provenance, versions, example tickets, lessons, and lifecycle metadata
- `Lesson`: root-cause-specific sub-learning attached to a knowledge item
- `KnowledgeCandidate`: proposed memory mutation generated before validation
- `ValidationRecord`: explicit approval or rejection record for a candidate and active version
- `MemoryChangeRecord`: append-only audit snapshot linking candidate, validation, and before/after memory state
- `ReflectionDecision` and `ReflectionCommitInput`: the reflection output and the human-supplied commit inputs

### AI and draft types

- `SuggestedResponse`: the customer-facing draft plus its source, grounding mode, fallback notice, and linked knowledge IDs
- `DraftGroundingMode`: `lesson_grounded`, `memory_grounded`, or `cold_start`
- `AIAdvisory`: diagnostics and structured AI suggestions

### Bulk upload types

- `BulkUploadEntry`: parsed historical query
- `BulkAnalyzedQuery`: one analyzed entry with deterministic understanding and optional memory match
- `BulkCluster`: grouped bulk knowledge candidate
- `BulkAnalysisResult`: batch output for the bulk workflow

## Three AI Draft Grounding Modes

The prototype has three explicit AI grounding modes, all set in `requestDraftAdvisory()` in `app/page.tsx` and represented by `DraftGroundingMode` in `types/ai.ts`:

1. `lesson_grounded`
   Used when `findMatchingLesson()` finds a lesson on the matched knowledge item. The AI receives lesson root cause, solution, customer response, and matched signals.

2. `memory_grounded`
   Used when the ticket matches validated organizational memory and the deterministic draft is grounded in the matched canonical problem.

3. `cold_start`
   Used when there is no acceptable organizational memory match. The AI receives no memory grounding and the UI carries the explicit label that no organizational knowledge backed the draft.

The important architectural point is that these are advisory grounding modes, not authorization modes. Human review remains the gate.

## AI Layer and LM Studio Proxy

The AI stack is split across `lib/ai/*` plus the Next.js proxy route:

- `lib/ai/adapter.ts`
  Reads env config and selects LM Studio, AMD placeholder, or disabled mode.

- `lib/ai/lmStudio.ts`
  Implements `analyzeTicket`, `suggestCanonicalProblem`, `suggestPatternName`, `enrichKnowledge`, `draftCustomerResponse`, and `discriminateMatch`. Every call uses timeout handling, JSON parsing, and structured failure mapping.

- `lib/ai/prompts.ts`
  Builds prompt bundles for analysis, canonical problem suggestion, knowledge enrichment, response drafting, and match discrimination.

- `lib/ai/deterministic.ts`
  Computes agreement, advisory status, and whether an AI draft is even eligible to be used in the review surface.

- `app/api/ai/chat/route.ts`
  Proxies browser requests to `AI_BASE_URL` with the configured model and a bounded timeout. Failures return structured diagnostics instead of leaving the UI hanging.

The route defaults to:

- base URL: `http://127.0.0.1:1234/v1`
- model: `google/gemma-4-e4b`
- timeout cap: 30000 ms

## Persistence

Persistence is intentionally simple and entirely client-side. `lib/orgMemory.ts` stores the prototype state in `window.localStorage`, including:

- knowledge items
- knowledge candidates
- validation records
- memory change records
- organization metrics
- intelligence log
- emerging patterns

There is no database, backend write API, authentication boundary, or multi-user concurrency model. `loadKnowledge()` normalizes and deduplicates stored knowledge through `withLearningDefaults()` and `withCanonicalProblemDefaults()` before the app hydrates.

## UI View Structure

The UI is a single-screen shell rendered from `app/page.tsx` with a sidebar and view switch:

- `components/views/HomeView.tsx`
  landing page and summary
- `components/views/TicketWorkspace.tsx`
  single-ticket intake, review, reflection, and reuse workflow
- `components/views/BulkUploadWorkspace.tsx`
  batch analysis and cluster validation
- `components/views/KnowledgeView.tsx`
  knowledge browser, provenance, validation history, and memory network overlay
- `components/views/DashboardView.tsx`
  org metrics and trend summaries
- `components/views/OrganizationView.tsx`
  organization profile management
- Settings section in `app/page.tsx`
  theme controls and the reset danger zone

## Intentional Simplifications vs. the Full OIP Blueprint

The code intentionally simplifies the broader OIP vision documented elsewhere in `docs/`:

- Single role, not enterprise RBAC
  The only effective reviewer role in code is the prototype's built-in `knowledge_validator` flow. There are no distinct human personas, permissions, or approval queues.

- Client-side persistence, not production storage
  `localStorage` is the only persistence layer. There is no server-side audit store, tenant isolation, or durable shared backend.

- Simplified trust model
  Trust is a bounded numeric score in `lib/trustEngine.ts`, driven by reuse outcomes and gated by validation. It is not a probabilistic or policy-engine-driven confidence system.

- Simplified operational pipeline
  The entire workflow lives in one client orchestrator rather than distributed services, queues, or background jobs.

- AI as bounded advisor only
  AI can suggest, discriminate, and personalize drafts, but it does not validate knowledge, directly commit memory, or bypass human review.

That simplicity is deliberate: the prototype demonstrates the learning loop, governance surfaces, and memory lifecycle without implementing the full multi-actor platform architecture.
