# OIP-V2-AUDIT-002 — Single-Experience Memory Admission & Human Validation Authority

Priority: High  
Status: Authorized Audit  
Mode: Read-only audit; the only repository mutation authorized by the brief is this report.

## 1. Executive Summary

The intended principle is already implemented for the current domain-neutral Organizational Memory path:

> One organizational experience + source-linked evidence + authorized human validation can create active Organizational Memory.

The implementation does not require multiple occurrences, repeated incidents, prior reuse, a successful reuse outcome, pattern recurrence, a minimum trust score, or a fixed number of Evidence records beyond the structural requirement that at least one Evidence record exists before preparation/validation. Evidence sufficiency remains a human judgment supported by the stored Source, Evidence, candidate, rationale, and provenance.

The legacy Support path has an additional safety gate: each referenced Support ticket must be resolved and have durable resolution evidence. That is an evidence/workflow requirement, not a recurrence, reuse, outcome, pattern, trust, or confidence threshold.

## 2. Final Verdict

`OIP_V2_AUDIT_002_SINGLE_EXPERIENCE_MEMORY_ADMISSION_CONFIRMED`

Architectural assessment: `ALREADY_IMPLEMENTED`  
Implementation decision: `NO_IMPLEMENTATION_FIX_REQUIRED`

The current code separates admission from reliability evolution. Validation creates an active KnowledgeItem with initial reliability metadata (`trustScore: 20`, `timesReused: 0`, `autoResponseEligible: false`). Later reuse outcomes update reliability and counters. Retrieval and automation have their own gates and do not prevent the item from existing.

Non-blocking follow-ups are documentation clarification and a focused single-Evidence regression test. No implementation repair is required for the audited principle.

## 3. Repository State

Recorded before this report was created:

- Branch: `landing/option-c32-release-polish`
- HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Worktree: already dirty with 52 entries: 27 modified tracked paths and 25 untracked paths.
- The existing dirty set includes prior OIP memory code, migrations, probes, reports, Canon, implementation documentation, and UI changes. Those changes were treated as pre-existing and were not restored, staged, or rewritten.
- `CHANGELOG.md` is absent at the repository root; no equivalent changelog was found during the targeted review.
- `npx prisma migrate status`: 28 migrations found; database schema is up to date.
- `npx prisma validate`: passed.
- `git diff --check`: no whitespace errors; Git emitted only existing line-ending warnings for dirty files.

## 4. Intended Principle

The audit principle is not automatic trust. It is an eligibility rule:

```text
one experience
  -> Source
  -> sufficient Source-linked Evidence
  -> proposed learning
  -> authorized human validation
  -> active Organizational Memory
```

Reliability is a separate post-admission question:

```text
validated memory
  -> reuse and observed Outcomes
  -> trust/reliability and scope evolution
```

This preserves the safety boundary that AI preparation is advisory, human validation is explicit, and admission does not grant unrestricted automation authority.

## 5. Current Memory Admission Path

### Domain-neutral path

1. `POST /api/organizations/{organizationId}/memory/experiences` calls `createOrganizationalSource` (`app/api/organizations/[organizationId]/memory/experiences/route.ts:9-35`). It requires a bounded source kind, title, description, occurred timestamp, and idempotency key. The route derives actor identity from the authenticated session.
2. `POST .../experiences/{sourceId}/evidence` calls `addOrganizationalEvidence` (`app/api/organizations/[organizationId]/memory/experiences/[sourceId]/evidence/route.ts:10-27`). Evidence is linked to the selected Source and persisted immutably through `ensureEvidenceTx` (`lib/server/organizationalMemoryPrimitives.ts:118-148`).
3. `POST .../experiences/{sourceId}/prepare` calls `prepareOrganizationalLearning` (`lib/server/organizationalMemoryService.ts:563-627`). It loads Source-linked Evidence and rejects only an empty Evidence set (`evidence.length === 0`). It creates a proposed candidate and advisory ReflectionDecision; it does not create a KnowledgeItem or trust event.
4. `POST .../experiences/{sourceId}/validate` calls `validateOrganizationalLearning` (`app/api/organizations/[organizationId]/memory/experiences/[sourceId]/validate/route.ts:9-24`). The service rechecks Source ownership, Source-linked Evidence, and proposed candidate status (`lib/server/organizationalMemoryService.ts:631-715`).
5. Validation constructs an active KnowledgeItem with version 1, validation/provenance, initial reliability, and zero reuse counters, then calls the governed `commitValidation` transaction (`lib/server/organizationalMemoryService.ts:653-715`).
6. `commitValidation` atomically persists candidate status, ValidationRecord, MemoryChangeRecord, KnowledgeItem, and neutral Evidence links (`lib/server/persistenceService.ts:1817-2154`).

