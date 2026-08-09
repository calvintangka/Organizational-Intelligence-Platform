# RSS-1.2E.1 — Developer Demo Integrity Reconciliation

Status: Complete  
Priority: Critical  
Organization: profile-oip-developer-demo  
Repository HEAD observed: 50c04d0a225d3a37f139370e3d8425c7cb8ab7eb  
Audit date: 2026-08-07 (Asia/Jakarta)  
Final verdict: DATASET_REQUIRES_RECONCILIATION

## 1. Executive Summary

The RSS-1.2E integrity failure was reproduced exactly: 87 findings, comprising 73 high-, 7 medium-, and 7 low-severity findings. The probe's own labels were 80 DATA_CORRUPTION and 7 AUDITABILITY_GAP. Those labels are not reliable release classifications.

Forensic reconciliation assigns every finding exactly once:

| Class | Meaning | Count | Release result |
| --- | --- | ---: | --- |
| A | True Data Corruption | 4 | Release-blocking metric-state reconciliation |
| B | Historical Protected Data | 20 | Non-blocking; preserve and document |
| C | Obsolete Certification Fixture | 1 | Non-blocking; update certification |
| D | Audit Implementation Defect | 62 | Non-blocking; update the probe |
| **Total** |  | **87** |  |

The four Class A findings are limited to persisted OrgMetrics: lifetimeTickets, knowledgeReused, knowledgeVersions, and emergingPatternsDetected. Core Organizational Memory is not corrupted. Independent checks found zero validation, memory, trust-evidence, membership, role, authorization-audit, job-actor, cross-organization, duplicate-ticket, or trust-chain orphans. The separate TODO-025H structural audit passed twice, accepted valid append-only growth, rejected a synthetic orphan, and reported protected snapshots unchanged.

No data repair, migration, reseed, history rewrite, ticket mutation, trust mutation, lesson rewrite, version rewrite, Organizational Memory change, commit, or tag was performed.

## 2. Integrity Audit Replay

The exact RSS-1.2E command was replayed from the current worktree:

    node scripts/developer-demo-integrity-probe.cjs

It exited 1 in approximately 3 seconds with DATA_INTEGRITY_FAILURE.

| Measure | Replay result |
| --- | ---: |
| Organization | profile-oip-developer-demo |
| Knowledge | 47 |
| Candidates | 1,805 |
| Validations | 1,804 |
| Memory changes | 1,804 |
| Trust evidence | 4,500 |
| Tickets | 5,180 |
| Patterns | 50 |
| Versions | 133 |
| Lessons | 181 |
| Ticket sequence | 5,180 |
| High findings | 73 |
| Medium findings | 7 |
| Low findings | 7 |
| Total findings | 87 |
| Probe DATA_CORRUPTION labels | 80 |
| Probe AUDITABILITY_GAP labels | 7 |
| Protected organizations unchanged | true |

Primary replay details:

- Trust scores reconstructed exactly for all 47 items; 45 chains passed the probe's raw comparison and the two reported chain failures are revision-only differences.
- All 4,500 TrustEvidence rows were valid, without orphan, duplicate key, or cross-organization evidence.
- All 1,804 validations and 1,804 memory changes resolve through the actual membership table; the eight actor findings are false positives.
- All 133 version IDs are unique and chronological; two source identifiers are documented historical bulk provenance.
- All 181 lessons are content-unique; 15 aliases resolve.
- All 5,180 ticket IDs are unique and organization-scoped; the sequence counter equals the maximum suffix and the next ID is unused.
- The independent command node scripts/todo025h-scale-responsiveness-audit.cjs passed structural integrity, deterministic replay, append-only growth, orphan rejection, and post-read snapshot stability with zero structural issues.

## 3. Finding Inventory

This is the unaggregated 87-row replay inventory. Category names below describe the affected invariant, not the probe's pre-reconciliation label.

