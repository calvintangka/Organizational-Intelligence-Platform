# OIP-V2-FIX-006 — Candidate-to-Source Identity & Provenance Binding Hardening

Status: Implemented and verified  
Date: 2026-08-26  
Branch: `landing/option-c32-release-polish`  
Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`  
Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`

## 1. Executive Summary

FIX-006 closed the `PRE_EXISTING_IDENTITY_PROVENANCE_HARDENING_FOLLOWUP` from DOC-FIX-003. Before this repair, neutral candidate identity was encoded by the deterministic ID `neutral-candidate-${source.id}`, but the validation service did not explicitly compare the submitted candidate ID with the selected Source. A same-organization caller could therefore submit Candidate B while selecting Source A; the service could construct a Source A memory while using Candidate B content.

The repair extracts one shared `getNeutralCandidateId(sourceId)` helper, uses it during preparation, checks it before candidate lookup in the validation service, and checks it again inside the authoritative `commitValidation` transaction before metrics, candidate, validation, memory-change, trust, KnowledgeItem, or evidence-link writes. No schema or migration was required.

## 2. Final Verdict

`OIP_V2_FIX_006_CANDIDATE_SOURCE_PROVENANCE_BINDING_HARDENED_AND_VERIFIED`

The mismatch is explicitly rejected, cross-organization attempts fail closed, tampering attempts produce no trusted-memory side effects, the legitimate two-source path works, DOC-FIX-003 remains green, all relevant V2 regressions pass, and the full automated QA report is accepted with guardrails.

## 3. Repository State Before

- Branch: `landing/option-c32-release-polish`.
- HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- Worktree: already dirty with 53 top-level `git status --short` entries from prior work, including OIP v2 implementation, migrations, probes, reports, UI, Canon, and implementation documentation.
- Pre-existing changes were preserved. No reset, clean, stash, restore, staging, commit, push, tag, deploy, or publish was performed.
- `npx prisma migrate status`: 28 migrations found; database schema up to date.
- `CHANGELOG.md`: absent; no CHANGELOG was created.

## 4. DOC-FIX-003 Baseline

DOC-FIX-003 established that one sufficiently evidenced organizational experience may become Organizational Memory after authorized human validation. FIX-006 preserves that rule. It adds no occurrence, reuse, Outcome, Pattern, trust, Confidence, Source-count, or arbitrary Evidence-count threshold.

The exactly-one-Source/exactly-one-Evidence DOC-FIX-003 probe continued to pass after this repair.

## 5. Provenance Hardening Concern

The concern was not that Source or Evidence ownership was absent. Those checks already existed. The concern was that the neutral candidate-to-Source relationship was implicit: the candidate ID contained the Source ID by convention, but the validation boundary did not enforce that relationship.

## 6. Current Candidate Identity Model

Before FIX-006, `prepareOrganizationalLearning` generated `neutral-candidate-${source.id}` inline and persisted it as the `KnowledgeCandidate.id`. The candidate schema has no separate `sourceId` column. `sourceTicketIds` is empty for a domain-neutral candidate; the proposed content’s lesson includes the Source ID, but that was not the validation binding assertion.

After FIX-006, preparation and validation use the shared `getNeutralCandidateId(sourceId)` helper. A candidate is valid for a neutral Source only when its ID equals the canonical ID derived from that Source.

## 7. Current Source Identity Model

`OrganizationalSource.id` is the durable Source identity, scoped and owned by an Organization. The source creation route and service resolve the selected Source under the requested organization. KnowledgeItem provenance retains that Source ID through `sourceTicketId`, and neutral Evidence records retain `sourceId`.

## 8. Current Evidence Binding

The validation route does not accept caller-selected Evidence IDs. The service derives the Evidence set from the selected Source. Inside `commitValidation`, each neutral Evidence ID is rechecked for both organization ownership and `sourceId === selectedSource.id` before evidence-to-memory links are written. The probe confirmed Source B Evidence cannot appear in Source A’s memory links.

## 9. Reproduction

The pre-fix control flow precisely demonstrates the defect without retaining an attack artifact: validation loaded Source A and its Evidence, looked up any proposed candidate by submitted ID within the organization, and did not compare that candidate ID to Source A. Candidate B could therefore reach `commitValidation` with neutral context for Source A; the constructed KnowledgeItem used Source A’s memory ID and provenance while candidate content and audit references used Candidate B.

The same-organization attack probe now submits that exact pair and receives a server-side `409 CONFLICT` before any trusted-memory write.

## 10. Root Cause Classification

`CANDIDATE_SOURCE_BINDING_IMPLICIT_ONLY`

The canonical ID convention existed, but the validation assertion did not. The issue was not a missing database schema relationship or a tenant-ownership bypass.

