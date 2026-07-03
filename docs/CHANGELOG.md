# Organizational Intelligence Platform

# Developer Changelog

This document records the evolution of the Organizational Intelligence Platform (OIP).
Unlike Git history, this changelog focuses on architectural evolution, implementation milestones, important fixes, and developer context.
Every significant implementation should append a new dated entry.

---

## 2026-07-03

### Added

- **Organizational Memory** — localStorage-backed knowledge store with versioning, provenance tracking, trust scoring, and example ticket accumulation. Knowledge items progress through Learning, Maturing, and Production lifecycle stages.

- **Canonical Problem Engine** — Deterministic problem identity system that maps incoming tickets to known organizational problems using signal-based matching, similarity scoring, and category rules. Includes customer response templates, internal guidance, and resolution workflows for each canonical problem type.

- **Trust Engine** — Per-knowledge-item trust scoring that accumulates from human approvals. Trust scores determine whether a ticket can be auto-resolved or requires human review. Each organization profile sets its own auto-resolution threshold.

- **Pattern Discovery** — Deterministic emerging pattern detection that groups unresolved or recurring tickets, calculates confidence scores, and supports promotion of discovered patterns into canonical problems.

- **Organization Profile Engine** — Multi-tenant profile system supporting different industries (Software/SaaS, Delivery/Logistics, Legal Services). Each profile defines supported domains, business vocabulary, issue types, out-of-scope topics, customer tone, support boundaries, escalation rules, and auto-resolution thresholds.

- **AI Advisory Layer** — Optional AI-assisted draft generation using connected LLM providers. AI drafts are clearly labeled as advisory and always require human review. The system falls back to deterministic templates when AI is unavailable.

- **LM Studio Provider** — Local LLM integration via LM Studio's OpenAI-compatible API. Supports Gemma and other locally-hosted models with configurable timeouts and token limits.

- **AI Provider Interface** — Pluggable provider architecture supporting LM Studio (local), AMD Cloud (placeholder), and disabled modes. All AI requests route through a Next.js API proxy to avoid CORS issues.

- **Knowledge Candidate Pipeline** — Approved resolutions become knowledge candidates that enter the organizational memory through the reflection workflow. New issues create new knowledge entries; repeat issues merge into or version existing entries.

- **Reflection Workflow** — Post-approval analysis that determines whether a resolution should create new knowledge, merge into existing knowledge, create a new version, or only update trust. Reflection decisions are deterministic and based on category compatibility, similarity scoring, and existing knowledge state.

- **Bulk Knowledge Upload** — CSV-based bulk intake for importing historical knowledge. Uploaded items enter the memory with appropriate provenance tracking and initial trust scores.

- **Three Knowledge Intake Doors** — Knowledge enters the system through three paths: (1) the ticket resolution pipeline (observe, understand, draft, review, reflect), (2) bulk CSV upload, and (3) the reuse/second-ticket flow where similar tickets reuse and strengthen existing knowledge.

- **Business Domain Classification** — New deterministic pipeline stage between Business Relevance Guardrail and Canonical Problem Detection. Classifies tickets into 20 business domains (Authentication, Activation, Two-Factor Authentication, Licensing, Billing, Subscription, Product Version, Installation, Compatibility, Performance, Application Stability, Dashboard, Account Management, Data Sync, API, Shipping, Delivery, Client Portal, Legal Document, Consultation). Supports multi-domain detection with primary domain selection, confidence scoring, and organization profile-aware domain filtering.

- **Email Recovery Intent** — Dedicated handling for "forgot email" and account recovery tickets that were previously misclassified as login issues.

- **AI Diagnostics** — Runtime diagnostics panel showing AI provider status, connection health, model availability, and fallback behavior. Helps operators verify LM Studio connectivity and model loading.

- **Cold Start AI** — When no organizational memory matches a ticket, the system routes to Cold Start AI (Gemma via LM Studio) for an initial draft suggestion. Cold start drafts are explicitly labeled as not backed by organizational knowledge and always require human review.

- **Local Organization Memory** — All organizational knowledge persists to localStorage with automatic migration, deduplication (3-layer: engine merge, load migration, retrieval), and session/organization-scoped reset capabilities.

- **Auto Resolution** — Tickets matching high-trust knowledge items can be auto-resolved without human review. Auto-resolution is gated by the organization profile's threshold and is blocked entirely for unknown/uncategorized issues.

- **Organizational Metrics** — Dashboard tracking open tickets, knowledge reuse count, auto-resolutions, trust growth, out-of-scope dismissals, and learning events.

### Changed

- AI draft generation now uses larger token limits for more complete responses.
- AI provider routes through the Next.js API proxy (`/api/ai/chat`) to avoid browser CORS restrictions.
- Trust scoring improved with per-organization thresholds and human approval accumulation.
- Business relevance assessment is now profile-aware, using each organization's configured vocabulary, domains, issue types, and out-of-scope topics rather than a single global signal list.
- Draft generation validates category compatibility before rendering templates, preventing cross-category template misuse regardless of trust or similarity scores.
- Business Relevance Guardrail expanded with approximately 30 new software support terms (update, crash, install, compatibility, performance, sync, import, export, software, application, launch, startup, loading, freezing, feature, and variants).
- Five new category rules added to the analyzer: Product Version, Installation, Compatibility, Performance, Application Stability.
- Maesa Tech organization profile expanded to 15 supported domains, 26 business vocabulary terms, and 17 supported issue types.
- Out-of-scope ticket rejection now displays a visible error message explaining the rejection reason.

