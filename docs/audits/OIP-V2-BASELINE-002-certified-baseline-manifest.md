# OIP-V2-BASELINE-002 — Certified Baseline Manifest

Status: Approved pre-commit manifest  
Prepared: 2026-08-26  
Branch: `landing/option-c32-release-polish`  
Starting HEAD: `084f9ab46d6555e793df8b73b1abb085267a2a05`  
Starting HEAD tree: `a6b8439e3cf941ede527272a91b8f25b60baf1ba`  
Starting worktree: 77 dirty paths (27 modified, 50 untracked); no staged files  
Starting database: PostgreSQL `oip_development` at `127.0.0.1:5432`; schema up to date  
Starting package version: `0.3.0`; latest tag: `v0.3.0`

## Purpose and safety decision

This manifest reconstructs the exact certified OIP V2 change set from actual working-tree status, diffs, task reports, Canon/architecture evidence, migrations, package scripts, and probes. It does not use broad staging. The include set contains the domain-neutral memory implementation, its schema/migrations, Canon and implementation documentation that define the certified behavior, the complete OIP V2 evidence chain, and the required regression infrastructure. The exclude set contains unrelated TODO-080 and NC/REL work that is intentionally preserved outside the baseline commit.

`YES_TO_REPRODUCIBILITY`: If only INCLUDE were committed, the repository would contain the implementation, schema, migration history, Canon context, evidence chain, and automated gates required to reproduce BASELINE-001.

`NO_UNRELATED_WORK`: No excluded path is required by the certified OIP V2 runtime or its required certification gates.

`BLOCKED`: empty.

## Include manifest

The intended baseline commit includes the 68 original OIP V2 paths below plus this manifest itself (69 committed files total). SHA-256 values are working-tree content hashes captured before staging. The manifest's own self-hash is intentionally not recorded because it would be self-referential.