### Legacy Support path

Support Reflection promotion reaches the same `commitValidation` persistence boundary through `promoteKnowledgeCommand` (`lib/application/learning/reflectionCommands.ts:414-605`). The UI requires a resolved ticket and `reflection.validationEligible` (`app/page.tsx:3800-3812`). The persistence commit requires every source ticket to be resolved and to have durable resolution evidence (`lib/server/persistenceService.ts:1893-1935`). It does not require repeated incidents, previous reuse, or a previous SUCCESS.

## 6. Admission Gate Inventory

| Condition | Classification | Blocks admission? | Evidence |
| --- | --- | --- | --- |
| Organization ID is valid and organization exists | `TENANT_AUTHORIZATION_REQUIREMENT` | Yes | `assertOrganizationId`/`assertOrganizationExists`, `lib/server/organizationalMemoryService.ts:122-126`; `withOrganizationRoute`, `lib/server/organizationRoute.ts:55-75` |
| Authenticated member has the route capability | `TENANT_AUTHORIZATION_REQUIREMENT` / `HUMAN_AUTHORIZATION_REQUIREMENT` | Yes | `withOrganizationRoute(..."knowledge.promote"...)`, neutral validate route; capability resolution in `lib/server/authorization.ts:43-76` |
| Source exists in the selected organization | `IDENTITY_PROVENANCE_REQUIREMENT` | Yes | `loadSource` and Source ownership checks, `lib/server/organizationalMemoryService.ts:482-496`, `631-638` |
| At least one Evidence record is linked to that Source | `EVIDENCE_SAFETY_REQUIREMENT` | Yes | `prepareOrganizationalLearning` and `validateOrganizationalLearning`, `lib/server/organizationalMemoryService.ts:571-574`, `638-640` |
| Candidate exists and is still `proposed` | `HUMAN_AUTHORIZATION_REQUIREMENT` / lifecycle control | Yes | `lib/server/organizationalMemoryService.ts:644-646`; candidate lifecycle persistence is restricted to the commit path, `lib/server/persistenceService.ts:1119-1150` |
| Neutral Source/Evidence IDs belong to the same organization and Source | `IDENTITY_PROVENANCE_REQUIREMENT` / `TENANT_AUTHORIZATION_REQUIREMENT` | Yes | `commitValidation`, `lib/server/persistenceService.ts:1908-1923` |
| Support source tickets exist, are in the same tenant, are resolved, and have resolution evidence | `PROTECTED_CASE_REQUIREMENT` / `EVIDENCE_SAFETY_REQUIREMENT` | Yes for Support only | `lib/server/persistenceService.ts:1893-1935` |
| Candidate, validation, memory change, and KnowledgeItem references are structurally consistent | `IDENTITY_PROVENANCE_REQUIREMENT` | Yes | `validateCommitPayload`, `lib/server/persistenceService.ts:1698-1759` |
| Validation is committed once with candidate/record uniqueness | `CONCURRENCY_REQUIREMENT` | Yes when conflicting | `ValidationRecord @@unique([organizationId,candidateId])`, `prisma/schema.prisma:566-588`; transaction handling in `lib/server/persistenceService.ts:1842-1875`, `1978-2001` |
| Knowledge creation/update revision is correct | `CONCURRENCY_REQUIREMENT` | Yes when stale/conflicting | `upsertKnowledgeItemTx`, `lib/server/persistenceService.ts:1067-1117`; neutral creation passes `expectedKnowledgeRevision: null` |
| Reflection safety content is free of prohibited customer-specific or unsafe reusable material | `EVIDENCE_SAFETY_REQUIREMENT` | Yes for reviewer-authored Support lesson drafts; not an occurrence gate | `assessReflectionSafety`, `lib/reflectionSafety.ts:97-143`; `validateReflectionCommand`, `lib/application/learning/reflectionCommands.ts:402-412` |

