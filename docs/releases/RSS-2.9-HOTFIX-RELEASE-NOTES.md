# RSS-2.9 Hotfix Release Notes

## Status

`RSS_2_9_READY_FOR_RELEASE_CANDIDATE_COMMIT`

The RSS-2 organization-lifecycle hotfix chain passed its technical certification gates on the tested working tree. The exact candidate is not yet committed; no tag or remote update was performed.

## Included

- Organization context switching without snapshot flush.
- Server-owned organization creation with creator ownership and idempotency.
- Account signup and first-organization onboarding.
- Demo/customer isolation and membership-aware limits.
- Optimistic KnowledgeItem revision conflicts with structured HTTP 409 recovery.
- Organization lifecycle UX and the fresh-customer browser acceptance chain.
- Gated, acceptance-only KnowledgeItem two-tab closure rehearsal using the real authenticated API.

## Verification

- RSS-2.1 through RSS-2.8 permanent probes: PASS.
- KnowledgeItem browser closure: `KNOWLEDGEITEM_TWO_TAB_CLOSURE_VERIFIED`.
- RSS-1.2S1-S5: PASS; RSS-1.2S6: PASS as provider-contract coverage with Claude intentionally inactive in the release runtime; RSS-1.2S7: PASS with five live DeepSeek Tier-1 requests.
- TODO-078 RBAC: PASS.
- TypeScript, Prisma validation/migrations, production build, and diff check: PASS.
- OIP Benchmark v1: 1000/1000 checks; critical security 100%.
- Protected mature-state digest unchanged before and after probes.

## Operator action

Review and stage the exact candidate tree, create the release-candidate commit, then create and push the annotated `v0.1.1-certified` tag only after explicit authorization.
