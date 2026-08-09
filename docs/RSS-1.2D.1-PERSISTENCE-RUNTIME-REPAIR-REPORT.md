# RSS-1.2D.1 — Persistence Runtime Repair Report

Date: 2026-08-07  
Scope: server-authoritative browser runtime persistence for `saveOrgMetrics` and `saveKnowledgeCandidates`.

## Final verdict

`PERSISTENCE_RUNTIME_REPAIRED`

Both browser-observed persistence failures were reproduced, classified, repaired, and re-tested through the authenticated production API and the real in-app browser. No persistence warning remained after the final production build.

## Failure reproduction

The initial authenticated browser load of `profile-oip-developer-demo` displayed:

```text
Persistence failed for saveOrgMetrics: Server persistence could not read the requested resource.
Persistence failed for saveKnowledgeCandidates: The request body must be valid JSON.
```

The candidate snapshot contained 1,805 records and serialized to 11,323,970 bytes. Next.js 15.5.22 was using its default 10 MB `experimental.middlewareClientMaxBodySize`; the request was truncated before `request.json()` and correctly became `INVALID_REQUEST`.

The metrics failure was reproduced independently with an authenticated HTTP PUT. The API returned HTTP 500 with `DATABASE_ERROR`. A server log trace identified the actual cause: `RATE_LIMIT_HASH_SECRET is required in production while rate limiting is enforced.` The metrics route invokes the shared PostgreSQL-backed limiter; the missing required local runtime secret caused fail-closed configuration handling to surface as a generic persistence failure.

## Repair applied

| Failure | Root cause | Repair | Result |
| --- | --- | --- | --- |
| `saveKnowledgeCandidates` | 11.3 MB JSON exceeded Next's 10 MB middleware body clone limit and was truncated | Set `experimental.middlewareClientMaxBodySize` to `32mb` in [next.config.ts](../next.config.ts) | Full 11,323,970-byte snapshot PUT returns HTTP 200 |
| `saveOrgMetrics` | Production rate limiter had no `RATE_LIMIT_HASH_SECRET` in the local runtime environment | Added a local-only generated `RATE_LIMIT_HASH_SECRET` to `.env.local` (ignored; not committed) | Metrics PUT returns HTTP 200; browser warning cleared |
| Error observability | Adapter discarded the HTTP status when the server returned an error envelope | Include HTTP status in `ServerPersistenceAdapterError` messages in [serverPersistenceAdapter.ts](../lib/persistence/serverPersistenceAdapter.ts) | Runtime failures retain actionable status context |

Validation and server-owned persistence were not weakened. The route still rejects malformed JSON, and no localStorage fallback was added.

## Contract and data-integrity checks

The repair probe [rss-1.2d1-persistence-runtime-probe.cjs](../scripts/rss-1.2d1-persistence-runtime-probe.cjs) passed:

```json
{"verdict":"PERSISTENCE_RUNTIME_REPAIRED","candidateCount":1805,"candidateBytes":11323970,"metricsPutStatus":200,"candidatesPutStatus":200,"malformedPutStatus":400}
```

The malformed candidate body still returned `400` with `INVALID_REQUEST`. Direct service checks also loaded and re-saved metrics for Developer Demo, FastDrop Logistics, and Maesa Tech successfully. No cross-organization payload path or localStorage access was introduced.

## Browser runtime verification

After rebuilding and restarting the production server:

- authenticated app hydration completed;
- Developer Demo loaded with the 1,805-candidate snapshot;
- the browser displayed no storage migration/persistence notice;
- browser console had no new persistence errors;
- the same result held after a production-server restart and reload.

## Regression and quality results

Passed: RSS-1.2S3 server-owned ticket write contract; TODO-014; TODO-015; TODO-058; TODO-058B; TODO-058D; TODO-058E; TODO-058F; TODO-068; TODO-070; TODO-078; TODO-080; TODO-082A; TODO-082C; TODO-083 expanded calibration (`200/200`); `tsc --noEmit`; `prisma validate`; production `npm run build`; OIP Benchmark v1 (`1000/1000`, 100% overall and critical security).

One unrelated pre-existing language-learning fixture mismatch remains in `todo058c-language-neutral-learning-probe.cjs` (duplicate-invoice expected `canonical-billing-invoice-issue`, observed `canonical-duplicate-invoice`). It does not exercise the repaired persistence transport or route and was unchanged by this repair.

## Remaining operational requirement

Deployments running with `RATE_LIMIT_MODE=enforce` must provide a stable server-only `RATE_LIMIT_HASH_SECRET`; the checked-in `.env.example` already documents this requirement. The local runtime now has that value in ignored `.env.local`.

## Release status

Persistence runtime repair is complete. The repaired files and probe are ready for review; no tag or automatic commit was created.