No `OCCURRENCE_THRESHOLD`, `REUSE_THRESHOLD`, `OUTCOME_THRESHOLD`, `PATTERN_THRESHOLD`, `TRUST_THRESHOLD`, or `CONFIDENCE_THRESHOLD` blocks the neutral human validation commit.

## 7. Threshold Search Results

The repository contains many numeric thresholds, but the audit classified their purpose rather than treating numbers as defects.

| Threshold or count | Actual control | Admission effect |
| --- | --- | --- |
| `evidence.length === 0` | Prevents preparing/validating learning with no supporting Evidence | Legitimate structural evidence-safety gate; not a fixed multi-item threshold |
| `AUTO_THRESHOLD = 80` and `RECOMMEND_THRESHOLD = 40` | Reliability presentation and automatic/human handling after admission | Does not prevent memory existence (`lib/trustEngine.ts:17-18`, `70-139`) |
| Retrieval `matchScore > 0`, compatibility score, canonical match threshold, facet minimum aliases | Candidate retrieval and grounding compatibility | Does not prevent a validated memory from existing (`lib/memory.ts:238-388`, `lib/retrievalCompatibility.ts:115-249`) |
| `minimumEvidence` on relevance concepts | Evidence needed for a retrieval concept signal | Retrieval-only; not admission (`lib/memory.ts:10-38`) |
| `PATTERN_MERGE_THRESHOLD = 40` and pattern confidence/seen thresholds | Emerging-pattern merge, suggestion, and canonical-pattern promotion | Pattern lifecycle only (`lib/patternDiscovery.ts:7`, `156`, `232-260`) |
| Reflection similarity/overlap thresholds | Chooses `trust_update_only`, `merge_existing`, or `create_version` for a known Support item | Does not require recurrence before `create_new` admission (`lib/reflection.ts:96-171`) |
| Safety scanner thresholds such as copied-text overlap | Prevents unsafe reviewer-authored reusable content | Evidence/safety control, not recurrence or trust |
| Collection and API page-size limits | Bounds transport and read/write size | Operational safety only |

Searches for occurrence count, recurrence, repeated incidents, reuse count, successful reuse count, outcome count, pattern count, minimum trust, promotion threshold, validation threshold, and repeated confirmation found counters and labels used for metrics, retrieval explanation, pattern detection, reliability, or safety. No admission branch checks them for the neutral `create_new` validation path.

## 8. Occurrence Threshold Analysis

No `occurrenceCount` field or recurrence predicate is part of neutral admission. One Source represents one organizational experience, and `prepareOrganizationalLearning` does not query other Sources or incidents. The resulting KnowledgeItem is created from that Source and its Evidence.

The requested tuple is represented as follows before any later reuse:

- occurrence cardinality: one Source; no recurrence requirement;
- `timesReused`: explicitly `0` in `validateOrganizationalLearning` (`lib/server/organizationalMemoryService.ts:665`);
- successful outcomes: none are required or created by validation;
- repeated-pattern count: no Pattern record is consulted or created by neutral validation.

The schema has no `occurrenceCount` column on `KnowledgeItem`; that is a representation choice, not an admission blocker. `timesSeen` and outcome counters are nullable projections and are normalized to zero when read by `withLearningDefaults` (`lib/trustEngine.ts:41-57`).

## 9. Reuse Threshold Analysis

Prior reuse is not required. The neutral KnowledgeItem is created with `timesReused: 0`, and `recordReuseOutcome` is a later operation over an existing KnowledgeItem (`lib/server/organizationalMemoryService.ts:165-293`). The retrieval explanation may mention reuse history, but FIX-005 explicitly keeps reuse out of intrinsic candidate selection (`lib/memory.ts:269-270`, `443-445`).

## 10. Outcome Threshold Analysis

Prior SUCCESS is not required. Validation itself does not call `recordReuseOutcome` and does not create a `KnowledgeReuseOutcome`. Later `SUCCESS` increases trust by +5 for human reuse or +3 for automatic reuse; `CORRECTION_REQUIRED` decreases trust by 2; `FAILURE` decreases trust by 10 (`lib/server/organizationalMemoryService.ts:211-223`). These effects occur only after admission.

## 11. Pattern Threshold Analysis