## 11. Candidate-to-Source Invariant Before

Before FIX-006, the effective invariant was only:

```text
candidate.organizationId == requested organization
candidate.id exists and is proposed
selected Source belongs to requested organization
selected Evidence belongs to selected Source and organization
```

There was no explicit:

```text
candidate.id == canonical candidate ID derived from selected Source
```

## 12. Candidate-to-Source Invariant After

For neutral validation, the server now requires all of the following before promotion:

```text
candidate.id == getNeutralCandidateId(selectedSource.id)
candidate belongs to the selected organization
selected Source belongs to the selected organization
every validation Evidence belongs to the selected Source and organization
authenticated actor has the organization capability
```

## 13. Implementation Changes

- Added `getNeutralCandidateId(sourceId)` to `lib/server/organizationalMemoryPrimitives.ts`.
- Reused that helper during neutral candidate preparation in `lib/server/organizationalMemoryService.ts`.
- Added an early validation-service mismatch rejection with the existing `CONFLICT` error convention.
- Added the authoritative in-transaction Source/candidate identity and candidate organization check in `lib/server/persistenceService.ts`.
- Added the explicit binding contract to `docs/implementation/15_API_ARCHITECTURE.md`.
- Added the focused `probe:oip-v2-fix-006` package script and probe.

No candidate metadata schema field was added because the existing deterministic identity contract is stable, already used by persisted candidates, and can be verified without a migration. Historical candidates with the canonical ID remain usable; ambiguous/noncanonical neutral candidates fail closed rather than being silently repaired.

## 14. Transaction Safety

The authoritative check runs at the beginning of the `prisma.$transaction` callback, before `ensureOrgMetricsRowTx` and before candidate lifecycle, ValidationRecord, MemoryChangeRecord, trust, KnowledgeItem, or Evidence-link writes. Existing neutral Source/Evidence ownership checks remain inside the same transaction. A mismatch cannot pass a check-then-write gap or leave a trusted-memory mutation.

## 15. Positive Validation Path

The probe created Source A and Source B in one organization, each with exactly one Evidence item and a prepared candidate. Correct Source A + Candidate A and correct Source B + Candidate B both validated successfully. Each resulting memory retained its own Source and Evidence provenance, validator identity, and rationale.

## 16. Same-Organization Cross-Source Rejection

Both attack directions were rejected with `409 CONFLICT`:

- Source A + Candidate B.
- Source B + Candidate A.

Before legitimate validation, primary-organization counts remained zero for KnowledgeItems, ValidationRecords, MemoryChanges, and TrustEvidence. Candidate B remained proposed until its correct Source B validation.

## 17. Cross-Organization Rejection

The probe created a separate organization with its own Source and Candidate. Primary Source A + other-organization Candidate and other Source + primary Candidate both failed closed with `409 CONFLICT`. No cross-tenant existence was disclosed through a successful lookup, and neither organization received a trusted-memory side effect.

## 18. Candidate Tampering Rejection

The following attempts were rejected:

- fabricated candidate ID;
- nonexistent candidate using a valid-looking prefix;
- valid-prefix candidate ID derived from the wrong Source;
- valid candidate belonging to another Source;
- valid candidate belonging to another organization.

No attempt triggered candidate promotion or trusted-memory creation.

## 19. Evidence Binding Regression

Source A and Source B each had distinct Evidence. The positive Source A memory linked exactly one Evidence item, and its Evidence and Source IDs both matched Source A. Source B Evidence had zero links to the Source A memory. The authoritative transaction also retains the existing organization-and-Source Evidence predicate.

## 20. Rejected-Request Side-Effect Verification

After all rejected requests, the probe verified unchanged counts for:

```text
KnowledgeItem        0
ValidationRecord     0
MemoryChange         0
TrustEvidence        0
```

No candidate status changed, no Source or Evidence was rewritten, and no provenance record was created by an attack request.

## 21. Exactly-One-Evidence Regression

`npm run probe:doc-fix-003` passed unchanged. Its positive case still uses exactly one Source and exactly one Evidence item, creates active memory only after human validation, initializes trust at 20, leaves reuse/outcomes/patterns at zero, and keeps automation disabled.

## 22. Human Validation Authority

Neutral validation remains protected by `knowledge.promote` for Owner, Administrator, and Reviewer roles. FIX-006 did not broaden or narrow RBAC. The authenticated route remains the source of validator identity.

## 23. AI Authority

AI remains advisory. It may prepare candidate learning but cannot validate or promote its own candidate. FIX-006 added no AI capability or authority.

## 24. Provenance Reconstruction

After successful validation, the probe reconstructed the chain:

```text
KnowledgeItem A
  -> ValidationRecord with validator identity and rationale
  -> Candidate A with canonical Source-derived identity
  -> Source A
  -> Evidence A
```