| ID | Severity | Category | Entity | Description |
| --- | --- | --- | --- | --- |
| F001 | High | Snapshot comparison | canonical-knowledge-ownership-transfer-after-administrator-departure | Final historical afterState does not equal the current KnowledgeItem. |
| F002 | High | Snapshot comparison | demo-ki-annual-renewal-seat-count | Final historical afterState does not equal the current KnowledgeItem. |
| F003 | High | Snapshot comparison | demo-ki-api-idempotency-collision | Final historical afterState does not equal the current KnowledgeItem. |
| F004 | High | Snapshot comparison | demo-ki-api-pagination-cursor | Final historical afterState does not equal the current KnowledgeItem. |
| F005 | High | Snapshot comparison | demo-ki-api-rate-limit-burst | Final historical afterState does not equal the current KnowledgeItem. |
| F006 | High | Snapshot comparison | demo-ki-audit-log-visibility | Final historical afterState does not equal the current KnowledgeItem. |
| F007 | High | Snapshot comparison | demo-ki-biometric-unlock-reset | Final historical afterState does not equal the current KnowledgeItem. |
| F008 | High | Snapshot comparison | demo-ki-cellular-attachment-resume | Final historical afterState does not equal the current KnowledgeItem. |
| F009 | High | Snapshot comparison | demo-ki-connector-field-mapping | Final historical afterState does not equal the current KnowledgeItem. |
| F010 | High | Snapshot comparison | demo-ki-csv-export-encoding | Final historical afterState does not equal the current KnowledgeItem. |
| F011 | High | Snapshot comparison | demo-ki-custom-role-cache | Final historical afterState does not equal the current KnowledgeItem. |
| F012 | High | Snapshot comparison | demo-ki-dashboard-filter-persistence | Final historical afterState does not equal the current KnowledgeItem. |
| F013 | High | Snapshot comparison | demo-ki-delegated-admin-approval | Final historical afterState does not equal the current KnowledgeItem. |
| F014 | High | Snapshot comparison | demo-ki-digest-email-timezone | Final historical afterState does not equal the current KnowledgeItem. |
| F015 | High | Snapshot comparison | demo-ki-duplicate-invoice-seat-change | Final historical afterState does not equal the current KnowledgeItem. |
| F016 | High | Snapshot comparison | demo-ki-email-dmarc-alignment | Final historical afterState does not equal the current KnowledgeItem. |
| F017 | High | Snapshot comparison | demo-ki-email-notification-suppression | Final historical afterState does not equal the current KnowledgeItem. |
| F018 | High | Snapshot comparison | demo-ki-failed-card-retry-schedule | Final historical afterState does not equal the current KnowledgeItem. |
| F019 | High | Snapshot comparison | demo-ki-guest-workspace-access | Final historical afterState does not equal the current KnowledgeItem. |
| F020 | High | Snapshot comparison | demo-ki-invoice-currency-display | Final historical afterState does not equal the current KnowledgeItem. |
| F021 | High | Memory chain | memory-change-1785334902400-4usauk | beforeState differs from the prior afterState for demo-ki-invoice-pdf-stale-address. |
| F022 | High | Snapshot comparison | demo-ki-invoice-pdf-stale-address | Final historical afterState does not equal the current KnowledgeItem. |
| F023 | High | Snapshot comparison | demo-ki-invoice-tax-rounding | Final historical afterState does not equal the current KnowledgeItem. |
| F024 | High | Snapshot comparison | demo-ki-large-export-timeout | Final historical afterState does not equal the current KnowledgeItem. |
| F025 | High | Snapshot comparison | demo-ki-mfa-device-clock-drift | Final historical afterState does not equal the current KnowledgeItem. |
| F026 | High | Snapshot comparison | demo-ki-mfa-recovery-code-exhaustion | Final historical afterState does not equal the current KnowledgeItem. |
| F027 | High | Snapshot comparison | demo-ki-mobile-deep-link-workspace | Final historical afterState does not equal the current KnowledgeItem. |
| F028 | High | Snapshot comparison | demo-ki-mobile-offline-export-filters | Final historical afterState does not equal the current KnowledgeItem. |
| F029 | High | Snapshot comparison | demo-ki-mobile-offline-sync-conflict | Final historical afterState does not equal the current KnowledgeItem. |
| F030 | High | Snapshot comparison | demo-ki-mobile-push-token-stale | Final historical afterState does not equal the current KnowledgeItem. |
| F031 | High | Snapshot comparison | demo-ki-notification-digest-duplication | Final historical afterState does not equal the current KnowledgeItem. |
| F032 | High | Snapshot comparison | demo-ki-notification-locale-fallback | Final historical afterState does not equal the current KnowledgeItem. |
| F033 | High | Snapshot comparison | demo-ki-oauth-refresh-token-revoked | Final historical afterState does not equal the current KnowledgeItem. |
| F034 | High | Snapshot comparison | demo-ki-passwordless-link-expiry | Final historical afterState does not equal the current KnowledgeItem. |
| F035 | High | Snapshot comparison | demo-ki-permission-inheritance-delay | Final historical afterState does not equal the current KnowledgeItem. |
| F036 | High | Snapshot comparison | demo-ki-proration-credit-mismatch | Final historical afterState does not equal the current KnowledgeItem. |
| F037 | High | Snapshot comparison | demo-ki-report-column-order-migration | Final historical afterState does not equal the current KnowledgeItem. |
| F038 | High | Snapshot comparison | demo-ki-saml-nameid-case | Final historical afterState does not equal the current KnowledgeItem. |
| F039 | High | Snapshot comparison | demo-ki-scheduled-report-timezone | Final historical afterState does not equal the current KnowledgeItem. |
| F040 | High | Snapshot comparison | demo-ki-scim-delayed-provisioning | Final historical afterState does not equal the current KnowledgeItem. |
| F041 | High | Snapshot comparison | demo-ki-session-cookie-samesite | Final historical afterState does not equal the current KnowledgeItem. |
| F042 | High | Memory chain | memory-change-1785206860672-972cue | beforeState differs from the prior afterState for demo-ki-sso-certificate-redirect-loop. |
| F043 | High | Snapshot comparison | demo-ki-sso-certificate-redirect-loop | Final historical afterState does not equal the current KnowledgeItem. |
| F044 | High | Snapshot comparison | demo-ki-sso-domain-verification | Final historical afterState does not equal the current KnowledgeItem. |
| F045 | High | Snapshot comparison | demo-ki-vat-exemption-review | Final historical afterState does not equal the current KnowledgeItem. |
| F046 | High | Snapshot comparison | demo-ki-webhook-delivery-replay | Final historical afterState does not equal the current KnowledgeItem. |
| F047 | High | Snapshot comparison | demo-ki-webhook-ipv6-allowlist | Final historical afterState does not equal the current KnowledgeItem. |
| F048 | High | Snapshot comparison | demo-ki-webhook-signature-secret-rotation | Final historical afterState does not equal the current KnowledgeItem. |
| F049 | High | Actor resolution | validation-1785206860672-r81s2l | Validation actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F050 | High | Actor resolution | validation-1785325005437-2gy8if | Validation actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F051 | High | Actor resolution | validation-1785334902400-a0gmiw | Validation actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F052 | High | Actor resolution | validation-1785335357198-ox3d38 | Validation actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F053 | High | Actor resolution | memory-change-1785206860672-972cue | Memory-change actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F054 | High | Actor resolution | memory-change-1785325005437-mcc23v | Memory-change actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F055 | High | Actor resolution | memory-change-1785334902400-4usauk | Memory-change actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F056 | High | Actor resolution | memory-change-1785335357198-9lpu2f | Memory-change actor dev-7625a9e2-40a6-44ca-a8c9-6071342f3154 reported unresolved. |
| F057 | Low | Version identifier | canonical-knowledge-ownership-transfer-after-administrator-departure-v1 | Version ID differs from the probe's padded v001 convention. |
| F058 | Low | Version identifier | canonical-reporting-exports-problem-v1 | Version ID differs from the probe's padded v001 convention. |
| F059 | Low | Version provenance | canonical-reporting-exports-problem-v1 | sourceTicketId bulk-ticket-csv-81 does not resolve to a TicketRecord primary key. |
| F060 | Low | Version identifier | demo-ki-invoice-pdf-stale-address-v4 | Version ID differs from the probe's padded v004 convention. |
| F061 | Low | Version provenance | demo-ki-invoice-pdf-stale-address-v4 | sourceTicketId bulk-ticket-csv-31 does not resolve to a TicketRecord primary key. |
| F062 | Low | Reflection history | OD-20260729-5117 | reflection.lessonCreatedId lesson-1785335357198-6zei is unresolved. |
| F063 | Low | Reflection history | OIP-20260728-5001 | reflection.lessonCreatedId lesson-1785177487335-j15m is unresolved. |
| F064 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-81, not a TicketRecord primary key. |
| F065 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-82, not a TicketRecord primary key. |
| F066 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-83, not a TicketRecord primary key. |
| F067 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-84, not a TicketRecord primary key. |
| F068 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-85, not a TicketRecord primary key. |
| F069 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-86, not a TicketRecord primary key. |
| F070 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-87, not a TicketRecord primary key. |
| F071 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-88, not a TicketRecord primary key. |
| F072 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-89, not a TicketRecord primary key. |
| F073 | High | Bulk provenance | candidate-1785325003916-262kdf | sourceTicketIds contains bulk-ticket-csv-90, not a TicketRecord primary key. |
| F074 | High | Bulk provenance | candidate-1785334902400-lrwq5n | sourceTicketIds contains bulk-ticket-csv-31, not a TicketRecord primary key. |
| F075 | High | Bulk provenance | candidate-1785334902400-lrwq5n | sourceTicketIds contains bulk-ticket-csv-32, not a TicketRecord primary key. |
| F076 | High | Bulk provenance | candidate-1785334902400-lrwq5n | sourceTicketIds contains bulk-ticket-csv-33, not a TicketRecord primary key. |
| F077 | High | Bulk provenance | candidate-1785334902400-lrwq5n | sourceTicketIds contains bulk-ticket-csv-34, not a TicketRecord primary key. |
| F078 | High | Bulk provenance | candidate-1785334902400-lrwq5n | sourceTicketIds contains bulk-ticket-csv-35, not a TicketRecord primary key. |
| F079 | High | Knowledge provenance | canonical-reporting-exports-problem | Top-level sourceTicketId bulk-ticket-csv-81 is unresolved as a TicketRecord primary key. |
| F080 | Medium | Metric state | OrgMetrics.lifetimeTickets | Persisted 5003 differs from 5180 stored TicketRecords. |
| F081 | Medium | Metric state | OrgMetrics.knowledgeReused | Persisted 4707 differs from 4723 independently qualifying resolved reuse tickets. |
| F082 | Medium | Metric audit | OrgMetrics.mergedTickets | Persisted 1029 differs from the probe-derived 1028. |
| F083 | Medium | Metric audit | OrgMetrics.duplicatePreventions | Persisted 1029 differs from the probe-derived 1028. |
| F084 | Medium | Metric state | OrgMetrics.knowledgeVersions | Persisted 130 differs from 133 embedded KnowledgeVersions. |
| F085 | Medium | Metric state | OrgMetrics.emergingPatternsDetected | Persisted 54 differs from 50 distinct EmergingPattern rows. |
| F086 | Medium | Metric audit | OrgMetrics.promotedPatterns | Persisted 45 differs from the probe-derived 50. |
| F087 | High | Sequence fixture | TicketSequence | Counter 5180 differs from the probe's fixed value 5000. |

