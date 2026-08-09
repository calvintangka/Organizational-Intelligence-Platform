# RSS-1.2S5 — Prompt Injection Hardening Report

**Status:** Completed with limitations  
**Final verdict:** `COMPLETED_WITH_LIMITATIONS`

## 1. Executive Summary

OIP's six active AI advisory prompts now establish an explicit trust boundary: system instructions are separate from application context, and all raw and ticket-derived values are enclosed in an `UNTRUSTED TICKET DATA` section between unambiguous begin/end delimiters. The shared provider adapter now accepts only a single, exact JSON object matching the operation-specific schema; malformed, wrapped, partial, multi-object, unexpected-key, incorrect-type, and reasoning-channel output is rejected and retried once before provider fallback.

Business logic, retrieval, trust, memory, reflection, RBAC, connectors, and ticket lifecycle behavior were not changed.

## 2. Root Cause

Before this change, ticket subject and description values were directly interpolated next to application instructions in each prompt. The prior parser also searched for a JSON object within provider text, which could accept leading/trailing prose or wrappers. These patterns made prompt instruction/data boundaries ambiguous and structured-output acceptance too permissive.

## 3. Prompt Inventory

| Prompt | Purpose | Input | Expected output | Structured schema | Potential injection surface |
|---|---|---|---|---|---|
| Ticket analysis | Advisory classification/context extraction | Ticket, profile, deterministic understanding | Analysis suggestion | Summary/category/urgency/entities/tags/confidence/rationale/fields | Subject, description, derived fields |
| Canonical suggestion | Advisory canonical-problem naming | Ticket, profile, deterministic canonical candidate | Title suggestion | title/confidence/rationale | Subject, description, derived candidate |
| Pattern naming | Advisory pattern title | Ticket and deterministic pattern | Title suggestion | title/confidence/rationale | Subject, description, pattern text |
| Knowledge enrichment | Advisory knowledge fields | Ticket, matched knowledge, profile | Enrichment | four string arrays/confidence | Ticket and derived summary |
| Customer drafting | Advisory customer response | Ticket, deterministic context, validated grounding | Customer response | customerResponse/confidence | Ticket and extracted fields |
| Match discrimination | Advisory same/distinct decision | Ticket, memory candidate | Match decision | isDistinctFromMatch/confidence/reasoning | Ticket and derived understanding |
| Provider health diagnostic | Fixed provider availability check | No ticket or organization data | Literal `OK` | Exact plain text | None (fixed empty user-data boundary) |

| Prompt | Hardened | Delimiters | Structured Output | Injection Safe |
|---|---|---|---|---|
| Ticket analysis | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Canonical suggestion | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Pattern naming | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Knowledge enrichment | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Customer drafting | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Match discrimination | Yes | Yes | Exact schema | Yes (deterministic probe) |
| Provider health diagnostic | Yes | Yes | Exact `OK` token | Yes (mocked probe) |

There are no separate checked-in AI prompt files or additional provider prompt builders in the active `lib/ai` provider surface. Provider health diagnostics use a fixed harmless probe prompt and do not interpolate ticket data.

## 4. Prompt Boundary Design

Every active prompt uses these layers:

1. `SYSTEM`: immutable instructions, explicit refusal to follow ticket instructions, secret/prompt/memory non-disclosure, no mutation authority, and JSON-only contract.
2. `APPLICATION CONTEXT`: deterministic constraints, approved profile/grounding, and task-specific rules.
3. `UNTRUSTED TICKET DATA`: raw subject/description plus ticket-derived values, clearly labelled as data rather than instructions.

The system prompt explicitly rejects attempts to change behavior, become another model, disable safety, disclose prompts/secrets/memory, change trust or retrieval, mutate governance, bypass validation, or execute commands.

## 5. Delimiter Strategy

The common prompt helper emits the following fixed boundary in every prompt:

```text
UNTRUSTED TICKET DATA
--------------------
<<<BEGIN OIP UNTRUSTED TICKET DATA>>>
Subject: ...
Description: ...
...derived ticket data...
<<<END OIP UNTRUSTED TICKET DATA>>>
END OF USER DATA
```

Application instructions always occur before the boundary. The RSS-1.2S5 probe asserts that adversarial content never appears before it.

## 6. Structured Output Validation

The shared OpenAI-compatible adapter now requires all of the following:

- One complete JSON object only; no extraction from surrounding text.
- No markdown, code fences, leading/trailing prose, partial JSON, or multiple objects.
- Exact operation-specific keys; unexpected and missing keys fail.
- Exact field types, confidence ranges, enum values, and nested extracted-field keys.
- No `reasoning_content` accepted as an answer channel.
- One retry after malformed or schema-invalid output; then normal DeepSeek/LM Studio/Claude fallback and finally deterministic behavior.

## 7. Injection Test Matrix