### Certified product code

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `app/page.tsx` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002/003/004/005 | YES | Integrates the Organizational Memory surface and certified retrieval/grounding behavior. | `67b2fead17449baacf240935ea074150930961d2196966d5e8cd16d47372df9f` |
| `components/ProvenancePanel.tsx` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-004/005 | YES | Presents certified retrieval, grounding, and human-review states. | `a55b9c71ce10b293486284edfbce9df6528cc1b3baed59bd3b056770ce2d562d` |
| `components/views/HomeView.tsx` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002 | YES | Exposes domain-neutral organizational-experience entry in the certified UI. | `9cf87af59988a793fd8948bcbe4376d4cf5e311d1005f9f12f977c55122fddf2` |
| `components/views/TicketWorkspace.tsx` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-004/005 | YES | Preserves selected-candidate and human-review presentation semantics. | `3cf74feae906c3917819d578dc008a9bcea111226a01bfcc9d1a2ccb524583ee` |
| `lib/application/tickets/processTicket.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-003/004/005 | YES | Preserves ranking-to-projection and grounded reuse identity. | `0167511cbb13bc83f32e9899b629af694dfbb7d22d4bec5c3bf4129e5e85425a` |
| `lib/lessonSelection.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-005 | YES | Uses the certified deterministic candidate comparator. | `d71c2928e276597e6c98a8e44be53722dd860681e84a894909a54651eae6f8ab` |
| `lib/memory.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-003/004/005 | YES | Implements bounded retrieval, compatibility, ranking, specificity, and deterministic selection. | `4aaef36dba4442466c449767fa27250782bb171aa6bbc539ea22ccf1660f1a1b` |
| `lib/retrievalCompatibility.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-003/004/005 | YES | Implements hard compatibility and scope/condition safeguards. | `b4d4e740eaa6a3a45624ea30ce552ae29ea85cb36ecde541fc207a142728ad38` |
| `lib/server/persistenceService.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/003/006 | YES | Provides organization-scoped governed validation, provenance, outcomes, and candidate binding. | `ceede78e83f01154a463c4d830f8b3701974081dafd0f46b9c59b146be7717be` |
| `lib/server/rbac/definitions.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002/003 | YES | Defines memory capabilities and human governance permissions. | `4c0ceb55f9668a53a40e6a4dfa5c10e648222d45859a7d530753c484def75225` |
| `lib/trustEngine.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-003 | YES | Keeps lifecycle, reliability, and automation authority distinct. | `0b5ae59534db069ef710a15d9d5571b88813598f2f57bf52c2445521143d164a` |
| `lib/eventTime.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-004 | YES | Preserves event-time parsing and timezone behavior. | `dba5a767db0e839215069ce5bb27e8bd2b722fdb08e30819a5dfb13479dd9fd6` |
| `lib/retrievalPresentation.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-004/005 | YES | Defines inspectable retrieval presentation states. | `ac39d9dbef80a0224bde8758a54b51f8da49ebda97034db070394143730cfb0e` |
| `lib/server/organizationalMemoryPrimitives.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/006 | YES | Provides Source/Evidence helpers and canonical candidate identity. | `4979f5a961ac8bbbef21533101a52f0ba55e4716f9397af27b3a0a856bd27693` |
| `lib/server/organizationalMemoryService.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/003/006 | YES | Implements domain-neutral Source, Evidence, preparation, validation, outcomes, challenges, and inspection. | `bfec6f990a380b190846a093ca5d9c10ca16f26cb345e63109bc29125076c4d3` |
| `components/views/OrganizationalMemorySurface.tsx` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002 | YES | Provides the certified operator entry and inspection surface. | `b09d0017ecde71d4d8b2c10498fe1cb910d41dc89266076aaa91773906f94832` |
| `app/api/organizations/[organizationId]/memory/challenges/[challengeId]/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/003 | YES | Provides human challenge review and scope evolution route. | `e8652b577550abc6995be533ebf0997e1078bd6165f22c53a68d41127c8b91b0` |
| `app/api/organizations/[organizationId]/memory/challenges/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/003 | YES | Provides challenge listing/opening and organization boundary. | `59374f8efbad31c46c7f87897256c42f4ac0d88ac174bde10b89017c20807481` |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/evidence/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002 | YES | Provides Source-linked Evidence create/read. | `41d067d03a0ec9a3e0832af47b3c268beeed9974576c499303766258d72f7011` |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/prepare/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002 | YES | Provides advisory learning preparation. | `07a6f83ae9ddf0b4434f1f23f20e7c85217609d0bc33ed50c2e75e681287e909` |
| `app/api/organizations/[organizationId]/memory/experiences/[sourceId]/validate/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002/006 | YES | Provides authenticated human validation and candidate-to-Source enforcement. | `7acb077203f4dfe8b2040262c40951957c439e7c2070e800e6dd96a8b7cc763e` |
| `app/api/organizations/[organizationId]/memory/experiences/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002 | YES | Provides domain-neutral organizational Source creation. | `76099e7d33afc723aea6619162911c3c4ebbc20645a7829fa21ceacba85f7e4c` |
| `app/api/organizations/[organizationId]/memory/knowledge/[knowledgeItemId]/evidence/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002 | YES | Provides inspectable memory Evidence provenance. | `2e9ecce5fd3f35aa7d26e35141eb32d9672d81c6705adfccc30afb1e1d2c2149` |
| `app/api/organizations/[organizationId]/memory/knowledge/[knowledgeItemId]/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-002 | YES | Provides organization-scoped memory inspection. | `208dc3de39d17f61e6b22a519a91da03a12929c2726be9f8d3163a61e0f73ec0` |
| `app/api/organizations/[organizationId]/memory/outcomes/route.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/003 | YES | Provides durable SUCCESS/CORRECTION_REQUIRED/FAILURE outcome recording and idempotency. | `4877b0bc65338e6522529de431f8f8ea53d27a47252f4c6b459217d219932903` |
| `types/organizationalMemory.ts` | ?? | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002 | YES | Defines the domain-neutral memory contracts used by the certified runtime. | `42c429969e2746603515e2b8ee78c67264c6154d5ae871383397c0d0de780c2d` |
| `types/index.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-001/002 | YES | Exports the domain-neutral memory contracts to the application. | `a844489f9015625f3a3241524d9d854148eb87ba6853609e6c28dd2d1a18aa04` |
| `types/knowledge.ts` | M | `CERTIFIED_PRODUCT_CODE` | OIP-V2-FIX-003/004/005 | YES | Carries governance, retrieval-selection, and explainability fields used by the certified path. | `ba16234723d2bc8365c6b87b01039d2670a10d45084951d8a29161bff86f23e4` |

### Schema and migration

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `prisma/schema.prisma` | M | `CERTIFIED_SCHEMA_OR_MIGRATION` | OIP-V2-FIX-001/002/003 | YES | Defines Source, Evidence, outcomes, challenges, versions, and tenant-scoped relationships. | `c7466159eb402f4638455c53881fd921c2c3579bf7999806cd0f6e22a55de28b` |
| `prisma/migrations/20260824120000_add_oip_v2_memory_foundation/migration.sql` | ?? | `CERTIFIED_SCHEMA_OR_MIGRATION` | OIP-V2-FIX-001 | YES | Adds the domain-neutral memory foundation. | `ef0ebd880200470a0a0a449a84b89c72f71cf95a579eb4caddfbdf682174a157` |
| `prisma/migrations/20260824130000_add_memory_governance_capabilities/migration.sql` | ?? | `CERTIFIED_SCHEMA_OR_MIGRATION` | OIP-V2-FIX-001/003 | YES | Adds outcome/challenge/governance persistence. | `83cca7b547e03e10ce62bf3d9dcd2b58ea99a99c55788f917583651795bd7866` |
| `prisma/migrations/20260824140000_add_memory_entry_capabilities/migration.sql` | ?? | `CERTIFIED_SCHEMA_OR_MIGRATION` | OIP-V2-FIX-002 | YES | Adds entry/inspection capability persistence. | `2580dd6fd03138b976203a3b47459710285784cee1bcaa6ea14dd33940e5709d` |

### Canon and implementation documentation

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/canon/01_PRODUCT_VISION.md` | M | `CERTIFIED_CANON` | DOC-AUDIT-001/DOC-FIX-001 | YES | Defines Organizational Memory as the durable foundation and current/future boundary. | `5278f4899df355c2914469e3d70aa21a251f6ce8528ff959864c344f7029e19a` |
| `docs/canon/03_PRODUCT_CAPABILITY_MODEL.md` | M | `CERTIFIED_CANON` | DOC-AUDIT-001/DOC-FIX-001/DOC-FIX-003 | YES | Defines evidence-backed memory, single-experience admission, validation, and authority boundaries. | `9a7fcfa2f8ca75e37e7db66ce5bac42e2b745d5e10079da525d5ed6ed23cb21c` |
| `docs/canon/04_PRODUCT_DOMAIN_MODEL.md` | M | `CERTIFIED_CANON` | DOC-AUDIT-001/DOC-FIX-001/DOC-FIX-003 | YES | Defines Source, Evidence, Candidate, Validation, and Organizational Memory relationships. | `771f3c79d5739ab489e25f4f7276420f5e0cb078073f323f14639787dfaaa51e` |
| `docs/canon/05_PRODUCT_WORKFLOW_MODEL.md` | M | `CERTIFIED_CANON` | DOC-AUDIT-001/DOC-FIX-001/DOC-FIX-003 | YES | Defines Remember/Retrieve/Evolve/Trust and human-governed promotion. | `f26acbda07815f8ac3acdfb5c3f4bad2756191ea913c11462b68d9f54840c53c` |
| `docs/canon/06_AI_COGNITIVE_MODEL.md` | M | `CERTIFIED_CANON` | DOC-AUDIT-001/DOC-FIX-001 | YES | Defines AI as advisory and retrieval as recall rather than truth. | `6ac073e46eb70332dd5190f8dff7758ebd8ad045d3dd0c71f3ba8f9c534f0ac3` |
| `docs/canon/CANON_GOVERNANCE.md` | M | `CERTIFIED_CANON` | DOC-FIX-001/DOC-FIX-003 | YES | Records compatible Canon patch clarifications and history. | `68578889828ba9175381182d09b500fc695c2acf62ce06bc1eabf574fb5080b7` |
| `docs/canon/README.md` | M | `CERTIFIED_CANON` | DOC-FIX-001 | YES | Preserves Canon navigation and version context. | `9350e9a5517c19dfeb74a685f6cd399fe64d87782f8f51f78751bcf67ec179a7` |
| `docs/ARCHITECTURE_BASELINE.md` | M | `CERTIFIED_IMPLEMENTATION_DOC` | OIP-V2-FIX-001/003/004/005 | YES | Describes the implemented memory lifecycle, retrieval pipeline, and governance boundaries. | `614fdb01d48a8256231d1510e045e6577b0c255a104e070a8bb250b8ba249e63` |
| `docs/KNOWN_LIMITATIONS.md` | M | `CERTIFIED_IMPLEMENTATION_DOC` | OIP-V2-FIX-003/004/005 | YES | Records bounded retrieval, reliability, automation, and design-partner guardrails. | `44587632c23bd6238228fc1ea1e885de5835dca18102f48883e797452d142853` |
| `docs/implementation/15_API_ARCHITECTURE.md` | M | `CERTIFIED_IMPLEMENTATION_DOC` | OIP-V2-FIX-001/002/006 | YES | Documents domain-neutral memory APIs and candidate identity enforcement. | `4653f51b00dc4e0b64963409fa04fbbb0c25310c3d85262a2e0f796c12efe9dc` |
| `docs/implementation/16_STORAGE_ARCHITECTURE.md` | M | `CERTIFIED_IMPLEMENTATION_DOC` | OIP-V2-FIX-001/002/003 | YES | Documents Source/Evidence, Outcome, Challenge, version, and tenant storage. | `26606e2ae6a000d79d365ccd8d0e05c5cccc2599f0ee265d0e114404fef43f33` |

