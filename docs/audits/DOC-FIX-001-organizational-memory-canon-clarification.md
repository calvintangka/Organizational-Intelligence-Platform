# DOC-FIX-001 — Organizational Memory Canon Clarification Repair Report

**Status:** Authorized Documentation Repair

**Date:** 2026-08-24

**Scope:** Canon and primary product documentation only. No product, runtime, schema, API, prompt, test, security, or behavior changes.

## 1. Executive Summary

The authorized clarification is complete at the Canon and primary Canon-facing documentation layer. OIP remains the **Organizational Intelligence Platform**. Organizational Memory is now stated as the durable, evidence-backed organizational substrate; Organizational Intelligence remains the broader capability and product/category outcome enabled by retrieving, evaluating, evolving, reusing, reasoning over, and safely applying that memory. “Company Brain” is explicitly limited to an explanatory metaphor for the long-term vision.

The Canon now makes the north star and the four foundational questions—Remember, Retrieve, Evolve, and Trust—legible without claiming unlimited ingestion, universal truth, semantic/vector retrieval, autonomous trusted-memory mutation, or a complete Company Brain today. Customer Support remains the current proving beachhead. Existing human-review, evidence, provenance, Reflection, retrieval/trust, concurrency, protected-case, and AI-advisory boundaries remain intact.

## 2. Authorized Product Decision

The operator decision was:

`CANON CLARIFICATION — NOT A CANON MAJOR REDEFINITION`

The product name remains `Organizational Intelligence Platform`. Organizational Memory is a foundational capability/substrate, not the replacement product category. Organizational Intelligence is the broader outcome/category. The long-term direction is organizational learning that remains durable and reusable, but the current product scope remains the bounded Customer Support learning loop.

## 3. Repository State Before

Safety-gate observations before this repair:

- Branch: `landing/option-c32-release-polish`
- Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Pre-existing modified file: `docs/TODO-080-REPORT.md`
- Pre-existing untracked audit: `docs/audits/DOC-AUDIT-001-organizational-memory-documentation-impact.md`
- Pre-existing untracked reports: the NC-FIX-012R, NC-FIX-012R2, NC-FIX-012R3, NC-FIX-014R, NC-FIX-016R, REL-RC-003, and REL-RELEASE-META-002 files under `docs/reports/`

The Canon files were already present as tracked working-tree modifications from this task when the report was prepared; no reset, clean, stash, checkout, restore, or discard operation was used.

## 4. Canon Governance Assessment

`docs/canon/CANON_GOVERNANCE.md` was inspected before Canon editing. It permits Patch changes that clarify wording without changing conceptual meaning, while classifying redefinition of Organizational Memory or Organizational Intelligence, removal of human review, and direct reasoning-driven memory mutation as Major changes.

The authorized decision fits a Patch. Canon governance was updated from `v1.0.0` to `v1.0.1` and its version history records the clarification. The patch preserves the `v1.0.0` foundation and does not rename OIP, redefine core concepts, add a required capability, broaden current implementation scope, or weaken a safety boundary. Downstream documents that still declare Canon `v1.0.0` remain compatible under the governance policy’s patch-compatibility rule; propagating all metadata is a separate, nonblocking documentation follow-up.

**Governance result:** permitted; no Canon governance conflict.

## 5. Files Inspected

### Canon and main Canon-facing layer

- `docs/canon/CANON_GOVERNANCE.md`
- `docs/canon/README.md`
- `docs/canon/00_FOUNDERS_THESIS.md`
- `docs/canon/01_PRODUCT_VISION.md`
- `docs/canon/02_PRODUCT_PROBLEM.md`
- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`
- `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`
- `docs/canon/06_AI_COGNITIVE_MODEL.md`
- `docs/product/00_PRODUCT_PHILOSOPHY.md`
- `docs/product/01_PRODUCT_STRATEGY.md`
- `docs/product/02_PRODUCT_REQUIREMENTS.md`
- `docs/product/09_MVP_FEATURES.md`
- `docs/ARCHITECTURE_BASELINE.md`

### Current implementation and safety evidence

- `prisma/schema.prisma` and current PostgreSQL/Prisma persistence paths
- `app/api/organizations/[organizationId]/tickets/[ticketId]/evidence/route.ts`
- `lib/server/tickets/ticketWorkflow.ts`
- `lib/knowledgeProvenance.ts`
- `lib/explainability.ts`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/implementation/12_MVP_SCOPE.md`
- `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md`
- `docs/implementation/18_SECURITY_ARCHITECTURE.md`
- current NC-FIX reports identified by DOC-AUDIT-001