## 4. Classification Matrix

Each finding appears exactly once in this matrix.

| Finding | Class | Evidence | Release Impact |
| --- | --- | --- | --- |
| F001 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F002 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F003 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F004 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F005 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F006 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F007 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F008 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F009 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F010 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F011 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F012 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F013 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F014 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F015 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F016 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F017 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F018 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F019 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F020 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F021 | Class D | The only difference is the persistence revision field, which the same probe already excludes from its final-state comparison. | Does Not Block Release; Needs Probe Update |
| F022 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F023 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F024 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F025 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F026 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F027 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F028 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F029 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F030 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F031 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F032 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F033 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F034 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F035 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F036 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F037 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F038 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F039 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F040 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F041 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F042 | Class D | The only difference is the persistence revision field, which the same probe already excludes from its final-state comparison. | Does Not Block Release; Needs Probe Update |
| F043 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F044 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F045 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F046 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F047 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F048 | Class D | TODO-065 changed the current privacy/audit representation while leaving immutable MemoryChangeRecord snapshots intact. | Does Not Block Release; Needs Probe Update |
| F049 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F050 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F051 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F052 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F053 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F054 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F055 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F056 | Class D | The User and Developer Demo membership both exist; the probe checks the static seed actor array instead of organization_memberships. | Does Not Block Release; Needs Probe Update |
| F057 | Class D | Production creation code deliberately emits unpadded v1; ID uniqueness, numeric version, and chronology are valid. | Does Not Block Release; Needs Probe Update |
| F058 | Class D | Production creation code deliberately emits unpadded v1; ID uniqueness, numeric version, and chronology are valid. | Does Not Block Release; Needs Probe Update |
| F059 | Class B | TODO-062 and TODO-065 document this preserved bulk-entry provenance and its incomplete-but-preservable classification. | Does Not Block Release; Needs Documentation |
| F060 | Class D | Production creation code deliberately emits unpadded version IDs; ID uniqueness, numeric version, and chronology are valid. | Does Not Block Release; Needs Probe Update |
| F061 | Class B | TODO-062D and TODO-065 document this preserved bulk-entry provenance; the durable ticket uses a generated OD ID plus external bulk ID. | Does Not Block Release; Needs Documentation |
| F062 | Class B | TODO-062D records the historical promotion-audit defect and explicitly states that the already-created row was not rewritten after the runtime fix. | Does Not Block Release; Needs Documentation |
| F063 | Class B | This pre-fix accepted reflection artifact is documented in the historical audit trail and remains immutable. | Does Not Block Release; Needs Documentation |
| F064 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F065 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F066 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F067 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F068 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F069 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F070 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F071 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F072 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F073 | Class B | TODO-062 records these stable uploaded-entry identifiers and the later generated ticket mapping; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F074 | Class B | TODO-062D records the OD ticket range and stable upload entry IDs; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F075 | Class B | TODO-062D records the OD ticket range and stable upload entry IDs; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F076 | Class B | TODO-062D records the OD ticket range and stable upload entry IDs; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F077 | Class B | TODO-062D records the OD ticket range and stable upload entry IDs; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F078 | Class B | TODO-062D records the OD ticket range and stable upload entry IDs; candidate history was intentionally not rewritten. | Does Not Block Release; Needs Documentation |
| F079 | Class B | TODO-065 preserves the known top-level source gap as historical_incomplete rather than manufacturing lineage. | Does Not Block Release; Needs Documentation |
| F080 | Class A | The documented semantic is all stored tickets; TODO-062 already observed and named the transactional undercount defect. | Blocks Release; Needs Product Fix and Data Reconciliation |
| F081 | Class A | Sixteen post-seed resolved tickets satisfy the same durable reuse predicate but were not reflected in the counter. | Blocks Release; Needs Product Fix and Data Reconciliation |
| F082 | Class D | The probe filters rationale by a seed-only prefix and omits one valid live merge candidate; persisted 1029 matches all approved merge activity. | Does Not Block Release; Needs Probe Update |
| F083 | Class D | The probe reuses the same incomplete seed-prefix derivation; the live approved merge increments both documented counters. | Does Not Block Release; Needs Probe Update |
| F084 | Class A | The documented semantic is the total embedded version count including v1; three live versions were not reflected in the persisted counter. | Blocks Release; Needs Product Fix and Data Reconciliation |
| F085 | Class A | The documented semantic is distinct patterns ever created; the current worker also increments on strengthening four existing patterns. | Blocks Release; Needs Product Fix and Data Reconciliation |
| F086 | Class D | There are exactly 45 rows whose lifecycle status is promoted; the probe incorrectly compares this field to all 50 pattern rows. | Does Not Block Release; Needs Probe Update |
| F087 | Class C | Counter 5180 equals the maximum persisted ticket suffix; there are no duplicate IDs or next-ID collision. Legitimate live growth made the fixed seed total obsolete. | Does Not Block Release; Needs Certification Update |

