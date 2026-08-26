# DOC-FIX-003 — Single-Experience Memory Admission Canon Clarification & Regression Protection

Status: Completed with non-blocking follow-up  
Date: 2026-08-26  
Branch: `landing/option-c32-release-polish`  
Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`  
Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`

## 1. Executive Summary

The Canon was ambiguous about whether repeated successful use, Confidence, trust, or Pattern frequency were required before a lesson could enter Organizational Memory. The implementation audited by AUDIT-002 already supports the intended rule: one organizational Source with sufficient Source-linked Evidence can produce a proposed learning candidate, and an authorized human can validate that candidate into active Organizational Memory.

This task clarifies that rule in the Capability Model, Domain Model, Workflow Model, and Canon governance history. It adds an authenticated application-boundary regression probe with an exactly-one-Source/exactly-one-Evidence positive case plus no-Evidence, no-human-validation, and cross-tenant negative controls. Product behavior, schema, migrations, trust thresholds, retrieval safeguards, automation gates, and AI authority were not changed.

## 2. Final Verdict

`DOC_FIX_003_COMPLETED_WITH_FOLLOWUPS`

The clarification is complete, the exactly-one-Evidence regression passes, negative controls pass, and relevant safety regressions pass. The remaining candidate/Source identity hardening observation from AUDIT-002 is non-blocking and remains a recommended follow-up.

## 3. Repository State Before

- Branch: `landing/option-c32-release-polish`.
- HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- Worktree: already dirty with 52 top-level `git status --short` entries: 27 modified tracked paths and 25 untracked entries/directories.
- Pre-existing changes included OIP v2 implementation, migrations, probes, UI, Canon, implementation documentation, and reports. They were preserved and not reset, cleaned, stashed, restored, staged, committed, pushed, tagged, deployed, or published.
- `npx prisma migrate status`: 28 migrations found; database schema up to date.
- `CHANGELOG.md`: absent at repository root; no equivalent changelog was found during the targeted review.

## 4. AUDIT-002 Baseline

AUDIT-002 established `OIP_V2_AUDIT_002_SINGLE_EXPERIENCE_MEMORY_ADMISSION_CONFIRMED` with `ALREADY_IMPLEMENTED` and `NO_IMPLEMENTATION_FIX_REQUIRED`.

Its baseline is:

```text
Source -> Source-linked Evidence -> proposed learning
      -> authorized human validation -> active KnowledgeItem
      -> later reuse and Outcomes -> reliability/challenge evolution
```

The neutral path has a structural `>=1` Source-linked Evidence floor, but no universal requirement for multiple occurrences, prior reuse, prior SUCCESS, Pattern recurrence, minimum trust, minimum Confidence, multiple Sources, or an arbitrary Evidence count. Neutral validation is protected by `knowledge.promote` and the Owner, Administrator, and Reviewer roles. Initial trust is 20, reuse is zero, and automation is disabled.

## 5. Canon Governance Classification

Classification: `CANON_CLARIFICATION` / Semantic Versioning `PATCH` (`v1.0.2`).

The governance policy defines a Patch as a clarification that removes accidental ambiguity without adding or changing an obligation. The implementation and surrounding Canon already express the Source, Evidence, Validation, human-authority, and AI boundaries. This edit makes the intended interpretation explicit and records it in the Canon version history. It does not redefine Organizational Memory, change authority, remove a required workflow, add a product capability, or invalidate existing Canon-aligned work.

## 6. Principle Before Clarification

The Canon said that validation could use a combination of human review, Source Evidence, expert approval, repeated successful use, contradiction checks, Confidence thresholds, and revalidation. It also said no single signal was sufficient in every Domain. That wording was compatible with the implementation but did not explicitly state that some signals may only become available after admission.

## 7. Ambiguity Identified

A reader could incorrectly infer that “repeated successful use,” Confidence, trust, or Pattern recurrence was a universal pre-admission gate. That would confuse eligibility for preserving a sufficiently evidenced lesson with later evidence about whether the lesson remains reliable, applicable, and suitable for automation.

## 8. Canon Changes

Updated:

- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` — validation signals are selected by subject, consequence, and governance context; later-use signals are optional when later use exists; a single sufficiently evidenced experience may be admitted after authorized human validation; the neutral `>=1` Evidence floor is distinguished from fixed Evidence sufficiency.
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` — the Validation Gate and Evidence sufficiency rule now explicitly separate admission from recurrence, reuse, Outcomes, Patterns, trust, Confidence, retrieval, and automation decisions.
- `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` — the cross-Domain workflow principles now state the single-experience admission rule and the post-admission role of repeated use.
- `docs/canon/CANON_GOVERNANCE.md` — current Canon version advanced to `v1.0.2` and the Patch clarification was added to Version History.

