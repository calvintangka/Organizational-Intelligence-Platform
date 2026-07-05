# OIP Codebase Map

Use this file to find the minimum source needed for a task. It is written for coding agents, so the emphasis is on load-bearing paths and the functions that actually move state.

## Top-Level Directories

- `ai/` - AI governance and working-context documents for brain-layer and coding-layer agents.
- `app/` - Next.js app router entrypoints; the client orchestrator lives here.
- `components/` - React UI components and full-page workspaces.
- `data/` - Seed tickets, seed knowledge, seed organization profiles, and starter knowledge packs.
- `docs/` - Product, architecture, roadmap, canon, and implementation references for broader OIP context.
- `lib/` - Core business logic, memory lifecycle, AI provider adapters, and pipeline engines.
- `outputs/` - Generated output artifacts.
- `tmp/` - Temporary generation helpers and rendered assets.
- `types/` - Shared TypeScript contracts used across UI and business logic.

## App Layer

- `app/layout.tsx` - Root HTML shell and metadata.
- `app/globals.css` - Global styling and design tokens used by the prototype UI.
- `app/page.tsx` - Main client orchestrator; owns pipeline state, persistence wiring, view selection, and all write-path coordination.
- `app/api/ai/chat/route.ts` - LM Studio proxy route with request validation, timeout, and diagnostic headers.

## View Components

- `components/views/HomeView.tsx` - Landing workspace with summary cards and entry actions.
- `components/views/TicketWorkspace.tsx` - Single-ticket intake, analysis, review, reflection, reuse testing, and AI advisory surface.
- `components/views/BulkUploadWorkspace.tsx` - Bulk upload parsing, batch analysis, cluster review, and commit UI.
- `components/views/KnowledgeView.tsx` - Knowledge browser, pack import/review, bundled-pack preview buttons, provenance, validation history, and memory-network entrypoint.
- `components/views/DashboardView.tsx` - Metrics and health dashboards.
- `components/views/OrganizationView.tsx` - Profile selection and organization settings.
- `components/maesa/Sidebar.tsx` - Primary navigation between views.

## Supporting Components

- `components/AIAdvisoryPanel.tsx` - AI diagnostics, agreement, and fallback display.
- `components/AIAnalysisPanel.tsx` - Structured AI analysis and canonical suggestions.
- `components/HumanReviewEditor.tsx` - Editable customer-response review gate.
- `components/ReflectionPanel.tsx` - Create/merge/version/trust-update explanation and commit inputs.
- `components/ProvenancePanel.tsx` - Provenance, matched-lesson, validation, and version-history display.
- `components/ReasoningPanel.tsx` - Deterministic reasoning and uncertainty display.
- `components/RelevanceGuardrailPanel.tsx` - Business-relevance decision display.
- `components/SimilarKnowledgeList.tsx` - Retrieved memory candidates.
- `components/TrustBadges.tsx` - Trust score and maturity display.
- `components/EmergingPatternsPanel.tsx` - Pattern-detection and promotion UI.
- `components/KnowledgeBaseList.tsx` and `components/KnowledgeItemCard.tsx` - Knowledge list and card rendering.
- `components/MemoryNetworkOverlay.tsx` - Full-screen knowledge network visualization.
- `components/MetricsDashboard.tsx` and `components/OrgMetricsDashboard.tsx` - Metric summaries.
- `components/IntelligenceLogPanel.tsx` - Pipeline event log.
- `components/TicketCard.tsx` - Ticket display card.
- `components/StepNavigation.tsx` - Step-based workflow navigation.
- `components/AccentPicker.tsx` - Organization accent-color picker.
- `components/DemoScenarioSelector.tsx` and `components/ResetDemoButton.tsx` - Demo-specific controls.

## Seed Data

- `data/seedKnowledge.ts` - Starter organizational memory used before localStorage hydration.
- `data/seedOrganizationProfiles.ts` - Maesa Tech, FastDrop Logistics, and Pramana Legal profiles plus defaults.
- `data/seedTickets.ts` - Demo tickets for first and second-ticket flows.
- `data/seedResponses.ts` - Older response seeds still referenced by the prototype data layer.
- `data/packs/login-issues-v1.json` - Shipped Login starter pack with 9 pre-authored lessons.
- `data/packs/billing-invoices-v1.json` - Billing and invoice starter pack for Maesa Tech with 7 lessons and a recognized `Billing` category.
- `data/packs/subscription-trial-v1.json` - Subscription and trial starter pack for Maesa Tech with 7 lessons and a recognized `Subscription` category.
- `data/packs/api-integrations-v1.json` - API and integrations starter pack for Maesa Tech with 6 lessons and an intentional unknown-category fallback warning.
- `data/packs/shipment-issues-v1.json` - Shipment support starter pack for FastDrop Logistics with 8 lessons and an intentional unknown-category fallback warning.
- `data/packs/client-portal-v1.json` - Client portal starter pack for Pramana Legal with 7 lessons and an intentional unknown-category fallback warning.