Control totals: Class A = 4; Class B = 20; Class C = 1; Class D = 62; total = 87.

## 5. Root Cause Analysis

| Findings | Origin and first appearance | Affected implementation | Product behavior affected? | Release block? |
| --- | --- | --- | --- | --- |
| F001–F020, F022–F041, F043–F048 | The TODO-065 historical-audit migration updated 47 current KnowledgeItems with privacy-safe evidence IDs and audit metadata while explicitly leaving MemoryChangeRecord history immutable. TODO-065 immediately documented that the legacy probe would fail this comparison. | scripts/developer-demo-integrity-probe.cjs snapshot normalization/comparison at lines 78–103 and 192–193 | No. Retrieval, text, trust, IDs, timestamps, and current lessons remain valid. | No |
| F021, F042 | Live reflection/bulk writes on 2026-07-28/29 produced a beforeState with revision 1 after an older afterState without revision. The probe's raw chain comparator has existed since commit d66156d (2026-07-21). | scripts/developer-demo-integrity-probe.cjs line 152 | No; content and trust are continuous. | No |
| F049–F056 | Four post-seed validations/memory records use the real Developer user added through membership-aware runtime flows. The probe retained its static seed-actor roster from d66156d. | scripts/developer-demo-integrity-probe.cjs lines 234–264; data/developerDemoFoundation.ts | No; the user and membership exist. | No |
| F057, F058, F060 | Production canonical, reflection, and bulk code emits v1/v4 identifiers; the simulator emits v001/v004. The probe copied the simulator-only formatting assumption. | scripts/developer-demo-integrity-probe.cjs lines 292–293; lib/bulkUpload.ts; lib/canonicalProblemEngine.ts; lib/application/learning/reflectionCommands.ts | No; identity, numeric order, and chronology are valid. | No |
| F059, F061, F064–F079 | TODO-062 and TODO-062D live bulk workflows stored stable uploaded-entry IDs in immutable candidate/version/top-level provenance. TODO-065 classified the unresolved legacy links as incomplete but preservable and did not rewrite them. | Historical bulk persistence and TODO-065 migration policy; probe lines 297–298 and 380–386 | Current runtime does not depend on these values as TicketRecord primary keys. | No |
| F062, F063 | Pre-fix reflection rows omitted durable lesson/audit links. TODO-062D fixed later runtime behavior and explicitly preserved already-created history. | Historical ticket reflection payloads; fixed reflection persistence path documented by TODO-062D | No current behavior impact; historical trace is incomplete. | No |
| F080 | Bulk and subsequent live ticket writes did not increment lifetimeTickets transactionally per durable ticket. TODO-062 first documented the defect when rows rose by 12 and the metric by 1. | Bulk/ticket metric write paths; OrgMetrics persistence | Dashboard/telemetry accuracy is affected. | Yes |
| F081 | Post-seed resolved reuse activity updated tickets/memory but did not keep knowledgeReused synchronized. | Ticket/reflection metric write paths | Dashboard/telemetry accuracy is affected. | Yes |
| F082, F083 | The probe derives both fields only from candidates whose rationale starts with Canonical support merge, excluding one approved live merge. | scripts/developer-demo-integrity-probe.cjs lines 423, 437–438 | No; persisted values match approved merge activity. | No |
| F084 | Three live KnowledgeVersions exist without matching OrgMetrics increments. | Bulk/reflection metric write paths | Dashboard/telemetry accuracy is affected. | Yes |
| F085 | Metric design defines distinct patterns ever created, but patternDiscoveryStore increments the counter for both created and strengthened outcomes. Four strengthening events explain 54 versus 50. | lib/server/jobs/patternDiscoveryStore.ts lines 205–206 | Dashboard/telemetry accuracy is affected. | Yes |
| F086 | The probe compares promotedPatterns with every pattern row instead of filtering status = promoted. The database has exactly 45 promoted rows. | scripts/developer-demo-integrity-probe.cjs line 441 | No. | No |
| F087 | The original 5,000-row seed invariant remained hard-coded after legitimate live growth to 5,180. | scripts/developer-demo-integrity-probe.cjs lines 459–475, especially 471 | No; allocation integrity is healthy. | No |

