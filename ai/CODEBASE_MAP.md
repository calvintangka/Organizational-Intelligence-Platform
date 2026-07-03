# OIP Codebase Map

This document maps the major folders and files in the repository. Use it to locate code before reading source files. For detailed symbol-level navigation, query Graphify first.

## Directory Structure

```
app/                    Next.js app router
components/             React UI components
  views/                Full-page view components
  maesa/                Organization-specific UI (sidebar)
lib/                    Core business logic
  ai/                   AI provider layer
data/                   Seed data and organization profiles
types/                  TypeScript type definitions
hooks/                  React hooks
docs/                   Project documentation
ai/                     AI agent documentation (this directory)
graphify-out/           Graphify knowledge graph output
```

## App Layer

### `app/page.tsx`
- **Purpose**: Main application orchestrator
- **Responsibilities**: All pipeline coordination, state management, ticket lifecycle, approval gates, cold start routing, view rendering
- **Dependencies**: Nearly every lib and component module
- **Important exports**: None (root component)
- **Note**: This is the largest file in the project (~2000 lines). Most pipeline logic lives here.

### `app/layout.tsx`
- **Purpose**: Root layout with metadata
- **Responsibilities**: HTML wrapper, font loading
- **Dependencies**: None

### `app/api/ai/chat/route.ts`
- **Purpose**: Next.js API proxy for LM Studio
- **Responsibilities**: Forwards AI requests to local LM Studio, handles timeouts, returns structured responses
- **Dependencies**: None (standalone API route)

## Core Library (`lib/`)

### `lib/analyzer.ts`
- **Purpose**: Business Relevance Guardrail and Understanding Engine
- **Responsibilities**: Signal-based relevance assessment, ticket understanding, category classification, core problem mapping
- **Dependencies**: `types/oip.ts`, `types/organization.ts`, `lib/organizationProfile.ts`
- **Important exports**: `assessBusinessRelevanceForProfile()`, `understandForProfile()`, `observe()`

### `lib/domainClassifier.ts`
- **Purpose**: Business Domain Classification engine
- **Responsibilities**: Classifies tickets into business domains using signal matching against 20 domain rules
- **Dependencies**: `types/oip.ts`, `types/organization.ts`
- **Important exports**: `classifyBusinessDomain()`

### `lib/canonicalProblemEngine.ts`
- **Purpose**: Canonical Problem Detection, templates, merging
- **Responsibilities**: Problem identity matching, customer response templates, internal guidance, resolution workflows, canonical problem CRUD, deduplication
- **Dependencies**: `types/knowledge.ts`, `types/oip.ts`, `types/organization.ts`
- **Important exports**: `identifyCanonicalProblem()`, `getCustomerResponseTemplate()`, `renderCustomerResponse()`, `getInternalGuidance()`, `getResolutionWorkflow()`, `createCanonicalProblem()`, `mergeCanonicalProblemItems()`, `dedupeCanonicalProblems()`

### `lib/drafting.ts`
- **Purpose**: Draft response generation
- **Responsibilities**: Template selection, category compatibility validation, lesson matching, tone application
- **Dependencies**: `types/knowledge.ts`, `types/oip.ts`, `lib/canonicalProblemEngine.ts`
- **Important exports**: `draftResponse()`, `isCompatibleForDrafting()`, `findMatchingLesson()`

### `lib/trustEngine.ts`
- **Purpose**: Trust scoring and auto-resolution decisions
- **Responsibilities**: Trust evaluation, auto-resolution eligibility, trust increment calculation
- **Dependencies**: `types/knowledge.ts`, `types/organization.ts`
- **Important exports**: `evaluateTrust()`

### `lib/memory.ts`
- **Purpose**: Knowledge retrieval and matching
- **Responsibilities**: Similarity search, knowledge matching, deduplication at retrieval time
- **Dependencies**: `types/knowledge.ts`, `lib/matching.ts`
- **Important exports**: `findSimilarKnowledge()`

### `lib/orgMemory.ts`
- **Purpose**: localStorage persistence layer
- **Responsibilities**: Load, save, migrate, deduplicate organizational memory
- **Dependencies**: `types/knowledge.ts`
- **Important exports**: `loadOrganizationMemory()`, `saveOrganizationMemory()`

### `lib/reflection.ts`
- **Purpose**: Reflection engine
- **Responsibilities**: Post-approval analysis determining create/merge/version/trust-update actions
- **Dependencies**: `types/knowledge.ts`, `lib/canonicalProblemEngine.ts`
- **Important exports**: `generateReflection()`

### `lib/patternDiscovery.ts`
- **Purpose**: Emerging pattern detection
- **Responsibilities**: Groups recurring tickets, calculates confidence, supports promotion to canonical problems
- **Dependencies**: `types/patterns.ts`, `types/knowledge.ts`
- **Important exports**: `detectEmergingPattern()`, `upsertEmergingPattern()`

### `lib/organizationProfile.ts`
- **Purpose**: Organization profile utilities
- **Responsibilities**: Profile keyword bank generation, profile matching
- **Dependencies**: `types/organization.ts`
- **Important exports**: `profileKeywordBank()`

### `lib/matching.ts`
- **Purpose**: Text similarity scoring
- **Responsibilities**: Word overlap, similarity percentage calculation
- **Dependencies**: None
- **Important exports**: Similarity functions used by memory retrieval

### `lib/metrics.ts`
- **Purpose**: Organizational metrics state
- **Responsibilities**: Default metrics, metric update helpers
- **Dependencies**: `types/metrics.ts`
- **Important exports**: `defaultMetrics`

