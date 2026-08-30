# OIP-V2-FIX-003 — Domain-Neutral Retrieval, Outcome Idempotency & Trust-State Reconciliation

## 1. Executive Summary

Targeted repair completed for the four QA-001R blockers: Event B retrieval, exact-once Outcome retries, trust-zero presentation, and Outcome Source/work context. The repair remains deterministic, evidence-backed, organization-scoped, and human-governed. No vector search, embeddings, RAG, connectors, or schema migration were added.

## 2. Final Verdict

`OIP_V2_FIX_003_RETRIEVAL_OUTCOME_AND_TRUST_RECONCILED_AND_VERIFIED`

All four confirmed defects are closed. The unrelated pre-existing TODO-046 W07 safety failure remains unchanged and is recorded as a follow-up, not a FIX-003 regression.

## 3. Repository State Before

- Branch: `landing/option-c32-release-polish`
- Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`
- Worktree: already dirty with user-owned modified and untracked work from earlier OIP documentation, memory, and release tasks.
- Safety actions: no reset, clean, restore, checkout, stash, stage, commit, push, tag, deploy, or publish.

## 4. QA-001R Defect Baseline

QA-001R showed Event B cold-started instead of retrieving Event A; identical Outcome retries created duplicate rows and trust effects; trust 0 was presented as a generic trusted state; and Outcome history lacked named Source/work context. The exact warehouse Event A/B/C sequence was retained.

## 5. Retrieval Root Cause

Classification: `RETRIEVAL_DATA_GAP` plus `RETRIEVAL_QUERY_GAP`, exposed through the existing deterministic path. Neutral learning had useful symptom tokens but no bounded transition facet, while Event B used “moving between scanning zones” rather than “Wi-Fi roaming.” Compatibility therefore lacked shared positive evidence and failed closed. No retrieval-path split or architecture limit was found.

## 6. Retrieval Repair

Added deterministic, bounded normalization for offline synchronization wording and a generic `network-transition-synchronization` facet. Candidate scope notes now participate in inspectable retrieval text. Transition candidates fail closed when shared transition evidence is absent and are vetoed for firmware conflict. The repair is not warehouse- or fixture-string hard-coded.

## 7. Event A/B Matching Analysis

Event A produces warehouse, handheld/scanner, synchronization, offline, and network-transition evidence. Event B produces warehouse, handheld/scanner, synchronization, and movement-between-zone evidence. The candidate is retrieved through keyword/facet overlap, remains category-compatible, and is marked as a recall candidate requiring human review; it is not treated as truth merely because it was retrieved.

## 8. False-Positive Safeguards

The acceptance probe verifies no match for certificate-root-cause and backend-outage cases, and verifies the firmware case is not retrieved after scope narrowing. Existing contradiction, negation, weak-overlap, cross-domain, trust-independent, and tenant-isolation probes also pass.

## 9. Retrieval Explanation

Event B exposes deterministic explanation including shared keywords/facets, category compatibility, absence of stronger object confirmation, knowledge version, trust score, and the warning that similarity does not confirm accuracy. Scope and reliability are displayed separately.

## 10. Neutral Retrieval Path

Neutral Organizational Memory continues through the supported application/domain retrieval path. The repair uses the existing `KnowledgeItem` projection and deterministic `retrieveMemory`/compatibility logic; it does not create a second retrieval engine or pretend a neutral Source is a Support ticket.

## 11. Outcome Idempotency Root Cause

Root cause: `IDEMPOTENCY_KEY_NOT_STABLE`. The UI previously generated a fresh random identity for each retry, so the server correctly treated repeated deliveries as separate events. Database uniqueness and server handling could not deduplicate a logically new key.

## 12. Outcome Identity Model

The stable logical identity binds organization, knowledge item, knowledge version, Source/work type and object identity, classification, correction flag, and normalized outcome evidence. Two genuinely separate failures use different Source/work identities and remain separate.

## 13. Outcome Exact-Once Repair

The UI now derives a deterministic idempotency key from the logical Outcome identity and retains Source/work fields after commit. The server normalizes identity, checks for an existing matching Outcome before mutation, and returns the existing aggregate on replay. Conflicting reuse of the same key is rejected.

## 14. Concurrent Retry Behavior

The server-side uniqueness/concurrency path re-reads the existing Outcome after a unique conflict and returns it only when the logical identity matches. The FIX-003 probe verifies sequential and concurrent duplicate requests produce one Outcome and one trust effect.

## 15. Outcome Source/Work Binding

Outcome read models now project nested Source and Evidence. The UI shows Source/work title, source type, source/work identity, evidence, actor, timestamp, classification, and trust effect. The generic `REUSE_OUTCOME` relationship remains an audit type but is no longer the primary visible context.

## 16. Trust-State Root Cause

The numeric trust projection was being rendered as if it were governance state. The underlying model legitimately allowed an active memory with trust 0, but the presentation did not distinguish reliability from lifecycle and governance.

## 17. Lifecycle vs Governance vs Reliability

The UI now renders three independent projections: lifecycle (`active`/deprecated), governance (`trusted`/challenged and its restrictions), and reliability (`0–100` with Outcome counts). Automation eligibility is shown separately and is fail-closed for low trust or challenge state.

## 18. Trust-Zero Presentation

Trust 0 is displayed as `Reliability 0/100 · human review required`. An active memory may remain in the lifecycle, but it is not presented as unrestricted trusted guidance and remains human-review-only.

## 19. Trust Explanation

The explanation is deterministic: human validation identity, successful reuse count, correction/failure count, current score, Challenge state, scope note, and automation eligibility are all visible. The manual UI reached 0 after three distinct failures and displayed the reason without resetting history.

## 20. Challenge/Scope Interaction

Challenge opened with automation fail-closed. `SCOPE_UPDATED` created version 2, preserved the four historical Outcomes and challenge record, displayed the narrower scope, resolved governance to trusted, and left reliability at 0. Scope update did not reset trust or provenance.

## 21. Event C Post-Scope Retrieval

The probe confirms the firmware-specific Event C is not returned as an applicable match after scope narrowing. The UI also showed the narrowed scope and retained historical firmware failure evidence.

## 22. Persistence Restart Investigation

Classification: `TEST_DATA_BEHAVIOR` / environmental confusion, not a confirmed durability defect. The disposable UI tenant initially lacked its server-authority row, so the list adapter read empty local storage while the memory inspection API read PostgreSQL. After creating the same server-authority condition used by real organization provisioning, the memory survived page reload and a dev-server restart. The disposable tenant and user were then removed.

## 23. UI Refresh Reconciliation

All direct surface GETs now use `cache: "no-store"`; Outcome and Challenge mutations await authoritative inspection refresh. Manual verification showed the committed Outcome history, trust projection, version, Challenge resolution, and scope after clean reload. The initial stale list was caused by the invalid disposable-tenant authority fixture, not by durable Outcome loss.

## 24. Files Changed

Files touched for FIX-003:

- `lib/retrievalCompatibility.ts`
- `lib/memory.ts`
- `lib/server/persistenceService.ts`
- `lib/server/organizationalMemoryService.ts`
- `types/knowledge.ts`
- `types/organizationalMemory.ts`
- `components/views/OrganizationalMemorySurface.tsx`
- `scripts/oip-v2-fix-003-retrieval-outcome-trust-probe.cjs`
- `package.json`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/audits/OIP-V2-FIX-003-domain-neutral-retrieval-outcome-trust-reconciliation.md`

