# REL-CERT-001 Candidate Manifest

Certification timestamp: 2026-08-12 09:46:46 +07:00 (SE Asia Standard Time)

Baseline tag: `v0.1.1-certified`

Baseline SHA: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`

Canonical row format: `path<TAB>classification<TAB>size<TAB>SHA-256`, sorted by path. The manifest hash is calculated from the release-file rows in the `path<TAB>size<TAB>SHA-256` format, with a trailing newline.

Candidate file count: 64

Candidate manifest SHA-256: `521968264109cb392e466222d7b726112131a708456df41c58bd0bfcdcfd0266`

Tracked diff SHA-256: `7e7b6a0011d3e1343a9d7139dbad9c080b589f21823c290d01b2928e746e4f4d`

Explicit exclusions: `docs/REL-CERT-001-POST-V0.1.1-RELEASE-CERTIFICATION-REPORT.md`, this manifest, `nc009-dev.err`, `nc009-dev.log`, ignored build/runtime directories, and environment files not present in candidate status.

| Path | Classification | Size | SHA-256 |
|---|---|---:|---|
| `app/api/organizations/[organizationId]/commits/validation/route.ts` | RELEASE_PRODUCT_FILE | 1388 | `ae86e1fd7a49b1e733b6f64e25664e6e93ceb6e2702f930e70e10c0c57576c7c` |
| `app/api/organizations/[organizationId]/tickets/[ticketId]/evidence/route.ts` | RELEASE_PRODUCT_FILE | 553 | `89150f371ef1d129a9926274ed7ad0aa21cb9db0a178275bd1de86cf3baafe71` |
| `app/api/organizations/[organizationId]/tickets/[ticketId]/messages/route.ts` | RELEASE_PRODUCT_FILE | 533 | `b393a251fefbec753fd2433d00de9c3306bde170df421284b91cf36784af4908` |
| `app/api/organizations/[organizationId]/tickets/[ticketId]/transition/route.ts` | RELEASE_PRODUCT_FILE | 5501 | `7996bd9db32b72fc2afe8f6e93ebdfd7571c080331d6eb7e87720e43e573bed9` |
| `app/api/organizations/[organizationId]/tickets/route.ts` | RELEASE_PRODUCT_FILE | 4228 | `1d3b298a625ffa6bee8e2fc85458872ab288ede93efd3c87e23b124c2744c05d` |
| `app/page.tsx` | RELEASE_PRODUCT_FILE | 233368 | `d73fe37a21b9251ba7ab81158f621af6109319e9f9c0dd9e6c437b66bc4398d1` |
| `components/ProvenancePanel.tsx` | RELEASE_PRODUCT_FILE | 14903 | `53e665f0850396c666eca88747416fde3533a921c0e5a779938933a1654836e7` |
| `components/ReflectionPanel.tsx` | RELEASE_PRODUCT_FILE | 18015 | `14718aeba1e8af46d5efdb9936436a7307d3b9de04168ea6c51917dd51de2193` |
| `components/views/CaseLookupView.tsx` | RELEASE_PRODUCT_FILE | 25642 | `5a4d21e559d207f3172602f7bee9323260b7aca81d3ec1231f317797394c6f01` |
| `components/views/TicketWorkspace.tsx` | RELEASE_PRODUCT_FILE | 53996 | `069e28906619e148e774911f6b09b747df155722207f097fade24928f1f66d5a` |
| `docs/CHANGELOG.md` | RELEASE_DOCUMENTATION_FILE | 41210 | `d0e4efc9086e6cbce62953dd6988bcfb071b346afc04a35aec9ea89e9092dd34` |
| `docs/NC-ACCEPT-001-FINAL-NUSACLOUD-LEARNING-LOOP-REACCEPTANCE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 17432 | `32ae252abcfc3da4bea9bac4cd17fcd5701852eae12822ee5cc7a5ccb69d3894` |
| `docs/NC-ACCEPT-001-FINAL-RERUN-NUSACLOUD-LEARNING-LOOP-REACCEPTANCE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 17270 | `542b769d4246274494d9d88b3bdae28b03ba2101147a3e39f34c770de7c0f3c1` |
| `docs/NC-ACCEPT-001-NC-0001-LEARNING-LOOP-ACCEPTANCE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 16651 | `4a13f39b41ece2bd7b7ebc7c43362e312d3576ef6969c9d2c84030bc86a4ab7d` |
| `docs/NC-FIX-001-IN-REVIEW-DRAFT-PERSISTENCE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 9903 | `57de2368694179ff130abc57898aa7e8c4f42ce0e519a3a95b86bc7e3e54bef0` |
| `docs/NC-FIX-002-MULTI-TURN-CASE-CONVERSATION-LIFECYCLE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 11116 | `79ca993a9979be3573dc263067c2b67b2893973c06f3b4cd42b4f323d2239241` |
| `docs/NC-FIX-003-FINAL-2-LEGACY-HARNESS-RECONCILIATION-FINAL-ACCEPTANCE-CLOSURE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 14429 | `fcf53004ced890ef55b769e038a8c7ba1d7fd49dd17b0507543a2832cb4f7119` |
| `docs/NC-FIX-003-FINAL-BROWSER-ACCEPTANCE-MISSING-REGRESSION-CLOSURE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 14641 | `9fcc277e3c847cc33ad9f855bf3d7988cca6c2a5fe19f19090e768c955307358` |
| `docs/NC-FIX-003-RESOLUTION-EVIDENCE-REFLECTION-GATING-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 13050 | `635d622de216058a1a98c607902d63a7baad56515da5cd22e0535be11d80d0a7` |
| `docs/NC-FIX-004-RESPONSE-FORMATTING-PIPELINE-DIAGNOSIS-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 13724 | `68cedd78def35fe455eaff7a92f6cbb3733b12585c57905ba0b522c31ab55cae` |
| `docs/NC-FIX-005-AI-DRAFT-LATENCY-MEASUREMENT-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 20139 | `fb5c6fb5dbd33eb1123e45b631dcabd7c78411d96035a68847df0b8c30caa927` |
| `docs/NC-FIX-006-KNOWLEDGE-REUSE-APPROVAL-SOURCE-TICKET-INTEGRITY-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 12931 | `461e7ad96d39efd88084084c4424456c2868ed3eae196e2616afe9dd34d61bf1` |
| `docs/NC-FIX-007-CROSS-DOMAIN-RETRIEVAL-COMPATIBILITY-GUARD-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 17967 | `41c081a2bd3d66a98e4cb115a9ddd80216f27118ef993c87bf0154d29e0388a2` |
| `docs/NC-FIX-007A-RETRIEVAL-AUDIT-RECONCILIATION-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 29590 | `b2499b0e58c45d09a117f6efa70c86a4856cff361a0ee9217f26934470bb8eff` |
| `docs/NC-FIX-008-POST-RESOLUTION-REFLECTION-LIFECYCLE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 18924 | `9b90b46ec52e591cd69c2a49011a24847c74fa87864b62668191ef8854db13f1` |
| `docs/NC-FIX-009-GROUNDING-COLD-START-UI-LABEL-RECONCILIATION-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 9772 | `ad4de89248a322129f4f3dda95643366d16bf4bbee34986acc00eae909436544` |
| `docs/NC-FIX-010-OPTIMISTIC-CONCURRENCY-RELOAD-RETRY-UX-RECONCILIATION-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 14511 | `9ae012d1b2242f23290d5d9f92e6d3fa78d0aa532477cc81ee7553a2c37b4b37` |
| `docs/REL-PREP-001-POST-V0.1.1-CHANGELOG-RECONCILIATION-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 21178 | `c2f0b85e607cf4e0cf340758b9c0e8a38ebdb6053677ced6f06a712802f47dbc` |
| `docs/RSS-2.9A-RELEASE-CANDIDATE-COMMIT-SHA-RECONCILIATION-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 17142 | `295b75cd1878dc7b2394cc0b7e1991d64f60515d2787f96b3c00c32fda8792a4` |
| `docs/RSS-2.9B-CERTIFIED-TAG-REMOTE-RELEASE-FREEZE-REPORT.md` | RELEASE_DOCUMENTATION_FILE | 10083 | `d0ce153643927427646da79d6c54fc99a50e29b8d7be14d8d128598d7a8840a8` |
| `lib/ai/adapter.ts` | RELEASE_PRODUCT_FILE | 15429 | `221eeb85de0ba2893895366015cfc727d74ab5dea84d2e077d7c2b078903d868` |
| `lib/ai/deterministic.ts` | RELEASE_PRODUCT_FILE | 5322 | `31cf5ed717d3d62b97bdc26f6aae8caad15a3f0e01ad4eb94b9b12accc7a954c` |
| `lib/ai/lmStudio.ts` | RELEASE_PRODUCT_FILE | 27543 | `1eada21a05c9f13fae53fc2fbbd8bf05952dbe4d55122e26cc2ed17a70e144a0` |
| `lib/ai/prompts.ts` | RELEASE_PRODUCT_FILE | 22415 | `d7c9d007b7f84104f1174b245b0978f840c5f2d5f4474d98337e8d3ec8177aca` |
| `lib/ai/types.ts` | RELEASE_PRODUCT_FILE | 5557 | `dbda95639e2f4942cb85fd11567c0537fd9659360586cb2913501271d2182be5` |
| `lib/application/learning/reflectionCommands.ts` | RELEASE_PRODUCT_FILE | 25645 | `8be4d7e5ef0f4d280fe40d83bd1fc50c473d3cd8b490c92425df5acd4aed7710` |
| `lib/application/tickets/processTicket.ts` | RELEASE_PRODUCT_FILE | 38740 | `e7665e32e09b1196bfab114bb7afd9626fc1ac514c8134f455147321647cb030` |
| `lib/drafting.ts` | RELEASE_PRODUCT_FILE | 83231 | `335c2f97c0dee70045da08016e69c9b6ca3ab4861f9d494369ef5be528c01111` |
| `lib/groundingPresentation.ts` | RELEASE_PRODUCT_FILE | 870 | `7870d1a481de3e30383a162ff65da42ee5222fc9451b7f5c6e9fd52861a90c0c` |
| `lib/memory.ts` | RELEASE_PRODUCT_FILE | 15402 | `df8edacd5aaf2b3ac97c6ed990d550a2b1602abe86f175aa4e0f5c5b3c783501` |
| `lib/retrievalCompatibility.ts` | RELEASE_PRODUCT_FILE | 7205 | `4acc4881f7ca59359c67fa52d56f3d5961702b7bf4d5e234b31b8719439d59cc` |
| `lib/server/persistenceService.ts` | RELEASE_PRODUCT_FILE | 91175 | `79ed5750a1c8099309fd4ea4726adcd31ef66a9ef9d27de8dd0b1ec00bd6e0f3` |
| `lib/server/tickets/ticketWorkflow.ts` | RELEASE_PRODUCT_FILE | 41030 | `cee2202398809d8e76fe74d1d5fd944a9402dc23a22a84383d118b2bdf75e8b2` |
| `lib/ticketRecords.ts` | RELEASE_PRODUCT_FILE | 12438 | `34846fc94411082e3ca8467212a59a8b4e434a8ddf4f6e39d7d9f151f72aa152` |
| `package.json` | RELEASE_PRODUCT_FILE | 15475 | `9c77668af77c3498800b785cf510e6d6db1357028e62604378c8642f3a10fa0c` |
| `prisma/migrations/20260810000000_add_ticket_messages/migration.sql` | RELEASE_DATABASE_FILE | 1416 | `f103c6a16dae2f87a3f0bef76e018ea933d9c32c7b6cc194d1cb1ac3d9452f32` |
| `prisma/migrations/20260811010000_add_resolution_evidence/migration.sql` | RELEASE_DATABASE_FILE | 1749 | `8f62484d51b7feb5b7a46fa472af3cab2025893570a11c27ee31430b79b2cbee` |
| `prisma/schema.prisma` | RELEASE_DATABASE_FILE | 41911 | `aa382bbab946b6d3292ff69fae6de34adfcc182de2091af99c016ddb23f9aa6f` |
| `scripts/nc-accept-001-learning-loop-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 17725 | `9cbdb87f7d488776997a0ed507711d05c979c051761a476fe5ac6a8d996a1e60` |
| `scripts/nc-fix-001-draft-persistence-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 10552 | `d5afce372b4959ede3b772d3099c461c60df054f8a54b3c1b72b597f501f8f71` |
| `scripts/nc-fix-002-multi-turn-conversation-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 13604 | `957e662eec56a0b43f42c43143cd57887aeaeede7cfb445bdbf93a8b89bb9ff0` |
| `scripts/nc-fix-003-resolution-evidence-reflection-gating-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 16726 | `85e8bf06d9fe455cce030c8204911b35486e9b997d2e0dfb37cd4a72dd8dcfcb` |
| `scripts/nc-fix-004-response-formatting-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 16109 | `48e94d7d999dcd30e2163c44194ce0fae324ed5dc37ed0625029c323b5023e72` |
| `scripts/nc-fix-005-ai-draft-latency-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 13065 | `d2f5c62d1002ec39025d5e85f9702c696248f271e28be0f90edd6805601df1df` |
| `scripts/nc-fix-006-knowledge-reuse-source-ticket-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 25496 | `e3dcd065b0ceeb73944938df1eff26b5a5ce610464583e65c5cb1a696ea7fac6` |
| `scripts/nc-fix-007-cross-domain-retrieval-compatibility-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 10614 | `d5b6902269f6ab729caeff908015c5983fe459b5cc5a102b2e553924d324badc` |
| `scripts/nc-fix-008-post-resolution-reflection-lifecycle-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 18668 | `5f3a507975ba2ba42652fbbfe9364f20050c14eb2e66b15ab2c4d98bb2743c60` |
| `scripts/nc-fix-009-grounding-ui-state-reconciliation-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 3534 | `e1a3cf62eeac6697560fdffb468b9ca56a334632ae492b48013522ff6743c21c` |
| `scripts/nc-fix-010-optimistic-concurrency-reload-retry-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 8537 | `86cae6d5d6397b9535a2a8d2d4af3c8afc963d47c4afbe28c749d46d57a08faf` |
| `scripts/rss-1.2e2-orgmetrics-concurrency-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 9830 | `ef9c55143737888bdbc46a20a6f4bf5251efcba57fa3c9ea53a9d88ea0a88524` |
| `scripts/todo015-source-ticket-idempotency-probe.cjs` | RELEASE_TEST_OR_PROBE_FILE | 16181 | `8c9217cb64282b115715c892715c31062aeca4799e59657dfc67ef84660917f8` |
| `types/ai.ts` | RELEASE_PRODUCT_FILE | 4515 | `bc83135951f3e383fb3fee33190d7436bb53f164ecd6912f7c85da36e6c5c0ee` |
| `types/index.ts` | RELEASE_PRODUCT_FILE | 3916 | `72ebe030f52175db0f13388cf6b132dd757b219dad3d53e7db3457f01363f2ff` |
| `types/ticket.ts` | RELEASE_PRODUCT_FILE | 10021 | `0f3ffa06b277a4907e4972492e348c0d55a059759fe34246ae873fd6dc389692` |

No secret or environment file is in this manifest. Local-only logs are intentionally excluded.
