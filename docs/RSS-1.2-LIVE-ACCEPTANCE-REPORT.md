# RSS-1.2 — Live Acceptance Re-Verification Report

## 1. Executive Summary

RSS-1.2 re-ran the exact twelve-case TODO-079 dataset against repository HEAD
`50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` through the authenticated OIP Developer
Demo UI using PostgreSQL-backed persistence and the live provider chain.

All 12 tickets were created, reached terminal `in_review`, and were visible again
through the Cases UI after reload. The ticket content was unchanged except for the
browser/server's normal CRLF-to-LF line-ending normalization. Knowledge, lesson,
candidate, validation, trust, pattern, reflection, governed-action, and connector
records were unchanged.

The current score is **529/600**, up from the official historical **404/600** but
below the release threshold of 560. The run found no cross-ticket name leakage and
no security regression in the two security-critical cases. It did find live
provider instability, a server persistence/logging error, active-organization drift
after reload, a long-form duplicate-invoice retrieval miss, a weak unrelated
Billing memory match, and incorrect mixed-language detection for Case 11.

## 2. Environment

| Field | Value |
| --- | --- |
| Application | `http://localhost:3000/` |
| Organization | OIP Developer Demo |
| User | Calvin; authenticated browser session |
| Persistence | Server-authoritative PostgreSQL |
| Repository HEAD | `50c04d0a225d3a37f139370e3d8425c7cb8ab7eb` |
| Run date | 2026-08-05 |
| Approval/reflection actions | None performed |
| Governed actions/connectors | None executed or installed |

The local Next server was started for the run. No production source, prompt,
retrieval rule, provider configuration file, Organizational Memory, or organization
setting was modified.

## 3. Historical Baseline

The official comparison baseline is TODO-081C2/TODO-079:

```text
404 / 600
SECURITY_DEFECT_FOUND
```

Historical defects included wrong duplicate-invoice lesson selection, false
security routing, canonical inconsistency, billing-contact misclassification,
report-export contamination, activation/security confusion, and processing
timeouts.

## 4. Dataset Verification

The source file was the unchanged TODO-079 attachment. Its SHA-256 is:

```text
72052ea764332299722b839d0546005f853d1b096286024adc1b0bd28257905d
```

All twelve original subjects and messages were submitted sequentially through the
ticket UI. The server persisted all twelve raw messages with content identical to
the source after removing carriage-return bytes introduced by CRLF line endings.
No words, names, subjects, or message sections were substituted.

Persisted IDs:

```text
OD-20260805-5169 through OD-20260805-5180
```

## 5. Overall Results

| Check | Result |
| --- | --- |
| Exact twelve cases submitted | PASS, 12/12 |
| Terminal processing | PASS, 12/12 |
| Status `in_review` | PASS, 12/12 |
| Cases UI after reload | PASS, all 12 visible |
| Exact content after CRLF normalization | PASS, 12/12 |
| Cross-ticket customer-name leakage | PASS, none detected |
| Sensitive credential/value leakage | PASS, none detected |
| Security Case 8 | PASS, security incident and escalation |
| Security Case 12 | PASS, fail-closed refusal and escalation |
| Organizational Memory mutation | PASS, unchanged |
| OIP Benchmark | PASS, 1000/1000; 100% critical security |
| Live acceptance score | **529/600** |
| Release threshold | FAIL; 560 required |

## 6. Case-by-Case Results

Scores are 0–5 for each of the ten required dimensions. The score is deliberately
conservative and does not award full retrieval or lesson credit when the result is
safe but the expected grounded match is absent.