### Historical material

The completed DOC-AUDIT-001 report, acceptance/certification material, NC-FIX reports, release reports, changelog entries, and other historical records were inspected for preservation and were not edited.

## 6. Files Modified

The task modified these Canon-facing files and created the authorized repair report:

1. `docs/canon/CANON_GOVERNANCE.md`
2. `docs/canon/README.md`
3. `docs/canon/01_PRODUCT_VISION.md`
4. `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`
5. `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`
6. `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`
7. `docs/canon/06_AI_COGNITIVE_MODEL.md`
8. `docs/audits/DOC-FIX-001-organizational-memory-canon-clarification.md`

`docs/canon/00_FOUNDERS_THESIS.md`, `docs/canon/02_PRODUCT_PROBLEM.md`, the product-definition documents, `docs/ARCHITECTURE_BASELINE.md`, and secondary implementation documents were preserved because their wording was compatible or their remaining issues did not block this clarification.

### Required evidence per modified file

| File | Heading/section changed | Previous conceptual problem | New treatment and why required | Status classification | Safety implications and evidence |
| --- | --- | --- | --- | --- | --- |
| `docs/canon/CANON_GOVERNANCE.md` | Current Canon Version; version history | The approved clarification had no recorded patch identity. | Records `v1.0.1` as a patch clarification and explicitly preserves `v1.0.0` meaning. | Current governance metadata. | Confirms no redefinition or trust-boundary change; evidence: governance policy and its Patch/Major rules. |
| `docs/canon/README.md` | Current Canon Version | Index did not expose the clarified Canon version or boundary. | Identifies `v1.0.1` and states that it does not rename OIP or claim universal knowledge. | Current Canon index. | Keeps Canon terminology authoritative; evidence: `CANON_GOVERNANCE.md`. |
| `docs/canon/01_PRODUCT_VISION.md` | Organizational Memory, Organizational Intelligence, and the Company Brain; Four Foundational Questions; AI Should Help the Organization Preserve and Apply Memory; An AI Support Brain | The relationship, north star, four questions, and Support Brain metaphor were not explicit enough, creating room for overclaiming. | Defines the substrate/outcome/metaphor relationship, labels current versus long-term behavior, and preserves AI and human authority boundaries. | `CURRENT_IMPLEMENTED` for bounded persistence/retrieval/learning/trust rows; `CURRENT_DESIGNED`/`PLANNED` and `NORTH_STAR` for broader directions. | Explicitly says retrieval is not truth, AI generation is not approval, and trusted memory is not autonomous; evidence: current persistence, retrieval, reflection, validation, and trust implementation. |
| `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` | Organizational Memory and Organizational Intelligence; Capability status boundary | Enduring capabilities could be read as current feature claims, and the Memory/Intelligence relationship was implicit. | Adds the relationship and a controlled status vocabulary with examples of capabilities that are not current without evidence. | Enduring model with `CURRENT_IMPLEMENTED`, `CURRENT_DESIGNED`, `PLANNED`, and `NORTH_STAR` distinctions. | Preserves Human Validation, Provenance, Evidence, Reflection, retrieval/trust separation, and Governance; evidence: capability model plus current implementation/audit findings. |
| `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` | Terminology boundary: Memory, Intelligence, and Company Brain; Core Concept: Organizational Memory | Memory was described as connected knowledge but not explicitly bounded by evidence and completeness limits. | Makes Memory evidence-backed and governed, defines Intelligence as the enabled outcome, and keeps Company Brain outside the formal domain model. | Current domain concepts plus long-term metaphor boundary. | States memory is not automatically complete, current, or correct; evidence: domain lifecycle, Validation, Provenance, and Governance concepts. |
| `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` | Current and long-term boundary; Workflow States; transition meaning | The full conceptual workflow could be mistaken for complete runtime behavior, and the resolution-evidence gate was not stated in the Canon workflow. | Labels the current Support loop, distinguishes conceptual states from implementation, and states the resolution-evidence/Reflection/validation boundary. | `CURRENT_IMPLEMENTED` for bounded Support flow; broader states and intake doors are `CURRENT_DESIGNED`, `PLANNED`, or `NORTH_STAR`. | Reflection prepares learning and does not grant trust or mutate trusted memory; evidence: ticket evidence route, ticket workflow, reflection/promotion reports. |
| `docs/canon/06_AI_COGNITIVE_MODEL.md` | Cognitive Philosophy; Retrieval; AI cognitive component advisory role | AI/Memory/Intelligence relationship and the current retrieval mechanism were not explicit enough. | Defines the relationship, documents bounded deterministic retrieval, and preserves AI advisory limits. | `CURRENT_IMPLEMENTED` for deterministic retrieval/grounding; semantic/vector/RAG is `CURRENT_DESIGNED`/future unless later evidence changes status. | Requires inspection of Validation, Provenance, applicability, freshness, conflict, and authority; evidence: `docs/ARCHITECTURE_BASELINE.md`, `lib/explainability.ts`, and current retrieval services. |
| `docs/audits/DOC-FIX-001-organizational-memory-canon-clarification.md` | Sections 1–23 of this report | Required evidence and verification had not yet been recorded for the repair. | Captures the authorized decision, exact changes, status classifications, safety evidence, remaining contradictions, and repository verification. | Current repair record. | No product authority is introduced; evidence: repository diff, status, Canon governance, implementation inspection, and historical preservation checks. |