Other dirty files shown by Git predated or belong to adjacent user-owned work and were not cleaned or reverted.

## 25. Tests Added

Added `scripts/oip-v2-fix-003-retrieval-outcome-trust-probe.cjs` and the `probe:oip-v2-fix-003` npm script. The probe uses real HTTP/application/domain paths, with direct database access only for disposable setup and cleanup.

## 26. Acceptance Probe

`npm run probe:oip-v2-fix-003` passed with `OIP_V2_FIX_003_RETRIEVAL_OUTCOME_AND_TRUST_PROBE_PASSED`: Event B non-exact retrieval, certificate/backend/firmware safeguards, SUCCESS/CORRECTION_REQUIRED/FAILURE retries, concurrent retry, separate failures, Source/Evidence projection, trust effects, Challenge fail-closed behavior, scope update, and cross-organization isolation all passed.

## 27. Manual UI Verification

Passed in the actual app using a disposable server-authoritative QA tenant: Event A creation, five evidence items, prepare, human validation, Event B Ticket submission and memory explanation, named SUCCESS Outcome, three named FAILURE Outcomes, trust 0 presentation, Challenge OPEN, `SCOPE_UPDATED`, historical retention, current scope, and clean reload after server restart. Temporary tenant/user data was deleted afterward.

## 28. Regression Results

- OIP-V2-FIX-001 probe: PASS.
- OIP-V2-FIX-002 probe: PASS.
- NC-FIX-007 cross-domain retrieval: PASS, 18/18.
- TODO-030 weak-overlap safety: PASS.
- TODO-029 trust-independent selection: PASS.
- TODO-051 match explainability: PASS.
- TODO-046 weak-fallback safety: pre-existing `SAFETY_FAILURE_REMAINS`, one unchanged W07 notification case; snapshots unchanged and outside FIX-003 scope.
- Organization isolation and AI authority checks: PASS in FIX-003 and supporting probes.

## 29. Build/Typecheck/Lint

- `npx tsc --noEmit --pretty false`: PASS.
- `npm run build`: PASS; 13/13 static pages generated.
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS; schema up to date with 28 existing migrations.
- `npm run lint`: BLOCKED by the repository's deprecated interactive `next lint` configuration prompt; no lint configuration was changed.

## 30. Documentation Changes