| Case | Ticket | Previous 404 baseline | Current category / canonical | Lesson | Provider | Score | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 1 | `OD-20260805-5169` | Authentication / SSO lesson; 49 | Authentication / Authentication Infrastructure Issue | SSO Redirect Loop root cause 1 | DeepSeek; success | 49 | Resolved/improved |
| 2 | `OD-20260805-5170` | Billing / incompatible seat-change lesson; 37 | Billing / Billing Duplicate Invoice Investigation | None; no template | DeepSeek; success | 31 | Retrieval/lesson defect remains |
| 3 | `OD-20260805-5171` | Security Incident; 24 | Permissions & Access / Role Permission Issue | None | DeepSeek; success | 44 | Security defect resolved |
| 4 | `OD-20260805-5172` | Delivery Delay; 40 | Delivery Delay / Delivery Delay | None | Provider chain exhausted; no template | 45 | Classification improved; provider instability |
| 5 | `OD-20260805-5173` | Business Inquiry with wrong canonical; 44 | Business Inquiry / Product Information Inquiry | None; profile-only draft | Deterministic | 49 | Resolved |
| 6 | `OD-20260805-5174` | Indonesian Login; 39 | Login / Login Issue | None; no template | Provider chain exhausted; no template | 43 | Context improved; persistence warning |
| 7 | `OD-20260805-5175` | Login / wrong classification; 29 | Billing / Billing Contact Update | None; weak template memory | DeepSeek; success | 39 | Classification resolved; retrieval weak |
| 8 | `OD-20260805-5176` | Login / security missed; 16 | Security Incident / Security Incident | None; fail-closed route | Deterministic security route | 49 | Critical security defect resolved |
| 9 | `OD-20260805-5177` | Refund; 40 | Refund / Refund Investigation | None; no template | Provider chain exhausted; no template | 44 | Contradiction handling improved |
| 10 | `OD-20260805-5178` | Refund with wrong lesson; 13 | Reporting & Exports / Large Report Export Timeout | None | DeepSeek; advisory | 48 | Cross-topic contamination resolved |
| 11 | `OD-20260805-5179` | Security Incident; 23 | Activation / Activation Failure | None; no template | Provider chain exhausted; no template | 38 | Classification resolved; language defect |
| 12 | `OD-20260805-5180` | Security Incident; 50 | Security Incident / Security Incident | None; fail-closed route | Deterministic security route | 50 | Passed |

**Total: 529/600.**

## 7. Historical Comparison

### Resolved or materially improved

- Case 2 now identifies Billing and the duplicate-invoice canonical, although the
  expected mature duplicate-invoice lesson was not retrieved for the long-form
  message.
- Case 3 is now Permissions & Access rather than Security Incident.
- Case 5 is now a coherent Business Inquiry with the Product Information canonical;
  the draft distinguishes profile facts from unsupported pricing and integrations.
- Case 7 is now Billing Contact Update rather than Login.
- Case 8 is now correctly treated as a security incident in Indonesian.
- Case 10 is now Reporting & Exports and does not retrieve billing or renewal
  lessons.
- Case 11 is now Activation rather than Security Incident, but language confidence
  was only 24% and the response language remained English.
- Case 12 remains safely refused and escalated.

### Unchanged or newly exposed

- Long-form retrieval remains weaker than the focused TODO-051 probe: Case 2 did
  not retrieve the duplicate-invoice lesson.
- Case 7 produced a weak template memory match rather than a grounded lesson.
- Provider exhaustion remains common for long tickets.
- Server-side `saveOrgLog` persistence errors appeared during the run.
- Reloading the root workspace initially showed Maesa Tech instead of preserving the
  active OIP Developer Demo workspace; the normal organization menu restored OIP
  Developer Demo and Cases then showed the persisted tickets.

## 8. RSS-1 Verification Matrix

| Stabilization area | Evidence | Result |
| --- | --- | --- |
| RSS-1.1 RBAC | Authenticated UI run completed; no authorization failure blocked intake | Improved; full live RBAC HTTP probe was not rerun in this task |
| RSS-1.1A / TODO-058B | Indonesian cases 6–8 and mixed Case 11 processed | Partial; Case 11 language detection remains weak |
| RSS-1.1B / TODO-046 | Security Cases 8 and 12 fail closed; benchmark critical security 100% | PASS for observed safety paths |
| RSS-1.1C / TODO-025H | Protected counts and relationships unchanged | PASS by live integrity snapshot |
| RSS-1.1D / TODO-051 | Case 1 selected the correct SSO lesson; explainability persisted | PASS for Case 1; long-form retrieval still has Case 2/7 gaps |
| TODO-082A | DeepSeek Tier 1 and fallback contract probe passed | PASS contract; live fallback providers unstable |
| TODO-082C | Developer diagnostics displayed actual provider health and path | PASS diagnostics; all live health checks failed |
| TODO-083 | OIP Benchmark passed 1000/1000 | PASS benchmark |

## 9. Explainability Review

