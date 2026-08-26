# DOC-AUDIT-001 — Organizational Memory North-Star Documentation Impact Audit

Audit mode: READ-ONLY repository audit, with the single authorized output being this report.

Audit date: 2026-08-24 (Asia/Jakarta)

## 1. Executive Summary

The repository already expresses the proposed persistent-organizational-memory direction in its highest-authority documents. The Founder's Thesis, Product Vision, Canon capability/domain/workflow models, product requirements, and roadmap do not describe OIP as a generic “knows everything” system. They describe a governed learning platform in which work can become validated, reusable Organizational Memory and improve future organizational judgment.

The proposed north star is therefore a realignment/clarification of an existing direction, not a product reset. “Organizational Memory” is already a first-class capability and domain concept; “Organizational Intelligence” is the broader product/category outcome enabled by memory, reasoning, learning, and governance. That relationship is strongly implied and often explicitly stated, but it should be made uniform in future canonical wording. “Company Brain” is not an established repository term and should not be introduced without a product decision.

The highest-impact documentation issue is not the Canon. It is the current-state boundary in implementation documentation. `docs/implementation/12_MVP_SCOPE.md` and `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md` still contain local/prototype and “production database not included” statements that conflict with the current PostgreSQL/Prisma schema, server persistence path, durable workers, organization-scoped records, and deployment documentation. These documents should be reconciled in a later authorized update and should explicitly label implemented, designed, planned, and north-star behavior.

The audit found no evidence that the current implementation provides unlimited organizational-scale storage, general semantic/vector search, automatic trust decay, complete contradiction resolution, or a universal accuracy guarantee. Current capability is a bounded, organization-scoped Customer Support learning loop with deterministic classification/retrieval, optional AI advisory, human validation, durable persistence, provenance/evidence records, trust/reuse signals, reflection, and governed memory changes.

Classification counts across the 259-file Markdown/MDX audit inventory are: `UPDATE_REQUIRED` 2; `CLARIFICATION_RECOMMENDED` 23; `NO_UPDATE_REQUIRED` 87; `HISTORICAL_PRESERVE` 141; `SUPERSEDED_OR_STALE` 5; `NEEDS_HUMAN_DECISION` 1.

Final verdict: `DOC_AUDIT_001_DOCUMENTATION_IMPACT_MAPPED`

## 2. Repository State

Safety gate captured before audit:

| Field | Value |
|---|---|
| Branch | `landing/option-c32-release-polish` |
| HEAD | `084f9ab46d6555e793df8b73b1abb085267a2a05` |
| Working tree before audit | Dirty; pre-existing modifications present |
| Audit mutation authorized | `docs/audits/DOC-AUDIT-001-organizational-memory-documentation-impact.md` only |

Pre-existing status before the audit:

```text
 M docs/TODO-080-REPORT.md
?? docs/reports/NC-FIX-012R-reflection-promotion-identity-boundary-investigation.md
?? docs/reports/NC-FIX-012R2-STASH-RECOVERY-CONTRACT-AUDIT-REPORT.md
?? docs/reports/NC-FIX-012R3-COMMIT-READINESS-FINAL-VERIFICATION-REPORT.md
?? docs/reports/NC-FIX-014R-resolved-ticket-reflection-availability-boundary-investigation.md
?? docs/reports/NC-FIX-016R-exact-certification-path-reuse-state-divergence-investigation.md
?? docs/reports/REL-RC-003-CERTIFIED-CANDIDATE-ARTIFACT-RECONCILIATION-AND-RELEASE-CANDIDATE-PREPARATION.md
?? docs/reports/REL-RC-003-RELEASE-CANDIDATE-MANIFEST.json
?? docs/reports/REL-RELEASE-META-002-V0.3.0-RELEASE-IDENTITY-METADATA-FREEZE.md
```

The audit inspected 259 Markdown/MDX files, including the Canon, product, architecture, implementation, strategy, research, roadmap, hackathon, AI/developer, operational, release, audit, acceptance, and report surfaces. It also inspected implementation/configuration/schema evidence relevant to storage, retrieval, lifecycle, trust, provenance, and reflection.

## 3. Canonical Documentation Identification

The repository establishes its own authority hierarchy:

- `docs/README.md` says the primary documentation is layered as Canon → Architecture → Implementation and that Canon is the authoritative source of organizational meaning.
- `docs/canon/README.md` identifies the seven Canon documents as the authoritative conceptual source of truth for OIP identity, principles, capabilities, domain language, workflows, and cognition.
- `docs/REPOSITORY_MAP.md` confirms that Canon answers what must remain true, Strategy answers where OIP is going, Product answers what is being built, Architecture answers how it is structured, Implementation answers how it is built, and Roadmap answers what comes next.
- `docs/product/README.md`, `docs/architecture/README.md`, and `docs/implementation/README.md` identify their respective active downstream document families.

Canonical/main documentation is therefore:

1. `docs/canon/00_FOUNDERS_THESIS.md` — why the company exists and the cost of organizational forgetting.
2. `docs/canon/01_PRODUCT_VISION.md` — what product must exist, current Customer Support entry point, and long-term organizational scope.
3. `docs/canon/02_PRODUCT_PRINCIPLES.md` — decision constraints including trust, review, evidence, governance, and durable memory.
4. `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` — required capabilities, including Organizational Memory, validation, evolution, and cross-domain expansion.
5. `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` — authoritative domain vocabulary and distinctions.
6. `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` — lifecycle from work through evidence, reflection, validation, memory, reuse, and outcomes.
7. `docs/canon/06_AI_COGNITIVE_MODEL.md` — retrieve/reason/reflect/learn/improve-memory behavior and AI authority boundaries.

`docs/README.md` and `docs/canon/README.md` are canonical navigation/governance surfaces, not substitutes for the seven Canon documents. The main document for a later implementation-oriented documentation update should be `docs/canon/01_PRODUCT_VISION.md`, with the other Canon documents reviewed as a coherent set under `docs/canon/CANON_GOVERNANCE.md`.

Representation assessment of the primary documents:

| Primary document | Assessment against proposed north star | Treatment |
|---|---|---|
| `docs/canon/00_FOUNDERS_THESIS.md` | A — already represented accurately. It explicitly names organizational memory, the cost of forgetting, compounding knowledge, evidence, validation, reuse, and Customer Support as first proving ground. | `NO_UPDATE_REQUIRED` |
| `docs/canon/01_PRODUCT_VISION.md` | B — strongly represented, but current live intake, future intake doors, current bounded scope, and long-term organizational scope should remain visibly separated. | `CLARIFICATION_RECOMMENDED` |
| `docs/canon/02_PRODUCT_PRINCIPLES.md` | A/B — trust, human expertise, governance, evidence, uncertainty, memory, and evolution are present; the Memory/Intelligence relationship can be made more explicit. | `NO_UPDATE_REQUIRED` |
| `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` | B — the capability model is more complete than the proposed brief, but maturity language can be mistaken for current implementation. | `CLARIFICATION_RECOMMENDED` |
| `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` | B — concepts and distinctions are present, including Memory versus Storage and Knowledge Intake versus Memory; implementation support for every modeled lifecycle state is not uniform. | `CLARIFICATION_RECOMMENDED` |
| `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` | B — the learning loop is explicit, including the current MVP workflow, but the canonical workflow contains future behavior beyond the current implementation. | `CLARIFICATION_RECOMMENDED` |
| `docs/canon/06_AI_COGNITIVE_MODEL.md` | B — the cognitive cycle is explicit and trust-bounded, but semantic retrieval, continuous improvement, and memory evolution are partly designed rather than current. | `CLARIFICATION_RECOMMENDED` |

## 4. Current OIP Product Narrative

The repository’s current narrative is coherent:

- OIP exists to reduce the cost of organizational forgetting, not merely to speed up support communication (`docs/canon/00_FOUNDERS_THESIS.md`, “Why This Company Deserves To Exist”; “The Archive Illusion”; “The Central Thesis”).
- OIP starts with Customer Support because repeated questions, escalations, inconsistent answers, and resolved cases expose organizational knowledge loss (`docs/canon/00_FOUNDERS_THESIS.md`, “Why This Matters”; `docs/canon/01_PRODUCT_VISION.md`, “Why This Product Exists”).
- A record is not automatically a lesson, and storage is not automatically memory. The repository repeatedly distinguishes artifacts from validated, contextual, reusable knowledge (`docs/canon/00_FOUNDERS_THESIS.md`, “The Founder’s Realization” and “The Archive Illusion”; `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Capability 4 — Organizational Memory”).
- OIP’s intended flywheel is work → learning candidate → human validation → Organizational Memory → future reasoning/reuse → outcomes and further learning (`docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`, “Current MVP Workflow: Live Customer Support Learning Loop”; `docs/product/14_PRODUCT_LIFECYCLE.md`, “Knowledge Flywheel Loop”).
- AI is advisory. The platform owns validation, trust, governance, and memory mutation (`docs/canon/06_AI_COGNITIVE_MODEL.md`, “AI Is Not the Intelligence”; `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md`, “AI Advisory Layer”).
- Customer Support is an initial beachhead, not the permanent product boundary. Cross-domain expansion is designed as a later capability (`docs/canon/01_PRODUCT_VISION.md`, “Long-Term Vision”; `docs/roadmap/09_MULTI_DEPARTMENT.md`).

The current narrative does not support the stronger but unsafe claim that OIP knows everything an organization knows. It supports a narrower and more defensible claim: OIP preserves and retrieves validated organizational learning with evidence, provenance, history, lifecycle state, and trust signals, within the implemented domain and governance boundaries.

## 5. Proposed North-Star Interpretation

For this audit, the proposed direction is interpreted as a strategic lens over the existing repository, not as a new implementation contract:

> OIP’s durable substrate is organization-scoped, validated Organizational Memory. Organizational Intelligence is the improved organizational capability that results when that memory can be retrieved, evaluated, learned from, and acted upon under governance.

This interpretation is supported by:

- `docs/canon/00_FOUNDERS_THESIS.md`, “The Intelligence Ladder,” which places Organizational Memory before Reasoning and Organizational Intelligence.
- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Capability 4 — Organizational Memory” and “Capability 5 — Reasoning and Decision Support.”
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Organizational Memory vs. Storage” and the Organizational Intelligence Metric concept.
- `docs/architecture/09_DATA_ARCHITECTURE.md`, “Information Hierarchy,” which maps validated knowledge → Organizational Memory → Organizational Intelligence.
- `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md`, which calls the Organizational Intelligence Layer the core that connects new work to existing Organizational Memory.

This remains a hypothesis to preserve as a coherent relationship, not an authorized redefinition. `docs/canon/CANON_GOVERNANCE.md` classifies redefining Organizational Intelligence or Organizational Memory as a Major Canon change. A formal adoption that changes either meaning would therefore require a human-approved Canon version decision before downstream editing.

## 6. Four Foundational Questions Assessment

### Q1 — Storage: Can OIP store an organization’s memory?

Assessment: **Partially, within the current bounded organization-scoped support workflow. Not proven at meaningful general organizational scale.**

Current implemented evidence:

- PostgreSQL is the configured database provider in `prisma/schema.prisma`, and `docs/ARCHITECTURE_BASELINE.md`, “Persistence,” documents Prisma/PostgreSQL server persistence.
- `prisma/schema.prisma`, `KnowledgeItem`, `KnowledgeCandidate`, `ValidationRecord`, `TrustEvidence`, and `MemoryChangeRecord`, stores reusable knowledge, proposed knowledge, human validation, trust contributions, and before/after memory changes.
- `prisma/schema.prisma`, `TicketRecord`, `TicketMessage`, and `TicketResolutionEvidence`, preserves ticket work, conversation history, and resolution evidence.
- `prisma/schema.prisma`, `PreparedReflection`, `EmergingPattern`, `PatternDiscoveryOutcome`, and `PatternDiscoveryEvidence`, persists reflection/pattern work and its evidence.
- `lib/server/persistenceService.ts` and `lib/server/persistenceAuthorityService.ts` provide organization-scoped durable persistence boundaries; `docs/ARCHITECTURE_BASELINE.md`, “Organizational Memory,” summarizes the same current model.
- `types/knowledge.ts` represents provenance, validation, knowledge versions, learning history, lessons, reuse/outcome counters, trust score, last-use/validation timestamps, and lifecycle state.

Current boundaries and gaps:

- The current knowledge item is a bounded product model with semi-structured `content` and organization-scoped relational metadata; it is not evidence of arbitrary organization-scale memory across every source system.
- Source/provenance is strongest around tickets, validation records, resolution evidence, and memory-change snapshots. The repository does not prove complete ingestion and preservation of every organizational source, decision, policy, or outcome.
- Production-scale load and multi-customer design-partner validation remain limited (`docs/KNOWN_LIMITATIONS.md`, “Live validation”).
- The architecture describes separate conceptual Memory, Evidence, Audit, and Vector stores (`docs/implementation/16_STORAGE_ARCHITECTURE.md`, “Storage Domains” and “Persistence Strategy”), but the current schema does not evidence a physical vector store or a separate general-purpose memory graph/store.

Current/future classification:

| Area | Classification |
|---|---|
| Organization-scoped durable knowledge, candidates, validations, memory changes, tickets, and evidence | `CURRENT_IMPLEMENTED` |
| Richer versioned memory, relationships, historical retrieval, retention, and separate storage domains | `CURRENT_DESIGNED` |
| Historical/bulk intake, distributed/enterprise storage, multi-domain memory at scale | `PLANNED` / `NORTH_STAR` |
| Unlimited organizational-scale storage or “never forgets everything” guarantee | `UNSUPPORTED` |

### Q2 — Retrieval: Can OIP retrieve the right organizational memory?

Assessment: **Yes for the bounded current Support knowledge collection, using deterministic retrieval and authorization gates; broad semantic/vector retrieval is not current.**

Current implemented evidence:

- `lib/memory.ts`, `lib/retrievalCompatibility.ts`, `lib/lessonSelection.ts`, and `lib/application/tickets/processTicket.ts` connect current ticket understanding to organization-scoped knowledge retrieval, compatibility, lesson selection, and grounded drafting.
- `lib/analyzer.ts` implements deterministic lexical/category/intent matching and ranking. `docs/TODO-047-cross-domain-canonical-relevance-ranking-robustness-report.md` and `docs/TODO-051-match-explainability-report.md` provide historical evidence for ranking and explainability behavior.
- `lib/explainability.ts` exposes match evidence and whether grounded reuse was authorized. `lib/groundingPresentation.ts` prevents provider use from being presented as organizational-memory grounding without authorized knowledge identifiers.
- `docs/ARCHITECTURE_BASELINE.md`, “Trust Engine,” correctly states that similarity or retrieval alone does not authorize reusable knowledge or autonomous action.

Current safety boundaries and gaps:

- Retrieval is bounded by organization, category/problem compatibility, lesson evidence, profile/domain guards, trust/promotion rules, and human review. A relevant match can be found without being authorized for grounded reuse.
- AI-assisted semantic lesson compatibility exists as an advisory/authorization input in the application path, but the repository does not show a general embedding index or vector database.
- No dependency or schema evidence supports claiming production semantic/vector/RAG retrieval. `package.json` has no vector/embedding database dependency, and `prisma/schema.prisma` has no embedding model.
- The current system does not search every organizational repository and does not guarantee that the right memory will always be found.

Current/future classification:

| Area | Classification |
|---|---|
| Deterministic lexical/category/canonical/lesson retrieval over bounded organization memory | `CURRENT_IMPLEMENTED` |
| AI-assisted semantic compatibility and explainable grounding gates | `CURRENT_IMPLEMENTED`, bounded/advisory |
| General semantic/vector retrieval, embeddings, metadata-filtered vector search, graph/context retrieval | `CURRENT_DESIGNED` / `PLANNED` |
| Universal “right memory every time” retrieval guarantee | `UNSUPPORTED` |

### Q3 — Updating: Can organizational memory continuously change as the organization learns?

Assessment: **A governed learning loop exists today; continuous, comprehensive knowledge maintenance remains partly designed and future work.**

Current implemented lifecycle evidence:

1. A live support ticket is persisted and processed.
2. Resolution evidence is required before eligible Reflection/promotion paths (`app/api/organizations/[organizationId]/tickets/[ticketId]/evidence/route.ts`, `app/api/organizations/[organizationId]/tickets/[ticketId]/transition/route.ts`, and `lib/server/tickets/ticketWorkflow.ts`).
3. Reflection prepares a learning decision and a Knowledge Candidate (`prisma/schema.prisma`, `PreparedReflection`; `docs/ARCHITECTURE_BASELINE.md`, “Reflection”).
4. Human validation creates a `ValidationRecord`; approved changes create a `MemoryChangeRecord` and update the Knowledge Item in a transaction (`lib/server/persistenceService.ts`, `commitValidation`; `prisma/schema.prisma`).
5. Reuse and outcomes can contribute to deterministic trust evidence and counters (`TrustEvidence`, `timesReused`, successful/failed resolutions, and `lib/trustEngine.ts`).
6. Optimistic concurrency prevents stale canonical-memory writes from silently overwriting newer state (`KnowledgeItem.revision`, `MemoryChangeRecord` uniqueness, and `docs/KNOWN_LIMITATIONS.md`).
7. Pattern discovery records monitoring/suggested/promoted/dismissed states and evidence (`prisma/schema.prisma`, `EmergingPattern` and pattern evidence models).

Incomplete or future lifecycle behavior:

- The Canon and architecture model supersession, retirement, stale knowledge, contradictions, replacement relationships, and revalidation. The current schema has `active`, `candidate`, and `deprecated` knowledge states and version/history fields, but no general dedicated supersession graph or comprehensive automated retirement/decay workflow is evidenced.
- `lastValidatedAt`, reuse counters, outcomes, and trust scores exist, but no repository evidence establishes automatic confidence decay, time-based retirement, or universal revalidation when external policy/source truth changes.
- “Continuous updating” should not be documented as autonomous self-updating memory. Current updates are gated by explicit workflow, human validation, authorization, transactionality, and concurrency controls.

Current/future classification:

| Lifecycle stage | Classification |
|---|---|
| Ticket/work capture, resolution evidence, Reflection preparation, candidate creation | `CURRENT_IMPLEMENTED` |
| Human validation, approved promotion, memory-change audit, reuse/trust update, versioned lesson changes | `CURRENT_IMPLEMENTED` |
| Rich revalidation, contradiction handling, supersession/retirement, automatic stale detection and confidence decay | `CURRENT_DESIGNED` / `PLANNED` |
| Autonomous continuous learning without review or governance | `UNSUPPORTED` and conflicts with safety invariants |

### Q4 — Accuracy/Trust: Can retrieved memory be guaranteed accurate?

Assessment: **No unconditional guarantee. OIP can make selected knowledge inspectable and increasingly trustworthy within its evidence and governance boundaries.**

Current trust signals:

- Evidence and source identity: ticket IDs, source ticket arrays, ticket messages, resolution evidence, and provenance objects (`prisma/schema.prisma`; `types/knowledge.ts`).
- Human validation: actor, role, rationale, decision, timestamp, candidate-to-validation uniqueness (`prisma/schema.prisma`, `ValidationRecord`).
- History: validation records, before/after memory changes, knowledge versions, learning history, revision checks, and audit logs.
- Reuse/outcomes: `timesReused`, resolution counts, success/failure counters, `TrustEvidence`, and deterministic trust evaluation (`lib/trustEngine.ts`).
- Grounding/explainability: `lib/explainability.ts`, `lib/groundingPresentation.ts`, `components/ProvenancePanel.tsx`, and the documented separation between retrieval compatibility and trust/promotion.
- Human safety: `docs/KNOWN_LIMITATIONS.md` states that human review remains required for reusable-memory promotion, sensitive security requests, and governed external effects.

Gaps:

- Trust score is a governed product signal, not proof of factual correctness.
- Recency is represented in fields and design language, but a complete freshness/revalidation policy is not demonstrated.
- Contradiction, supersession, retirement, and replacement are richly modeled in Canon/architecture but only partially represented in current implementation.
- Evidence is primarily tied to current product workflows; the repository does not establish that all retrieved organizational claims have complete external provenance.
- Accuracy cannot be guaranteed merely because the system returned a result. Future documentation should preserve the distinction between “returned by the system” and “currently supported by evidence and validation.”

Current/future classification:

| Area | Classification |
|---|---|
| Human review, validation state, provenance, resolution evidence, reuse/outcome signals, deterministic trust gates | `CURRENT_IMPLEMENTED` |
| Complete source graph, contradiction/supersession/retirement semantics, recency policy, cross-source provenance | `CURRENT_DESIGNED` / `PLANNED` |
| Guaranteed factual accuracy of all retrieved organizational knowledge | `UNSUPPORTED` |

## 7. Main Documentation Gap Analysis

This compares the primary OIP explanation against the information a future canonical explanation would need. It is an audit only; no replacement text is proposed.

| Required topic | Assessment | Evidence |
|---|---|---|
| A. Organizational forgetting problem | `PRESENT_AND_CLEAR` | `docs/canon/00_FOUNDERS_THESIS.md`, “Why This Company Deserves To Exist,” “Organizational Entropy,” and `docs/canon/01_PRODUCT_VISION.md`, “The Real Problem.” |
| B. Persistent organizational memory | `PRESENT_AND_CLEAR` | `docs/canon/00_FOUNDERS_THESIS.md`, “The Intelligence Ladder” and “The Knowledge Flywheel”; `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Capability 4.” |
| C. What counts as learned organizational memory | `PRESENT_BUT_INCOMPLETE` | Knowledge Candidate → Validation → Knowledge Item → Memory is clear, but current implementation boundaries and the difference between current memory and all organizational knowledge need a sharper canonical cross-reference. |
| D. Evidence and provenance | `PRESENT_AND_CLEAR` | `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Evidence,” “Source,” and “Provenance”; `docs/architecture/09_DATA_ARCHITECTURE.md`, “Provenance Model.” |
| E. Retrieval | `PRESENT_BUT_INCOMPLETE` | `docs/canon/06_AI_COGNITIVE_MODEL.md`, “Retrieve”; `docs/implementation/12_MVP_SCOPE.md`, “Organizational Memory Retrieval.” Current deterministic/bounded retrieval should be distinguished from future semantic/vector retrieval. |
| F. Continuous learning/updating | `PRESENT_BUT_INCOMPLETE` | `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`, “Knowledge Flywheel” and “Knowledge Evolution”; current lifecycle is real but narrower than the Canon model. |
| G. Trust and accuracy boundaries | `PRESENT_BUT_INCOMPLETE` | Trust, uncertainty, review, and “AI is not authority” are clear; the explicit non-guarantee of accuracy should be stated once in the canonical narrative. |
| H. Human validation | `PRESENT_AND_CLEAR` | `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Knowledge Validation” and “Human Review and Learning Loop”; `docs/KNOWN_LIMITATIONS.md`, “Scope.” |
| I. Knowledge lifecycle | `PRESENT_BUT_INCOMPLETE` | Candidate/validated/active/deprecated/version/history are present; supersession, retirement, and revalidation are not uniformly current. |
| J. Current Customer Support beachhead | `PRESENT_AND_CLEAR` | `docs/canon/00_FOUNDERS_THESIS.md`, `docs/canon/01_PRODUCT_VISION.md`, `docs/implementation/12_MVP_SCOPE.md`, and `docs/product/09_MVP_FEATURES.md`. |
| K. Long-term organizational scope | `PRESENT_AND_CLEAR` | `docs/canon/01_PRODUCT_VISION.md`, “Long-Term Vision”; `docs/roadmap/09_MULTI_DEPARTMENT.md`, `17_ORGANIZATIONAL_INTELLIGENCE.md`, and `19_GLOBAL_MEMORY_NETWORK.md`. |
| L. Current capability vs future direction | `PRESENT_BUT_POTENTIALLY_MISLEADING` | Product/MVP documents distinguish status well, but implementation documents still contain stale local-storage/production-database language and some architecture text describes future storage categories next to current statements. |

## 8. Terminology Audit

| Term | Repository evidence | Audit treatment |
|---|---|---|
| Organizational Intelligence Platform / OIP | Defined as the platform/category in `docs/canon/00_FOUNDERS_THESIS.md`, “What This Company Is Really Building,” and `docs/strategy/00_CATEGORY_DESIGN.md`. | Already clearly defined; retain as the product/category name. |
| Organizational Intelligence | Defined as organizational capability that improves through accumulated experience, memory, reasoning, and learning (`docs/canon/00_FOUNDERS_THESIS.md`, “The Intelligence Ladder”; `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Organizational Intelligence Metric”). | Already defined, but its relationship to Memory should be made explicit rather than treated as a synonym. |
| Organizational Memory | Defined as shared knowledge preserved across people, systems, and time with context and trust intact (`docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Capability 4”; `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Organizational Memory”). | Already clearly defined; this is the strongest existing term for the proposed durable substrate. |
| Company Brain | No material repository usage found. | Potentially misleading/marketing-loaded. `NEEDS_HUMAN_DECISION` before introduction; do not substitute it for Organizational Intelligence or Organizational Memory. |
| Knowledge | Defined as context-bearing, meaningful, sufficiently trusted organizational content; distinguished from information and storage (`docs/canon/00_FOUNDERS_THESIS.md`, “The Central Thesis”; `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`). | Existing definition is usable. Preserve the distinction between knowledge and raw records. |
| Lesson | Used as reusable learning from a case and as a structured field inside knowledge (`docs/canon/00_FOUNDERS_THESIS.md`, “The Founder’s Realization”; `types/knowledge.ts`, `Lesson`). | Broadly defined through use; a future glossary could clarify whether Lesson is a Knowledge form or a domain subtype. Do not invent a final definition in this audit. |
| Evidence | Defined as information supporting a claim, decision, resolution, or validation (`docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Evidence”). | Clearly defined; preserve evidence-versus-assertion distinction. |
| Source | Defined separately from Evidence as origin/context/provenance (`docs/canon/04_PRODUCT_DOMAIN_MODEL.md`, “Source” and “Source vs. Evidence”). | Clearly defined; do not collapse Source and Evidence. |
| Reflection | Defined as outcome-aware review that prepares learning, not direct memory mutation (`docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`, “Knowledge Flywheel”; `docs/ARCHITECTURE_BASELINE.md`, “Reflection”). | Clearly bounded in current implementation; retain human/gated semantics. |
| Trust | Represented through validation, confidence, evidence, reuse/outcomes, and deterministic trust evaluation (`docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`; `lib/trustEngine.ts`). | Existing term is meaningful but must not be presented as factual certainty. |
| Validation | The transition from candidate/proposed learning to trusted knowledge, with human authority and rationale (`docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`, “Knowledge Validation”). | Clearly defined; preserve as a gate, not a confidence score. |
| Retrieval | The operation of finding relevant memory under context, authority, applicability, and evidence constraints (`docs/canon/06_AI_COGNITIVE_MODEL.md`; `docs/implementation/12_MVP_SCOPE.md`). | Existing term is clear; add mechanism labels when discussing current vs future retrieval. |
| Grounding | Used for drafts/responses authorized by relevant organizational knowledge and supported by evidence (`lib/groundingPresentation.ts`, `lib/explainability.ts`, `docs/NC-FIX-009-GROUNDING-COLD-START-UI-LABEL-RECONCILIATION-REPORT.md`). | Current product term; do not equate provider use or similarity with grounding. |

The main terminology decision is whether formal north-star adoption changes any authoritative definition. Based on repository evidence, it does not need to. It appears to strengthen and foreground existing concepts. If leadership intends to redefine the platform category or the meaning of Organizational Intelligence/Memory, that is a Canon Major-version decision under `docs/canon/CANON_GOVERNANCE.md`, not a terminology cleanup.

## 9. Current Capability vs Long-Term Direction

The following matrix is the audit’s capability boundary. It must be preserved in any later documentation work.

| Capability | Current implementation/design evidence | Classification | Safe documentation claim |
|---|---|---|---|
| Organization-scoped durable storage | PostgreSQL/Prisma schema, server persistence, organization relations, durable jobs | `CURRENT_IMPLEMENTED` | OIP can persist the current bounded support learning model with server authority. |
| Local/development persistence | Local-first configuration and development/demo mode | `CURRENT_IMPLEMENTED` | Local mode exists for development/demonstration, not as the production durability claim. |
| Validated knowledge and memory changes | Candidate, validation, memory-change, trust-evidence records and transactional commit | `CURRENT_IMPLEMENTED` | Human-validated knowledge can enter governed organizational memory. |
| Evidence/resolution provenance | Ticket messages, source ticket IDs, resolution evidence, validation rationale, memory snapshots | `CURRENT_IMPLEMENTED` | Current memory changes can be inspected back to bounded workflow evidence. |
| Deterministic retrieval | Lexical/category/canonical/lesson matching, ranking, compatibility, grounding gates | `CURRENT_IMPLEMENTED` | Bounded deterministic retrieval is current. |
| AI-assisted semantic compatibility | Provider-neutral AI advisory and semantic lesson compatibility path | `CURRENT_IMPLEMENTED`, bounded/advisory | AI may assist retrieval/compatibility; it does not own truth or memory. |
| General semantic/vector retrieval | Vector persistence and embeddings appear in design docs, not current schema/dependencies | `PLANNED` / `CURRENT_DESIGNED` | Describe as future/design intent only. |
| Continuous Reflection and learning | Durable reflection preparation, human review, promotion, pattern discovery | `CURRENT_IMPLEMENTED` | A governed learning loop exists for the current Support path. |
| Fully automatic memory updating | No evidence; conflicts with human review and validation invariants | `UNSUPPORTED` | Do not claim autonomous learning or self-updating truth. |
| Supersession/retirement/confidence decay | Modeled in Canon/design, only partial state/history support in current implementation | `CURRENT_DESIGNED` / `PLANNED` | Describe as lifecycle direction, not complete current behavior. |
| Cross-department organizational memory | Roadmap and architecture target it; MVP is Support-focused | `PLANNED` / `NORTH_STAR` | Keep as long-term platform scope. |
| Universal accuracy guarantee | No supporting evidence; trust signals are not correctness proof | `UNSUPPORTED` | Say inspectable/increasingly trustworthy, never guaranteed accurate. |

## 10. Documentation Impact Matrix

Q1 = Storage, Q2 = Retrieval, Q3 = Updating, Q4 = Accuracy/Trust. “Current/Future” uses the required capability categories.

| Classification | Count |
|---|---:|
| `UPDATE_REQUIRED` | 2 |
| `CLARIFICATION_RECOMMENDED` | 23 |
| `NO_UPDATE_REQUIRED` | 87 |
| `HISTORICAL_PRESERVE` | 141 |
| `SUPERSEDED_OR_STALE` | 5 |
| `NEEDS_HUMAN_DECISION` | 1 |
| **Total audited Markdown/MDX files** | **259** |

| File | Role | Classification | Q1 | Q2 | Q3 | Q4 | Current/Future | Reason | Future Action |
|---|---|---:|:---:|:---:|:---:|:---:|---|---|---|
| `docs/README.md` | Documentation authority/navigation | `NO_UPDATE_REQUIRED` | — | — | — | — | Current structure | Correctly establishes Canon → Architecture → Implementation. | None for this realignment. |
| `docs/canon/README.md` | Canon index/governance pointer | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Canon | Correctly identifies Canon as conceptual source of truth. | None unless Canon version changes. |
| `docs/canon/00_FOUNDERS_THESIS.md` | Foundational purpose | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | North star already present | Already articulates forgetting, memory, learning, trust, and Support beachhead. | Preserve wording; do not rewrite for novelty. |
| `docs/canon/01_PRODUCT_VISION.md` | Canonical product vision | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current + north star | Strongly aligned; current live door and future doors should remain explicit. | Later add a formal current/future boundary and non-guarantee of accuracy if approved. |
| `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` | Canonical capability model | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed maturity model | Memory, validation, evolution, and cross-domain capabilities are present; maturity levels are not all current. | Mark capability maturity/current implementation references. |
| `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` | Canonical vocabulary | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Canon + future lifecycle | Definitions are coherent; modeled lifecycle exceeds current implementation. | Add traceable status notes only if Canon governance permits. |
| `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` | Canonical lifecycle/workflows | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current MVP + future workflows | Current loop is identified, but full evolution workflow is aspirational. | Label current MVP path versus future lifecycle paths. |
| `docs/canon/06_AI_COGNITIVE_MODEL.md` | Canonical AI/cognition model | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | North star design | Retrieve/reflect/learn/improve-memory cycle is correct but broader than current implementation. | Add capability-status cross-references; preserve AI authority boundary. |
| `docs/canon/CANON_GOVERNANCE.md` | Canon change control | `NEEDS_HUMAN_DECISION` | ✓ | ✓ | ✓ | ✓ | Decision-dependent | Formal adoption is compatible unless leadership intends to redefine OI/Memory; a redefinition is Major. | Decide whether the proposed direction is a clarification or Canon Major change before editing Canon. |
| `docs/product/00_PRODUCT_PHILOSOPHY.md` | Product philosophy | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Durable principles | Already prioritizes memory, trust, governance, and learning. | Align terminology with explicit substrate/outcome relationship. |
| `docs/product/01_PRODUCT_STRATEGY.md` | Product sequencing | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Beachhead + expansion | Current scope and platform ambition coexist; status labels can be made more visible. | Add explicit “current beachhead / long-term platform” framing if authorized. |
| `docs/product/02_PRODUCT_REQUIREMENTS.md` | Enduring requirements | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Requirements | Requirements cover durable memory and trust but may be read as implemented guarantees. | Separate required product behavior from current MVP evidence. |
| `docs/product/06_WORKFLOW_DESIGN.md` | Product workflow design | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed | Compatible with the north star; future lifecycle is broader than current implementation. | Add status cross-links. |
| `docs/product/07_INFORMATION_ARCHITECTURE.md` | Information model/IA | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed | Memory and provenance are central; implementation coverage is bounded. | Keep model; clarify current stored objects versus future objects. |
| `docs/product/08_FEATURE_CATALOG.md` | Capability catalog | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Product capability | Broad capability catalog can be mistaken for shipped scope. | Ensure status legend and MVP boundary are linked. |
| `docs/product/09_MVP_FEATURES.md` | MVP scope/status | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current + deferred | This is one of the clearest current/future documents; only terminology alignment is needed. | Preserve Support beachhead and deferred-domain boundaries. |
| `docs/product/10_PRODUCT_METRICS.md` | Metrics | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current + future | Metrics already cover reuse, trust, learning, and entropy; scope of evidence should be explicit. | Identify which metrics are observable today versus target metrics. |
| `docs/product/11_PRODUCT_GOVERNANCE.md` | Governance/trust | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Durable governance | Compatible and safety-critical; future memory scale may require additional decisions. | Preserve human review, evidence, and organization boundaries. |
| `docs/product/14_PRODUCT_LIFECYCLE.md` | Product learning lifecycle | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed lifecycle | Explicitly describes evidence, memory, review, reuse, and evolution. | Distinguish product lifecycle from runtime memory lifecycle. |
| `docs/architecture/07_SYSTEM_ARCHITECTURE.md` | Logical system architecture | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current design + future | Correctly centers Memory/Trust/Learning layers, but is implementation-independent. | Add explicit status disclaimer where readers may infer physical implementation. |
| `docs/architecture/09_DATA_ARCHITECTURE.md` | Logical data architecture | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed | Strong evidence/provenance/lifecycle model; not a claim that every store exists now. | Keep design; link current schema mapping and gaps. |
| `docs/architecture/10_KNOWLEDGE_REPRESENTATION_MODEL.md` | Knowledge semantics/lifecycle | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed | Excellent trust/provenance/contradiction model; implementation is narrower. | Mark unsupported lifecycle features as future. |
| `docs/implementation/12_MVP_SCOPE.md` | Current implementation scope | `UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Current statements conflict with implementation | Says production database is not included and frames the MVP around local storage while current repository supports PostgreSQL/server persistence, durable workers, RBAC, connectors, and organization persistence. | Reconcile to current release state; retain the Support boundary and label deferred features. |
| `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md` | Current implementation architecture | `UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Current statements conflict with implementation | “Implemented: Local Storage” and “Current: Local Storage” understate current PostgreSQL/server authority and overstate/understate other release capabilities. | Replace stale current mapping with evidence-backed current/future matrix; do not change code in this audit. |
| `docs/implementation/15_API_ARCHITECTURE.md` | API contract | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Designed contract | API guidance correctly requires provenance, validation, status, and explainability but is not a current feature inventory. | Add links to current routes/resources only if later authorized. |
| `docs/implementation/16_STORAGE_ARCHITECTURE.md` | Storage strategy | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Future-capable design | Vector, object, separate memory/evidence stores, retention, and semantic retrieval are design categories, not current physical capabilities. | Add explicit “logical/future category” labels and current schema mapping. |
| `docs/strategy/09_LONG_TERM_VISION.md` | Long-term strategy | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | North star | Already describes organization-wide memory and capability gates. | Preserve; align one-sentence relationship to Organizational Intelligence. |
| `docs/strategy/10_EXECUTIVE_SUMMARY.md` | Executive narrative | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Strategy summary | Broad claims need current Support beachhead and evidence boundary nearby. | Add concise scope/status qualifier later. |
| `docs/roadmap/06_CUSTOMER_SUPPORT_MVP.md` | Beachhead roadmap | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Current beachhead | Correctly protects Support as first proof point. | Preserve. |
| `docs/roadmap/07_KNOWLEDGE_FLYWHEEL.md` | Learning roadmap | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | North star progression | Already maps work to validated memory and reuse. | Preserve historical roadmap intent. |
| `docs/roadmap/09_MULTI_DEPARTMENT.md` | Expansion roadmap | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Planned | Explicitly defers broader domains until Support evidence. | Preserve. |
| `docs/roadmap/17_ORGANIZATIONAL_INTELLIGENCE.md` | Organization-scale roadmap | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Planned/north star | Already states memory remains governed and people remain accountable. | Preserve; do not pull roadmap scope into MVP. |
| `docs/roadmap/19_GLOBAL_MEMORY_NETWORK.md` | Far-future ecosystem | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | North star/future | Explicitly preserves private memory, consent, and governance. | Preserve as future vision; no current capability implication. |
| `docs/ARCHITECTURE_BASELINE.md` | Current engineering orientation | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Current | Accurately documents PostgreSQL, durable memory records, trust/reflection boundaries, and server deployment. | Use as evidence when reconciling stale implementation docs. |
| `docs/DEPLOYMENT_GUIDE.md` | Operational deployment | `NO_UPDATE_REQUIRED` | ✓ | — | — | ✓ | Current controlled deployment | Accurately requires PostgreSQL, server persistence, worker supervision, and human review. | Preserve. |
| `docs/PRODUCTION_CONFIGURATION.md` | Configuration contract | `NO_UPDATE_REQUIRED` | ✓ | ✓ | ✓ | ✓ | Current | Explicitly separates local development from managed PostgreSQL/server deployment and deterministic fallback. | Preserve. |
| `docs/VERSION_SUMMARY.md` | Release/current summary | `SUPERSEDED_OR_STALE` | ✓ | ✓ | ✓ | ✓ | Stale current claim | Still presents `v0.1.0-certified` as planned while `docs/CHANGELOG.md` contains a `v0.3.0` release entry dated 2026-08-24. | Later reconcile or supersession-label; do not rewrite now. |
| `docs/KNOWN_LIMITATIONS.md` | Current limitations | `SUPERSEDED_OR_STALE` | ✓ | ✓ | ✓ | ✓ | Stale release framing | Opens as limitations for planned `v0.1.0-certified`, while current release metadata is later and the implementation has evolved. | Later refresh release identity and limitation scope; preserve historical claims. |
| `docs/RELEASE_CHECKLIST.md` | Release operations | `SUPERSEDED_OR_STALE` | ✓ | ✓ | ✓ | ✓ | Stale target version | Targets `v0.1.0-certified` and should not be read as current v0.3.0 release truth. | Archive/retarget under release governance later. |
| `ai/CURRENT_STATUS.md` | Developer status/history | `SUPERSEDED_OR_STALE` | ✓ | ✓ | ✓ | ✓ | Stale/current-label risk | File title says Current Status but content is a historical sequence dominated by July TODOs and explicitly records features as designed/not implemented at earlier dates. | Rename/segment only in a later authorized documentation task; preserve historical entries. |
| `DEMO_SCRIPT.md` | Demo narrative | `CLARIFICATION_RECOMMENDED` | ✓ | ✓ | ✓ | ✓ | Current demo | Correctly demonstrates cold start, human approval, provenance, trust growth, and memory reuse; some wording can be read as product-wide behavior. | Add explicit “bounded Support demo” qualifier later. |
| `docs/*REPORT.md`, `docs/reports/*`, `docs/releases/*`, acceptance/certification/audit records | Historical evidence | `HISTORICAL_PRESERVE` | ✓ | ✓ | ✓ | ✓ | Historical | Records completed audits, releases, fixes, acceptance, certification, or experiments. Rewriting would destroy evidence of what was true at that time. | Leave unchanged; label/supersede only if a record falsely presents itself as current canonical truth. |

## 11. UPDATE_REQUIRED Documents

These are the two documents whose current implementation claims are materially incomplete or misleading after comparing them with current repository evidence. This classification does not authorize edits beyond this audit report.

### `docs/implementation/12_MVP_SCOPE.md`

- Relevant sections: “MVP Scope at a Glance,” “Implemented Intake Pipeline,” “Not Included Yet,” “Organizational Memory and Lifecycle,” and “Roadmap Alignment.”
- Current statement: the table marks “Production Database” as not included, the implementation is described as one bounded/local MVP, and the roadmap calls Phase 1 “Local Organizational Memory.”
- Why affected: current repository evidence includes PostgreSQL as the Prisma datasource, server persistence configuration, durable organization-scoped records, migration history, worker-backed persistence, RBAC, connector, and resolution-evidence capabilities. The Customer Support and bounded-scope statements remain valid, but the storage/current-release description is stale.
- Questions: Q1 Storage; Q2 Retrieval; Q3 Updating; Q4 Accuracy/Trust, because current persistence and gates are part of the trust story.
- Current/future: stale `CURRENT_IMPLEMENTED` statements mixed with valid `CURRENT_DESIGNED`/`PLANNED` statements.
- Future treatment: reconcile the current MVP table against `docs/ARCHITECTURE_BASELINE.md`, `docs/PRODUCTION_CONFIGURATION.md`, `prisma/schema.prisma`, and current release evidence. Preserve the distinction between current Support scope and future doors/domains. Add explicit labels for “implemented,” “designed,” “planned,” and “unsupported.”
- Risk if unchanged: readers may understate durable persistence and misreport the current product, or infer that the repository has not crossed the local prototype boundary.

### `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md`

- Relevant sections: “Current MVP Mapping” and “Implementation Roadmap.”
- Current statement: “Implemented” includes “Local Storage,” and “Current” lists Customer Support, Local Gemma, and Local Storage; “Future” lists enterprise storage.
- Why affected: `prisma/schema.prisma`, `prisma/migrations/20260715172000_init_postgres_persistence/migration.sql`, `lib/server/persistenceService.ts`, `docs/ARCHITECTURE_BASELINE.md`, `docs/DEPLOYMENT_GUIDE.md`, and `docs/PRODUCTION_CONFIGURATION.md` establish a current PostgreSQL/server persistence path. Local mode remains a development option, but is not the complete current persistence description.
- Questions: Q1 Storage; Q2 Retrieval; Q3 Updating; Q4 Accuracy/Trust.
- Current/future: current-state mapping is stale; architecture layers remain valid as `CURRENT_DESIGNED`/`CURRENT_IMPLEMENTED` boundaries.
- Future treatment: replace only the stale implementation mapping with an evidence-backed matrix. Identify what is current in server persistence, what remains local/demo-only, what is planned (distributed storage, additional domains), and what is unsupported (unbounded scale/vector/RAG guarantees).
- Risk if unchanged: implementation, release, and investor/customer readers receive contradictory product truth and may assume future storage features are current or current PostgreSQL durability is absent.

## 12. CLARIFICATION_RECOMMENDED Documents

These documents are broadly compatible and are not currently wrong. They would benefit from a coordinated future pass that makes the following distinctions uniform:

1. Organizational Memory is the durable, governed substrate/capability; Organizational Intelligence is the broader outcome/category enabled by memory, reasoning, learning, and action.
2. The current beachhead is Customer Support and the current live intake path is bounded; broader departments and intake doors remain future scope.
3. Current deterministic retrieval and bounded AI-assisted compatibility must not be described as general vector/RAG retrieval.
4. Trust signals improve inspectability and decision quality; they do not guarantee factual accuracy.
5. Reflection, validation, promotion, concurrency, provenance, and resolution-evidence gates remain safety invariants.

Exact files classified `CLARIFICATION_RECOMMENDED` are:

- `docs/canon/01_PRODUCT_VISION.md`
- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`
- `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`
- `docs/canon/06_AI_COGNITIVE_MODEL.md`
- `docs/product/00_PRODUCT_PHILOSOPHY.md`
- `docs/product/01_PRODUCT_STRATEGY.md`
- `docs/product/02_PRODUCT_REQUIREMENTS.md`
- `docs/product/06_WORKFLOW_DESIGN.md`
- `docs/product/07_INFORMATION_ARCHITECTURE.md`
- `docs/product/08_FEATURE_CATALOG.md`
- `docs/product/09_MVP_FEATURES.md`
- `docs/product/10_PRODUCT_METRICS.md`
- `docs/product/11_PRODUCT_GOVERNANCE.md`
- `docs/product/14_PRODUCT_LIFECYCLE.md`
- `docs/architecture/07_SYSTEM_ARCHITECTURE.md`
- `docs/architecture/09_DATA_ARCHITECTURE.md`
- `docs/architecture/10_KNOWLEDGE_REPRESENTATION_MODEL.md`
- `docs/implementation/15_API_ARCHITECTURE.md`
- `docs/implementation/16_STORAGE_ARCHITECTURE.md`
- `docs/strategy/09_LONG_TERM_VISION.md`
- `docs/strategy/10_EXECUTIVE_SUMMARY.md`
- `DEMO_SCRIPT.md`

For every file above, the relevant questions are Q1–Q4 as shown in the impact matrix. These are clarification impacts, not permission to rewrite the documents during this audit.

## 13. NO_UPDATE_REQUIRED Documents

The following remain correct and useful without a north-star rewrite:

- `docs/README.md`, `docs/canon/README.md`, `docs/product/README.md`, `docs/architecture/README.md`, `docs/implementation/README.md`, `docs/strategy/README.md`, `docs/roadmap/README.md`, `docs/research/README.md`, and `docs/REPOSITORY_MAP.md` as repository navigation and dependency rules.
- `docs/canon/00_FOUNDERS_THESIS.md`, `docs/canon/02_PRODUCT_PRINCIPLES.md`, and `docs/canon/mock.md` where applicable; they already preserve the product’s conceptual identity and safety principles.
- Product documents not listed as impacted: `docs/product/03_PERSONAS.md`, `04_USER_JOURNEYS.md`, `05_USER_STORIES.md`, `12_PRODUCT_BACKLOG.md`, and `13_PRODUCT_DECISIONS.md`, subject to their own ordinary lifecycle governance.
- Architecture documents not listed as impacted: `docs/architecture/08_AI_AGENT_ARCHITECTURE.md` and `docs/architecture/11_INTEGRATION_ARCHITECTURE.md`.
- Implementation documents not listed as impacted: `docs/implementation/14_TECHNOLOGY_DECISIONS.md`, `17_DEPLOYMENT_ARCHITECTURE.md`, and `18_SECURITY_ARCHITECTURE.md`, which retain relevant current boundaries and do not require a strategic rewrite.
- Strategy documents other than the two listed above, all roadmap documents, research documents, and hackathon scope documents where they already distinguish current proof from future expansion.
- `docs/ARCHITECTURE_BASELINE.md`, `docs/DEPLOYMENT_GUIDE.md`, and `docs/PRODUCTION_CONFIGURATION.md`, which are the strongest current operational evidence for PostgreSQL/server persistence, durable memory, deterministic fallback, human review, and deployment boundaries.
- Narrow operational/developer references whose behavior is unaffected by the product realignment, including `AGENTS.md`, `CLAUDE.md`, and developer workflow instructions, unless they contain a separate stale release claim.

This classification means no update is needed for the north-star realignment; it does not mean these files can never change for unrelated correctness or release maintenance.

## 14. HISTORICAL_PRESERVE Documents

Historical truth must remain intact. The audit classified historical acceptance, certification, release, report, and prior-task records as `HISTORICAL_PRESERVE`, including the exact file families below:

- All existing `docs/reports/*.md` files, including the NC-FIX, REL-RC, REL-CERT, and landing-option reports.
- All existing `docs/releases/*.md` files.
- `AUDIT_REPORT.md`, `E2E_AUDIT_REPORT.md`, `docs/OIP-CERTIFICATION-REPORT.md`, `docs/A-005-DURABLE-PERSISTENCE-MIGRATION-REPORT.md`, and the NC-ACCEPT/NC-FIX/RSS/TODO audit and acceptance reports under `docs/`.
- Historical changelogs and release records including `ai/CHANGELOG.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG-v0.1.0.md`, and `docs/REL-CERT-001-CANDIDATE-MANIFEST.md`.
- Historical evidence records under `evidence/` are not Markdown documentation, but were treated as evidence artifacts and not modified.

These records may contain past scope, past limitations, historical product names, prior implementation states, or earlier release claims. They should not be rewritten to make the past look consistent with a later strategic direction. If a historical record is confusingly surfaced as current canonical truth, the future treatment is an archival/supersession label or a current pointer—not rewriting the record.

## 15. SUPERSEDED_OR_STALE Documents

The following files present older release/current truth and should be corrected or superseded in a later authorized task, without rewriting their historical meaning:

- `docs/VERSION_SUMMARY.md`: still frames `v0.1.0-certified` as planned, while `docs/CHANGELOG.md` has a `0.3.0 — 2026-08-24` entry.
- `docs/KNOWN_LIMITATIONS.md`: opens as limitations for the planned `v0.1.0-certified` release and does not read as a current v0.3.0 limitation set.
- `docs/RELEASE_CHECKLIST.md`: targets `v0.1.0-certified` rather than the current release identity shown in the changelog.
- `ai/CURRENT_STATUS.md`: a current-status filename whose content is predominantly historical July TODO closeout material and includes earlier “designed, not implemented” statements.
- `docs/RELEASE_NOTES-v0.1.0.md`: historical release notes that contain mixed release-status wording and should not be used as current release truth; preserve as a v0.1.0 record and add a later current-release pointer if needed.

Relevant questions: Q1–Q4 where these files make capability or release-status claims. Current/future classification: stale current presentation, not evidence that the underlying historical capability claim was false at its original time.

## 16. NEEDS_HUMAN_DECISION Items

### Formal Canon treatment of the realignment

Relevant file: `docs/canon/CANON_GOVERNANCE.md`, sections “Major Version,” “Classification Rule,” and “Canon Integrity Rules.”

Decision required: Is the proposed north star merely a clearer statement of the existing Canon, or does leadership intend to redefine the product category, Organizational Intelligence, Organizational Memory, or a core responsibility?

- If it is clarification, downstream documents can receive coordinated wording/status clarification without redefining the Canon.
- If it changes the meaning or boundary of Organizational Intelligence or Organizational Memory, Canon Governance says that is a Major change and requires a versioned impact assessment.

Questions: Q1–Q4 and terminology. Current/future classification: `NORTH_STAR` decision, not an implementation fact. Future treatment: obtain the decision before changing Canon or propagating a new definition.

No evidence supports changing human review, evidence gates, tenant identity, provenance, optimistic concurrency, Reflection safety, or trust semantics as part of this realignment. Any proposal to change one of those is a separate `NEEDS_HUMAN_DECISION` item.

## 17. Customer Support Beachhead Assessment

The proposed north star does not conflict with the current Customer Support beachhead. The repository repeatedly states that Support is the first proving ground because it exposes repeated questions, high-value lessons, resolution evidence, and customer-facing trust consequences.

Evidence:

- `docs/canon/00_FOUNDERS_THESIS.md`: “We are beginning with customer support because support is where organizational forgetting is most visible”; “Customer support is the first proving ground. The mission is larger.”
- `docs/canon/01_PRODUCT_VISION.md`: current Live Workflow door is open today; Manual and Historical/Bulk doors are long-term.
- `docs/implementation/12_MVP_SCOPE.md`: current MVP implements only Door 3, Live Workflow Capture, and explicitly defers the other doors.
- `docs/product/09_MVP_FEATURES.md`: Support is the beachhead and broader domains are intentionally excluded from the MVP.
- `docs/roadmap/09_MULTI_DEPARTMENT.md` and `docs/roadmap/17_ORGANIZATIONAL_INTELLIGENCE.md`: cross-department capability is gated by evidence and maturity.

Finding: preserve the two-level story:

```text
Long-term platform: persistent, governed organizational memory enabling Organizational Intelligence.
Current beachhead: Customer Support learning, reuse, reflection, validation, and trust.
```

Do not broaden immediate implementation to HR, Engineering, Sales, Finance, Operations, or other departments merely to make the long-term vision sound broader. The roadmap already provides the safer sequencing.

## 18. Product Safety Invariant Assessment

The north-star proposal is compatible with current safety invariants if it is treated as a direction and not as permission for autonomous memory mutation.

Invariants that must remain explicit in future documentation:

- Human review remains required for reusable-memory promotion and governed actions (`docs/KNOWN_LIMITATIONS.md`; `docs/implementation/12_MVP_SCOPE.md`, “Knowledge Validation”).
- Resolution evidence gates Reflection/validation eligibility (`app/api/organizations/[organizationId]/tickets/[ticketId]/evidence/route.ts`; `lib/server/tickets/ticketWorkflow.ts`).
- Customer-specific identity/provenance must not be replaced by a later candidate’s source identity (`lib/knowledgeProvenance.ts`; current NC-FIX-012 reports).
- Reflection prepares learning but does not directly grant trust or mutate memory (`docs/ARCHITECTURE_BASELINE.md`, “Reflection”; `docs/canon/06_AI_COGNITIVE_MODEL.md`).
- Retrieval compatibility is separate from trust and promotion (`docs/ARCHITECTURE_BASELINE.md`, “Trust Engine”; `lib/explainability.ts`).
- Optimistic concurrency and atomic validation/memory-change writes protect current memory (`prisma/schema.prisma`, `KnowledgeItem.revision` and unique audit constraints; `docs/KNOWN_LIMITATIONS.md`).
- Protected/security-sensitive cases remain fail-closed and human-governed (`docs/implementation/18_SECURITY_ARCHITECTURE.md`; `docs/KNOWN_LIMITATIONS.md`).
- AI remains advisory and cannot approve its own output or write trusted memory (`docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md`, “AI Advisory Layer”).

No safety invariant needs reinterpretation for the proposed north star. The unresolved issue is only whether the Canon itself is being clarified or redefined.

## 19. Architecture Reality Check

The implementation evidence supports the following conclusions:

### Persistence/storage

- Current physical persistence is PostgreSQL through Prisma (`prisma/schema.prisma`, datasource; `docs/ARCHITECTURE_BASELINE.md`, “Persistence”).
- Organization-scoped relations exist for knowledge, candidates, validations, memory changes, trust evidence, tickets, patterns, metrics, jobs, connectors, and reflection (`prisma/schema.prisma`).
- The repository supports a server-authority deployment mode and a local-first development mode (`docs/PRODUCTION_CONFIGURATION.md`, “Development versus production”; `lib/server/persistenceAuthorityService.ts`).
- This supports durable current memory, but does not prove unlimited scale, a separate memory graph, or lossless ingestion of all enterprise knowledge.

### Evidence, provenance, trust, and outcomes

- Evidence is represented in ticket messages/resolution evidence and linked source IDs; validation records carry actor, role, rationale, decision, and timestamp.
- Trust evidence is idempotently keyed to organization, knowledge item, source ticket, and event type; memory changes preserve before/after state and validation linkage.
- Knowledge items carry reuse/outcome counters, trust score, review counts, timestamps, and lifecycle state.
- These are strong current trust signals, not correctness guarantees.

### Retrieval

- The codebase includes deterministic lexical/category/canonical/lesson retrieval and explainability/grounding gates.
- AI providers are behind advisory boundaries and deterministic fallback remains available.
- No Prisma embedding model, vector index, vector database dependency, or general RAG pipeline was found. Vector/semantic retrieval in `docs/implementation/16_STORAGE_ARCHITECTURE.md` is design/future guidance.

### Reflection and lifecycle

- Durable `PreparedReflection`, worker jobs, reflection commands, validation, promotion, and memory-change records exist.
- Knowledge lifecycle states include active/candidate/deprecated; patterns include monitoring/suggested/promoted/dismissed.
- Rich Canon/design semantics for supersession, retirement, contradiction, recency, and confidence evolution are not all current implementation behavior.

### Scale and scope

- Current product scope is bounded Customer Support; broader domains and extra intake doors are roadmap items.
- Production-scale load and multi-customer design-partner validation remain limited (`docs/KNOWN_LIMITATIONS.md`).

## 20. Recommended Documentation Update Order

No updates were performed. For a later authorized documentation task, the safest order derived from repository dependencies is:

1. Resolve the human decision in `docs/canon/CANON_GOVERNANCE.md`: clarification versus Canon Major change.
2. If clarification only, update/confirm the canonical relationship among Organizational Memory, Organizational Intelligence, Knowledge, Lesson, Evidence, and Trust in `docs/canon/01_PRODUCT_VISION.md`, then review `03_PRODUCT_CAPABILITY_MODEL.md`, `04_PRODUCT_DOMAIN_MODEL.md`, `05_PRODUCT_WORKFLOW_MODEL.md`, and `06_AI_COGNITIVE_MODEL.md` as one Canon set.
3. Reconcile current implementation truth in `docs/implementation/12_MVP_SCOPE.md` and `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md` against PostgreSQL/server persistence and current release evidence.
4. Add explicit current/designed/planned/north-star status markers to `docs/implementation/15_API_ARCHITECTURE.md`, `docs/implementation/16_STORAGE_ARCHITECTURE.md`, and the affected logical architecture documents without turning design into implementation claims.
5. Review product requirements, information architecture, feature catalog, metrics, governance, and lifecycle documents for consistent substrate/outcome language and the Support boundary.
6. Review strategy and roadmap summaries, preserving the current Support beachhead and capability gates.
7. Reconcile stale release/current-status documents (`docs/VERSION_SUMMARY.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/RELEASE_CHECKLIST.md`, `ai/CURRENT_STATUS.md`) under release/documentation governance.
8. Add current pointers or archival labels to historical reports only where navigation is confusing; do not rewrite historical content.

This order follows the repository’s own dependency rule: Canon → Product/Architecture → Implementation → Roadmap/secondary references. Historical records remain outside the rewrite chain.

## 21. Risks and Open Questions

Risks if the documentation is changed carelessly:

- Calling OIP a system that “knows everything” would erase the evidence/validation boundary and create an accuracy claim the repository cannot support.
- Presenting semantic/vector retrieval, supersession, retirement, or trust decay as current would overstate implementation.
- Treating “Organizational Memory” as a replacement for “Organizational Intelligence” would break established Canon terminology and could trigger a Major change under Canon Governance.
- Broadening the current scope beyond Customer Support would weaken the MVP proof strategy and obscure whether the learning loop works.
- Rewriting historical audits, certification results, changelogs, or acceptance reports would destroy evidence of past system states.
- Failing to reconcile stale implementation/current-status docs would leave readers with contradictory release and persistence truth.

Open questions requiring product/architecture judgment:

1. Is the proposed north star intended as a clarification of Canon v1.0.0 or a redefinition requiring a new Canon major version?
2. Is Organizational Memory formally the durable substrate/capability and Organizational Intelligence the resulting organizational capability/category, or does leadership intend another relationship?
3. What future memory types are in scope beyond support lessons, and what evidence/provenance minimum applies to each?
4. Which lifecycle states—superseded, retired, stale, contradicted, revalidated—must become current implementation commitments, and when?
5. What scale, retention, privacy, deletion, and customer-ownership guarantees are intended before using “persistent organizational memory at organizational scale” as a current product claim?
6. When should semantic/vector retrieval move from design to an implemented capability, and what explainability/authorization gates must accompany it?

## 22. Repository Mutation Verification

The audit performed read-only inspection of repository files, implementation/configuration/schema evidence, and Git state. The only repository file created by this task is:

`docs/audits/DOC-AUDIT-001-organizational-memory-documentation-impact.md`

No pre-existing documentation, product code, tests, schemas, prompts, migrations, release records, or reports were modified. No files were staged, committed, pushed, tagged, deployed, renamed, moved, deleted, reset, checked out, stashed, or restored.

Post-audit verification required by the audit brief:

- The expected post-audit status is the same pre-existing dirty set listed in Section 2, plus the authorized untracked audit report path.
- The pre-existing modification `docs/TODO-080-REPORT.md` and the pre-existing untracked report/manifest files remain separate from this audit.
- The report itself is the only authorized mutation.

## 23. Final Verdict

`DOC_AUDIT_001_DOCUMENTATION_IMPACT_MAPPED`