Updated only the directly affected current limitation documentation with deterministic retrieval boundaries, trust/lifecycle/governance separation, fail-closed behavior, and Outcome identity/provenance notes. Historical QA and Canon documents were not rewritten by FIX-003.

## 31. Known Limitations

Retrieval remains deterministic and bounded; it supports the tested wording variation but is not generalized semantic search. Reliability is a projection, not a truth guarantee. TODO-046 W07 remains a pre-existing unrelated safety follow-up. Lint requires repository-level migration away from deprecated interactive `next lint`.

## 32. Deferred Capabilities

Vector databases, embeddings, RAG, hybrid search, knowledge graphs, connectors, autonomous agents, trust decay, automatic invalidation, automatic Challenge resolution, and broad UI redesign remain explicitly deferred.

## 33. Git Diff Summary

Starting HEAD and ending HEAD are identical because no commit was created. The FIX-003 implementation adds bounded retrieval metadata/compatibility, stable Outcome identity and projections, trust-state UI clarification, a probe, and current limitation documentation. No migration directory or schema change was added by FIX-003.

## 34. Repository State After

- Ending HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`.
- Worktree remains dirty with the pre-existing user-owned changes plus the FIX-003 touched files and report.
- No staged files, commits, pushes, tags, deployments, or publications.
- Disposable QA tenant and user were removed.

## 35. QA Rerun Readiness

`QA_001R_RERUN_READY`. All four confirmed defects are closed and no new FIX-003 HIGH/CRITICAL regression was found. The unrelated TODO-046 failure remains explicitly tracked and unchanged.

## 36. Recommended Next Task

Rerun `OIP-V2-QA-001R` using its exact warehouse Event A/B/C sequence, then separately scope TODO-046 W07 notification safety and migrate the repository away from the interactive deprecated lint command.

## Defect Closure Matrix

| Defect | Closure |
|---|---|
| RETRIEVAL-001 | CLOSED |
| OUTCOME-IDEMPOTENCY-001 | CLOSED |
| TRUST-STATE-001 | CLOSED |
| OUTCOME-CONTEXT-001 | CLOSED |

## Final Verification Matrix

| Requirement | Result |
|---|---|
| Event B retrieves Event A | PASS |
| Retrieval is non-exact-text | PASS |
| Retrieval explanation is inspectable | PASS |
| Backend outage does not strongly match | PASS |
| Certificate issue does not strongly match | PASS |
| Firmware issue is scoped out after SCOPE_UPDATED | PASS |
| SUCCESS/CORRECTION_REQUIRED/FAILURE retries are idempotent | PASS |
| Trust and counters apply once | PASS |
| Concurrent retry exact-once | PASS |
| Separate real outcomes remain separate | PASS |
| Outcome Source/work context and Evidence visible | PASS |
| Trust 0 is not unrestricted trusted guidance | PASS |
| Lifecycle and reliability are distinct | PASS |
| Challenge remains fail-closed | PASS |
| Scope update preserves provenance/history | PASS |
| Support regressions pass | PASS |
| Organization isolation passes | PASS |
| AI authority unchanged | PASS |
| No vector/RAG/connectors added | PASS |

## Direct Answers 1–20

1. Event B originally failed because normalized transition evidence was missing on the neutral item/query pair, so compatibility failed closed.
2. Added bounded deterministic synchronization/transition facets, aliases, scope-note retrieval text, and firmware/insufficient-evidence vetoes.
3. No. No vector search or embeddings were added.
4. Yes, through the supported application/domain path and the exact FIX-003 probe.
5. Expired certificate, backend outage, firmware after scope narrowing, contradiction/negation, weak overlap, cross-domain, and tenant-isolation cases were tested.
6. Yes. The narrowed scope causes the firmware case to fail compatibility and the probe passes.
7. The UI generated a fresh random idempotency key for retries.
8. Organization, knowledge/version, Source/work identity, classification, correction flag, and evidence define the logical submission.
9. No. The server returns the existing Outcome and does not apply a second trust delta or counter update.
10. Yes. Different Source/work identities remain separate Outcomes.
11. Yes. History shows named Source/work title, type, identity, actor, time, classification, evidence, and trust effect.
12. Trust 0 means reliability is exhausted for recommendation purposes; human review is required, while lifecycle and governance remain separately visible.
13. Yes. A memory can remain active while reliability is 0, without being shown as unrestricted trusted guidance.
14. The UI labels lifecycle, governance, reliability, and automation eligibility in separate fields and explanations.
15. Yes. Challenge opens a fail-closed automation state; after scope review, the resolved decision and current scope remain visible.
16. No. The numeric trust formula was not changed.
17. No. AI remains advisory and cannot authorize unsupported reuse.
18. No. Support retrieval and related explainability/safety probes pass.
19. No. No vector, RAG, embedding, connector, or broad search infrastructure was added.
20. Yes: `QA_001R_RERUN_READY`.