Pattern detection is a distinct lifecycle. `EmergingPattern` has its own `monitoring`, `suggested`, `promoted`, and `dismissed` states (`prisma/schema.prisma:47-50`, `812-836`). Pattern merging uses `PATTERN_MERGE_THRESHOLD`; suggestion requires `timesSeen >= 3` and confidence `>= 60`; canonical-pattern suggestion requires `timesSeen >= 5` and confidence `>= 75` (`lib/patternDiscovery.ts:156-182`, `232-260`).

Those thresholds govern recurring-pattern interpretation and pattern promotion. Ordinary domain-neutral memory admission does not call pattern discovery and does not require a Pattern.

## 12. Trust Threshold Analysis

Initial reliability is separate from existence. `TRUST_INITIAL` is 20; `RECOMMEND_THRESHOLD` is 40; `AUTO_THRESHOLD` is 80 (`lib/trustEngine.ts:8-18`). `evaluateTrust` uses these values to select `human_required`, `human_recommended`, or `auto_resolution` after a KnowledgeItem exists (`lib/trustEngine.ts:115-139`).

The neutral validator sets `trustScore: 20` and `autoResponseEligible: false` (`lib/server/organizationalMemoryService.ts:665-671`). A score of 20 therefore does not block creation. The latest automated QA report also captured a fresh validated memory with `trustScore: 20`, `timesReused: 0`, and null outcome counters before reuse (`docs/audits/OIP-V2-QA-001R-R2-AUTO-organizational-memory-core-acceptance.md`, section 39).

## 13. Evidence Sufficiency

There is no arbitrary fixed Evidence cardinality such as five or six in the admission service. The neutral path requires `>= 1` Source-linked Evidence item before preparation and validation. That floor is a necessary evidence-safety condition; it does not claim that one Evidence item is always substantively sufficient.

The substantive sufficiency decision is made by the authorized human using the Source, Evidence content, candidate, rationale, scope, and risk. The current code does not implement a universal semantic evidence score, which is appropriate for a domain-neutral path and avoids replacing judgment with an arbitrary count. Evidence IDs are verified against both organization and selected Source during commit.

For Support, the minimum is expressed semantically as resolved source work plus durable resolution evidence, not as a number of incidents. A single resolved ticket with its required resolution evidence can form a `create_new` candidate.

## 14. Human Validation Authority

Validation can admit the lesson. The neutral validator builds an active KnowledgeItem, creates a version-1 record, records validation and provenance, marks the candidate validated, writes a MemoryChangeRecord, and links origin Evidence in one transaction (`lib/server/organizationalMemoryService.ts:653-715`; `lib/server/persistenceService.ts:1959-2154`).

The neutral endpoint is protected by `knowledge.promote` (`app/api/organizations/[organizationId]/memory/experiences/[sourceId]/validate/route.ts:9`). The durable role matrix grants that capability to:

- `owner`;
- `administrator`;
- `reviewer`.

The migration seeds neutral entry/preparation capabilities for `owner`, `administrator`, `reviewer`, and `support_agent`, but it does not grant `knowledge.promote` to `support_agent` (`prisma/migrations/20260824140000_add_memory_entry_capabilities/migration.sql`). This lets a Support Agent contribute Source/Evidence and prepare learning while reserving neutral admission for the explicit validator roles.

The legacy Support commit endpoint is protected by `ticket.review` (`app/api/organizations/[organizationId]/commits/validation/route.ts:13`). The role matrix grants `ticket.review` to `owner`, `administrator`, `reviewer`, and `support_agent` (`lib/server/rbac/definitions.ts:33-39`). Thus the exact authorized human roles are path-specific: the neutral experience validator roles are Owner, Administrator, and Reviewer; the legacy Support Reflection validation roles additionally include Support Agent.

## 15. Single-Experience Proof

The repository supports this lifecycle without requiring a second experience:

```text
one Source -> one or more Source-linked Evidence records -> proposed candidate
-> authorized validation -> active KnowledgeItem
```

Evidence already exists in the latest accepted FIX-002 probe (`scripts/oip-v2-fix-002-entry-inspection-probe.cjs:57-84`), which proves a non-Support Source can be entered without a TicketRecord, prepared, and validated. The latest AUTO report independently proves authenticated neutral entry, advisory preparation, validation, active memory, and initial trust 20 (`docs/audits/OIP-V2-QA-001R-R2-AUTO-organizational-memory-core-acceptance.md`, sections 39-42).