### `lib/bulkUpload.ts`
- **Purpose**: CSV bulk knowledge import
- **Responsibilities**: Parse CSV, validate entries, create knowledge items from bulk data
- **Dependencies**: `types/bulkUpload.ts`, `types/knowledge.ts`

### `lib/oipEngine.ts`
- **Purpose**: Pipeline re-exports
- **Responsibilities**: Central export point for pipeline functions
- **Dependencies**: Re-exports from analyzer, domainClassifier, canonicalProblemEngine, etc.

### `lib/intelligenceLog.ts`
- **Purpose**: Intelligence log entry creation
- **Dependencies**: `types/oip.ts`

### `lib/demoState.ts`
- **Purpose**: Demo mode state management
- **Dependencies**: `types/`

## AI Provider Layer (`lib/ai/`)

### `lib/ai/adapter.ts`
- **Purpose**: AI provider routing and fallback
- **Responsibilities**: Selects provider (LM Studio, AMD Cloud, disabled), handles fallback to deterministic
- **Important exports**: `createAIAdapter()`

### `lib/ai/lmStudio.ts`
- **Purpose**: LM Studio provider implementation
- **Responsibilities**: HTTP requests to local LM Studio API, response parsing, timeout handling
- **Important exports**: `createLMStudioProvider()`

### `lib/ai/prompts.ts`
- **Purpose**: AI prompt construction
- **Responsibilities**: Builds prompts for ticket analysis, customer response drafting, canonical problem suggestion
- **Important exports**: Prompt builder functions

### `lib/ai/types.ts`
- **Purpose**: AI provider interfaces
- **Important exports**: `AIProvider`, `AIAdapter`, `AIConfig`, `AIProviderResult`

### `lib/ai/deterministic.ts`
- **Purpose**: Deterministic fallback provider
- **Responsibilities**: Returns structured responses without AI when provider is unavailable

### `lib/ai/provider.ts`
- **Purpose**: Provider factory
- **Responsibilities**: Creates provider instances based on configuration

## Components (`components/`)

### Views (`components/views/`)

| File | Purpose |
|------|---------|
| `TicketWorkspace.tsx` | Ticket intake form, OIP reasoning timeline, review workflow, reuse flow |
| `KnowledgeView.tsx` | Knowledge base browser with search and filtering |
| `DashboardView.tsx` | Organizational metrics, trust growth charts, stat cards |
| `OrganizationView.tsx` | Organization profile display and switching |
| `HomeView.tsx` | Landing page with quick actions and learning timeline |
| `BulkUploadWorkspace.tsx` | CSV upload interface for bulk knowledge import |

### Feature Components

| File | Purpose |
|------|---------|
| `HumanReviewEditor.tsx` | Editable review interface for draft responses |
| `ReflectionPanel.tsx` | Reflection decision display and confirmation |
| `ProvenancePanel.tsx` | Knowledge item provenance and history |
| `SuggestedResponsePanel.tsx` | Draft response display with confidence notes |
| `AIAdvisoryPanel.tsx` | AI diagnostics and provider status |
| `ReasoningPanel.tsx` | OIP reasoning display |
| `RelevanceGuardrailPanel.tsx` | Business relevance assessment display |
| `AIAnalysisPanel.tsx` | AI analysis results display |
| `KnowledgeBaseList.tsx` | Knowledge item list rendering |
| `KnowledgeItemCard.tsx` | Individual knowledge item card |
| `EmergingPatternsPanel.tsx` | Pattern discovery display |
| `OrganizationProfilePanel.tsx` | Organization profile details |
| `TrustBadges.tsx` | Trust score visual indicators |
| `SimilarKnowledgeList.tsx` | Similar knowledge matches display |
| `MetricsDashboard.tsx` | Metrics chart component |
| `OrgMetricsDashboard.tsx` | Organization-level metrics |
| `TicketCard.tsx` | Individual ticket display |
| `StepNavigation.tsx` | Pipeline step navigation |
| `MemoryNetworkOverlay.tsx` | Memory network visualization |
| `IntelligenceLogPanel.tsx` | Intelligence log display |
| `AccentPicker.tsx` | Theme color picker |
| `ResetDemoButton.tsx` | Demo state reset |
| `DemoScenarioSelector.tsx` | Demo scenario selection |

## Types (`types/`)

| File | Key Types |
|------|-----------|
| `types/ticket.ts` | `Ticket` |
| `types/knowledge.ts` | `KnowledgeItem`, `KnowledgeMatch`, `KnowledgeVersion`, `ReflectionDecision`, `TrustDecision`, `Lesson` |
| `types/oip.ts` | `Observation`, `Understanding`, `BusinessRelevance`, `BusinessDomainClassification`, `IntelligenceLogEntry` |
| `types/organization.ts` | `OrganizationProfile` |
| `types/ai.ts` | `AIAnalysis`, `AIAdvisory`, `SuggestedResponse`, `AIDiagnostics`, `MatchDiscriminationResult` |
| `types/metrics.ts` | `OrgMetrics` |
| `types/patterns.ts` | `EmergingPattern` |
| `types/bulkUpload.ts` | `BulkUploadEntry`, `BulkAnalyzedQuery`, `BulkCluster` |
| `types/index.ts` | Central re-export for all types |

## Data (`data/`)

| File | Purpose |
|------|---------|
| `seedOrganizationProfiles.ts` | Three organization profiles (Maesa Tech, FastDrop Logistics, Pramana Legal) |
| `seedTickets.ts` | Sample tickets for demo mode |