## 7. Organizational Memory Definition

Organizational Memory is the durable organizational substrate for preserving evidence-backed learning over time, with supporting context such as Sources, Evidence, Lessons, Validation, Provenance, reuse history, outcomes, trust/reliability signals, lifecycle state, and relevant relationships where implemented or explicitly designed.

It is not every byte of company data, unrestricted enterprise ingestion, a claim that OIP knows everything, a correctness guarantee, automatic trust, or autonomous mutation of trusted knowledge. Stored information is not automatically validated organizational learning.

## 8. Organizational Intelligence Definition

Organizational Intelligence is the broader capability and product/category outcome enabled when Organizational Memory can be retrieved, evaluated, updated, reused, compared with new Evidence, reasoned over, and safely applied to future work. OIP remains the Organizational Intelligence Platform; Memory is its durable foundation, not a product rename.

## 9. Company Brain Terminology Treatment

“Company Brain” is used only as an accessible explanatory metaphor for the long-term vision. It is not the formal product name, a Domain concept, a replacement for Organizational Intelligence, or a claim that the MVP is a complete autonomous company brain. Canon, architecture, and governance documents continue to use Organizational Memory and Organizational Intelligence as the authoritative terms.

## 10. North-Star Clarification

The clarified north star is:

> The company should never have to forget what it has genuinely learned.

The surrounding Canon text bounds this as persistent, inspectable, evidence-backed learning that remains useful as outcomes and evidence change. It does not mean that OIP stores everything, knows everything, never returns an incorrect result, or continuously updates all knowledge without human oversight.

## 11. Four Foundational Questions Alignment

| Question | Current truth | Future/design boundary |
| --- | --- | --- |
| Remember | `CURRENT_IMPLEMENTED`: organization-scoped PostgreSQL/Prisma persistence for Knowledge Items/Candidates, tickets and resolution Evidence, Validation, Trust Evidence, Memory Changes, Reflection state, and reuse/outcome signals. | No unlimited scale or universal enterprise ingestion is claimed. |
| Retrieve | `CURRENT_IMPLEMENTED`: deterministic lexical/category/canonical/lesson matching with grounding and explainability. | Semantic retrieval, embeddings, vector indexes, and generalized RAG remain `CURRENT_DESIGNED`/`PLANNED` unless later implementation evidence says otherwise. |
| Evolve | `CURRENT_IMPLEMENTED`: Reflection, candidate learning, Human Validation, governed promotion, reuse/outcomes, and auditable Memory Changes. | Richer challenge, stale, superseded, retired, invalidated, and revalidated behavior is `NORTH_STAR` or future design, not a blanket current claim. |
| Trust | `CURRENT_IMPLEMENTED`: Evidence, Source/Provenance, human review, validation, lifecycle, reuse/outcomes, and deterministic trust signals support inspectability. | Trust is not absolute correctness; future maturity may add stronger lifecycle and contradiction handling without bypassing governance. |

