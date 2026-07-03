# OIP Architecture

This document describes the architecture of the Organizational Intelligence Platform. It is intended for developers and AI agents who need to understand the system before making changes.

## System Overview

OIP is a Next.js 15 application that learns from customer support resolutions to build organizational knowledge. Every resolved ticket strengthens the organization's ability to handle similar issues in the future. The system is deterministic-first: AI is advisory only, and all knowledge must pass through human review and reflection before entering organizational memory.

## Architectural Layers

### UI Layer

The application is a single-page app with six views: Home, Tickets, Knowledge, Dashboard, Organization, and Settings. Navigation is handled by a sidebar component. All views render from `app/page.tsx`, which serves as the main orchestrator and holds the application state.

- `app/page.tsx` — Main orchestrator, state management, pipeline coordination
- `components/views/TicketWorkspace.tsx` — Ticket intake, OIP reasoning timeline, human review
- `components/views/KnowledgeView.tsx` — Knowledge base browser
- `components/views/DashboardView.tsx` — Organizational metrics and trust growth
- `components/views/OrganizationView.tsx` — Organization profile management
- `components/views/HomeView.tsx` — Landing page with quick actions
- `components/maesa/Sidebar.tsx` — Navigation sidebar

### Ticket Intake

Tickets enter the system through three doors:

1. **Manual entry** — User types a customer issue into the ticket workspace textarea
2. **Bulk CSV upload** — Import historical tickets via `components/views/BulkUploadWorkspace.tsx`
3. **Reuse flow** — After resolving a ticket, submit a similar ticket to test knowledge reuse

The intake creates a `Ticket` object and triggers the pipeline orchestration in `app/page.tsx`.

### Business Relevance Guardrail

The first pipeline gate. Determines whether a ticket relates to the organization's business responsibilities. Uses signal-based matching against the organization profile's vocabulary, domains, and out-of-scope topics.

- `lib/analyzer.ts` — `assessBusinessRelevanceForProfile()` performs the check
- Out-of-scope tickets are rejected with a visible error message
- Uncertain tickets (some business signals but also boundary signals) continue through the pipeline

### Business Domain Classification

Classifies business-relevant tickets into one or more domains (Authentication, Billing, Performance, etc.) before canonical problem detection occurs. This separates "is this our business?" from "what kind of problem is this?"

- `lib/domainClassifier.ts` — `classifyBusinessDomain()` performs domain classification
- Returns primary domain, all detected domains, and confidence level
- Domain rules are filtered by the organization profile's supported domains

### Understanding Engine

Analyzes the ticket to extract intent, category, core problem, and reasoning. Maps the ticket to the organization's problem taxonomy.

- `lib/analyzer.ts` — `understandForProfile()` produces an `Understanding` object
- `lib/analyzer.ts` — Category rules and core problem mappings

### Canonical Problem Engine

Identifies whether the ticket matches a known canonical problem. Canonical problems represent the organization's recognized problem types with associated response templates, internal guidance, and resolution workflows.

- `lib/canonicalProblemEngine.ts` — Problem identity, matching, templates, merging
- `lib/canonicalProblemEngine.ts` — `identifyCanonicalProblem()` finds the best match
- Includes customer response templates, internal guidance, and resolution workflows per category

### Organizational Memory

The knowledge store. Contains validated knowledge items with trust scores, example tickets, provenance, versioning, and lessons. Knowledge items progress through Learning, Maturing, and Production stages.

- `lib/memory.ts` — `findSimilarKnowledge()` retrieves matching knowledge
- `lib/orgMemory.ts` — localStorage persistence, load/save, deduplication
- `types/knowledge.ts` — `KnowledgeItem`, `KnowledgeMatch`, `KnowledgeVersion`

### Trust Engine

Each knowledge item accumulates trust from human approvals. Trust scores determine auto-resolution eligibility. Each organization profile sets its own threshold.

- `lib/trustEngine.ts` — `evaluateTrust()`, trust scoring, auto-resolution decisions
- Unknown/uncategorized issues are blocked from auto-resolution regardless of score

