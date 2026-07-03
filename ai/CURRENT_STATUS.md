# OIP Current Status

This document describes the current state of the project. Read this first before making any changes.

## Current Milestone

Production polish and demo readiness.

## Version

0.8.0

## Tech Stack

- Next.js 15.5.19
- TypeScript
- React 19
- Tailwind CSS
- LM Studio (Gemma 4 E4B) for local AI advisory
- localStorage for persistence
- Graphify for code graph navigation

## Completed Features

### Views
- **Home** — Landing page with learning timeline, quick actions, and organizational summary
- **Tickets** — Full ticket workspace with intake, OIP reasoning timeline, human review, and reuse flow
- **Knowledge** — Knowledge base browser with search, filtering, and item detail cards
- **Dashboard** — Organizational metrics, trust growth chart, category distribution, pattern summary
- **Organization** — Organization profile display, profile switching (3 profiles), accent color picker
- **Settings** — AI provider configuration, demo controls

### Pipeline Stages
- **Business Relevance Guardrail** — Profile-aware signal matching with visible rejection messages
- **Business Domain Classification** — 20 domain rules, multi-domain detection, confidence scoring
- **Canonical Problem Detection** — Signal-based matching, similarity scoring, category rules
- **Memory Retrieval** — Knowledge matching with 3-layer deduplication
- **Draft Response Generation** — Deterministic templates, lesson matching, category validation
- **AI Advisory** — LM Studio integration, cold start drafting, diagnostics panel
- **Human Review** — Editable review with approval workflow
- **Reflection** — Create/merge/version/trust-update decisions

### Engines
- **Trust Engine** — Per-item trust scoring, auto-resolution gating, organization thresholds
- **Pattern Discovery** — Emerging pattern detection, grouping, confidence scoring
- **Reflection Engine** — Post-approval knowledge lifecycle decisions
- **Organizational Memory** — localStorage persistence, versioning, provenance, deduplication

### Infrastructure
- **Three Knowledge Intake Doors** — Manual entry, bulk CSV upload, reuse flow
- **Organization Profiles** — Maesa Tech, FastDrop Logistics, Pramana Legal
- **AI Provider Interface** — LM Studio, AMD Cloud (placeholder), disabled mode
- **API Proxy** — Next.js route for LM Studio CORS avoidance
- **Bulk Upload** — CSV parsing, clustering, knowledge creation
- **Provenance Tracking** — Full audit trail on all knowledge items

## Remaining Work

### Polish
- Ticket workspace spacing and layout refinement
- Dashboard chart polish and responsive sizing
- Settings view completion (additional configuration options)
- Dark mode consistency across all views
- Mobile responsiveness improvements
- Demo flow polish for presentation

### Known Issues
- Duplicate action buttons may appear in certain edge-case workflows
- Minor spacing inconsistencies between views
- Developer controls (reset buttons, demo selectors) should be consolidated inside Settings rather than appearing in multiple views
- Graph visualization (`graph.html`) skipped for large graphs (>5000 nodes)

### Not Yet Implemented
- Enterprise storage backend (server-side database)
- Enterprise authentication and access control
- AMD Cloud AI provider
- Semantic retrieval (embeddings, vector similarity)
- Knowledge graph visualization
- Multi-tenant data isolation
- Automated end-to-end testing
- Manual Knowledge Entry workflow (authoring without a ticket)

## Build Status

- Production build: **Passing**
- Dev server: **Running** (Next.js 15.5.19)
- Graphify graph: **Generated** (5607 nodes, 7727 edges, 357 communities)
