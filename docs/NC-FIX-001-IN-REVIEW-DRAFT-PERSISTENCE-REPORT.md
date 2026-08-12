# NC-FIX-001 — In-Review Draft Persistence

## 1. Executive Summary

QC-007 was caused by a missing write path for the work-in-progress response. `reviewedResponse` lived in React state, while the existing durable `TicketRecord.resolution.finalResponse` field was only populated during final approval. Resume already read that field, found it empty, and regenerated the generic deterministic draft.

The repair persists the generated draft when the case enters `in_review`, persists human edits through the server-owned ticket transition path, and adds a monotonic draft revision inside the existing JSON resolution value. No new table or column was required.

## 2. Final Verdict

`NC_FIX_001_DRAFT_PERSISTENCE_VERIFIED`

The exact latest human-edited draft survives the authenticated persistence/resume lifecycle, logout/login, controlled server restart, case switching, tenant isolation checks, and stale-write conflict checks. A browser UI run was not completed because the pre-existing local dev server returned a Next.js 500 from a stale `.next` page artifact; the clean production build passed.

## 3. Source Finding — QC-007

Source finding: QC-007 — BUG — High — Draft Persistence.

Affected case: `NC-20260810-0001` from the NusaCloud HR simulation. The case remains unresolved and was not modified.

## 4. Real-World Reproduction

The supplied reproduction is consistent with the baseline source flow: generation set `reviewedResponse` in the client, editing only called `setReviewedResponse`, and navigation cleared that state. The persisted in-review record had `resolution.finalResponse: null`; resume therefore used the deterministic fallback.

The permanent controlled probe reproduces the same lifecycle with disposable cases and a synthetic generated draft, without a live DeepSeek request.

## 5. Baseline

- Date/time: 2026-08-10, Asia/Jakarta (`UTC+07:00`).
- Branch: `master`.
- Baseline HEAD: `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`.
- Certified tag resolution: `v0.1.1-certified` resolves to the expected commit.
- Pre-existing untracked files were preserved: the two RSS-2.9 reports.
- Database: PostgreSQL `oip_development`; Prisma reported 23 migrations and an up-to-date schema.
- Environment presence was checked by variable name only; secrets were not printed.

## 6. Existing Draft Architecture

`TicketRecord` is the authoritative case model. It contains `status`, `draftSource`, `classification`, `memoryMatch`, `resolution`, and `reflection`. `resolution.finalResponse` is the existing response field; `draftSource` preserves provenance. The Prisma `TicketRecord` model stores `resolution` as JSON and is organization-scoped by `(organizationId, ticketId)`.

## 7. Generation Flow

`processTicket` creates and progressively persists the ticket, analysis, memory match, and draft. Before this fix, the final in-review save updated `draftSource` and `status` but left `resolution.finalResponse` empty. The fix writes the generated response into that existing field and initializes `draftRevision` to `1` when a non-empty draft exists. A no-template response remains `null`, so placeholder instructions are not stored as a customer response.

## 8. Human Edit Flow

Before the fix, `HumanReviewEditor` called `updateReviewedResponse`, which only changed React state. Now the same handler queues an organization/case-scoped save. Server authority uses the `save_draft` workflow transition; local authority uses the existing scoped ticket adapter. The latest queued value is persisted and returned to active state.

## 9. Navigation Flow

Navigation remains SPA state switching. It does not flush a whole organization snapshot. Draft writes use a ticket-specific queue and the explicit ticket transition path. RSS-2.1 organization switching continues to drain only explicit pending resource writes and does not reintroduce broad snapshot flushing.

## 10. Resume/Hydration Flow

Cases reads the authoritative organization-scoped ticket record. `Resume in workspace` reconstructs the display ticket and analysis, rebuilds a deterministic comparison draft, and hydrates the editor from `record.resolution.finalResponse` when non-empty. The persisted response is authoritative; the deterministic draft is only the comparison/fallback layer.

## 11. Root Cause

The actual category is `WRITE_PATH_MISSING`: generated and edited response text was not written to the durable in-review ticket record. Resume hydration was already capable of restoring `resolution.finalResponse`, so this was not a GET omission or hydration overwrite.

## 12. Persistence Contract

Generated content becomes the initial durable draft. Human edits update the same work-in-progress field. Normal navigation, fresh reads, logout/login, and server restart do not discard it. Empty response text is represented as `null`; generic placeholder instructions are never persisted. Final approval still owns the resolved response lifecycle.

## 13. Implementation