## Core Libraries

### Pipeline and analysis

- `lib/analyzer.ts` - Business relevance, category/intent understanding, reasoning summaries, confidence summaries, and classifier-category helpers.
- `lib/domainClassifier.ts` - Business-domain classification before knowledge lookup.
- `lib/canonicalProblemEngine.ts` - Canonical-problem identity, templates, internal guidance, workflows, merges, versions, and canonical defaults.
- `lib/memory.ts` - Retrieval ranking over existing knowledge items.
- `lib/drafting.ts` - Deterministic response drafting, category safety, lesson matching, and tone shaping.
- `lib/reflection.ts` - Post-approval reflection decision engine.
- `lib/trustEngine.ts` - Trust scoring, auto-resolution gating, validation-aware automation checks, and reuse outcome recording.
- `lib/patternDiscovery.ts` - Recurring-issue detection and promotion to canonical problems.
- `lib/bulkUpload.ts` - Batch parsing, analysis, clustering, and cluster-to-memory draft preparation.
- `lib/knowledgePacks.ts` - Starter-pack parsing, category warnings, lesson shaping, and pack-candidate-to-knowledge conversion helpers.

### Persistence and profile state

- `lib/orgMemory.ts` - localStorage load/save helpers for knowledge, candidates, validations, memory changes, metrics, log, and patterns.
- `lib/organizationProfile.ts` - Profile load/save helpers, normalization, and keyword-bank generation.
- `lib/metrics.ts` - Metric defaults.
- `lib/intelligenceLog.ts` - Event-log helpers.
- `lib/demoState.ts` - Demo data helpers.
- `lib/oipEngine.ts` - Thin export surface for pipeline modules.
- `lib/matching.ts` - Low-level token overlap helpers used by retrieval/matching.

### AI layer

- `lib/ai/adapter.ts` - Selects LM Studio, AMD placeholder, or disabled mode from env config.
- `lib/ai/deterministic.ts` - Advisory agreement scoring, AI draft eligibility checks, and fallback status logic.
- `lib/ai/lmStudio.ts` - LM Studio provider implementation, timeout handling, JSON extraction, and typed response mapping.
- `lib/ai/prompts.ts` - Prompt builders for analysis, canonical suggestion, pattern naming, knowledge enrichment, draft generation, and match discrimination.
- `lib/ai/provider.ts` - Provider re-export surface.
- `lib/ai/types.ts` - Provider contracts and request/response types.

## Shared Types

- `types/ticket.ts` - `Ticket`, `TicketStatus`.
- `types/oip.ts` - `Observation`, `Understanding`, `ReasoningSummary`, `Confidence`, `BusinessRelevance`, `BusinessDomainClassification`, `IntelligenceLogEntry`.
- `types/knowledge.ts` - `KnowledgeItem`, `Lesson`, `KnowledgeCandidate`, `ValidationRecord`, `MemoryChangeRecord`, `ReflectionDecision`, `TrustEvaluation`, `KnowledgeMatch`.
- `types/knowledgePack.ts` - `KnowledgePack`, `PackLesson`, preview, and editable pack-candidate draft contracts.
- `types/ai.ts` - `AIAnalysis`, `AIAdvisory`, `SuggestedResponse`, `DraftGroundingMode`, diagnostics and advisory suggestion types.
- `types/bulkUpload.ts` - `BulkUploadEntry`, `BulkAnalyzedQuery`, `BulkCluster`, `BulkAnalysisResult`, parse/mapping contracts.
- `types/metrics.ts` - `Metrics`, `OrgMetrics`.
- `types/patterns.ts` - Pattern types.
- `types/organization.ts` - `OrganizationProfile`, `CustomerTone`.
- `types/index.ts` - Re-export barrel.

## Load-Bearing Functions

### `app/page.tsx`