Git history establishes that the problematic probe comparisons originated in d66156d on 2026-07-21. The current probe file was subsequently present through commits 512576a, d24b3da, 34daa0e, and 676e486 without replacing those seed-era invariants. Database row origins are established from durable timestamps and the TODO-062, TODO-062D, and TODO-065 execution reports; this review does not claim that mutable Git history alone proves database provenance.

## 6. Dataset Health

| Dataset | Status | Findings |
| --- | --- | --- |
| Knowledge | Warning | 47 rows are structurally sound; one protected top-level bulk provenance ID is not a TicketRecord PK; current privacy migration is intentional. |
| Lessons | Healthy | 181 lessons; no duplicate lesson content; 15 aliases resolve; opaque evidence migration is present. |
| Versions | Warning | 133 unique chronological versions; three unpadded IDs are valid; two preserved external bulk source IDs do not resolve as ticket PKs. |
| Candidates | Warning | 1,805 rows; candidate/validation/memory relational links resolve; 15 preserved external bulk-entry references exist across two candidates. |
| Validations | Healthy | 1,804 rows; zero candidate, knowledge, organization, or actual-membership actor orphans. |
| Memory Changes | Healthy | 1,804 rows; zero validation/candidate/knowledge/actor orphans; two raw comparison alerts are revision-only; trust reconstructs exactly. |
| Trust Evidence | Healthy | 4,500 rows; no orphan, duplicate evidence key, or cross-organization reference. |
| Patterns | Healthy | 50 structurally valid rows: 45 promoted, 4 monitoring, 1 suggested. The separate metric counter is corrupted. |
| Tickets | Warning | 5,180 unique organization-owned rows; two protected historical reflection lesson links are incomplete. |
| Metrics | Corrupted | Four counters are semantically wrong: lifetimeTickets, knowledgeReused, knowledgeVersions, emergingPatternsDetected. Three reported mismatches are probe defects. |
| Sessions | Healthy | Seven active sessions for Developer Demo members at audit time. |
| Organizations | Healthy | Four organizations; protected-organization snapshots were unchanged by both audits. |
| Memberships | Healthy | Nine Developer Demo memberships; no duplicate or unresolved role assignment membership. |
| Users | Healthy | Nine Developer Demo members resolve to users; the live Developer actor exists. |
| Reflection | Warning | Current path is fixed; two pre-fix ticket reflection links remain historically incomplete. |
| Governed Actions | Healthy | Empty dataset (0 actions, 0 ledger entries); no inconsistent ownership observed. |
| Worker Jobs | Warning | 37 historical pattern.discover jobs are terminal failed; 37 failed and 2 lease-expired attempts. Actors resolve. Failures are explicit invalid_input results for missing scoped source tickets, not hidden or cross-tenant execution. This is an adjacent operational warning, not one of the 87 probe findings. |
| Connector Data | Healthy | Empty installation/event/mapping/credential datasets; no organization mismatch. |
| Audit Logs | Warning | 582 intelligence logs and 2,563 authorization audits are present with zero authorization-actor membership orphans. Ticket-transition audits are empty because that evidence path postdates most dataset history. |

