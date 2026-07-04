# OIP Codebase Map

Use this file to find the minimum source needed for a task. It is written for coding agents, so the emphasis is on load-bearing paths and the functions that actually move state.

## Top-Level Directories

- `ai/` — AI governance and working-context documents for brain-layer and coding-layer agents.
- `app/` — Next.js app router entrypoints; the client orchestrator lives here.
- `components/` — React UI components and full-page workspaces.
- `data/` — Seed tickets, seed knowledge, and seed organization profiles.
- `docs/` — product, architecture, roadmap, canon, and implementation references for broader OIP context.
- `graphify-out/` — generated code graph artifacts and graph report.
- `lib/` — core business logic, memory lifecycle, AI provider adapters, and pipeline engines.
- `outputs/` — generated output artifacts, currently including the brochure PDF.
- `tmp/` — temporary generation helpers and rendered assets.
- `types/` — shared TypeScript contracts used across UI and business logic.

## App Layer

- `app/layout.tsx` — root HTML shell and metadata.
- `app/globals.css` — global styling and design tokens used by the prototype UI.
- `app/page.tsx` — main client orchestrator; owns pipeline state, persistence wiring, view selection, and all write-path coordination.
- `app/api/ai/chat/route.ts` — LM Studio proxy route with request validation, timeout, and diagnostic headers.

## View Components

- `components/views/HomeView.tsx` — landing workspace with summary cards and entry actions.
- `components/views/TicketWorkspace.tsx` — single-ticket intake, analysis, review, reflection, reuse testing, and AI advisory surface.
- `components/views/BulkUploadWorkspace.tsx` — bulk upload parsing, batch analysis, cluster review, and commit UI.
- `components/views/KnowledgeView.tsx` — knowledge browser, provenance, validation history, and memory-network entrypoint.
- `components/views/DashboardView.tsx` — metrics and health dashboards.
- `components/views/OrganizationView.tsx` — profile selection and organization settings.
- `components/maesa/Sidebar.tsx` — primary navigation between views.

## Supporting Components

- `components/AIAdvisoryPanel.tsx` — AI diagnostics, agreement, and fallback display.
- `components/AIAnalysisPanel.tsx` — structured AI analysis and canonical suggestions.
- `components/HumanReviewEditor.tsx` — editable customer-response review gate.
- `components/ReflectionPanel.tsx` — create/merge/version/trust-update explanation and commit inputs.
- `components/ProvenancePanel.tsx` — provenance, validation, and version history display.
- `components/ReasoningPanel.tsx` — deterministic reasoning and uncertainty display.
- `components/RelevanceGuardrailPanel.tsx` — business-relevance decision display.
- `components/SimilarKnowledgeList.tsx` — retrieved memory candidates.
- `components/TrustBadges.tsx` — trust score and maturity display.
- `components/EmergingPatternsPanel.tsx` — pattern-detection and promotion UI.
- `components/KnowledgeBaseList.tsx` and `components/KnowledgeItemCard.tsx` — knowledge list and card rendering.
- `components/MemoryNetworkOverlay.tsx` — full-screen knowledge network visualization.
- `components/MetricsDashboard.tsx` and `components/OrgMetricsDashboard.tsx` — metric summaries.
- `components/IntelligenceLogPanel.tsx` — pipeline event log.
- `components/TicketCard.tsx` — ticket display card.
- `components/StepNavigation.tsx` — step-based workflow navigation.
- `components/AccentPicker.tsx` — organization accent-color picker.
- `components/DemoScenarioSelector.tsx` and `components/ResetDemoButton.tsx` — demo-specific controls.

## Seed Data

- `data/seedKnowledge.ts` — starter organizational memory used before localStorage hydration.
- `data/seedOrganizationProfiles.ts` — Maesa Tech, FastDrop Logistics, and Pramana Legal profiles plus defaults.
- `data/seedTickets.ts` — demo tickets for first and second-ticket flows.
- `data/seedResponses.ts` — older response seeds still referenced by the prototype data layer.

## Core Libraries

### Pipeline and analysis

- `lib/analyzer.ts` — business relevance, category/intent understanding, reasoning summaries, and confidence summaries.
- `lib/domainClassifier.ts` — business-domain classification before knowledge lookup.
- `lib/canonicalProblemEngine.ts` — canonical-problem identity, templates, internal guidance, workflows, merges, versions, and canonical defaults.
- `lib/memory.ts` — retrieval ranking over existing knowledge items.
- `lib/drafting.ts` — deterministic response drafting, category safety, lesson matching, and tone shaping.
- `lib/reflection.ts` — post-approval reflection decision engine.
- `lib/trustEngine.ts` — trust scoring, auto-resolution gating, validation-aware automation checks, and reuse outcome recording.
- `lib/patternDiscovery.ts` — recurring-issue detection and promotion to canonical problems.
- `lib/bulkUpload.ts` — batch parsing, analysis, clustering, and cluster-to-memory draft preparation.

### Persistence and profile state