| Injection Type | Expected | Actual | Result |
|---|---|---|---|
| Direct English instruction | Treated as ticket data | Delimited and never placed in application context | Pass |
| Mixed English/Indonesian/Spanish/French/German/Japanese/Chinese | Same behavior | Delimited mixed-language fixture | Pass |
| HTML/email/XML-like indirect content | Treated as ticket data | Included inside untrusted boundary | Pass |
| Markdown/code-block indirect content | Treated as ticket data | Included inside untrusted boundary | Pass |
| Prompt/system/memory/secret disclosure request | Ignored by system rules | Explicit non-disclosure rule present in all prompts | Pass |
| Markdown/leading-prose response | Reject, retry once | Rejected by strict parser twice | Pass |
| Unexpected output key | Reject, retry once | Rejected; retry then accepted/fell back in mock tests | Pass |
| Multiple/partial JSON | Reject | Strict whole-response parser rejects it | Pass (parser contract) |

The tests are deterministic contract tests; they do not claim semantic compliance from a live model under every attack wording.

## 8. Provider Comparison

| Attack | DeepSeek | LM Studio | Claude | Deterministic |
|---|---|---|---|---|
| Boundary construction | Shared prompt code | Shared prompt code | Shared prompt code | Not prompted |
| Invalid JSON/schema | Shared adapter rejects/retries | Shared adapter rejects/retries | Shared adapter rejects/retries | Used after exhaustion |
| Unexpected keys | Shared adapter rejects/retries | Verified with mock | Verified as fallback mock | Safe fallback |
| Live adversarial-provider run | Not run | Not run | Not run | N/A |

DeepSeek provider and fallback-chain contracts passed in `probe:todo082a-deepseek`. Live provider tests were intentionally not run because this task does not authorize external provider calls or data handling; therefore live behavioral equivalence remains a release-validation item.

## 9. Memory Protection Verification

The hardened system instructions prohibit disclosure of organizational memory outside the validated context and prohibit retrieval changes, memory creation, lesson promotion, reflection updates, trust changes, and governance mutation. The prompt boundary does not grant any tool or mutation capability. `probe:todo046` passed with protected snapshots unchanged and confirmed AI advisory paths cannot authorize unsafe memory-grounded drafts.

## 10. Regression Results

| Check | Result |
|---|---|
| `npm run probe:rss-1.2s5-prompt-injection` | Pass |
| `npm run probe:todo082a-deepseek` | Pass |
| `npm run probe:todo046` | Pass; protected snapshots unchanged |
| `npm run probe:todo080-intent-isolation` | Pass |
| `npm run probe:todo082c-diagnostics` | Pass |
| `npm run probe:todo083-calibration` | Pass |
| `npm run benchmark:oip-v1` | Pass; 1000/1000, 100% |
| TypeScript (`tsc --noEmit`) | Pass |
| Prisma validation | Pass |
| Production build | Pass |

RSS-1.2S0 through S4 and TODO-078 were not rerun in this change because their probes create disposable database fixtures and/or start integration services. No pass is claimed for those unexecuted probes.

## 11. Performance Impact

Using one representative synthetic ticket across all six prompt builders, total prompt character count rose from 8,283 to 16,837 (average 1,381 to 2,806; +1,426 characters per prompt). The increase is the deliberate cost of repeated, explicit safety boundaries and delimiters.

No live latency, token consumption, retry-frequency, or fallback-frequency measurement was collected because no live provider calls were authorized. The deterministic probe confirms the extra retry occurs only when malformed or schema-invalid output is received.

## 12. Data Integrity

This implementation changes only prompt construction, provider response validation, a mocked probe fixture, the new RSS-1.2S5 probe, package script registration, and this report. It performs no application database, Organizational Memory, Reflection, Trust, ticket, or Developer Demo mutation. The read-only TODO-046 probe independently reported unchanged protected snapshots.

## 13. Remaining Limitations

- Prompt hardening reduces but cannot mathematically guarantee model compliance; provider models must still be evaluated under live adversarial traffic before a blanket behavioral claim.
- The boundary has a measurable prompt-size cost.
- Exact schemas can increase fallback frequency for providers that do not consistently honor JSON-only output; this is intentional fail-closed behavior.
- Existing validated application context is assumed to be governed by current authorization and data-quality controls.

## 14. Recommendation

Keep the strict schema gate enabled. Before the release sign-off that requires live-provider consistency, run the adversarial matrix against configured DeepSeek, LM Studio, and Claude endpoints with non-production fixtures and capture latency/retry/fallback telemetry.

## 15. Release Status

`COMPLETED_WITH_LIMITATIONS`

RSS-1.2S0 High Finding #5 is resolved at the code boundary: ticket text is explicitly untrusted and strict response acceptance is enforced before any advisory output is used. Live cross-provider adversarial verification remains outstanding.

READY TO RESUME RELEASE STABILIZATION