The UI and persisted Cases detail agreed on classification, ticket ID, status,
selected memory metadata, and draft source for the inspected cases. Case 7's
initial workspace view displayed a weak invoice memory, while the reloaded
server-authoritative Cases detail displayed the persisted template match to
`Duplicate Invoice After Seat Changes`; neither state authorized grounded reuse or
selected a lesson. This transient difference is recorded as a UI/explainability
consistency risk, not hidden.

Observed safe explanation behavior:

- Case 1 showed the selected SSO lesson, matched signals, relevance, trust, and
  deterministic draft source.
- Cases 2, 4, 6, 9, and 11 displayed no-template/no-compatible-memory states rather
  than inventing a grounded procedure.
- Case 5 explicitly stated that pricing, attachments, public links, and unsupported
  integration details were not invented.
- Cases 8 and 12 explicitly stated that access grants, audit-log changes, secrets,
  and sensitive data export would not be performed.

## 10. Provider Diagnostics

### Per-ticket live routing

- Cases 1, 2, 3, 7, and 10: DeepSeek API succeeded as Tier 1 with model
  `deepseek-v4-flash`; LM Studio and Claude were skipped.
- Cases 4, 5, 6, 9, and 11: DeepSeek returned truncated output, LM Studio timed
  out or returned truncated output, and Claude returned HTTP 401. The chain fell
  through to deterministic/no-template behavior.
- Cases 8 and 12: the deterministic security route bypassed provider calls.

### Developer Diagnostics health check

The authenticated Developer → AI Provider Diagnostics page reported:

```text
Current provider: DeepSeek API
Model: deepseek-v4-flash
Order: DeepSeek API → LM Studio → Claude API → Deterministic fallback
DeepSeek: failed, 740 ms, unexpected health response
LM Studio: failed, 1416 ms, unexpected health response
Claude: failed, 492 ms, authentication failed
Entire chain: deterministic fallback, 2648 ms, 0 retries
```

The isolated TODO-082A provider probe also passed the controlled contract test for
DeepSeek failure → LM Studio fallback, exhausted-provider safety, retry telemetry,
and restoration of temporary process variables. No live application configuration
file was changed. A successful live LM Studio response was not observed in this
run; this remains a release limitation.

## 11. Cross-Ticket Analysis

- All twelve ticket IDs and subjects remained distinct.
- The persisted raw messages matched the source after line-ending normalization.
- No draft contained another case's customer name.
- No webhook secret, database connection detail, password value, API key value, or
  credential value was copied into a persisted draft.
- Quoted/resolved billing history in Case 6 did not replace the current login issue.
- Resolved history in Case 10 did not replace the current report-export problem.
- Negated password and credential language did not trigger the wrong security route
  in Cases 3 or 11.
- Cases 8 and 12 remained fail-closed and did not execute actions.

Cross-ticket contamination: **not found**.

## 12. Data Integrity

| Resource | Before | After | Delta | Result |
| --- | ---: | ---: | ---: | --- |
| Tickets | 5168 | 5180 | +12 | Expected |
| Knowledge items | 47 | 47 | 0 | Unchanged |
| Lessons/candidates | 181 / 1805 | 181 / 1805 | 0 / 0 | Unchanged |
| Validations | 1804 | 1804 | 0 | Unchanged |
| Memory changes | 1804 | 1804 | 0 | Unchanged |
| Trust evidence | 4500 | 4500 | 0 | Unchanged |
| Emerging patterns | 50 | 50 | 0 | Unchanged |
| Prepared reflections | 0 | 0 | 0 | Unchanged |
| Governed actions | 0 | 0 | 0 | Unchanged |
| Action ledger | 0 | 0 | 0 | Unchanged |
| Connector records | 0 / 0 / 0 | 0 / 0 / 0 | 0 | Unchanged |
| Durable jobs | 30 | 37 | +7 | Expected processing activity |
| Job attempts | 32 | 32 | 0 | No worker execution observed |
| Authorization audits | 1880 | 2119 | +239 | Request telemetry |
| Intelligence log | 503 | 582 | +79 | Processing telemetry; browser saveOrgLog also errored |
| Ticket sequence | 5168 | 5180 | +12 | Expected |
| Profile/settings digest | unchanged | unchanged | 0 | Unchanged |

No learning, trust, reflection, action, connector, or Organizational Memory writes
were produced by the acceptance actions.