The stored KnowledgeItem provenance, inspection response, validation history, and Evidence link all remained consistent.

## 25. Schema/Migration Assessment

`NO_SCHEMA_CHANGE`.

The deterministic identity contract is already persisted in candidate IDs and is compatible with historical candidates. No migration, backfill, new relationship, or schema decision was needed.

## 26. Existing V2 Regression Results

All required regression commands passed against a fresh development server:

- `npm run probe:oip-v2-fix-006` — PASS.
- `npm run probe:doc-fix-003` — PASS.
- `npm run probe:oip-v2-fix-001` — PASS.
- `npm run probe:oip-v2-fix-003` — PASS.
- `npm run probe:oip-v2-fix-004` — PASS.
- `npm run probe:oip-v2-fix-005` — PASS.
- `npm run qa:oip-v2-001r-r2-auto` — accepted with follow-ups; failure code `none`; readiness `DESIGN_PARTNER_READY_WITH_GUARDRAILS`.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npx prisma validate` — PASS.
- `npx prisma migrate status` — PASS; 28 migrations, database up to date.
- `git diff --check` — PASS; only pre-existing CRLF conversion warnings.

The QA harness emitted its accepted verdict and wrote the full report. The shell session retained a Node handle after report generation and was interrupted during cleanup; the generated QA report itself records the completed accepted run with no failure code.

## 27. Files Changed

Files changed for FIX-006:

- `lib/server/organizationalMemoryPrimitives.ts`
- `lib/server/organizationalMemoryService.ts`
- `lib/server/persistenceService.ts`
- `docs/implementation/15_API_ARCHITECTURE.md`
- `package.json` (added `probe:oip-v2-fix-006`; pre-existing dirty scripts were preserved)
- `scripts/oip-v2-fix-006-candidate-source-provenance-probe.cjs`
- `docs/audits/OIP-V2-FIX-006-candidate-source-identity-provenance-binding-hardening.md`

No Prisma schema or migration was changed. No historical audit or Canon document was rewritten.

## 28. CHANGELOG Assessment

`CHANGELOG_NOT_PRESENT`. No CHANGELOG was created or modified.

## 29. Repository State After

- Branch remains `landing/option-c32-release-polish`.
- Ending HEAD remains `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- Worktree remains dirty with the pre-existing changes plus the FIX-006 implementation, probe, implementation-document clarification, and report. The report is nested in the already untracked `docs/audits/` directory.
- No reset, clean, stash, restore, staging, commit, push, tag, deployment, or publication occurred.

## 30. Recommended Next Task

Keep the explicit candidate-to-Source invariant as a permanent regression gate. The next separate task may address any remaining non-blocking QA follow-ups, such as running the AUTO harness with its owned-server restart leg or defining a human-governed memory-consolidation policy. Do not merge or repair candidates automatically.

## 31. Verification Matrix

| Requirement | Result |
| --- | --- |
| Candidate explicitly bound to Source | PASS |
| Correct candidate validates | PASS |
| Same-org wrong candidate rejected | PASS |
| Reverse same-org mismatch rejected | PASS |
| Fabricated candidate rejected | PASS |
| Wrong deterministic candidate rejected | PASS |
| Cross-org candidate rejected | PASS |
| Wrong-Source Evidence rejected/excluded safely | PASS |
| Rejection creates no KnowledgeItem | PASS |
| Rejection creates no ValidationRecord | PASS |
| Rejection creates no MemoryChange | PASS |
| Rejection creates no trust mutation | PASS |
| Source provenance preserved | PASS |
| Evidence provenance preserved | PASS |
| Validator identity preserved | PASS |
| Exactly-one-Evidence admission preserved | PASS |
| No recurrence threshold introduced | PASS |
| No reuse threshold introduced | PASS |
| No trust admission threshold introduced | PASS |
| Preparation remains advisory | PASS |
| AI cannot validate | PASS |
| Tenant isolation preserved | PASS |
| Outcome behavior preserved | PASS |
| Retrieval behavior preserved | PASS |
| Challenge behavior preserved | PASS |
| FIX-005 selection behavior preserved | PASS |
| No schema change | PASS |
| No migration | PASS |
| No CHANGELOG created | PASS |

## 32. QA Readiness

`OIP_V2_CORE_BASELINE_READY_AFTER_FIX_006`

Candidate-to-Source binding is explicit, mismatch attempts fail closed with zero trusted-memory side effects, exactly-one-Evidence admission remains valid, tenant isolation passes, FIX-003/FIX-004/FIX-005 behavior remains intact, full automated V2 QA is accepted with guardrails, and no HIGH/CRITICAL regression was observed.