- `processTicketPipeline()` - End-to-end single-ticket orchestration.
- `processSecondTicket()` - Reuse / auto-resolution pipeline.
- `requestAnalysisAdvisory()` - AI analysis and canonical suggestion wrapper.
- `requestMatchDiscrimination()` - AI same-problem vs distinct-problem check.
- `requestDraftAdvisory()` - Grounded AI draft wrapper plus deterministic fallback.
- `generateSuggestedResponse()` - Single-ticket draft generation stage.
- `approveResponse()` - Human approval gate before reflection.
- `confirmReflection()` - Create/merge/version/trust-update commit coordinator.
- `applyResolution()` - Reuse outcome recorder and trust-update committer.
- `analyzeUploadedQueries()` - Bulk analysis entrypoint.
- `commitBulkCluster()` - Bulk cluster validation and commit path.
- `importKnowledgePack()` - Creates a proposed pack-backed `KnowledgeCandidate` only.
- `validateKnowledgePackCandidate()` - Validates an imported pack through the shared commit path.
- `rejectKnowledgePackCandidate()` - Rejects a pending pack without creating validation or memory records.
- `applyValidatedMemoryChange()` - Canonical write path for candidates, validations, memory changes, and knowledge upserts.
- `commitValidatedMemoryChange()` - Wrapper returning the final validated knowledge item.
- `confirmAndResetOrganization()` and `resetOrganization()` - Protected danger-zone reset path.

### `lib/analyzer.ts`

- `assessBusinessRelevanceForProfile()` - Business-scope guardrail.
- `understandForProfile()` - Category, intent, urgency, tags, and detected signals.
- `observe()` - Raw ticket observation.
- `buildReasoning()` - Human-readable explanation of classification and memory reuse.
- `buildConfidence()` - Confidence score and basis/uncertainty summary.
- `getRecognizedClassifierCategories()` / `isRecognizedClassifierCategory()` - Source of truth for pack category warnings.

### `lib/canonicalProblemEngine.ts`

- `identifyCanonicalProblem()` - Deterministic canonical identity selection.
- `findCanonicalProblem()` - Similarity-thresholded canonical match against stored knowledge.
- `createCanonicalProblem()` - First validated canonical-problem creation.
- `mergeIntoCanonicalProblem()` - Evidence merge path.
- `upsertCanonicalProblem()` - Canonical upsert used during validated commit.
- `withCanonicalProblemDefaults()` - Normalization and default fields.
- `getCustomerResponseTemplate()` and `renderCustomerResponse()` - Deterministic customer template rendering.

### `lib/drafting.ts`

- `draftResponse()` - Deterministic draft generator.
- `findMatchingLesson()` - Lesson-grounded override lookup.
- `isCompatibleForDrafting()` - Category-safety gate for draft reuse.
- Lesson-level `doNotPromise` guardrails reach AI lesson-grounded prompts through `requestDraftAdvisory()`.

### `lib/trustEngine.ts`

- `hasApprovedValidationForActiveVersion()` - Active-version validation gate.
- `evaluateTrust()` - Auto-resolution decision with validation awareness.
- `recordResolution()` - Trust evolution and outcome counters.
- `updateTrust()` - Direct trust delta helper.

### `lib/reflection.ts`

- `generateReflection()` - Create-new vs merge vs version vs trust-only decision logic.

### `lib/orgMemory.ts`

- `loadKnowledge()` / `saveKnowledge()` - Knowledge persistence.
- `loadKnowledgeCandidates()` / `saveKnowledgeCandidates()` - Candidate persistence.
- `loadValidationRecords()` / `saveValidationRecords()` - Validation-history persistence.
- `loadMemoryChangeRecords()` / `saveMemoryChangeRecords()` - Memory-change audit persistence.
- `loadOrgMetrics()` / `saveOrgMetrics()` - Organization metrics.
- `loadOrgLog()` / `saveOrgLog()` - Intelligence log.
- `loadEmergingPatterns()` / `saveEmergingPatterns()` - Pattern persistence.
- `clearOrganization()` - Destructive reset.

### `lib/bulkUpload.ts`

- `parseBulkUploadFile()` - Multi-format bulk file parser.
- `analyzeBulkEntries()` - Bulk deterministic/AI-assisted analysis loop.
- `prepareBulkClusterCommit()` - Validated bulk cluster to memory-mutation draft.
- `getBulkUploadLimit()` - Batch cap.

### `lib/knowledgePacks.ts`

- `parseKnowledgePack()` / `parseKnowledgePackText()` - Runtime validation and preview preparation for pack JSON.
- `getKnowledgePackCategoryWarning()` - Preview warning when the pack category is not recognized by the classifier.
- `buildPackLessons()` - Converts pack lessons into shared `Lesson` records.
- `buildPackCandidateContent()` - Shapes the import payload stored on a proposed `KnowledgeCandidate`.
- `candidateToPackDraft()` - Rehydrates an editable draft for review in the Knowledge view.
- `buildKnowledgeItemFromPackCandidate()` - Converts an approved pack candidate into the final `KnowledgeItem` payload used by the shared commit path.