Additional relational evidence:

- validation orphans: 0
- memory-change orphans: 0
- trust-evidence orphans: 0
- related-knowledge orphans: 0
- role-assignment membership orphans: 0
- authorization-audit actor membership orphans: 0
- durable-job actor membership orphans: 0
- action-ledger organization mismatches: 0
- connector organization mismatches: 0
- pattern-evidence ticket orphans: 0
- ticket-transition actor orphans: 0
- duplicate or cross-organization tickets: 0
- ticket counter/max mismatch: 0
- next-ticket collision: 0

## 7. Historical Dataset Review

The 20 Class B findings are protected history, not proof of current relational corruption.

- TODO-062 documents candidate-1785325003916-262kdf and bulk-ticket-csv-81 through bulk-ticket-csv-90. The values are uploaded-entry provenance; later durable tickets use generated ticket IDs. The candidate, validation, and memory chain remains resolvable.
- TODO-062D documents candidate-1785334902400-lrwq5n and bulk-ticket-csv-31 through bulk-ticket-csv-35, plus the generated OD ticket range. The same report states that the already-created audit-defective rows were not rewritten after targeted runtime fixes.
- TODO-065 inspected 47 knowledge items, 181 lessons, 1,805 candidates, 1,804 validations, 1,804 memory changes, 4,500 trust-evidence rows, and 133 versions. It classified 14 findings as incomplete but preservable, performed no candidate/ticket/version/history rewrites, and preserved internal origin links.
- Current runtime does not dereference these bulk-entry IDs as authoritative TicketRecord primary keys for retrieval, trust, validation, or lesson selection. Their value is historical provenance.
- Replacing the identifiers merely to pass the old probe would manufacture history and violate the task's preservation boundary.

