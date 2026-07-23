# TODO-051 Match Percentage Explainability & Authorization Consistency Report

## Verdict

COMPLETED_WITH_UI_MODEL_CHANGE

The old numeric display was removed from the user-facing retrieval/provenance UI. The underlying intrinsic score remains available for deterministic ranking and regression diagnostics, but it is no longer presented as a calibrated percentage.

## Root Cause

The UI rendered `KnowledgeMatch.matchScore` as `${matchScore}% match`. That field is a bounded heuristic ranking score, not a probability, confidence percentage, or calibrated relevance scale. Authorization is decided by category/root-cause compatibility, strong validated lesson evidence, contradiction gates, and the existing semantic authorization path. Therefore a low intrinsic retrieval score could coexist with an authorized lesson, while a high-trust or category-only candidate could remain unauthorized.

A second inconsistency was found in `withPreDiscriminationLessonMatches`: a strong lesson match replaced the intrinsic score with `Math.max(existingScore, 95)`. That made lesson evidence look like a 95% retrieval match. The fix preserves the existing score and lets lesson evidence appear as its own structured field.

## Previous Match Percentage Meaning

The displayed field was `topMatch.matchScore`, sourced from `retrieveMemory()` in `lib/memory.ts` and rendered in `components/ProvenancePanel.tsx` and the OIP timeline.

Current formula before the UI change:

```text
matchScore = categoryPoints
           + tagPoints
           + keywordPoints
           + conceptPoints
           + phrasePoints
           + sessionPoints
           + reusePoints
```

The current component bounds are:

| Component | Formula | Maximum |
|---|---:|---:|
| Category | exact category match | 55 |
| Tags | `min(matchedTags * 10, 30)` | 30 |
| Specific keywords | `min(count * 3, 12)` | 12 |
| Broad keywords | `min(count, 3)` | 3 |
| Problem concepts | `min(matchedConcepts * 14, 28)` | 28 |
| Exact canonical phrase | boolean | 20 |
| Session-created item | boolean | 8 |
| Reuse history | TODO-047 sets this to 0 | 0 |

The raw component maximum is 156. The returned score is `min(rawScore, 100)` and candidates with score 0 are filtered out. The score has no natural probabilistic maximum and no calibration data. Trust does not contribute to this score in the current TODO-047 implementation.

The repository does not contain a current 2,000-point divisor. The 4–6% symptom is nevertheless misleading for the same fundamental reason: sparse retrieval points were rendered with a percent sign even though they represented lexical/canonical ranking evidence, not a 0–100 probability. Semantic lesson authorization was evaluated separately. The direct 95-point lesson override was also misleading in the opposite direction and has been removed.

## Why 4–6% Appeared

The low values represented low intrinsic retrieval evidence in the score being displayed, not “the system thinks this is only 4–6% relevant.” A candidate could still be selected as the canonical retrieval boundary and then authorized through strong lesson evidence or high-confidence semantic compatibility. The percentage made a ranking signal look like a calibrated confidence statement.

The corrected UI does not attempt to rescale those points. It uses ordinal labels only: Strong, Moderate, Weak, or None. Authorized semantic lesson paths explicitly surface Strong relevance and Strong lesson evidence because the authoritative authorization result confirms the validated lesson path; this does not alter ranking or thresholds.

## Relevance vs Lesson Evidence vs Trust vs Authorization

| Concept | Meaning | UI treatment |
|---|---|---|
| Relevance | How well the current ticket matches the selected canonical problem for retrieval/ranking | `Relevance: Strong/Moderate/Weak/None` |
| Lesson evidence | How strongly current-ticket evidence supports a specific validated lesson | `Lesson evidence: Strong/Weak/None` |
| Trust | Historical reliability of the Organizational Memory | `Trust: N/100` |
| Authorization | Whether grounded Organizational Memory may be used for this ticket | Separate `Decision` field |

Trust never substitutes for relevance. Trust continues to affect the existing resolution policy and automatic-versus-human path; it does not change the relevance display or canonical selection.

## Authorization Consistency Audit

| Case | Relevance display | Lesson evidence | Authorization | Draft mode |
|---|---|---|---|---|
| Strong canonical + strong lesson | Strong | Strong | Authorized | `lesson_grounded` |
| Strong canonical + weak lesson | Strong | Weak | Not authorized | `no_template` |
| Weak canonical + strong trust | Weak | None/Weak | Not authorized | `no_template` |
| Strong canonical + low trust | Strong | Strong | Subject to existing trust policy; relevance unchanged | `lesson_grounded`, human review when required |
| Wrong domain + high lexical overlap | At most a retrieval candidate | None/Weak | Not authorized | `no_template` |
| Semantic paraphrase + low lexical overlap | Strong after authorized semantic lesson result | Strong | Authorized | `lesson_grounded` |
| Exact wording + strong evidence | Strong | Strong | Authorized | `lesson_grounded` |
| Generic same-category ticket | Moderate or Weak | None/Weak | Not authorized | `no_template` |
| Contradictory ticket | Candidate may be visible before veto; no authorized reuse | None | Not authorized | `no_template` |
| Cold start | None | None | No compatible memory used | `cold_start` |

Rejected candidates now show `Relevant memory found, but not authorized for reuse` and a separate decision. They no longer show an authorized-looking percentage.

## New Explainability Model

The production UI now shows:

```text
Relevance: Strong
Lesson evidence: Strong
Trust: 95/100
Decision: Grounded Organizational Memory authorized

Why:
- Correct problem category
- Problem-specific evidence
- Validated lesson evidence
- Selected canonical ranked first among authorized candidates
```

For fail-closed cases it shows the same independent fields with:

```text
Decision: Not authorized for grounded reuse
```

For cold start it shows:

```text
Decision: No compatible Organizational Memory used
```

The labels are ordinal explanations, not probabilities. The explanation is built from structured `KnowledgeMatch`, lesson-match, response-grounding, and authorization state. It does not expose chain-of-thought.

## Production Fix

- Added `lib/relevanceLabels.ts` for non-probabilistic ordinal relevance labels.
- Added `lib/explainability.ts` and typed `MatchExplainability` output.
- Replaced UI `${matchScore}% match` with relevance, lesson evidence, trust, decision, and structured evidence.
- Added an explicit rejected-memory explanation for `no_template` results.
- Removed the artificial `Math.max(existingScore, 95)` lesson-score override while preserving ranking behavior.
- Preserved the existing authorization thresholds and contradiction/compatibility gates.
- Propagated semantic lesson authorization into draft grounding so semantic paraphrases are displayed as lesson-grounded.
- Removed percent-like match wording from analyzer, draft confidence notes, logs, and reflection UI.
- Added `probe:todo051-match-explainability`.

## Authorized Match Results

The focused probe confirms authorized cases report `Relevance: Strong`, `Lesson evidence: Strong`, and an authorized decision. The selected canonical and validated lesson remain unchanged by the UI model change.

## Rejected Match Results

Weak overlap, wrong-domain lexical overlap, contradictions, and generic same-category tickets remain fail-closed. The UI reports the candidate as not authorized rather than implying it is safe to reuse.

## Semantic vs Exact-Word Results

The probe confirms an authorized semantic paraphrase and an exact-word match produce the same authorization decision and the same strong lesson-grounded explanation. Exact wording may strengthen internal retrieval ranking, but it does not create a separate customer-facing probability scale.

## Trust Independence Results

The focused probe tested equivalent relevant knowledge at trust scores 1, 50, 68, 95, and 100. Relevance, lesson evidence, and authorization explanation remained identical. TODO-029 passed: a lower-trust but more relevant item still wins, and high trust cannot rescue irrelevant or weak evidence.

## Five Manual Case Results

| Case | Selected canonical | Selected lesson | Relevance | Lesson evidence | Trust | Authorization | Draft mode |
|---|---|---|---|---|---:|---|---|
| Calvin — duplicate subscription charge | `demo-ki-duplicate-invoice-seat-change` | `demo-les-duplicate-invoice-seat-change-001` | Strong | Strong | 95 | Authorized | `lesson_grounded` |
| Satya Nadella / Microsoft — duplicate integration events | `demo-ki-webhook-delivery-replay` | `demo-les-webhook-delivery-replay-001` | Strong | Strong | 68 | Authorized | `lesson_grounded` |
| Luna / Mawar Biru — role/access issue | `demo-ki-guest-workspace-access` | `demo-les-guest-workspace-access-001` | Strong | Strong | 68 | Authorized | `lesson_grounded` |
| Rishi Sunak / British Government — dashboard totals | None | None | None | None | — | Not authorized | `cold_start` |
| Mark Suker / Meta — SSO loop | `demo-ki-sso-certificate-redirect-loop` | `demo-les-sso-certificate-redirect-loop-001` | Strong | Strong | 95 | Authorized | `lesson_grounded` |

The reporting case safely fails closed, as required.

## AI Independence

The display is derived from deterministic structured retrieval/evidence and the already-recorded authorization/grounding state. No live Claude call is required to render the explanation. AI cannot invent the relevance label, trust score, or authorization state.

## Focused Probe Results

`npm run probe:todo051-match-explainability` passed. It covers:

- strong authorized match;
- semantic paraphrase;
- exact-word match;
- weak overlap;
- high-trust irrelevant knowledge;
- low-trust relevant knowledge;
- wrong domain;
- contradiction;
- cold start;
- all five manual cases;
- trust scores 1/50/68/95/100;
- explanation state equal to the actual grounded-memory decision.

## Regression Results

Passed serially to avoid concurrent Prisma connection contention:

- TODO-051 focused probe
- TODO-052, TODO-050, TODO-049, TODO-048, TODO-047, TODO-046, TODO-045
- TODO-044, TODO-041, TODO-040
- TODO-030, TODO-029, TODO-028, TODO-027
- BUG-008 semantic and retrieval probes
- BUG-010 profile pipeline probe
- TypeScript `tsc --noEmit`
- production `npm run build`

The first attempted parallel database batch was stopped by PostgreSQL connection closure; the complete requested set passed on the serial rerun.

## Mature Data Safety

No mature knowledge, lessons, trust, TrustEvidence, tickets, validations, MemoryChangeRecords, provenance, or OrgMetrics were modified. The probes were read-only. Mature-data digests were unchanged, and HERO provenance remains `OIP-20230104-0001`.

## Remaining Findings

The existing TODO-049 report retains its documented synthetic-data note for one encoding case; this task does not alter that dataset. The internal numeric retrieval score remains in the data model because ranking and regression code still use it, but it is intentionally not presented as a probability-like UI value.

## TODO-051 Status

COMPLETED_WITH_UI_MODEL_CHANGE

## Commit

Not committed; no commit was requested.