The exact one-Evidence variant is established statically: the only neutral preparation/validation cardinality check is `evidence.length === 0`, and the candidate constructor accepts the complete Source evidence list. No existing automated probe was mutated or rerun with new runtime data for this audit.

Before validation, reuse is zero because no KnowledgeItem exists yet; after validation, `timesReused` is zero and no Outcome is required. Pattern recurrence is not part of this path.

## 16. Rare-Knowledge Scenario

The rare database-recovery scenario works today if the recovery event is recorded as one Source, the investigation/recovery material is attached as sufficient Evidence, learning is prepared, and an authorized human validates it.

The event does not need to happen again in nine months. The only potential blockers are ordinary safety and governance conditions: no Source-linked Evidence, malformed or missing candidate, wrong organization, insufficient authorization, conflicting validation/concurrency state, or—on the Support path—unresolved source work or missing resolution evidence. None is an occurrence/reuse/trust blocker.

## 17. Initial Trust / Reliability

Immediately after neutral validation:

- lifecycle: `active`;
- governance state: `trusted` in the current KnowledgeItem projection;
- initial reliability score: `20`;
- `timesReused`: `0`;
- `autoResponseEligible`: `false`;
- no prior SUCCESS Outcome is created;
- no prior Pattern is required.

The word `trusted` in `governanceState` must not be read as “high reliability” or “automation approved.” The product separately projects lifecycle, governance, reliability, and automation. `KNOWN_LIMITATIONS.md` explicitly records that a validated active memory may remain at reliability 0 while requiring human review.

## 18. Reliability Evolution

Later human or automatic reuse records a durable `KnowledgeReuseOutcome` and updates the KnowledgeItem projection transactionally (`lib/server/organizationalMemoryService.ts:165-293`). Human SUCCESS contributes +5; automatic SUCCESS contributes +3; SUCCESS with required edits is reduced by 2; CORRECTION_REQUIRED contributes -2; FAILURE contributes -10. Counters, success rate, timestamps, and revision also evolve.

`evaluateTrust` requires both sufficient score and approved validation before automatic-resolution handling, and challenge state forces human-required handling (`lib/trustEngine.ts:115-139`). Thus strong reliability can strengthen future reuse/automation, but weak initial reliability does not erase the admitted memory.

## 19. Pattern vs Memory Separation

Pattern records are separate from KnowledgeItems and are discovered from repeated signals. Their recurrence/confidence thresholds govern pattern lifecycle and canonical-pattern promotion. A single validated KnowledgeItem can exist without an EmergingPattern, and the neutral admission service never invokes pattern detection.

## 20. Retrieval vs Admission Separation

Retrieval applies compatibility, category, problem-facet, grounding, lifecycle, and ranking rules after memory exists. A match can be weak, incompatible, ungrounded, deprecated, or human-review-only without deleting the KnowledgeItem or preventing its admission. `retrieveMemory` filters positive retrieval candidates and `retrievalPresentation` maps them to states such as `WEAK_CANDIDATE`, `UNGROUNDED_CANDIDATE`, and `HUMAN_REVIEW_REQUIRED` (`lib/memory.ts:238-388`; `lib/retrievalPresentation.ts:9-48`).

FIX-005 also confirms that reuse history is not a relevance signal that can outrank semantic evidence. This keeps retrieval thresholds distinct from the admission boundary.

## 21. Automation vs Admission Separation

Admission sets `autoResponseEligible: false`. Automatic reuse requires separate compatibility, grounding, trust, validation, and governance conditions; an open challenge is fail-closed for automation. The 80-point threshold is an automation/reliability threshold, not an admission threshold. The audit does not recommend weakening it.

## 22. AI Authority

AI can assist intake, classification, retrieval, summarization, drafting, and candidate preparation, but it cannot approve its own lesson through the current route. The neutral preparation service returns an advisory candidate and explicitly states that human validation is required (`lib/server/organizationalMemoryService.ts:587-601`). The validation route obtains actor identity from `user` supplied by the authenticated session and requires the human capability `knowledge.promote` (`app/api/organizations/[organizationId]/memory/experiences/[sourceId]/validate/route.ts:9-24`).