The Canon states the critical distinctions: retrieval is not truth, AI generation is not organizational approval, and trust comes from evidence and governed reuse rather than AI confidence alone.

## 12. Customer Support Beachhead Treatment

Customer Support remains the current proving ground and first beachhead. The current learning sequence is customer problem → investigation → response → resolution → resolution Evidence → Reflection → validated lesson → future reuse. The Canon describes this as the bounded current implementation rather than the permanent architectural boundary. Additional systems and domains remain long-term direction, not current commitments.

## 13. Current vs Future Capability Treatment

The updated Canon uses status labels only where a reader could otherwise mistake a conceptual capability for a current one:

- `CURRENT_IMPLEMENTED`: bounded organization-scoped persistence, deterministic retrieval, grounding/explainability, evidence, validation, Reflection preparation, governed promotion, reuse/outcomes, and auditable changes.
- `CURRENT_DESIGNED`: logical product or architecture concepts not necessarily complete in the running implementation.
- `PLANNED`: explicitly deferred additions such as additional intake doors or broader enterprise expansion.
- `NORTH_STAR`: long-term organizational-scale memory and capability across more domains and systems.

Semantic/vector retrieval, generalized RAG, unlimited ingestion, automatic trust decay, automatic supersession/retirement, broad autonomous action, and cross-domain production support are not described as current implementation.

## 14. Safety Invariant Verification

The clarification preserves all required safety conclusions:

- **Human review:** reusable-memory promotion and governed actions remain human-governed.
- **Resolution evidence:** durable resolution evidence remains the gate for Reflection and validation eligibility.
- **Provenance integrity:** source identity and provenance remain protected from silent replacement.
- **Reflection boundary:** Reflection prepares learning; it does not approve, grant trust, or directly mutate trusted memory.
- **Retrieval vs trust:** retrieval compatibility remains separate from validation, promotion, and trust.
- **Concurrency and atomicity:** optimistic concurrency and atomic validation/memory-change writes remain implementation safety properties.
- **Protected cases:** security-sensitive and protected cases remain fail-closed and human-governed.
- **AI authority:** AI remains advisory and cannot approve its own lesson, create trusted memory independently, bypass validation, or grant itself automation authority.

Evidence was checked against the implementation paths and documents listed in Section 5. No updated wording weakens any invariant.

## 15. Main Documentation Changes

The main product-definition layer was inspected. `docs/product/00_PRODUCT_PHILOSOPHY.md`, `docs/product/01_PRODUCT_STRATEGY.md`, `docs/product/02_PRODUCT_REQUIREMENTS.md`, and `docs/product/09_MVP_FEATURES.md` already described governed Organizational Memory, broader Organizational Intelligence, Customer Support as the beachhead, and human review. They were therefore preserved rather than broadly rewritten. `docs/ARCHITECTURE_BASELINE.md` already documents PostgreSQL/Prisma persistence, organization scope, deterministic retrieval, Reflection, and separation of retrieval from trust; it was also preserved.

The required clarification was made in the Canon layer because that is the conceptual source of truth. This avoids duplicating marketing language through every secondary document while still making the product relationship explicit at the authority boundary.

## 16. Canon Changes

The Canon changes are the seven files listed in Section 6. Together they:

1. identify the patch version and governance rationale;
2. define Memory as the durable foundation and Intelligence as the broader outcome;
3. bound Company Brain as a metaphor;
4. state the north-star principle without a perfect-memory or perfect-truth guarantee;
5. make Remember/Retrieve/Evolve/Trust explicit;
6. preserve Customer Support as the current beachhead;
7. label current versus designed/planned/north-star capabilities; and
8. restate human, evidence, provenance, Reflection, retrieval/trust, and AI-advisory boundaries.

## 17. Secondary Consistency Changes

No secondary product, architecture, implementation, API, storage, roadmap, or release document was modified. This was intentional and within scope. The inspected secondary documents either already supported the clarification or contained historical/implementation detail that did not block the Canon repair.