- `lib/orgMemory.ts` — localStorage load/save helpers for knowledge, candidates, validations, memory changes, metrics, log, and patterns.
- `lib/organizationProfile.ts` — profile load/save helpers, normalization, and keyword-bank generation.
- `lib/metrics.ts` — metric defaults.
- `lib/intelligenceLog.ts` — event-log helpers.
- `lib/demoState.ts` — demo data helpers.
- `lib/oipEngine.ts` — thin export surface for pipeline modules.
- `lib/matching.ts` — low-level token overlap helpers used by retrieval/matching.

### AI layer

- `lib/ai/adapter.ts` — selects LM Studio, AMD placeholder, or disabled mode from env config.
- `lib/ai/deterministic.ts` — advisory agreement scoring, AI draft eligibility checks, and fallback status logic.
- `lib/ai/lmStudio.ts` — LM Studio provider implementation, timeout handling, JSON extraction, and typed response mapping.
- `lib/ai/prompts.ts` — prompt builders for analysis, canonical suggestion, pattern naming, knowledge enrichment, draft generation, and match discrimination.
- `lib/ai/provider.ts` — provider re-export surface.
- `lib/ai/types.ts` — provider contracts and request/response types.

## Shared Types

- `types/ticket.ts` — `Ticket`, `TicketStatus`.
- `types/oip.ts` — `Observation`, `Understanding`, `ReasoningSummary`, `Confidence`, `BusinessRelevance`, `BusinessDomainClassification`, `IntelligenceLogEntry`.
- `types/knowledge.ts` — `KnowledgeItem`, `Lesson`, `KnowledgeCandidate`, `ValidationRecord`, `MemoryChangeRecord`, `ReflectionDecision`, `TrustEvaluation`, `KnowledgeMatch`.
- `types/ai.ts` — `AIAnalysis`, `AIAdvisory`, `SuggestedResponse`, `DraftGroundingMode`, diagnostics and advisory suggestion types.
- `types/bulkUpload.ts` — `BulkUploadEntry`, `BulkAnalyzedQuery`, `BulkCluster`, `BulkAnalysisResult`, parse/mapping contracts.
- `types/metrics.ts` — `Metrics`, `OrgMetrics`.
- `types/patterns.ts` — pattern types.
- `types/organization.ts` — `OrganizationProfile`, `CustomerTone`.
- `types/index.ts` — re-export barrel.

## Load-Bearing Functions

### `app/page.tsx`

- `processTicketPipeline()` — end-to-end single-ticket orchestration.
- `processSecondTicket()` — reuse / auto-resolution pipeline.
- `requestAnalysisAdvisory()` — AI analysis and canonical suggestion wrapper.
- `requestMatchDiscrimination()` — AI same-problem vs distinct-problem check.
- `requestDraftAdvisory()` — grounded AI draft wrapper plus deterministic fallback.
- `generateSuggestedResponse()` — single-ticket draft generation stage.
- `approveResponse()` — human approval gate before reflection.
- `confirmReflection()` — create/merge/version/trust-update commit coordinator.
- `applyResolution()` — reuse outcome recorder and trust-update committer.
- `analyzeUploadedQueries()` — bulk analysis entrypoint.
- `commitBulkCluster()` — bulk cluster validation and commit path.
- `applyValidatedMemoryChange()` — canonical write path for candidates, validations, memory changes, and knowledge upserts.
- `commitValidatedMemoryChange()` — wrapper returning the final validated knowledge item.
- `confirmAndResetOrganization()` and `resetOrganization()` — protected danger-zone reset path.

### `lib/analyzer.ts`

- `assessBusinessRelevanceForProfile()` — business-scope guardrail.
- `understandForProfile()` — category, intent, urgency, tags, and detected signals.
- `observe()` — raw ticket observation.
- `buildReasoning()` — human-readable explanation of classification and memory reuse.
- `buildConfidence()` — confidence score and basis/uncertainty summary.

### `lib/canonicalProblemEngine.ts`

- `identifyCanonicalProblem()` — deterministic canonical identity selection.
- `findCanonicalProblem()` — similarity-thresholded canonical match against stored knowledge.
- `createCanonicalProblem()` — first validated canonical-problem creation.
- `mergeIntoCanonicalProblem()` — evidence merge path.
- `upsertCanonicalProblem()` — canonical upsert used during validated commit.
- `withCanonicalProblemDefaults()` — normalization and default fields.
- `getCustomerResponseTemplate()` and `renderCustomerResponse()` — deterministic customer template rendering.

### `lib/drafting.ts`

- `draftResponse()` — deterministic draft generator.
- `findMatchingLesson()` — lesson-grounded override lookup.
- `isCompatibleForDrafting()` — category-safety gate for draft reuse.

### `lib/trustEngine.ts`

- `hasApprovedValidationForActiveVersion()` — active-version validation gate.
- `evaluateTrust()` — auto-resolution decision with validation awareness.
- `recordResolution()` — trust evolution and outcome counters.
- `updateTrust()` — direct trust delta helper.

### `lib/reflection.ts`

- `generateReflection()` — create-new vs merge vs version vs trust-only decision logic.

