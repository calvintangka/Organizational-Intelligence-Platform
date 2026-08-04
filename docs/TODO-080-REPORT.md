# TODO-080 Intent Isolation, Security Escalation & Retrieval Safety Report

## Verdict

**COMPLETED_WITH_LIMITATIONS**

The deterministic safety hardening is implemented and passes the focused TODO-080 contract probe, TypeScript validation, production build, and the existing customer-context and multilingual regression probes. The full twelve-case TODO-079 live UI acceptance was not re-created in this run, so the live score and database mutation invariants remain a follow-up verification item.

## Scope and baseline

The changes preserve the TODO-067 through TODO-078 application-service, persistence, worker, connector, RBAC, governed-action, reflection, and memory-promotion boundaries. No migration, dependency, database-schema, Organizational Memory, trust, reflection, governed-action, or connector code was changed.

## Deterministic decision flow

Ticket text is now processed as:

1. Sentence segmentation and label assignment.
2. Active-problem/request extraction with reduced-weight context.
3. Negation, quotation, resolved-history, hypothetical, workaround, and observation suppression.
4. Security-intent detection before advisory calls and retrieval.
5. Intent/object/outcome/stage-aware category and canonical selection.
6. Entity validation before advisory fields enter the persisted understanding.
7. Retrieval compatibility filtering before lesson discrimination or semantic fallback.
8. Drafting only from an authorized compatible match, profile grounding, or safe cold-start behavior.

The supported sentence labels are `ACTIVE_PROBLEM`, `BACKGROUND`, `RESOLVED_HISTORY`, `NEGATED`, `QUOTED`, `HYPOTHETICAL`, `REQUEST`, `WORKAROUND`, `OBSERVATION`, and `SECURITY_SIGNAL`.

## Retrieval and contamination fixes

Only active-problem and request sentences receive full retrieval weight. Background, observation, and workaround sentences are reduced; quoted, negated, resolved-history, and identity-only signature material is excluded.

The compatibility gate now checks the deterministic intent isolation result before allowing reuse. It rejects the known TODO-079 collision families:

- role/permission issue versus guest/workspace lesson;
- refund investigation versus duplicate-invoice lesson;
- report timeout versus CSV-encoding lesson;
- activation/invitation failure versus Login/password lesson.

The semantic fallback no longer receives a raw first match when the deterministic compatibility filter rejected it. Security-routed tickets never call retrieval, never call the semantic discriminator, and never enqueue pattern follow-up.

## Security routing

The security detector covers phishing and social engineering, unexpected or unfamiliar logins, compromise/session signals, privilege escalation and temporary-owner requests, audit-log disablement, credential/secret/API-key/webhook/database access, and sensitive exports.

When detected, the result is classified as `Security Incident` with severity, reasons, and `EscalationRequired`. The pipeline returns a safe human-review draft that explicitly refuses access grants, audit-log changes, credential disclosure, and sensitive exports. It performs no operational action and uses no Organizational Memory.

## Entity and canonical consistency

Company extraction now has confidence-aware validation, supports explicit signature organizations such as `PT ...`, and rejects issue prose such as “Perusahaan Sejak Bulan Lalu”. AI-advisory entity fields are validated before merge.

Strong deterministic hints force compatible canonical labels for activation failure, billing contact update, refund investigation, report export timeout, role-permission issues, and security incidents. The persisted canonical category is reconciled against the final understanding after advisory merge.

## Pattern-discovery queue investigation

The ten queued `pattern.discover` jobs observed after TODO-079 are intentional operational state: the UI/application service enqueues follow-up jobs, while `scripts/async-worker.cjs` is a separate long-lived worker process. The handler is registered and covered by the TODO-074 worker probes; the development UI does not automatically start that worker. No queued production/demo jobs were consumed during this task because doing so would mutate patterns and violate the no-learning-mutation boundary.

## Verification performed

- `npm.cmd run probe:todo080-intent-isolation` — passed.
- `npm.cmd run probe:todo050-customer-context` — 67/67 passed.
- `npm.cmd run probe:todo058-multilingual` — passed.
- `npm.cmd run probe:todo058b-language-neutral-retrieval` — passed.
- `npx.cmd tsc --noEmit` — passed.
- `npm.cmd run build` — passed.
- `git diff --check` — passed.

The focused probe verifies activation isolation, mixed-language routing, security escalation, resolved-history suppression, identity-only retrieval exclusion, and entity confidence rejection.

## Data safety and regression limitation

No source-level migration or dependency update was performed. No application regression was intentionally rerun through the live UI in this turn, and no durable worker job was processed. Because the full TODO-079 twelve-case live score was not repeated, the final quantitative acceptance score and post-run database invariants are not claimed here.

## Files changed

- `lib/intentIsolation.ts` — deterministic sentence isolation, security intent, and safe escalation draft.
- `lib/analyzer.ts` — intent-isolation metadata and strong intent/category overrides.
- `lib/memory.ts` — security short-circuit and compatibility vetoes.
- `lib/application/tickets/processTicket.ts` — security routing, canonical consistency, entity validation, and semantic-fallback boundary.
- `lib/customerContext.ts` — confidence-aware company validation and signature extraction.
- `types/oip.ts`, `types/knowledge.ts` — persisted metadata and compatibility explainability fields.
- `scripts/todo080-intent-isolation-probe.cjs` and `package.json` — focused acceptance probe.

## TODO-080 Status

Implementation complete with the live twelve-case score explicitly pending. Recommended next step is to run the TODO-079 twelve-case acceptance through the UI with the separate job worker stopped, then verify the required score, no-contamination, no-mutation, and queue invariants.

## Commit

No commit created. Changes remain in the working tree for review.