### Fixed

- Duplicate canonical problems caused by ID collisions resolved with 3-layer deduplication (engine merge, load migration, retrieval).
- Duplicate React keys in rendered lists.
- Pipeline stall for unknown business issues — two dead-end early returns in the reuse/second-ticket flow replaced with cold start path continuation.
- Incorrect login draft served for forgot-email requests — email recovery now handled as a distinct intent.
- Activation draft truncation caused by template rendering issues.
- LM Studio timeout handling improved with configurable timeouts and graceful fallback.
- AI fallback diagnostics — clear reporting when AI is unavailable rather than silent failure.
- Category-safe deterministic fallback — when AI is unavailable, the system uses the correct category template rather than a generic fallback.
- Unknown business issues incorrectly rejected — approval gate changed from `!businessRelevance?.isRelevant` to `businessRelevance?.status === "out_of_scope"` so that uncertain-but-valid tickets are not blocked.
- Canonical merge issues where similar but distinct problems were incorrectly merged.
- Auto-resolution safety — unknown and uncategorized issues are now forced to human review regardless of trust score.
- File encoding issues — Unicode smart quotes and mojibake sequences in component files that broke the production build.

### Architecture Impact

```
Business Relevance Guardrail
         |
         v
Business Domain Classification
         |
         v
Canonical Problem Detection
         |
    +---------+
    |         |
  Known    Unknown
    |         |
    v         v
 Memory   Cold Start AI
Retrieval     |
    |         v
    v     Human Review
  Trust       |
Evaluation    v
    |     Knowledge
    v     Candidate
 Draft        |
Generation    v
    |     Validation
    v         |
  Human       v
  Review  Organizational
    |       Memory
    v
Reflection
    |
    v
Organizational
  Memory
```

Previously, unknown business issues were often rejected because they did not match existing organizational knowledge. The Business Relevance Guardrail conflated "not in our memory" with "not our business."

The introduction of Business Domain Classification separates business relevance from organizational memory. The guardrail now answers only one question: "Is this related to the organization's responsibilities?" Domain classification then categorizes the ticket into business domains before memory retrieval occurs.

Unknown but relevant business issues now continue through the Cold Start AI path, undergo human review, become Knowledge Candidates, and can ultimately evolve into validated Organizational Memory. This architectural change allows the OIP to continuously learn new organizational knowledge rather than only recognizing existing problems.

### Verification

- Production build passes successfully (`next build` completes without errors).
- Dev server runs successfully on Next.js 15.5.19.
- Organization Profile switching verified across Maesa Tech, FastDrop Logistics, and Pramana Legal.
- Canonical Problem merging verified — similar tickets strengthen existing knowledge rather than creating duplicates.
- Trust Engine verified — trust accumulates from human approvals and gates auto-resolution.
- Pattern Discovery verified — emerging patterns detected from recurring unresolved tickets.
- Email Recovery intent verified — "forgot email" tickets classified correctly, not misrouted as login issues.
- Activation workflow verified — "Activation code invalid" correctly identifies canonical problem.
- AI proxy verified — LM Studio requests route through `/api/ai/chat` successfully.
- Cold Start AI verified — unknown business issues route to AI draft generation rather than being rejected.
- Business Relevance rejection verified — "My girlfriend left me" correctly rejected with visible error message.
- Multi-domain classification verified — "Dashboard freezes after latest update" correctly classified as Product Version, Performance, Dashboard.

### Known Limitations

- localStorage persistence only — all organizational knowledge is stored in the browser and will be lost if storage is cleared.
- No production database — no server-side persistence layer exists.
- No enterprise authentication — no user accounts, roles, or access control.
- Pattern discovery remains deterministic — no ML-based clustering or semantic grouping.
- AI advisory quality depends entirely on the connected local model (Gemma via LM Studio).
- Manual browser regression testing should continue as new features are added — no automated end-to-end test suite exists.
- Domain classification confidence is signal-count-based, not semantic — tickets with few matching keywords receive low confidence scores.
- Bulk upload does not validate against existing knowledge for duplicates before import.

### Next Steps

- Enterprise storage backend to replace localStorage with a production database.
- Historical Knowledge Import improvements with deduplication and conflict resolution.
- Manual Knowledge Entry workflow for directly authoring knowledge without a ticket.
- Additional organization profiles for other industries and use cases.
- AMD Cloud provider implementation for cloud-hosted AI advisory.
- Advanced semantic retrieval using embeddings and vector similarity rather than keyword matching.
- Knowledge graph evolution to represent relationships between canonical problems, domains, and solutions.
- Multi-tenant architecture with proper data isolation between organizations.
- Automated end-to-end testing for pipeline regression prevention.

---

> **Future Maintenance Rule**
>
> Every significant architectural change, major feature, important bug fix, or implementation milestone should append a new dated entry to this changelog rather than modifying historical entries. This preserves an accurate history of the platform's evolution.