### `lib/orgMemory.ts`

- `loadKnowledge()` / `saveKnowledge()` — knowledge persistence.
- `loadKnowledgeCandidates()` / `saveKnowledgeCandidates()` — candidate persistence.
- `loadValidationRecords()` / `saveValidationRecords()` — validation-history persistence.
- `loadMemoryChangeRecords()` / `saveMemoryChangeRecords()` — memory-change audit persistence.
- `loadOrgMetrics()` / `saveOrgMetrics()` — organization metrics.
- `loadOrgLog()` / `saveOrgLog()` — intelligence log.
- `loadEmergingPatterns()` / `saveEmergingPatterns()` — pattern persistence.
- `clearOrganization()` — destructive reset.

### `lib/bulkUpload.ts`

- `parseBulkUploadFile()` — multi-format bulk file parser.
- `analyzeBulkEntries()` — bulk deterministic/AI-assisted analysis loop.
- `prepareBulkClusterCommit()` — validated bulk cluster to memory-mutation draft.
- `getBulkUploadLimit()` — batch cap.

### `lib/ai/*`

- `createAIAdapter()` — provider selection from env.
- `buildAIAdvisory()` — advisory status and diagnostics wrapper.
- `shouldUseAIDraft()` — minimum AI draft safety screen.
- `createLMStudioProvider()` — provider factory.
- `callChatCompletion()` — LM Studio request primitive.

## Recent Load-Bearing Additions

- Extracted customer context
  See `types/oip.ts` for `ExtractedTicketFields`, `lib/analyzer.ts` for deterministic sender-name fallback extraction, `lib/ai/lmStudio.ts` for AI extracted-field normalization, and `app/page.tsx` for merging advisory fields back into `Understanding`.

- Draft personalization and tone enforcement
  See `lib/ai/prompts.ts` for tone-specific AI draft instructions and required response structure, `lib/canonicalProblemEngine.ts` for `resolveCustomerAddressingName()` plus `renderCustomerTemplateForTicket()`, and `lib/drafting.ts` for deterministic greeting/sign-off shaping.

- Extracted-field visibility in the UI
  See `components/views/TicketWorkspace.tsx`, which now surfaces sender name, role, company, deadline, sub-issues, and urgency indicators from the current analysis state.

- Post-prompt AI draft safety gate
  See `app/page.tsx` `validateNoUnvalidatedCommitments()` and `requestDraftAdvisory()`, which reject unsupported teams, processes, timelines, or unconditional commitments even when the provider returns valid JSON.

## Where To Look For X

- Classification and intents — `lib/analyzer.ts`
  Start with `understandForProfile()` and `inferIntent()`.

- Business-scope rejection vs uncertain pass-through — `lib/analyzer.ts`
  See `assessBusinessRelevanceForProfile()`.

- Domain classification — `lib/domainClassifier.ts`
  See `classifyBusinessDomain()`.

- Canonical-problem identity and similarity thresholds — `lib/canonicalProblemEngine.ts`
  See `identifyCanonicalProblem()` and `findCanonicalProblem()`.

- Memory retrieval and ranking — `lib/memory.ts`
  See `retrieveMemory()`.

- Draft generation and lesson matching — `lib/drafting.ts`
  See `draftResponse()`, `findMatchingLesson()`, and `isCompatibleForDrafting()`.

- AI analysis, discrimination, and grounded draft selection — `app/page.tsx`
  See `requestAnalysisAdvisory()`, `requestMatchDiscrimination()`, and `requestDraftAdvisory()`.

- LM Studio proxy and timeout handling — `app/api/ai/chat/route.ts` and `lib/ai/lmStudio.ts`
  See `POST()` and `callChatCompletion()`.

- Human approval gate — `app/page.tsx`
  See `approveResponse()` and `approveReuse()`.

- Reflection decisioning — `lib/reflection.ts`
  See `generateReflection()`.

- Validation / memory commit path — `app/page.tsx` and `lib/orgMemory.ts`
  See `createCandidate()`, `applyValidatedMemoryChange()`, `commitValidatedMemoryChange()`, and the `load*` / `save*` persistence helpers.

- Trust + validation dual requirement — `lib/trustEngine.ts`
  See `hasApprovedValidationForActiveVersion()` and `evaluateTrust()`.

- Reuse auto-resolution path — `app/page.tsx`
  See `processSecondTicket()` and `applyResolution()`.

- Bulk upload with cluster validation — `lib/bulkUpload.ts` and `app/page.tsx`
  See `analyzeBulkEntries()`, `prepareBulkClusterCommit()`, and `commitBulkCluster()`.

- Organizational reset / danger actions — `app/page.tsx` and `lib/orgMemory.ts`
  See `confirmAndResetOrganization()`, `resetOrganization()`, and `clearOrganization()`.

- Knowledge provenance, versions, and lessons — `types/knowledge.ts`, `lib/canonicalProblemEngine.ts`, and `app/page.tsx`
  See `KnowledgeItem`, `Lesson`, `confirmReflection()`, and `mergeIntoCanonicalProblem()`.