### Test, probe, QA, and audit evidence

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `scripts/doc-fix-003-single-experience-regression-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | DOC-FIX-003 | YES | Protects single-experience admission and human-validation boundaries. | `da41e2eb49fa951460d15af5473aa410201ecaa2950593ebfbd8009235b8ca45` |
| `scripts/oip-v2-fix-001-foundation-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-001 | YES | Exercises foundation lifecycle and governance invariants. | `d80d310595af766971c176c258130672efebc551565f9257e525203d299ece7b` |
| `scripts/oip-v2-fix-002-entry-inspection-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-002 | YES | Exercises entry and inspection surface. | `f22e08c3abb3d99e1fc0fd9d1e94e61c1870816e0c96ef8005990c238e522ca5` |
| `scripts/oip-v2-fix-003-retrieval-outcome-trust-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-003 | YES | Exercises retrieval, outcomes, idempotency, trust, challenge, and isolation. | `f999ee6745b53c3ba6a84da7a351afc7f6030bba74a4f1b75dee1a4a48d679df` |
| `scripts/oip-v2-fix-004-retrieval-candidate-selection-event-time-copy-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-004 | YES | Exercises event time, candidate selection, and presentation states. | `eae09903759d33a9bb22dec413c03150cc6daf527a300a3616464f02ae9686ec` |
| `scripts/oip-v2-fix-005-near-duplicate-selection-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-005 | YES | Exercises deterministic near-duplicate selection. | `d70789e049abd91c8d2fa9141b42419da65216cb26a9c2f7bdd676d390cd299e` |
| `scripts/oip-v2-fix-006-candidate-source-provenance-probe.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-FIX-006 | YES | Exercises candidate-to-Source identity and provenance attacks. | `248a5e21eb94e9631035a8d647975086d329a92b8cf02091e17e98e4ad9d2067` |
| `scripts/oip-v2-qa-001r-r2-auto.cjs` | ?? | `CERTIFIED_TEST_OR_PROBE` | OIP-V2-QA-001R-R2-AUTO | YES | Runs the full authenticated lifecycle, including owned restart. | `0ac3804420aeed6829da43dc7f0564a1731cc4a0e0732487ea18392ba284a7b8` |
| `docs/audits/DOC-AUDIT-001-organizational-memory-documentation-impact.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | DOC-AUDIT-001 | YES | Preserves documentation impact analysis. | `f391e1920ef77c2fec9326b861fb8e1aa15ea6886ac156898e8eb8200213ae87` |
| `docs/audits/DOC-FIX-001-organizational-memory-canon-clarification.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | DOC-FIX-001 | YES | Preserves Canon clarification evidence. | `3f891eecff2b1a135a30c977bc2bb3f5ad73fbc9ea578ec9abc25159dc10eeda` |
| `docs/audits/DOC-FIX-003-single-experience-memory-admission-canon-clarification-regression-protection.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | DOC-FIX-003 | YES | Preserves admission clarification and regression evidence. | `36801e53e7bb49f54accf7142d5d45965037a9ef543659abc68de1609e1da0b1` |
| `docs/audits/OIP-V2-AUDIT-001-organizational-memory-capability-baseline.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-AUDIT-001 | YES | Preserves original capability baseline evidence. | `593b57febf8f9536600ae587bfc39296f47d9fe4bcc61ac27153e7f9b991aba9` |
| `docs/audits/OIP-V2-AUDIT-002-single-experience-memory-admission-human-validation-authority.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-AUDIT-002 | YES | Preserves admission and authority audit evidence. | `c554b6624c7463fc3c8c24099a50526c10494db623de0a6f4c47c26c24313feb` |
| `docs/audits/OIP-V2-FIX-001-domain-neutral-memory-foundation.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-001 | YES | Preserves foundation implementation evidence. | `906b5f8a829e573e7289e6981150ddd2d73a01ed5ac693732cf573d268b789d9` |
| `docs/audits/OIP-V2-FIX-002-domain-neutral-memory-entry-inspection.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-002 | YES | Preserves entry/inspection evidence. | `1c54e531a73137b570216faf12df0b7b273fd466ef4567d4ee89c677f0762478` |
| `docs/audits/OIP-V2-FIX-003-domain-neutral-retrieval-outcome-trust-reconciliation.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-003 | YES | Preserves retrieval/outcome/trust repair evidence. | `ccb4dea568f5ccd83bdebd9076e6d1ce9ede8097cc6daf06c514897be3a9c217` |
| `docs/audits/OIP-V2-FIX-004-retrieval-candidate-selection-event-time-copy-reconciliation.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-004 | YES | Preserves candidate selection/event-time evidence. | `90ac9d8f3aba67be7ca6a9d500bbc3e6f30c6f79c86ea30e2b62f4c1ff32f7fe` |
| `docs/audits/OIP-V2-FIX-005-near-duplicate-memory-resolution-deterministic-tie-breaking-selection-reconciliation.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-005 | YES | Preserves near-duplicate selection evidence. | `89fb1e288b25de584514e4d5815446b728d8365c404b9befeedd37537795bb69` |
| `docs/audits/OIP-V2-FIX-006-candidate-source-identity-provenance-binding-hardening.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-FIX-006 | YES | Preserves candidate/source provenance hardening evidence. | `a6e538ee4270e8cd94ac70ecb4909d67cfaafeffbd5f68f99b05edf9c39c8063` |
| `docs/audits/OIP-V2-QA-001-organizational-memory-core-acceptance.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-QA-001 | YES | Preserves the original QA baseline. | `d297c28925bdcc6d25abbd1e7d3167f05867a4081e94dc7a57fe0d51ddb9ccae` |
| `docs/audits/OIP-V2-QA-001R-R2-AUTO-organizational-memory-core-acceptance.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-QA-001R-R2-AUTO | YES | Preserves the latest full accepted QA evidence. | `f0c17440d399f92ab5b1d78d14263d9938ab9cf48c5a22d63373eb3dc24d7264` |
| `docs/audits/OIP-V2-QA-001R-R2-organizational-memory-core-acceptance.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-QA-001R-R2 | YES | Preserves the historical failed/rejected rerun evidence without rewriting it. | `375ead85a68a951afe9872fc9470ad10f803915ed19e93e72433a46d3ce97ef5` |
| `docs/audits/OIP-V2-QA-001R-organizational-memory-core-acceptance-rerun.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-QA-001R | YES | Preserves the historical rerun evidence. | `d78473a8bed3708af2841e7235e907c9af27e194aee4c697863b9d70a5f6229d` |
| `docs/audits/OIP-V2-BASELINE-001-organizational-memory-core-baseline-certification.md` | ?? | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-BASELINE-001 | YES | Preserves the certification input for this freeze. | `7d85f867a458063f55be9e3aec59466d440e5a7f56640c3a07d557c81d65d3dd` |

