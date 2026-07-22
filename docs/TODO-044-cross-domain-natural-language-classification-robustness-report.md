# TODO-044 Cross-Domain Natural-Language Classification Robustness Report

## Verdict

`COMPLETED_WITH_REMAINING_LAYERS`

The deterministic analyzer now classifies the full TODO-041 cross-domain fixture set (70/70), 30 unseen positives (30/30), 18 negative controls (18/18), and six ambiguity controls (6/6). The remaining cross-domain weakness is downstream retrieval/lesson authorization, which is intentionally outside TODO-044 and remains visible in the TODO-041 audit.

## Baseline

The unchanged TODO-041 fixture previously classified 15/70 positives overall (5/60 non-SSO). SSO was already 10/10; the non-SSO domains were the gap: Billing 3/10, API & Integrations 0/10, Permissions & Access 2/10, Reporting & Exports 0/10, Mobile Application 0/10, and Notifications & Email 0/10.

## Classification Changes

- Added deterministic vocabulary and weighted evidence for API & Integrations, Reporting & Exports, Mobile Application, and Notifications & Email.
- Expanded bounded Billing and Permissions & Access evidence so domain-specific phrases outrank incidental neighboring terms.
- Added contextual disambiguation for explicit negation, access-control incidents, credential incidents, operating-system notifications, and billing-address wording.
- Preserved category compatibility through the existing organization-profile gate; no retrieval, ranking, lesson-evidence, trust, AI, or drafting authorization code was changed.
- Added possessive-aware normalization so stems such as `provider's`, `customer's`, and `report's` remain classifiable while contractions continue to normalize.

## Unseen Positive Coverage

The new fixture contains 30 unseen positives, five per required domain:

| Domain | Result |
|---|---:|
| Billing | 5/5 |
| API & Integrations | 5/5 |
| Permissions & Access | 5/5 |
| Reporting & Exports | 5/5 |
| Mobile Application | 5/5 |
| Notifications & Email | 5/5 |

Overall unseen coverage: **30/30**.

## Negative Controls

All 18 controls passed (false classifications: 0/18). Controls cover webhook-vs-billing, invoice-vs-permission, login-vs-access, report-vs-email, mobile-vs-billing/SSO, and operating-system-vs-product notifications.

## Ambiguity Controls

All 6 controls passed (6/6), including billing workspace access, authentication with an incidental notification, offline invoice capture, integration dashboard reporting, webhook access denied to a guest, and an intentionally underspecified data/access question.

## TODO-042 Possessive-Normalization Status

The analyzer now preserves possessive stems while normalizing apostrophes. The TODO-044 possessive set passed 5/5, covering provider, customer, user, device, and report possessives. This is a focused compatibility fix; broader TODO-042 normalization remains independently testable.

## Safety and Invariants

- Trust independence: 4/4 in-memory trust variants produced the same classification.
- Mature Developer Demo items loaded: 45; lessons: 180.
- HERO item `demo-ki-sso-certificate-redirect-loop` retained source ticket `OIP-20230104-0001`.
- Snapshots for Developer Demo, Maesa Tech, FastDrop Logistics, Pramana Consulting, and `test-oip-regression` were unchanged.
- No database writes were performed by the TODO-044 probe or fixtures.

## Regression Results

- TODO-044 classification probe: **PASS** (70/70, 30/30, 18/18, 6/6; snapshots unchanged).
- TODO-041 cross-domain audit: **PASS controls**, 70/70 classification; its expected downstream verdict remains `CROSS_DOMAIN_RETRIEVAL_WEAKNESS_CONFIRMED` because non-SSO authorization is still 0/60.
- TODO-025F mature retrieval: **23/23**.
- TODO-025G curated scenarios: **PASS**.
- TODO-030 weak-overlap safety: **PASS**.
- TODO-032 category compatibility: **PASS**.
- TODO-037 natural paraphrase: **PASS**.
- TODO-039 classification: **PASS**.
- TODO-040 semantic lesson safety: **PASS**.
- TODO-043 provenance: **PASS**.
- TODO-046 weak-fallback safety: **PASS** (unsafe 0/14; positive authorization 7/7).
- TODO-027, TODO-028, TODO-029, TODO-019, BUG-008 retrieval/semantic, BUG-010 pipeline/failover, persistence-boundary, server-persistence, and organization switching: **PASS**.
- TypeScript, strict unused TypeScript, and production build: **PASS**.

## Remaining Layers

TODO-044 fixes classification only. Natural-language retrieval specificity, canonical ranking, sibling lesson specificity, and strong lesson-evidence authorization remain governed by TODO-027/TODO-028/TODO-041/TODO-046 and were not weakened.

## TODO-044 Status

Complete for the requested classification scope, with the downstream retrieval weakness explicitly retained for its owning workstream.