## 8. Certification Fixture Review

F087 is the only Class C finding.

| Historical | Current | Expected | Correct? |
| --- | --- | --- | --- |
| Seed ticket total 5,000 | 5,180 TicketRecords | Derive from stored rows | Yes; live growth is legitimate |
| Seed TicketSequence 5,000 | Counter 5,180; max suffix 5,180 | Counter = max suffix; unique IDs; next unused | Yes |
| Static seed actor roster | 9 actual memberships | Resolve through User + organization_memberships | Yes |
| Simulator IDs v001/v004 | Runtime IDs v1/v4 | Unique ID + numeric order + chronology | Yes |
| Historical afterState raw provenance | Current privacy-safe opaque provenance | Compare semantic state or migration-aware fields | Yes |
| lifetimeTickets seed 5,000 | Persisted 5,003; rows 5,180 | 5,180 | No |
| knowledgeReused seed-derived 4,707 | Persisted 4,707; derived 4,723 | 4,723 | No |
| knowledgeVersions seed 130 | Persisted 130; embedded 133 | 133 | No |
| emergingPatternsDetected seed 50 | Persisted 54; distinct rows 50 | 50 | No |
| promotedPatterns seed 45 | Persisted 45; promoted rows 45 | 45 | Yes |
| merged/duplicate counters seed 1,028 | Persisted 1,029; approved activity 1,029 | 1,029 | Yes |

Certification must compare derived invariants, not fixed seed totals. A valid sequence rule is: IDs are unique, all tickets belong to the organization, counter equals the maximum numeric suffix, and counter + 1 is unused.

## 9. Audit Logic Review

| Probe area | Current logic | Defect | Intended rule |
| --- | --- | --- | --- |
| Snapshot comparison | Full normalized historical afterState versus current KnowledgeItem | Ignores the TODO-065 migration boundary and immutable historical representation | Compare stable semantic fields, or explicitly validate the migration transformation and immutable old snapshot |
| Memory chain | Full JSON equality | Treats absent revision and revision 1 as content corruption | Normalize persistence-only fields consistently on both chain and final comparisons |
| Actor resolution | Static developerDemoActors array | Excludes valid users added through actual memberships | Join User and organization_memberships for the audited organization |
| Version IDs | Requires zero-padded ordinal | Confuses simulator formatting with a domain invariant | Validate uniqueness, numeric version, monotonic chronology, and referenced item |
| Historical sources | Requires every source string to be a TicketRecord PK | Rejects documented imported-entry provenance | Resolve by explicit provenance type/mapping; otherwise classify documented legacy values |
| Merge metrics | Requires a seed-only rationale prefix | Omits approved runtime merges | Derive from validated merge actions or durable metric events |
| Pattern metrics | Uses patterns.length for detected and promoted | Conflates detected with promoted lifecycle | Distinct rows for detected; status = promoted for promoted |
| Ticket sequence | Requires exactly 5,000 | Fails all legitimate append-only growth | Counter/max/uniqueness/next-collision invariant |
| Finding labels | Emits DATA_CORRUPTION before historical/fixture reconciliation | Overstates release severity | Emit provisional finding type, then classify A/B/C/D with evidence |

The probe's SQL/database reads and tenant filters were otherwise useful: the protected snapshot guard, relational loading, trust reconstruction, evidence uniqueness, chronology, duplicate tickets, and counter/max checks all provided reliable evidence.

## 10. Release Impact