- Added `save_draft` to the server-owned ticket workflow command.
- Added validation that saves only `in_review` cases.
- Added expected/current draft revision checking with HTTP 409 `REVISION_CONFLICT`.
- Added queued UI persistence for human edits.
- Persisted generated drafts on the final processing save.
- Preserved existing draft source, classification, memory match, authorization, and transition audit behavior.

## 14. Data Model / Migration Impact

The existing `resolution` JSON field was sufficient. `draftRevision` is an optional property inside that existing JSON value for backward compatibility. Schema changed: `NO`. Migration created: `NONE`. Prisma validation and migration status passed.

## 15. Revision / Concurrency Compatibility

Knowledge RSS-2 revision checks were not changed. Draft saves use expected/current `draftRevision` and return 409 for a stale writer. The probe verified one stale save is rejected after a newer save. No last-write-wins bypass was added.

## 16. Tenant / Authorization Review

The transition route remains behind `withOrganizationRoute("ticket.review")`; the server resolves organization and actor from the authenticated session. The probe verified another organization cannot read or write the disposable draft. Case keys remain organization-scoped.

## 17. Generated Draft Test

PASS. A deterministic generated draft was inserted as the in-review work-in-progress value and was returned by a fresh authoritative Cases read.

## 18. Human-Edited Draft Test

PASS. The probe persisted sentinel `NC-FIX-001-HUMAN-EDIT-<unique-id>-v3` and restored that exact text after the resume read.

## 19. Multiple Edit Test

PASS. v1 → v2 → v3 was persisted in sequence; v3 was restored and stale v2/v1 values were not returned.

## 20. Refresh / Hard Refresh

The server-backed fresh GET equivalent passed. Browser refresh and hard-refresh UI checks were not completed because the existing local dev server exposed a stale `.next` runtime 500. The clean production build passed.

## 21. Logout / Login

PASS in the permanent probe. The disposable account logged out, logged back in, and read the same latest draft.

## 22. Server Restart

PASS in the permanent probe. The controlled Next server was stopped and restarted before the resume read; the latest draft remained present in PostgreSQL.

## 23. Organization / Case Switching

PASS. The probe verified Case A retained its own v3 draft and Case B retained a different draft. RSS-2.1 organization switching also passed.

## 24. Browser Acceptance

`NOT_AVAILABLE`. The in-app browser connected, but the existing local dev server returned `ENOENT` for `.next/server/app/page.js`; restarting that user-owned server was outside the safe scope of this task. The authenticated HTTP flow exercised the same API and persistence boundaries.

## 25. Regression Results

- TypeScript: PASS (`tsc --noEmit`).
- Prisma validation: PASS.
- Migration status: PASS; up to date.
- Production build: PASS.
- Permanent NC-FIX-001 probe: PASS.
- Server persistence probe: PASS.
- RSS-2.1 switch-context: PASS.
- RSS-2.4 demo isolation: PASS.
- RSS-2.6 concurrency observability: PASS.
- RSS-2.7 lifecycle UX: PASS.
- RSS-1.2S3 full probe was not rerun because its fixture code clears the entire transition-audit table before testing; the NC-FIX-001 probe covered authenticated transition authorization and audit-compatible writes without that broad cleanup.

## 26. Protected Data Integrity

Protected mature data changed: `NO`. RSS-2.4 isolation and the focused disposable probe restored their fixtures. OrgMetrics unexpected delta: `0` for protected organizations.

## 27. Cleanup

PASS. The permanent probe removes disposable users, sessions, organizations, tickets, and transition audits. A residue check after the initial fixture correction found no `nc-fix-001-*` organization rows.

## 28. Remaining Limitations

The browser UI refresh/hard-refresh acceptance remains to be run after the local dev server is restarted cleanly. Existing historical in-review records with no stored draft remain safely resumable through the deterministic fallback; the fix does not fabricate customer responses for those records.

## 29. Files Changed

- `app/page.tsx`
- `app/api/organizations/[organizationId]/tickets/[ticketId]/transition/route.ts`
- `lib/application/tickets/processTicket.ts`
- `lib/server/tickets/ticketWorkflow.ts`
- `types/ticket.ts`
- `scripts/nc-fix-001-draft-persistence-probe.cjs`
- `package.json`
- `docs/NC-FIX-001-IN-REVIEW-DRAFT-PERSISTENCE-REPORT.md`

The two pre-existing untracked RSS-2.9 report files were not changed.

## 30. Recommendation

Keep the fix scoped to durable in-review draft state. Run the browser acceptance flow after the local dev server is restarted, then proceed to `NC-FIX-002 — Multi-Turn Case Conversation Lifecycle` as a separate task.

## 31. Final Verdict

`NC_FIX_001_DRAFT_PERSISTENCE_VERIFIED`