### Certified configuration

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `package.json` | M | `CERTIFIED_CONFIGURATION` | OIP-V2-FIX-001/002/003/004/005/006 and QA | YES | Adds the versioned V2 probe and QA commands required for reproducibility. | `0b9ca093c58f91e29d2e846cc895fd30b508244cdae46fd628506c9030382eef` |
| `docs/audits/OIP-V2-BASELINE-002-certified-baseline-manifest.md` | NEW | `CERTIFIED_QA_OR_AUDIT_EVIDENCE` | OIP-V2-BASELINE-002 | YES | Required explicit freeze manifest; self-hash is not recorded because it is self-referential. | `SELF_HASH_NOT_APPLICABLE` |

## Exclude manifest

These 9 original paths are intentionally excluded from the baseline commit and remain in the worktree. They are not required to reproduce the certified OIP V2 memory system and belong to unrelated TODO/NC/REL work. They are preserved, not deleted or restored.

| Path | Pre-State | Classification | Origin | Include? | Reason | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/TODO-080-REPORT.md` | M | `PRE_EXISTING_UNRELATED_CHANGE` | TODO-080 | NO | Intent-isolation report unrelated to the certified OIP V2 Organizational Memory baseline. | `ed60fa3886ba0be0b3b10e596e37ebdfa085261335bd5b928a91f75699444f32` |
| `docs/reports/NC-FIX-012R-reflection-promotion-identity-boundary-investigation.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | NC-FIX-012R | NO | Customer-support reflection investigation outside the OIP V2 baseline path. | `ec147426e86d41528aabf606266d279e0420b2d42bd6e060d9aabde7453209ff` |
| `docs/reports/NC-FIX-012R2-STASH-RECOVERY-CONTRACT-AUDIT-REPORT.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | NC-FIX-012R2 | NO | Stash-recovery audit outside the OIP V2 baseline path. | `e5be2753d5113c12ad7ddffdca6aeb7bdb7d72fd58b9820e16ade7590f6e157f` |
| `docs/reports/NC-FIX-012R3-COMMIT-READINESS-FINAL-VERIFICATION-REPORT.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | NC-FIX-012R3 | NO | Customer-support commit-readiness report outside the OIP V2 baseline path. | `7d4d6c3454c6cce641c45779afdf55483ccfbdf1160011418d23f92be9d5f886` |
| `docs/reports/NC-FIX-014R-resolved-ticket-reflection-availability-boundary-investigation.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | NC-FIX-014R | NO | Resolved-ticket reflection investigation outside the OIP V2 baseline path. | `f935cd455ccef910fa33e9c2c704033fbb5db5621e09e480117a469620491d3b` |
| `docs/reports/NC-FIX-016R-exact-certification-path-reuse-state-divergence-investigation.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | NC-FIX-016R | NO | Customer-support reuse-state investigation outside the OIP V2 baseline path. | `7f2ceccf8d5b40638f61e212b62ba440a46a4335a8de6d31b2d473be68768e09` |
| `docs/reports/REL-RC-003-CERTIFIED-CANDIDATE-ARTIFACT-RECONCILIATION-AND-RELEASE-CANDIDATE-PREPARATION.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | REL-RC-003 | NO | Separate release-candidate artifact work; publication/release metadata is outside this local baseline commit. | `79f02512f77b09ae0d2da83c593ef3d21ab70dffe74f6ad7460e792ecfeea06d` |
| `docs/reports/REL-RC-003-RELEASE-CANDIDATE-MANIFEST.json` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | REL-RC-003 | NO | Separate release-candidate manifest outside the certified V2 baseline scope. | `c90d89ed2c0223c45ebfca6385bed336232e53f5ad914d6894870021362726bc` |
| `docs/reports/REL-RELEASE-META-002-V0.3.0-RELEASE-IDENTITY-METADATA-FREEZE.md` | ?? | `PRE_EXISTING_UNRELATED_CHANGE` | REL-RELEASE-META-002 | NO | Existing release metadata work; a new release/version decision is not authorized here. | `710cf305eb448611f27df5fa5d78e999e692560eba295c80227b60350d3245e6` |

## Staging and verification plan

1. Stage only the 69 explicit INCLUDE paths with path-based `git add --` commands.
2. Verify staged names, stat, check output, index cleanliness before commit, and excluded-path absence.
3. Verify every staged blob with `git hash-object --path=<path> <path>` against `git rev-parse :<path>`; any difference is `UNEXPECTED_STAGING_MUTATION` and blocks commit.
4. Build a temporary Git worktree at starting HEAD, apply only the staged binary diff, link only the existing dependency tree, and copy only `.env.local` as required runtime configuration. This represents `HEAD + staged changes` and excludes all remaining dirty paths.
5. Run the complete V2 probe suite, full owned-server QA, Prisma checks, typecheck, build, and diff check from that isolated staged tree.
6. Commit once with subject `feat: establish OIP V2 organizational memory baseline` only if all staged-tree gates pass.

## Commit identity placeholders

- Final commit: `TBD until the single authorized commit is created; recorded after commit in the execution report; no amend.`
- Final tree: `TBD until the single authorized commit is created; recorded after commit in the execution report; no amend.`
- Commit parent must equal starting HEAD `084f9ab46d6555e793df8b73b1abb085267a2a05`.

## Release-preparation assessment

- Current package version: `0.3.0`.
- Latest local tag: `v0.3.0`.
- Product generation `OIP V2` is not assumed to mean semantic version `2.0.0`.
- Baseline commit is locally authorized, but a subsequent release version/title/notes decision is required.
- Release readiness classification: `READY_FOR_RELEASE_METADATA_DECISION`.
- No version metadata, tag, GitHub release, push, deployment, or publication is authorized by this manifest.

## Post-commit update boundary

This manifest is committed before the baseline commit can exist. It must not be amended after commit merely to insert the final SHA/tree. The execution report records the final commit identity, final tree, committed path manifest, and post-commit worktree state.