| Finding group | Decision | Required disposition |
| --- | --- | --- |
| F080, F081, F084, F085 | Blocks Release | Fix metric write semantics, add regression coverage, then perform an approved one-time metric reconciliation |
| F059, F061–F079 | Does Not Block Release | Preserve; document typed historical provenance and current-runtime independence |
| F087 | Does Not Block Release | Replace fixed count with derived certification invariant |
| F001–F058, F060, F082, F083, F086 | Does Not Block Release | Correct probe comparisons/derivations |
| Historical worker-job warning | Does Not independently block this integrity reconciliation | Review separately before claiming fully clean operations state |

The dataset must not be described as wholly healthy while four authoritative metrics are wrong. Conversely, those counters do not justify rewriting Organizational Memory, trust, lessons, versions, candidates, validations, or ticket history.

## 11. Recommended Repairs

No repair was executed.

| Repair | Type | Risk | Required |
| --- | --- | --- | --- |
| Make snapshot comparison migration-aware and normalize revision in every chain comparison | Probe fix | Low | Yes |
| Resolve actors from actual User/membership relations | Probe fix | Low | Yes |
| Accept production version-ID formats while enforcing uniqueness/order | Probe fix | Low | Yes |
| Derive merge and promoted-pattern metrics from their real semantics | Probe fix | Low | Yes |
| Replace the fixed 5,000 sequence assertion with derived invariants | Certification update | Low | Yes |
| Make lifetimeTickets, knowledgeReused, and knowledgeVersions update transactionally with authoritative writes | Product fix | Medium | Yes |
| Increment emergingPatternsDetected only when a distinct pattern is created, or formally change and rename the metric semantics | Product fix | Medium | Yes |
| Recompute and update only the four confirmed bad OrgMetrics fields after product fixes and an approved dry run | Data reconciliation | Medium | Yes |
| Add explicit provenance kind/mapping for future imported entry IDs | Migration fix | Medium–High | No for release; future improvement |
| Rewrite the 20 protected historical references | Migration fix | High | No; prohibited without a new approved historical policy |
| Document accepted historical provenance and reflection gaps in the certification baseline | Documentation update | Low | Yes |
| Review the 37 terminal pattern jobs and document whether they are acceptance-run residue or require a separate operational repair | Documentation/operations follow-up | Low | Yes before a clean-operations claim |

Suggested sequencing:

1. Patch and test product metric semantics without touching existing data.
2. Patch the integrity probe and certification rules.
3. Run a read-only reconciliation dry run that calculates the four authoritative target values.
4. Obtain explicit authorization for a narrow OrgMetrics-only transaction with before/after digest and rollback values.
5. Rerun this integrity reconciliation, then RSS-1.2E from Phase A only if no release-blocking findings remain.

Rollback strategy:

- Probe/certification changes: revert code; no data rollback.
- Product metric fixes: revert code behind the same transactional boundary; preserve before/after test evidence.
- Metric reconciliation: record the four old values, new derived values, derivation query/digest, actor, request/correlation ID, and transaction timestamp; rollback only those four fields if post-checks fail.
- Documentation changes: normal source revert.
- No rollback plan is proposed for historical rewrites because no such rewrite is recommended.

## 12. Remaining Limitations

- This was a read-only forensic task. It proves current persisted structure and classifications; it does not prove that repaired write paths will remain correct under future concurrency.
- RSS-1.2E browser, provider, language, security, and TODO-079 acceptance phases were not rerun.
- The exact database origin of a row is supported by durable timestamps and execution reports; Git history alone cannot authenticate mutable database history.
- The simulator secondary cross-check remains unsuitable as a source of truth because it expects the old fixed dataset and reports hundreds of unresolved current references.
- Worker jobs expose an adjacent operational warning. Their terminal failures are durably recorded and actor-scoped, but their business origin was not part of the 87-finding integrity probe.
- Empty governed-action, connector, and transition-audit datasets permit structural checks but not positive end-to-end integrity claims for those features.
- The health result applies to profile-oip-developer-demo. Other protected organizations were checked for non-mutation, not exhaustively reconciled.

## 13. Recommendation

Do not reseed or rewrite the Developer Demo dataset. Preserve the 20 historical artifacts. Update the probe's 62 incorrect findings and the obsolete fixed-count fixture. Fix the product metric write semantics, then reconcile only the four confirmed OrgMetrics fields through a separately approved, auditable transaction.

After those steps, repeat this read-only probe with the reconciled baseline. If it produces no Class A release blockers, rerun RSS-1.2E from Phase A.

## 14. Release Decision

RSS-1.2E remains blocked.

The block is narrow: four authoritative metric counters require product correction and data reconciliation. Organizational Memory, trust, validation, evidence, membership, ticket ownership, tenant isolation, and ticket sequence integrity do not require repair based on this audit.

The 83 Class B/C/D findings do not block release after their documented reclassification, but the Class A metric findings remain unresolved because this task explicitly prohibited repairs.

## 15. Integrity Status

DATASET_REQUIRES_RECONCILIATION