### Draft Response Generation

Produces a suggested customer response using deterministic templates, lesson matching, or AI advisory. Category compatibility is validated before any template is rendered.

- `lib/drafting.ts` — `draftResponse()` produces the draft
- `lib/drafting.ts` — `isCompatibleForDrafting()` validates category compatibility
- `lib/drafting.ts` — `findMatchingLesson()` checks for lesson-grounded responses

### AI Advisory Layer

Optional AI-assisted drafting and analysis. AI is advisory only — never bypasses governance. All AI output goes through the same human review pipeline.

- `lib/ai/adapter.ts` — Provider routing and fallback logic
- `lib/ai/lmStudio.ts` — LM Studio provider (Gemma via local API)
- `lib/ai/prompts.ts` — Prompt construction for analysis and drafting
- `lib/ai/types.ts` — Provider interfaces and configuration
- `lib/ai/deterministic.ts` — Deterministic fallback when AI is unavailable
- `app/api/ai/chat/route.ts` — Next.js API proxy for LM Studio requests

### Human Review

Every draft response requires human review before it can become organizational knowledge. The reviewer can edit the response, approve it, or reject it.

- `components/HumanReviewEditor.tsx` — Review UI with edit capability
- `components/SuggestedResponsePanel.tsx` — Draft display with confidence notes

### Reflection Workflow

After human approval, the reflection engine determines how the resolution should update organizational memory: create new knowledge, merge into existing, create a version, or trust update only.

- `lib/reflection.ts` — `generateReflection()` produces reflection decisions
- `components/ReflectionPanel.tsx` — Reflection UI showing the decision and rationale

### Knowledge Evolution

Knowledge items evolve through repeated use. Trust increases, lessons accumulate, and canonical problems strengthen. Pattern discovery detects emerging patterns across unresolved tickets.

- `lib/patternDiscovery.ts` — `detectEmergingPattern()`, pattern grouping
- `lib/trustEngine.ts` — Trust accumulation from successful reuse
- `lib/canonicalProblemEngine.ts` — Canonical problem merging and versioning

### Provenance

Every knowledge item tracks its origin: which tickets contributed, which humans reviewed, when it was created and modified, and what versions exist.

- `components/ProvenancePanel.tsx` — Provenance display UI
- `types/knowledge.ts` — `KnowledgeVersion`, `LearningHistoryEntry`, provenance fields

### Dashboard

Organizational metrics tracking open tickets, knowledge reuse, auto-resolutions, trust growth, and learning events.

- `components/views/DashboardView.tsx` — Dashboard UI with charts and stat cards
- `components/MetricsDashboard.tsx` — Metrics display component
- `components/OrgMetricsDashboard.tsx` — Organization-level metrics
- `lib/metrics.ts` — Metrics state and defaults
- `types/metrics.ts` — `OrgMetrics` type definitions

### Organizational Learning Loop

The complete cycle: a ticket enters, gets analyzed, matched against memory, drafted, reviewed by a human, reflected upon, and the result strengthens organizational memory. Each cycle makes the organization slightly more capable of handling similar issues. Trust grows, patterns emerge, and eventually tickets can auto-resolve.

## Pipeline Flow

```
Ticket Intake
     |
Business Relevance Guardrail
     |
Business Domain Classification
     |
Canonical Problem Detection
     |
Memory Retrieval
     |
AI Advisory (Cold Start if no match)
     |
Human Review
     |
Reflection
     |
Organizational Memory Update
     |
Trust Evolution
     |
Pattern Discovery
```

## Organization Profiles

The system supports multiple organization profiles (Maesa Tech, FastDrop Logistics, Pramana Legal). Each profile configures:

- Supported domains and business vocabulary
- Out-of-scope topics and support boundaries
- Customer tone (professional, friendly, formal, empathetic)
- Auto-resolution threshold
- Escalation rules

Profile definitions live in `data/seedOrganizationProfiles.ts`.

## Persistence

All state persists to localStorage. There is no server-side database. The `lib/orgMemory.ts` module handles load, save, migration, and deduplication.