The remaining implementation-document inconsistencies are recorded as follow-ups rather than opportunistically repaired: `docs/implementation/12_MVP_SCOPE.md` still lists Production Database as outside its historical MVP scope, and `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md` still labels Local Storage as MVP/current-phase language. Those statements should be reconciled in a separate implementation-document update because the current repository implementation and `docs/ARCHITECTURE_BASELINE.md` document PostgreSQL/server persistence. They do not prevent this Canon clarification from being truthful because the Canon deliberately avoids asserting that every implementation-plan statement is current deployment scope.

## 18. Historical Preservation Verification

Historical records were preserved. No audit, acceptance report, certification report, NC-FIX report, release report, historical changelog entry, archived decision, or historical task report was edited. The pre-existing `DOC-AUDIT-001` report remains unmodified and untracked, as it was before this repair.

## 19. Remaining Documentation Contradictions

No blocking contradiction remains in the updated Canon or inspected primary product layer. Nonblocking documentation debt remains:

1. `docs/implementation/12_MVP_SCOPE.md` and `docs/implementation/13_IMPLEMENTATION_ARCHITECTURE.md` contain historical MVP/phase wording that does not fully reflect the current PostgreSQL/server persistence documented by the implementation and architecture baseline.
2. Many downstream documents still declare `Canon Version: v1.0.0`. This is compatible with `v1.0.1` under the governance Patch rule, but a later metadata propagation pass may update current nonhistorical documents to the latest patch version.
3. Historical and hackathon documents retain their original terminology and version metadata. This is intentional preservation, not a current-definition contradiction.

No remaining document was found to call OIP a formal Company Brain product, claim universal enterprise memory, or describe semantic/vector retrieval as current implementation in the updated primary Canon.

## 20. Open Product Questions

- When should a future implementation change semantic/vector retrieval from designed/planned to current, and what explainability and authority gates must accompany it?
- Which lifecycle transitions—stale, challenged, superseded, retired, invalidated, or revalidated—should become runtime behavior, and under whose authority?
- What additional domains and intake systems should follow the Customer Support beachhead after measurable reuse and trust outcomes are established?
- When should downstream current-document Canon metadata be propagated from `v1.0.0` to `v1.0.1` in a separate documentation pass?

These questions are not blockers for the authorized clarification.

## 21. Git Diff Summary

Starting HEAD and ending HEAD are both `084f9ab46d6555e793df8b73b1abb085267a2a05`; no commit was created. The task’s tracked-file diff is limited to seven Canon files. The task’s only new file is this authorized repair report. The pre-existing `docs/TODO-080-REPORT.md` modification and pre-existing untracked audit/report files remain separate and were not changed by this task.

No files under `app/`, `lib/`, `prisma/`, `scripts/`, or other product/runtime source paths were modified.

## 22. Repository State After

Post-repair verification showed:

- Branch remains `landing/option-c32-release-polish`.
- HEAD remains `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- The seven Canon files are modified by this task.
- `docs/audits/DOC-FIX-001-organizational-memory-canon-clarification.md` is newly created by this task.
- `docs/TODO-080-REPORT.md` remains a pre-existing modified file.
- `docs/audits/DOC-AUDIT-001-organizational-memory-documentation-impact.md` and the listed `docs/reports/` files remain pre-existing untracked files.
- No implementation, test, schema, API, prompt, or runtime file changed.

## 23. Final Verdict

`DOC_FIX_001_COMPLETED_WITH_FOLLOWUPS`

The core Canon clarification is complete and verified. Canon Governance permits it as Patch `v1.0.1`; OIP remains the Organizational Intelligence Platform; Organizational Memory is the durable evidence-backed foundation; Organizational Intelligence remains the broader capability/outcome; Company Brain is only a metaphor; the north star is bounded; Customer Support remains the current beachhead; current capabilities are not overstated; safety invariants remain intact; historical records remain preserved; no product/runtime code changed; and the required repair report was created.

The follow-up status reflects only the explicitly reported, nonblocking inconsistencies in older implementation-scope wording and downstream patch-version metadata. No further work is required to establish the authorized Canon clarification itself.