The Canon is consistent on this boundary: `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md:414-438`, `593-603`; `docs/canon/06_AI_COGNITIVE_MODEL.md:568-590`; and `docs/canon/04_PRODUCT_DOMAIN_MODEL.md:689-699` state that AI may assist but may not promote knowledge to memory.

## 23. Documentation Consistency

| Documentation statement | Classification | Assessment |
| --- | --- | --- |
| `docs/ARCHITECTURE_BASELINE.md:17-23` says operators can record an experience, add Evidence, prepare, validate, and inspect; retrieval is separate from trust/promotion | `CONSISTENT` | Matches the neutral routes and services. |
| `docs/implementation/15_API_ARCHITECTURE.md:180-201` documents neutral Source/Evidence/preparation/validation contracts and says challenge is not AI promotion | `CONSISTENT` | Matches route and persistence behavior. |
| `docs/KNOWN_LIMITATIONS.md:33-48` requires human review and separates reliability from lifecycle/governance | `CONSISTENT` | Matches role gates and trust-zero behavior. |
| Canon Capability 3 lists repeated successful use and confidence thresholds among possible validation signals (`docs/canon/03_PRODUCT_CAPABILITY_MODEL.md:161-179`) | `AMBIGUOUS` | The surrounding text says validation uses a combination and no single signal is universal, but readers could mistake these as mandatory pre-admission thresholds. |
| Domain Model Validation says the gate “may involve” successful use and trust scoring (`docs/canon/04_PRODUCT_DOMAIN_MODEL.md:393-410`) | `AMBIGUOUS` | “May involve” is compatible with the implementation but should explicitly say recurrence/reuse/trust are not universal admission prerequisites. |
| Workflow says resolution evidence is required before an eligible Support Reflection proceeds (`docs/canon/05_PRODUCT_WORKFLOW_MODEL.md:295-305`) | `CONSISTENT` | This is a Support evidence gate, not a recurrence requirement; neutral entry is an additive path. |
| AI boundary statements in Canon and implementation security documentation | `CONSISTENT` | AI cannot validate its own learning or bypass human validation. |

No reviewed document was found to state that multiple incidents, prior reuse, prior SUCCESS, pattern recurrence, or a minimum trust score is universally required before memory admission. The ambiguity is worth clarifying because the Canon lists repeated use and confidence as possible validation signals.

## 24. Changelog Review

No root `CHANGELOG.md` or equivalent changelog was present. Therefore the changelog does not currently record this principle. A later documentation task may add a release-history clarification if the project establishes a changelog; this audit did not create or modify one.

## 25. Audit Matrix

| Question | Result | Evidence |
| --- | --- | --- |
| One experience can become memory | YES | Neutral Source → Evidence → prepare → validate → active KnowledgeItem, `lib/server/organizationalMemoryService.ts:563-715` |
| Multiple occurrences required | NO | No recurrence query or threshold in neutral admission |
| Prior reuse required | NO | Initial `timesReused: 0` |
| Prior SUCCESS required | NO | No Outcome is required or created before validation |
| Pattern recurrence required | NO | Pattern lifecycle is separate |
| Minimum trust required for admission | NO | Initial score is 20; admission does not compare it to 40/80 |
| Fixed Evidence count required | NO fixed cardinality; `>=1` structural floor | Empty Evidence is rejected; no arbitrary 2/5/6 count |
| Authorized human validation required | YES | Neutral route `knowledge.promote`; Support route `ticket.review` |
| AI can validate its own learning | NO | Preparation is advisory; validation actor comes from authenticated human session |
| Reliability evolves after admission | YES | Reuse Outcome service updates trust/counters after creation |
| FAILURE can reduce reliability | YES | FAILURE applies -10 in domain-neutral outcome service |
| Challenge remains human-governed | YES | Challenge open/review routes have separate capabilities and revision checks |
| Automation authority separate from admission | YES | Initial automation false; trust/grounding/challenge gates are later controls |

## 26. Implementation Gap Assessment

The audited principle is `ALREADY_IMPLEMENTED`. There is no implementation gap requiring a FIX.