The required invariant is:

> OIP may preserve a lesson from a single sufficiently evidenced organizational experience after authorized human validation. Repeated occurrence and successful reuse strengthen the organization's confidence in that lesson over time; they are not universal prerequisites for remembering it.

## 9. Evidence Sufficiency Clarification

“Sufficient Evidence” means a human/governance judgment that the Source, its linked Evidence, rationale, applicability, and consequence support preserving the proposed lesson for the stated scope. The current neutral implementation enforces only the structural floor that at least one Evidence item is linked to the Source before preparation or validation.

One Evidence item is not declared universally sufficient, and no fixed larger count is declared universally necessary. Domain or policy-specific reviewers may require more Evidence for higher-risk or higher-consequence learning.

## 10. Human Validation Authority

Neutral memory validation remains a governed application action through `POST /api/organizations/{organizationId}/memory/experiences/{sourceId}/validate`, protected by `knowledge.promote`. The current neutral roles are Owner, Administrator, and Reviewer. The authenticated route supplies actor identity; the request does not accept an AI identity as the approving authority. The legacy Support path retains its separate `ticket.review` authority boundary.

## 11. Admission vs Reliability

Admission answers whether an evidenced proposed lesson may be preserved as memory. Reliability answers how much later use and observed Outcomes should change trust, review requirements, scope, and automation eligibility. The initial neutral item remains active with trust score 20, `timesReused = 0`, no previous SUCCESS or FAILURE, and `autoResponseEligible = false`. Low reliability does not prevent the memory from existing.

## 12. Memory vs Pattern

Organizational Memory preserves a lesson worth retaining from an evidenced experience. Pattern Discovery analyzes recurrence and frequency across validated knowledge. A Pattern is not required to admit a single experience, and the neutral admission service does not invoke Pattern Discovery.

## 13. Admission vs Retrieval

Memory admission does not guarantee that retrieval will select or recommend the item for a particular Case. Retrieval continues to apply compatibility, scope, problem-facet, grounding, lifecycle, and ranking safeguards. A weak, ungrounded, scope-incompatible, challenged, or human-review-only item may remain inspectable without becoming unrestrictedly reusable.

## 14. Admission vs Automation

Admission does not grant automation authority. Trust thresholds, grounding, compatibility, governance, challenge fail-closed behavior, and the initial automation-disabled state remain separate controls. The clarification does not lower or bypass any automation threshold.

## 15. AI Authority

AI may assist with understanding, enrichment, retrieval, comparison, drafting, and candidate preparation. AI cannot validate its own learning, directly create trusted memory, bypass Human Validation, or grant itself automation authority. The Canon and implementation boundaries remain unchanged.

## 16. Regression Test Added

Added `scripts/doc-fix-003-single-experience-regression-probe.cjs` and the `probe:doc-fix-003` package script. The probe uses the supported authenticated API boundary for Source creation, Evidence creation, preparation, validation, and inspection. PostgreSQL is limited to disposable identity setup, assertions, and cleanup.

## 17. Single-Evidence Positive Case

The positive case contains exactly one Source and exactly one Source-linked Evidence item. It verifies:

- preparation returns a proposed candidate and creates no KnowledgeItem;
- authorized human validation creates one active KnowledgeItem;
- Source and Evidence provenance are preserved;
- the validation record preserves validator identity and rationale;
- initial trust is 20, reuse is 0, and automation is false;
- successful and failed resolution counters are null, with no Outcome rows;
- no EmergingPattern row is required or created.

Result: `DOC_FIX_003_SINGLE_EXPERIENCE_REGRESSION_PASSED`.

## 18. Negative Controls

- No Evidence: preparation returns HTTP 400; no candidate or memory is created.
- No human validation: preparation leaves the candidate proposed; no KnowledgeItem or ValidationRecord is created; inspection of the derived memory ID returns HTTP 404.
- Tenant isolation: the validated memory cannot be read through a different organization scope and returns HTTP 404.

All negative controls passed.

## 19. Existing Safety Regression

The following existing regressions passed against a fresh development server:

- `npm run probe:oip-v2-fix-001` — foundation, evidence gate, validation, outcomes, trust, challenge, and isolation.
- `npm run probe:oip-v2-fix-003` — retrieval, outcomes, trust, challenge, and isolation.
- `npm run probe:oip-v2-fix-004` — candidate selection, event time, copy states, and contradiction guard.
- `npm run probe:oip-v2-fix-005` — near-duplicate deterministic selection and grounding identity.
- `npm run qa:oip-v2-001r-r2-auto` — `OIP_V2_QA_001R_R2_AUTO_ORGANIZATIONAL_MEMORY_CORE_ACCEPTED_WITH_FOLLOWUPS`, failure code `none`.

These runs preserved the existing ownership, tenant, provenance, human-validation, trust/reliability, retrieval, grounding, outcome, challenge, and protected Support boundaries.

## 20. Product Behavior Change Assessment

`PRODUCT_BEHAVIOR_CHANGED = NO`.

The code path already admitted the tested single-experience shape. This task adds documentation and regression protection only. No product implementation, RBAC permission, threshold, retrieval rule, challenge rule, or AI authority rule was changed.

## 21. Candidate/Source Identity Follow-Up

`PRE_EXISTING_IDENTITY_PROVENANCE_HARDENING_FOLLOWUP` remains open from AUDIT-002. The neutral validation service selects a proposed candidate by submitted candidate ID and separately validates the selected Source and Evidence. The normal product path derives `neutral-candidate-${source.id}`, and the transaction enforces organization/Source/Evidence ownership, but an explicit assertion that the candidate ID is the deterministic candidate for the selected Source and that candidate metadata carries the Source ID would further harden identity provenance. It was not repaired opportunistically in this documentation task.

## 22. CHANGELOG Assessment

`CHANGELOG_NOT_PRESENT`. No CHANGELOG was created or modified.

## 23. Files Changed

Files changed for DOC-FIX-003:

- `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md`
- `docs/canon/04_PRODUCT_DOMAIN_MODEL.md`
- `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md`
- `docs/canon/CANON_GOVERNANCE.md`
- `package.json` (added `probe:doc-fix-003`; existing dirty OIP scripts were preserved)
- `scripts/doc-fix-003-single-experience-regression-probe.cjs`
- `docs/audits/DOC-FIX-003-single-experience-memory-admission-canon-clarification-regression-protection.md`

No product source, Prisma schema, Prisma migration, historical audit, or historical QA document was intentionally edited for this task.

## 24. Verification Results

| Requirement | Result |
| --- | --- |
| Single experience may become memory | PASS |
| Source required | PASS |
| Evidence required | PASS |
| Exactly one Evidence item accepted when sufficient | PASS |
| Human validation required | PASS |
| Multiple occurrences not required | PASS |
| Prior reuse not required | PASS |
| Prior SUCCESS not required | PASS |
| Pattern recurrence not required | PASS |
| Minimum trust not required for admission | PASS |
| Initial reliability remains low | PASS |
| Automation remains disabled initially | PASS |
| AI cannot self-validate | PASS |
| Source provenance preserved | PASS |
| Evidence provenance preserved | PASS |
| Tenant isolation preserved | PASS |
| Retrieval safeguards unchanged | PASS |
| Trust safeguards unchanged | PASS |
| Challenge safeguards unchanged | PASS |
| Product behavior unchanged | PASS |
| No migration created | PASS |
| No new CHANGELOG created | PASS |

Command results:

- `npm run probe:doc-fix-003`: PASS on fresh server at port 3103.
- Relevant OIP v2 probes and automated QA: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS; 28 migrations, database up to date.
- `git diff --check`: PASS; only pre-existing CRLF conversion warnings were emitted.

An initial attempt against the already-running port 3000 encountered the pre-existing stale Next development artifact `Cannot find module './5611.js'`. Re-running against the fresh port-3103 server passed; this did not change the final product or schema assessment.

## 25. Repository State After

- Branch remains `landing/option-c32-release-polish`.
- HEAD remains `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- The worktree remains dirty with 53 top-level status entries: the pre-existing 52 plus the new `scripts/doc-fix-003-single-experience-regression-probe.cjs` entry. The report itself is nested within the already untracked `docs/audits/` directory, while the four Canon files and `package.json` remain in the already modified set.
- No reset, clean, stash, restore, staging, commit, push, tag, deployment, or publication was performed.

## 26. Recommended Next Task

Address the non-blocking `PRE_EXISTING_IDENTITY_PROVENANCE_HARDENING_FOLLOWUP` in a separately authorized implementation task, then rerun `probe:doc-fix-003` and the OIP v2 acceptance suite. Keep the single-experience admission rule unchanged while tightening candidate-to-Source identity assertions.
