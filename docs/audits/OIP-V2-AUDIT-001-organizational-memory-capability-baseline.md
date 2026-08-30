# OIP-V2-AUDIT-001 — Organizational Memory Capability Baseline & Minimal Gap Analysis

**Audit mode:** READ-ONLY AUDIT — NO IMPLEMENTATION CHANGES  
**Audit date:** 2026-08-24  
**Repository:** `C:\Users\Calvin\Documents\My Project\Hackathon 2`  
**Scope:** repository-wide capability baseline against Canon v1.0.1 and the smallest credible V2 Company Brain prototype.  
**Mutation authorization:** this report only.

## 1. Executive Summary

The current OIP is materially closer to a persistent, governed Organizational Memory system than to a generic support application. It already has a durable organization-scoped substrate, a support beachhead, deterministic retrieval, evidence-gated resolution, Reflection, human validation, atomic promotion, provenance, trust scoring, and optimistic-concurrency protection.

The important boundary is scope. The implemented loop is a credible Customer Support implementation of Organizational Memory, not yet a domain-neutral Company Brain. The core storage and governance seams are reusable, but the durable evidence/provenance model, outcome model, and challenge/revalidation lifecycle remain coupled to tickets or represented only as scalar fields and narrow event types.

The smallest credible V2 is therefore not a vector database, universal connector layer, or autonomous agent. It is the existing Support loop generalized around three primitives: a domain-neutral source/evidence reference, an explicit reusable outcome event, and a human-governed challenge/scope/revalidation transition.

**Scores:** Remember 4/5; Retrieve 3/5; Evolve 3/5; Trust 3/5.  
**OVERALL_V2_READINESS: 3/5**

**Final verdict:** `OIP_V2_AUDIT_001_BASELINE_MAPPED_AND_MINIMAL_GAPS_IDENTIFIED`

## 2. Repository State

The safety gate was recorded immediately before this report was created.

| Field | Value |
| --- | --- |
| Branch | `landing/option-c32-release-polish` |
| HEAD before audit | `084f9ab46d6555e793df8b73b1abb085267a2a05` |
| Worktree before audit | Dirty; pre-existing Canon/documentation edits and untracked audit/report artifacts were preserved |
| Allowed mutation | Create `docs/audits/OIP-V2-AUDIT-001-organizational-memory-capability-baseline.md` only |
| Product/runtime/schema/API/tests/prompts/UI/routes changed | No |
| Commit/stage/push/tag/deploy/publish performed | No |

The pre-existing dirty state included the Canon clarification and earlier audit/report artifacts. Those files were treated as out of scope and were not edited.

## 3. Canon Baseline

The applicable baseline is Canon v1.0.1 as clarified by the existing Canon files, especially:

- `docs/canon/CANON_GOVERNANCE.md`
- `docs/canon/01_PRODUCT_VISION.md`
- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`
- `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`
- `docs/canon/06_AI_COGNITIVE_MODEL.md`

The clarification distinguishes **Organizational Memory** from **Organizational Intelligence**. Organizational Memory is the durable, evidence-backed, validated, governed substrate of reusable organizational understanding. Organizational Intelligence is the broader ability to reason over that memory and act within governance. “Company Brain” is a product metaphor, not a separate technical primitive.

Canon’s four questions are:

| Question | Canon interpretation | Current baseline |
| --- | --- | --- |
| Remember | Capture durable organizational understanding with origin, evidence, validation, and history | Strong in the Support beachhead; source and evidence abstractions are not yet domain-neutral |
| Retrieve | Recall relevant memory with compatibility, grounding, and explainability | Implemented deterministically for bounded Support knowledge; no general vector/RAG layer |
| Evolve | Change memory through Reflection, review, promotion, versioning, and history | Implemented for governed Support Reflection; challenge, revalidation, and retirement are incomplete |
| Trust | Make reliability visible, inspectable, and outcome-sensitive | Implemented as validation, trust evidence, counters, thresholds, and idempotent reuse; outcome event breadth is limited |

Canon also requires that Reflection not directly mutate trusted memory, human validation remain authoritative, AI remain advisory, and provenance/evidence remain inspectable. The current implementation follows those boundaries in its main path.

## 4. Current Organizational Memory Architecture

The current architecture is a layered Support-first memory loop:

`TicketRecord + TicketResolutionEvidence` → `ReflectionDecision / PreparedReflection` → `KnowledgeCandidate` → `ValidationRecord` → atomic `KnowledgeItem + MemoryChangeRecord + TrustEvidence` → deterministic `retrieveMemory` → human or governed automatic reuse.

Relevant implementation evidence:

- `prisma/schema.prisma`: organization ownership, `KnowledgeItem`, `KnowledgeCandidate`, `ValidationRecord`, `MemoryChangeRecord`, `TrustEvidence`, `TicketRecord`, `TicketResolutionEvidence`, `PreparedReflection`, `DurableJob`, and connector models.
- `lib/persistence/session.ts`, `lib/persistence/index.ts`, and `lib/server/persistenceService.ts`: explicit organization/authority context and PostgreSQL-backed persistence with no silent server-to-local fallback.
- `lib/application/tickets/processTicket.ts`: ticket intake, classification, retrieval, eligibility, drafting, explainability, and persistence.
- `lib/application/learning/reflectionCommands.ts`: Reflection preparation, safety validation, candidate construction, promotion, provenance preservation, and governed memory commit.
- `lib/server/persistenceService.ts::commitValidation`: transactionally coordinates candidate state, validation, memory change, trust evidence, and knowledge revision.
- `lib/memory.ts`, `lib/retrievalCompatibility.ts`, `lib/drafting.ts`, and `lib/explainability.ts`: deterministic relevance, compatibility, drafting gates, and explanation.

The architecture is coherent for a bounded prototype. The main architectural limitation is not absence of persistence; it is that several supposedly universal concepts are represented through Support-shaped records: source identity is primarily a ticket ID, resolution evidence is a ticket-owned table, and the external signal contract is fixed to external tickets.

## 5. Q1 — Remember

**Answer: Yes, with a Support-specific boundary.**

The repository durably stores organization-scoped knowledge, candidates, validation decisions, memory changes, trust evidence, tickets, messages, and resolution evidence. `KnowledgeItem` carries source ticket references, validation/provenance fields, versions/history, reuse counters, trust state, and lifecycle state. `MemoryChangeRecord` preserves before/after state and validation/candidate links. Server persistence is PostgreSQL/Prisma and uses organization scoping.

What is not yet complete is a domain-neutral memory origin model. The durable `KnowledgeItem` provenance shape is ticket-based; there is no generalized source-event/evidence graph that can represent a Slack decision, an IT change, a policy review, or an operational incident without first making it look like a Support ticket.

**Score: 4/5.**

## 6. Q2 — Retrieve

**Answer: Yes for the current beachhead; not yet as scalable general retrieval.**

`lib/memory.ts` implements deterministic token, concept, category, tag, keyword, canonical-problem, specificity, and compatibility scoring. `lib/retrievalCompatibility.ts` applies structured domain facets and hard vetoes known conflicts. `lib/drafting.ts` and `lib/explainability.ts` add grounding, contradiction, lesson-evidence, authorization, and fail-closed gates.

The system deliberately does not use embeddings or vector search. The only semantic component is a narrow AI compatibility fallback after deterministic candidate generation, with bounded candidates, explicit lesson evidence, contradiction filtering, and fail-closed behavior. No vector/RAG dependency or vector index was found.

**Score: 3/5.**

## 7. Q3 — Evolve

**Answer: Yes through governed Support Reflection; partial as a memory lifecycle.**

Reflection is generated deterministically, safety-validated, prepared by a durable job, and marked as requiring promotion. Promotion creates or updates a candidate and commits only through human-governed validation. Existing actions include `create_new`, `merge_existing`, `create_version`, and `trust_update_only`. Versions, memory changes, validation records, and stable provenance are retained.

The lifecycle is incomplete for a Company Brain: there is no first-class challenged, scoped exception, stale, superseded, retired, invalidated, or revalidated state transition. The trust engine can calculate negative outcomes, but the main product path records successful reuse rather than a durable generalized challenge/outcome event.

**Score: 3/5.**

## 8. Q4 — Trust

**Answer: Yes as a first Support reliability model; partial as an organizational reliability model.**

`lib/trustEngine.ts` defines deterministic initial trust, human reuse, automatic success, wrong-answer, and edit adjustments; maintains success/failure counts and success rate; applies validation and legal-risk gates; and controls automatic-resolution eligibility. The durable commit path uses unique/idempotent `TrustEvidence` claims and optimistic revision checks.

The gap is event richness and coverage. Production paths call `recordResolution` for successful human or automatic reuse; the pure trust function supports failure and edit penalties, but failure/challenge is not a comparable first-class persisted workflow with evidence, actor, scope, and follow-up decision. Trust decay, revalidation scheduling, and automated retirement/supersession are absent.

**Score: 3/5.**

## 9. Current Data Model Map

| Model or type | Role in memory system | Evidence of current use | Boundary |
| --- | --- | --- | --- |
| `Organization` | Tenant and authority boundary | `prisma/schema.prisma`; organization-scoped relations throughout persistence | Strong tenant boundary; not a memory object itself |
| `TicketRecord` / `TicketMessage` | Support work and reusable source context | `ticketWorkflow.ts`, `processTicket.ts` | Support-shaped source |
| `TicketResolutionEvidence` | Durable proof that a ticket resolution was verified | `ticketWorkflow.ts::requireResolutionEvidence`, schema, evidence APIs | Only Support resolution evidence |
| `KnowledgeCandidate` | Proposed learning before approval | schema; `reflectionCommands.ts` | Candidate content is JSON and Support-originated |
| `KnowledgeItem` | Current reusable organizational knowledge | schema; `loadKnowledge`; `retrieveMemory` | Core fields and provenance are ticket-oriented |
| `Lesson` / `KnowledgeVersion` | Reusable explanation and versioned knowledge | `types/knowledge.ts`, Reflection code | Richer semantic structure is in JSON/type projections |
| `ValidationRecord` | Human decision and rationale | schema; validation commit route | One candidate validation uniqueness boundary |
| `MemoryChangeRecord` | Append-like before/after mutation history | schema; atomic commit | Captures changes, not a generalized evidence graph |
| `TrustEvidence` | Idempotent trust event claim | schema; `commitValidation` | Narrow event types: promotion and human reuse |
| `PreparedReflection` | Durable async Reflection awaiting promotion | schema; `reflection.generate` job | Does not mutate trusted memory by itself |
| `DurableJob` / attempts | Retryable background work | job registry/repository/worker | Operational substrate, not memory semantics |
| `ExternalWorkSignal` / connector models | Inbound external work normalization | generic signed webhook adapter and connector service | External object is currently fixed to ticket semantics |

## 10. Evidence Model

The current model has a real evidence gate: `TicketResolutionEvidence` stores type, actor, note, timestamp, optional source message, and idempotency key; evidence is organization- and ticket-scoped. Supported types are customer confirmation, agent verification, and manually verified resolution. Resolution and validation re-check the evidence server-side.

This is sufficient to prevent an unresolved Support case from becoming approved memory. It is not yet a generalized evidence model. There is no domain-neutral `Evidence` or `SourceEvent` aggregate that owns capture context, integrity, source-system identity, evidence state, and links to multiple work or knowledge artifacts. `KnowledgeItem` does not directly carry evidence IDs; it carries ticket-level provenance and related history.

**Assessment:** PARTIALLY_IMPLEMENTED for Canon-level Organizational Memory; CURRENTLY_IMPLEMENTED for the Support resolution-evidence gate.

## 11. Reflection Lifecycle

The implemented lifecycle is:

1. A resolved or reviewable Support case provides context.
2. `reflection.generate` creates a deterministic Reflection decision.
3. `reflectionSafety` rejects customer-specific identities, secrets, dates, ticket IDs, copied customer text, and unsafe workarounds.
4. A `PreparedReflection` is persisted with `promotionRequired: true`.
5. A human reviews the candidate and reusable projection.
6. Promotion commits `KnowledgeCandidate`, `ValidationRecord`, `MemoryChangeRecord`, `TrustEvidence`, and the revised `KnowledgeItem` atomically.
7. The next compatible ticket can retrieve and reuse the resulting memory.

This separation is a strong Canon alignment. Reflection is not allowed to directly mutate trusted memory. The missing lifecycle states are challenge, revalidation, scoped exception, supersession, retirement, and invalidation.

## 12. Validation & Promotion

Validation is durable, actor-bearing, rationale-bearing, organization-scoped, and server-authorized. The validation API runs under the authenticated actor and permission scope. `commitValidation` checks candidate and source references, requires resolved source tickets with durable evidence, enforces idempotency and unique validation/memory-change records, and uses a transaction for the aggregate mutation.

Promotion is therefore more than a UI flag: it creates inspectable records and advances a server revision. Stale revisions produce a conflict rather than silently overwriting another change. This is a currently implemented governance boundary.

## 13. Trust Model

The trust model is deterministic and inspectable:

- Initial trust: 20.
- Human reuse: +5.
- Automatic success: +3.
- Human edit: -2.
- Wrong answer: -10.
- Automatic response threshold: 80, subject to validation and risk rules.
- Recommendation threshold: 40.

The model maintains counters, success rate, last use/validation, human/automatic counts, and automatic eligibility. The server adds trust evidence only once for the relevant organization/item/source/event combination. This is a useful first reliability model, but the numeric score is not a substitute for an explicit outcome/event history. Negative outcome capture, decay, challenge, and revalidation need durable semantics before trust can be considered domain-neutral.

## 14. Reuse & Outcome Learning

Successful reuse is productized: the UI ensures a reuse ticket has resolution evidence, resolves it, invokes `recordResolution(... success: true)`, creates a `trust_update_only` candidate, and commits the resulting validation, memory change, and trust evidence. Automatic reuse has a corresponding mode and threshold gate.

The trust engine supports `success: false` and required edits as pure-domain inputs, and developer-demo simulation exercises wrong and edited outcomes. However, the production workflow does not expose a generalized durable “this memory worked, required correction, or was wrong” event independent of a ticket-resolution path. Merge/version Reflection actions also need an explicit policy for how reuse outcomes affect trust beyond the narrow `trust_update_only` action.

**Assessment:** PARTIALLY_IMPLEMENTED.

## 15. Retrieval Architecture

Retrieval is deterministic, bounded, and explainable:

- Tokenization and stop-word filtering.
- Category, tag, keyword, concept, canonical phrase, and specificity scoring.
- Domain facet compatibility and hard conflict vetoes.
- Stable deterministic ordering and item de-duplication.
- No reuse boost that could outrank canonical specificity.
- Drafting gates requiring compatible, grounded evidence.
- Optional AI discrimination only for deterministic unknowns and only with strong lesson evidence.

This is enough to demonstrate that Organizational Memory can improve repeated Support work without a vector database. It is not designed for millions of heterogeneous memories or open-ended cross-domain retrieval; current reads load knowledge and iterate in application memory.

## 16. Provenance

Current provenance can answer the principal Support questions: what ticket originated the knowledge, which tickets contributed, who validated it, when, with what rationale and scope, and what before/after change was recorded. `withStableValidationProvenance` preserves historical origin when supporting tickets are added.

The limitation is granularity. Provenance is primarily `sourceTicketId`, contributing ticket IDs, lesson source IDs, validation IDs, and memory-change IDs. The KnowledgeItem does not directly link to a generalized set of immutable evidence IDs. This prevents a clean, source-agnostic explanation of a memory supported by multiple heterogeneous observations.

## 17. Memory Lifecycle

Implemented lifecycle states include `KnowledgeItem` active/candidate/deprecated, `KnowledgeCandidate` proposed/validated/rejected, and `EmergingPattern` monitoring/suggested/promoted/dismissed. Knowledge versions and memory changes preserve evolution history.

Not implemented as first-class governed memory transitions are challenged, scoped exception, stale, superseded, retired, invalidated, and revalidated. These are not required for the first Support demo, but at least challenge/scope/revalidation is required for a credible V2 because a Company Brain must be able to narrow or question a memory without deleting history.

## 18. Human Governance

Human governance is a strong current capability. Human validation is explicit, actor- and rationale-bearing, server-authorized, evidence-gated, and transactionally committed. AI output is advisory and cannot directly mutate trusted memory. Automatic resolution is threshold- and validation-gated and remains bounded by policy/risk checks.

The remaining governance decision is not whether humans approve promotion; that boundary exists. It is how humans govern later disagreement: who can challenge a memory, how scope is narrowed, how revalidation is requested, and how conflicting evidence is represented.

## 19. AI Boundary

The AI boundary is aligned with Canon. AI may assist with classification, canonical understanding, enrichment, discrimination, and drafting. Deterministic gates own business relevance, compatibility, evidence requirements, validation, promotion, trust, and durable mutation. Semantic compatibility fails closed when provider calls fail or confidence/evidence is insufficient.

No evidence was found that an AI provider directly owns memory persistence or can bypass validation. This boundary should be preserved in V2.

## 20. Cross-System Readiness

The repository has a real connector seam: installation and encrypted credentials, HMAC/timestamp/replay protection, inbound-event identity, normalized signals, mapping, durable connector jobs, retries, and organization scoping. The currently implemented adapter is `generic.signed_webhook`, and `ExternalWorkSignal` is normalized as a ticket with `ticket.created`/`ticket.updated` events.

This is adequate for a first integration test but not evidence of a domain-neutral memory network. Zendesk, Jira, Slack, documents, and operational systems would require adapters and a generalized source/event/evidence contract. Broad connector coverage is not part of the smallest V2 proof.

## 21. Scale Readiness

The persistence shape has useful foundations: organization and lookup indexes, bounded ticket pagination, durable jobs with leases/retries/idempotency, and server-side revision conflicts. The developer seed also exercises synthetic volume, but it is not a production capacity test.

The main scale limitation is application-side whole-organization loading for knowledge, candidates, validations, memory changes, patterns, logs, and some ticket paths. Retrieval is O(number of loaded knowledge items) and there is no vector/indexed semantic retrieval. No load test or proven capacity target was found.

**Assessment:** structurally usable for a bounded prototype; production capacity is UNKNOWN and would require measurement before a scale claim.

## 22. Support-Specific Coupling

Support-specific coupling is visible in four places:

1. `KnowledgeItem` provenance centers on `sourceTicketId`.
2. Resolution evidence is owned by `TicketRecord` and uses Support-specific evidence types.
3. Reuse outcomes are attached to a resolved reuse ticket and persisted through ticket workflow commands.
4. The generic connector normalizes external objects as tickets.

This is not a reason to discard the Support beachhead. It means the next architectural move should introduce neutral primitives underneath the existing Support adapter, preserving the current product path while making the seams reusable.

## 23. Capability Classification Matrix

| Capability | Status | Evidence | Canon Question | Current Limitation | Required for V2? | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Durable organization-scoped memory persistence | CURRENTLY_IMPLEMENTED | `schema.prisma`; `persistenceService.ts` | Remember | Core item shape is Support-oriented | Preserve | P0 |
| Explicit server/local persistence authority | CURRENTLY_IMPLEMENTED | `lib/persistence/index.ts`, `session.ts`, server adapter | Remember / Trust | Local mode remains for dev/migration | Preserve | P0 |
| Organization isolation | CURRENTLY_IMPLEMENTED | Organization foreign keys and scoped queries | Trust | Must remain true for future source types | Preserve | P0 |
| Candidate-to-validation pipeline | CURRENTLY_IMPLEMENTED | `KnowledgeCandidate`, `ValidationRecord`, validation route | Evolve / Trust | Candidate content is partly JSON | Preserve | P0 |
| Evidence-gated resolution and promotion | CURRENTLY_IMPLEMENTED | `TicketResolutionEvidence`; `requireResolutionEvidence` | Remember / Trust | Evidence is ticket-specific | Preserve | P0 |
| Atomic promotion and optimistic concurrency | CURRENTLY_IMPLEMENTED | `commitValidation`; revision checks | Evolve / Trust | Generalized aggregates still needed | Preserve | P0 |
| Ticket-level provenance | PARTIALLY_IMPLEMENTED | `KnowledgeProvenance`, `sourceTicketId`, stable provenance helper | Remember / Trust | No direct generalized evidence-ID set | Yes, generalize | P0 |
| Domain-neutral source/evidence primitive | MISSING_REQUIRED | No generalized `Evidence`/`SourceEvent` model found | Remember / Trust | Heterogeneous work must look like a ticket | Yes | P0 |
| Deterministic explainable retrieval | CURRENTLY_IMPLEMENTED | `lib/memory.ts`, `explainability.ts` | Retrieve | Loads bounded knowledge in application memory | Preserve | P0 |
| Compatibility and contradiction gates | PARTIALLY_IMPLEMENTED | `retrievalCompatibility.ts`, `drafting.ts` | Retrieve / Trust | Strong for known Support facets, not generalized challenge semantics | Yes, minimally | P1 |
| General semantic/vector retrieval | DESIGNED_NOT_IMPLEMENTED | Future architecture references; no vector dependency/index | Retrieve | No embeddings, vector store, or hybrid ranker | No for smallest V2 | P2 |
| Reflection prepare/validate/promote lifecycle | CURRENTLY_IMPLEMENTED | `reflectionCommands.ts`, prepared-reflection job | Evolve | Support-originated | Preserve | P0 |
| Reuse counters and success-rate fields | PARTIALLY_IMPLEMENTED | `KnowledgeItem`; `trustEngine.ts` | Trust | Scalars do not replace event history | Yes, retain as projections | P1 |
| Explicit reusable outcome event | MISSING_REQUIRED | No domain-neutral persisted outcome aggregate found | Evolve / Trust | Production path is success-oriented and ticket-bound | Yes | P0 |
| Deterministic trust score and threshold policy | PARTIALLY_IMPLEMENTED | `trustEngine.ts` | Trust | Narrow event coverage; no decay/revalidation | Yes, generalize events | P1 |
| Idempotent trust evidence for promotion/reuse | CURRENTLY_IMPLEMENTED | `TrustEvidence`; unique claims in commit | Trust | Event vocabulary is narrow | Preserve | P0 |
| Version and memory-change history | CURRENTLY_IMPLEMENTED | `KnowledgeVersion`, `MemoryChangeRecord` | Evolve | History is not a full evidence graph | Preserve | P0 |
| Challenge, scope exception, and revalidation transition | MISSING_REQUIRED | No corresponding durable lifecycle command/state found | Evolve / Trust | Cannot govern later disagreement cleanly | Yes | P0 |
| Supersession, retirement, staleness, invalidation automation | MISSING_LATER | No complete transition/workflow found | Evolve / Trust | Important at maturity, not first proof | No | P3 |
| AI advisory boundary and fail-closed semantic fallback | CURRENTLY_IMPLEMENTED | `semanticCompatibility.ts`, drafting/explainability gates | Retrieve / Trust | AI remains bounded and advisory | Preserve | P0 |
| Human review authority and audit trail | CURRENTLY_IMPLEMENTED | validation actor/rationale; governed commit route | Trust | Later challenge authority not yet specified | Preserve | P0 |
| Generic signed-webhook intake | PARTIALLY_IMPLEMENTED | connector service and adapter | Remember | Normalizes only ticket-shaped work | Use as adapter | P1 |
| Domain-neutral source adapter contract | PARTIALLY_IMPLEMENTED | `ExternalWorkSignal` and connector boundary | Remember | `externalObjectType` is fixed to ticket | Yes, minimally | P1 |
| Durable background jobs | CURRENTLY_IMPLEMENTED | job registry, leases, retry, idempotency | Evolve | Worker is not memory semantics | Preserve | P1 |
| Migration/export/import durability | CURRENTLY_IMPLEMENTED | migration services and resource models | Remember / Trust | Not a substitute for source evidence | Preserve | P2 |
| Bounded pagination and indexed persistence | PARTIALLY_IMPLEMENTED | ticket page size/indexes | Remember / Retrieve | Several whole-org reads remain | Measure and improve | P1 |
| Proven capacity at larger scale | UNKNOWN | No load-test evidence found | Retrieve / Trust | Capacity and latency thresholds are unproven | No claim yet | P2 |
| Knowledge graph and broad typed relationships | MISSING_LATER | Architecture docs describe future relationship ownership | Evolve / Retrieve | No implemented graph subsystem | No | P3 |
| Autonomous memory mutation | NOT_REQUIRED | Canon requires governed mutation | Evolve / Trust | Would violate current boundary | No | P3 |
| General company chat interface | NOT_REQUIRED | Not required by Canon questions | Retrieve | Would obscure evidence and governance proof | No | P3 |
| Broad connector ecosystem | MISSING_LATER | Only generic signed webhook is implemented | Remember | Adapter expansion before core proof is premature | No | P3 |

**Classification counts:** `CURRENTLY_IMPLEMENTED` 14; `PARTIALLY_IMPLEMENTED` 7; `DESIGNED_NOT_IMPLEMENTED` 1; `MISSING_REQUIRED` 3; `MISSING_LATER` 3; `NOT_REQUIRED` 2; `UNKNOWN` 1.

## 24. Hypothesis Results

| Hypothesis | Result | Finding |
| --- | --- | --- |
| H1 — The current OIP already contains a real persistent Organizational Memory loop in the Support beachhead | SUPPORTED | Durable memory, evidence-gated resolution, Reflection, validation, promotion, reuse, and trust paths are implemented |
| H2 — The largest V2 gap is generalization and lifecycle depth, not raw persistence | SUPPORTED | Persistence and governance exist; source/evidence/outcome/challenge semantics are the missing center |
| H3 — Deterministic retrieval is sufficient to prove the first Company Brain thesis | SUPPORTED | Current retrieval is explainable and compatibility-gated; vector search is not needed for the first proof |
| H4 — Evidence/provenance and outcome events are higher-value next work than broad connectors | SUPPORTED | Existing Support loop exposes precisely those seams; connectors currently terminate in ticket-shaped intake |
| H5 — The current trust model is already a complete organizational reliability model | PARTIAL | It is useful and deterministic for Support, but event vocabulary, failure capture, challenge, and revalidation are incomplete |
| H6 — Customer Support can remain the first harness while the memory core is generalized underneath it | SUPPORTED | Existing Support workflow is a functioning vertical slice and can adapt to neutral primitives |

## 25. Commodity Capability Check

| Commodity capability | Decision | Reason |
| --- | --- | --- |
| Generic company chat | DEFER | Does not prove Remember/Retrieve/Evolve/Trust and risks hiding provenance |
| Enterprise search | DEFER | Search breadth is not governed organizational memory |
| Vector database | DEFER | Deterministic retrieval is sufficient for the first proof; no measured ceiling yet |
| General-purpose RAG | DEFER | Adds retrieval machinery before evidence and outcomes are generalized |
| Arbitrary document ingestion | DEFER | Not needed for the Support learning loop |
| Slack/Notion search | DEFER | Connector breadth is later than neutral source/evidence semantics |
| Zendesk replacement | NOT_REQUIRED | Support is a beachhead, not the product category |
| Notion replacement | NOT_REQUIRED | The product is governed memory, not a document editor |
| Autonomous agent framework | NOT_REQUIRED | AI must remain advisory and memory mutation governed |
| MCP/platform integration surface | DEFER | Integration breadth is not the minimal V2 proof |
| Knowledge-graph visualization | DEFER | Relationships may be useful later; no evidence it is required now |

## 26. Minimum Missing Pieces

Exactly three smallest missing pieces are required for the smallest credible V2:

1. **Domain-neutral Source/Evidence primitive.** Add a durable, organization-scoped source/event/evidence reference with immutable identity, source type, capture context, actor/time, integrity/state, and links that can adapt the existing Support resolution evidence without breaking it.
2. **Explicit reusable Outcome event.** Record a memory reuse outcome independently of scalar counters: memory/version, source work, actor/mode, evidence, success/correction/failure classification, required edits, and resulting trust decision. Start with human-verified success and correction/failure.
3. **Human-governed challenge/scope/revalidation transition.** Let a steward challenge or narrow a memory, preserve the prior state and evidence, require a review decision, and either revalidate, version, scope, or deprecate it without silent deletion.

These are the minimum because they close the Remember → Retrieve → Evolve → Trust loop at the abstraction level required by the Canon. Vector search, broad connectors, a knowledge graph, and autonomous action are not part of this minimum.

## 27. P0 / P1 / P2 / P3 Priorities

| Priority | Scope | Outcome |
| --- | --- | --- |
| P0 | The three minimum missing pieces; preserve tenant isolation, validation, atomic commit, explainability, and AI boundary | A domain-neutral but Support-proven Organizational Memory loop |
| P1 | Adapt Support evidence into the neutral primitive; persist outcome events; add targeted challenge/revalidation UI and APIs; measure the existing retrieval/reuse loop | A credible V2 prototype with inspectable reliability evolution |
| P2 | Pagination/indexing improvements, measured retrieval ceilings, one carefully chosen second source adapter, and only then a tested semantic retrieval experiment | Evidence-led scale and generalization decisions |
| P3 | Broad connector ecosystem, vector/RAG productionization, graph subsystem, automated retirement/decay, ecosystem memory, and autonomous action | Later platform maturity, not the first Company Brain proof |

## 28. Smallest Credible V2 Prototype

The smallest credible prototype keeps the current Support vertical slice and adds only the three neutral primitives from Section 26.

**Scenario:** a recurring customer issue is resolved with durable resolution evidence; Reflection proposes a reusable lesson; a human approves it; a later compatible ticket retrieves the lesson with an explanation; the agent or human records whether the reuse worked, needed correction, or was wrong; trust and history update through a durable outcome event; a steward can challenge or narrow the lesson when later evidence conflicts.

**Keep unchanged as the proof foundation:** PostgreSQL/Prisma organization persistence, `KnowledgeItem`/candidate/lesson/validation/memory-change/trust structures, deterministic retrieval and compatibility gates, explainability, evidence-gated workflow, human promotion, durable jobs, optimistic concurrency, and AI advisory boundaries.

**Generalize underneath Support:** source/evidence identity, provenance links, reuse outcome events, and governed challenge/revalidation. The Support ticket remains the first adapter and user-visible workflow.

Success is demonstrated by a replayable two- or three-case sequence whose evidence, validation, reuse outcome, trust change, and challenge/revalidation history can be inspected end to end.

## 29. Recommended Implementation Sequence

This is a recommendation only; no implementation was performed in this audit.

1. Define the neutral source/evidence contract and adapt existing `TicketResolutionEvidence` into it without removing the Support path.
2. Add the durable reuse/outcome event and make existing success/reuse counters projections of recorded events where practical.
3. Add the human-governed challenge/scope/revalidation transition and its history/explainability view.
4. Replay the current Support acceptance/reuse scenarios, including successful reuse, correction, failure, stale revision, and challenge outcomes.
5. Measure deterministic retrieval and persistence behavior at realistic organization sizes before selecting semantic/vector technology.
6. Add one second source adapter only after the neutral primitives are proven; keep Customer Support as the first harness.

## 30. What NOT to Build Yet

Do not build these for the smallest V2 proof:

1. A vector database or general-purpose RAG stack.
2. A broad Zendesk/Jira/Slack/Notion connector ecosystem.
3. A knowledge graph or large relationship visualization subsystem.
4. An autonomous agent that can mutate memory or bypass human governance.
5. A generic company chat/document replacement surface.

The existing deterministic retrieval and Support workflow are sufficient to test whether governed memory improves repeated work. The next investment should make evidence, outcomes, and disagreement durable and inspectable.

## 31. Risks

- Ticket-shaped provenance may force future domains through an artificial Support model.
- `KnowledgeItem.content` and related JSON projections may become difficult to query or migrate as generalized evidence and lifecycle state grow.
- Whole-organization loads and application-side retrieval create an unmeasured scale ceiling.
- Trust deltas and counters can look authoritative without a complete durable outcome event history.
- The production failure/challenge path is less complete than the pure trust function and developer simulator suggest.
- Merge/version Reflection actions need an explicit trust/outcome policy for generalized reuse.
- Connector normalization may create false confidence that source-agnostic ingestion is already solved.
- A premature vector or connector program could expand surface area without improving the core Canon loop.

## 32. Open Questions

1. What exact source types should the first neutral Source/Evidence primitive support besides Support tickets: incidents, policies, internal decisions, or operational changes?
2. Should a correction/failure outcome require a new validation record, a challenge record, or both?
3. Who can challenge memory, and how are scope exceptions represented for organization, domain, product version, geography, or role?
4. Should `merge_existing` and `create_version` emit the same reusable outcome event as `trust_update_only`?
5. What retention, redaction, and immutability rules apply to evidence linked from reusable memory?
6. What latency, knowledge-count, and concurrent-writer targets must be proven before retrieval or persistence is redesigned?
7. Is the first second source adapter better chosen as a generic operational event, a policy/document source, or a second ticket system?

These questions do not block the baseline; they define the product and governance decisions needed before implementation.

## 33. Repository Mutation Verification

After report creation, the expected mutation is exactly one new file:

`docs/audits/OIP-V2-AUDIT-001-organizational-memory-capability-baseline.md`

The audit did not stage, commit, push, tag, deploy, publish, or modify product/runtime/schema/API/tests/prompts/UI/routes. The final branch and HEAD were checked against the safety gate. Any other pre-existing dirty files remain attributable to the starting worktree, not this audit.

## 34. Final Verdict

**Direct answers:**

1. **Does current OIP already have persistent Organizational Memory?** Yes, as a durable, governed, Support-focused implementation; not yet as a domain-neutral Company Brain.
2. **Can it Remember?** Yes: organization-scoped knowledge, provenance, validation, evidence, versions, and memory changes are durable.
3. **Can it Retrieve?** Yes: deterministic, compatibility-aware, explainable retrieval works for the bounded Support corpus; vector retrieval is not implemented.
4. **Can it Evolve?** Yes: Reflection, candidate creation, human validation, promotion, versioning, and history are implemented; challenge/revalidation is missing.
5. **Can it Trust?** Yes: validation, trust evidence, counters, thresholds, and idempotent reuse exist; failure/challenge/decay semantics are partial.
6. **What are the exactly three smallest missing pieces?** Neutral Source/Evidence; explicit reusable Outcome events; human-governed challenge/scope/revalidation.
7. **What is the smallest credible V2?** Keep the Support vertical slice and generalize only those three primitives underneath it, then prove a replayable evidence-backed reuse and challenge loop.

**Scores:** Remember 4/5; Retrieve 3/5; Evolve 3/5; Trust 3/5.  
**OVERALL_V2_READINESS: 3/5**

**OIP_V2_AUDIT_001_BASELINE_MAPPED_AND_MINIMAL_GAPS_IDENTIFIED**