One non-threshold integrity observation should remain visible for future hardening: `validateOrganizationalLearning` finds a proposed candidate by candidate ID and validates the selected Source/Evidence, but does not separately assert that the candidate ID is the deterministic candidate derived from that Source or that its neutral metadata explicitly contains the Source ID (`lib/server/organizationalMemoryService.ts:644-646`). The normal product path generates `neutral-candidate-${source.id}`, and `commitValidation` validates organization/Source/Evidence ownership, so this did not block or invalidate the audited single-experience path. It is an identity/provenance hardening opportunity, not a recurrence/reuse/trust defect, and is outside this audit’s authorized scope.

## 27. Documentation Gaps

The Canon should clarify that repeated successful use, confidence, trust score, and pattern recurrence are domain/policy-dependent validation signals or post-admission reliability controls, not universal prerequisites for admitting a sufficiently evidenced single experience. It should also explicitly distinguish the neutral `>=1` evidence-safety floor from an arbitrary evidence-count threshold.

The next regression test should exercise exactly one neutral Evidence record, then verify validation succeeds with `timesReused = 0`, no Outcome, no Pattern, initial trust 20, and automation disabled. This would make the intended rare-knowledge property executable without changing product behavior.

## 28. Recommended Next Task

`DOC-FIX-003` — clarify Canon and implementation documentation with the following rule:

```text
Sufficient Source-linked Evidence + authorized human validation may admit
a single organizational experience into Organizational Memory.
Reuse, Outcomes, Challenges, Patterns, trust, and automation evolve or gate
later use; they are not universal pre-admission requirements.
```

Add a focused regression probe for the one-Evidence variant. Do not change trust, retrieval, pattern, or automation safeguards as part of that documentation/test follow-up.

## 29. Repository Mutation Verification

- Authorized mutation: this audit report only.
- Product code modified by this audit: no.
- Schema modified by this audit: no.
- Migrations created or modified by this audit: no.
- Tests/probes modified by this audit: no.
- Canon modified by this audit: no.
- Implementation documentation modified by this audit: no.
- `CHANGELOG.md` modified or created: no.
- Stage/commit/push/tag/deploy/reset/clean/stash/restore: none.
- The only new path from this audit is `docs/audits/OIP-V2-AUDIT-002-single-experience-memory-admission-human-validation-authority.md`.

## Direct Answers

1. Yes. One organizational experience can become Organizational Memory after sufficient Source-linked Evidence and authorized human validation.
2. No. More than one occurrence is not required.
3. No. Prior reuse is not required.
4. No. A prior SUCCESS Outcome is not required.
5. No. Pattern recurrence is not required.
6. No. A minimum trust score is not required before admission.
7. No fixed Evidence count is required; at least one Source-linked Evidence item is the structural safety floor.
8. Before neutral human validation: an organization-scoped Source, at least one linked Evidence record, a proposed candidate, valid tenant context, and an authorized validator request must exist. Support also requires resolved source work with durable resolution evidence.
9. Neutral validation: Owner, Administrator, Reviewer. Legacy Support Reflection validation: Owner, Administrator, Reviewer, Support Agent through `ticket.review`.
10. Validation creates/activates a KnowledgeItem, version, ValidationRecord, MemoryChangeRecord, provenance, and Evidence links atomically; it marks the candidate validated.
11. Initial reliability is trust score 20; reuse/outcome counters start at zero or normalize to zero.
12. Yes. A low-reliability memory can remain active and exist, but it remains human-review-only for use.
13. Successful reuse Outcomes strengthen reliability, with larger human than automatic deltas in the current policy.
14. CORRECTION_REQUIRED and FAILURE Outcomes weaken reliability; FAILURE is -10 in the neutral outcome service.
15. Yes. A human-governed Challenge can revalidate, narrow scope/version the lesson, or deprecate it while preserving history.
16. Yes. Pattern thresholds are separate from ordinary memory admission.
17. Yes. Retrieval compatibility/grounding thresholds are separate from admission.
18. Yes. Automation thresholds are separate from admission and remain fail-closed.
19. No. AI preparation is advisory and cannot self-validate or promote its own learning.
20. Yes. The rare nine-month incident scenario works after evidence-backed human validation; repetition is not a blocker.
21. Mostly. Current implementation/API documentation is consistent; Canon wording about repeated use/confidence as possible validation signals is ambiguous and should be clarified.
22. No. No changelog exists in the repository.
23. No. No implementation FIX is necessary for this principle.
24. Next: documentation clarification plus a one-Evidence automated regression probe.