### `lib/ai/*`

- `createAIAdapter()` - Provider selection from env.
- `buildAIAdvisory()` - Advisory status and diagnostics wrapper.
- `shouldUseAIDraft()` - Minimum AI draft safety screen.
- `createLMStudioProvider()` - Provider factory.
- `callChatCompletion()` - LM Studio request primitive.

## Recent Load-Bearing Additions

- Extracted customer context
  See `types/oip.ts` for `ExtractedTicketFields`, `lib/analyzer.ts` for deterministic sender-name fallback extraction, `lib/ai/lmStudio.ts` for AI extracted-field normalization, and `app/page.tsx` for merging advisory fields back into `Understanding`.

- Draft personalization and tone enforcement
  See `lib/ai/prompts.ts` for tone-specific AI draft instructions and required response structure, `lib/canonicalProblemEngine.ts` for `resolveCustomerAddressingName()` plus `renderCustomerTemplateForTicket()`, and `lib/drafting.ts` for deterministic greeting/sign-off shaping.

- Extracted-field visibility in the UI
  See `components/views/TicketWorkspace.tsx`, which now surfaces sender name, role, company, deadline, sub-issues, and urgency indicators from the current analysis state.

- Post-prompt AI draft safety gate
  See `app/page.tsx` `validateNoUnvalidatedCommitments()` and `requestDraftAdvisory()`, which reject unsupported teams, processes, timelines, or unconditional commitments even when the provider returns valid JSON.

- Starter Knowledge Packs
  See `types/knowledgePack.ts`, `data/packs/*.json`, `lib/knowledgePacks.ts`, `components/views/KnowledgeView.tsx`, and `app/page.tsx` `importKnowledgePack()` / `validateKnowledgePackCandidate()` / `rejectKnowledgePackCandidate()`.

## Where To Look For X

- Classification and intents - `lib/analyzer.ts`
  Start with `understandForProfile()` and `inferIntent()`.

- Business-scope rejection vs uncertain pass-through - `lib/analyzer.ts`
  See `assessBusinessRelevanceForProfile()`.

- Domain classification - `lib/domainClassifier.ts`
  See `classifyBusinessDomain()`.

- Canonical-problem identity and similarity thresholds - `lib/canonicalProblemEngine.ts`
  See `identifyCanonicalProblem()` and `findCanonicalProblem()`.

- Memory retrieval and ranking - `lib/memory.ts`
  See `retrieveMemory()`.

- Draft generation and lesson matching - `lib/drafting.ts`
  See `draftResponse()`, `findMatchingLesson()`, and `isCompatibleForDrafting()`.

- AI analysis, discrimination, and grounded draft selection - `app/page.tsx`
  See `requestAnalysisAdvisory()`, `requestMatchDiscrimination()`, and `requestDraftAdvisory()`.

- LM Studio proxy and timeout handling - `app/api/ai/chat/route.ts` and `lib/ai/lmStudio.ts`
  See `POST()` and `callChatCompletion()`.

- Human approval gate - `app/page.tsx`
  See `approveResponse()` and `approveReuse()`.

- Reflection decisioning - `lib/reflection.ts`
  See `generateReflection()`.

- Validation / memory commit path - `app/page.tsx` and `lib/orgMemory.ts`
  See `createCandidate()`, `importKnowledgePack()`, `validateKnowledgePackCandidate()`, `applyValidatedMemoryChange()`, `commitValidatedMemoryChange()`, and the `load*` / `save*` persistence helpers.

- Trust + validation dual requirement - `lib/trustEngine.ts`
  See `hasApprovedValidationForActiveVersion()` and `evaluateTrust()`.

- Reuse auto-resolution path - `app/page.tsx`
  See `processSecondTicket()` and `applyResolution()`.

- Bulk upload with cluster validation - `lib/bulkUpload.ts` and `app/page.tsx`
  See `analyzeBulkEntries()`, `prepareBulkClusterCommit()`, and `commitBulkCluster()`.

- Starter-pack import and review - `components/views/KnowledgeView.tsx` and `lib/knowledgePacks.ts`
  See the preview/import/review UI and the candidate conversion helpers.

- Organizational reset / danger actions - `app/page.tsx` and `lib/orgMemory.ts`
  See `confirmAndResetOrganization()`, `resetOrganization()`, and `clearOrganization()`.

- Knowledge provenance, versions, and lessons - `types/knowledge.ts`, `lib/canonicalProblemEngine.ts`, and `app/page.tsx`
  See `KnowledgeItem`, `Lesson`, `confirmReflection()`, and `mergeIntoCanonicalProblem()`.