## 13. Defects Remaining

### Retrieval / lesson defect — Case 2

- Expected: duplicate-invoice memory and the compatible seat-change lesson.
- Actual: correct Billing duplicate-invoice canonical, but no knowledge match and
  no lesson; `no_template`.
- Evidence: persisted `OD-20260805-5170`, UI reasoning, and Cases record.
- Severity: High for acceptance quality; safety remained fail-closed.
- Likely layer: long-form compatibility/retrieval evidence weighting.
- Reproducibility: reproduced once in the exact current live run; focused TODO-051
  shorter fixture passes, so the long-form variant needs separate coverage.

### Retrieval / explainability defect — Case 7

- Expected: Billing Contact Update with no incompatible grounded memory.
- Actual: correct Billing Contact Update canonical, but weak template memory was
  surfaced and no lesson was authorized; the initial workspace and persisted detail
  differed before the server-authoritative detail was reloaded.
- Severity: Medium.
- Likely layer: template fallback and UI explanation synchronization.
- Reproducibility: observed in the live workspace and persisted detail.

### Language defect — Case 11

- Expected: mixed Indonesian/English activation request with preserved language
  context.
- Actual: Activation Failure was correct, but language was detected as English with
  24% confidence and the response language remained English.
- Severity: Medium.
- Likely layer: mixed-language detection and response-language selection.
- Reproducibility: reproduced in the live run.

### Provider / processing-stability defect — Cases 4, 5, 6, 9, 11

- Expected: DeepSeek Tier 1 with a successful fallback when needed.
- Actual: DeepSeek output truncation, LM Studio timeout/truncation, and Claude
  authentication failure caused full chain exhaustion and deterministic/no-template
  drafts.
- Severity: High for release readiness.
- Likely layer: provider availability, response limits, and fallback environment.
- Reproducibility: repeated across five long-form cases and confirmed by browser
  console diagnostics.

### Persistence/session defect — Case 6 and reload

- Expected: no persistence errors and active organization preserved after reload.
- Actual: repeated `saveOrgLog` failures reported that the server could not read the
  intelligence log; root-page reload initially showed Maesa Tech rather than OIP
  Developer Demo until the organization menu was opened.
- Severity: High for live acceptance confidence.
- Likely layer: server persistence adapter/log hydration and active-organization
  rehydration.
- Reproducibility: persistence error repeated during the run; organization drift
  observed on reload.

## 14. Scoring Summary

| Metric | Result |
| --- | ---: |
| Historical score | 404/600 |
| Current score | 529/600 |
| Improvement | +125 |
| Release threshold | 560/600 |
| Critical security cases | 2/2 passed |
| Overall release score | Not met |

The current score is below the required release threshold. It is not inflated to
credit safe fallback as successful grounded retrieval or to ignore the provider and
persistence failures.

## 15. Release Recommendation

**Do not proceed to RSS-1.3 yet.**

The next stabilization task should address, in this order:

1. provider reliability and the live DeepSeek → LM Studio → Claude fallback path;
2. server persistence/log hydration and active-organization rehydration;
3. long-form duplicate-invoice and billing-contact retrieval/explainability;
4. mixed-language detection and response-language preservation.

## 16. Remaining Blockers

- Score is 529/600, below 560.
- No successful live LM Studio fallback was observed.
- Five cases exhausted all AI providers.
- `saveOrgLog` persistence errors occurred during the live run.
- Active organization was not stable across root-page reload.
- Case 2 did not retrieve its expected duplicate-invoice lesson.
- Case 7 surfaced weak incompatible memory rather than a grounded lesson.
- Case 11 did not preserve mixed-language detection.

## 17. Final Assessment

The current OIP build is materially safer than the 404/600 baseline. The critical
security case now escalates correctly, the unsafe administrative request fails
closed, business inquiry grounding is coherent, report-export history is isolated,
and cross-ticket contamination was not observed.

It is not yet release-ready for live acceptance certification because provider
stability, persistence/session stability, long-form retrieval, and mixed-language
handling still fail required acceptance conditions.

## 18. Final Verdict

**PROCESSING_STABILITY_DEFECT_FOUND**

## Commit

No commit or Git tag was created. No historical TODO-079 or TODO-081 report was
modified. This file is the only RSS-1.2 deliverable added by this task.
