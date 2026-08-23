# NC-FIX-015 — Persisted Lesson-Evidence / Grounded Reuse Authorization Reconciliation

Date: 2026-08-23 (Asia/Jakarta)

## Verdict

`COMPLETED / VERIFIED BUT UNRELEASED`

NC-FIX-015 was a real persisted-state defect, reproduced through the browser and
repaired at the first incorrect authorization boundary. The repair is present in
the working tree, has a permanent regression probe, and has passed the required
real-UI, regression, schema, build, benchmark, and integrity checks. No commit,
tag, push, release, or deployment was performed.

## Repository baseline

- Branch: `landing/option-c32-release-polish`
- HEAD: `2481ea4ac8326b1558271ba0b1ec0ede3d6210e8`
- HEAD subject: `fix: reconcile open-ticket dashboard lifecycle metric`
- Package version: `0.2.0`
- Published/tagged release context: local `v0.2.0` tag points to
  `d9dc83827a865ecd80c4c4b1d6a049c6394534df`; NC-FIX-015 is not part of that
  published version.
- The pre-existing NC-FIX-012R, NC-FIX-012R2, NC-FIX-012R3, and NC-FIX-014R
  untracked reports were preserved unchanged.
- The pre-existing stash on `landing/option-b-cinematic` was preserved unchanged.

## What failed and where

The fresh browser flow created a disposable organization and completed the first
case through the actual UI: sent response, customer follow-up, customer-confirmation
resolution evidence, resolution, Reflection, and approved lesson promotion.

Persisted first-case identifiers:

- Organization: `org-64a168c4-6a0b-4b5c-92fb-0b07ddc691f0`
- First ticket: `NB-20260823-0001`
- Second compatible ticket: `NB-20260823-0002`
- KnowledgeItem: `canonical-authentication-infrastructure-issue`
- Lesson: `lesson-5c13cb70`
- ValidationRecord: `validation-c989999d`
- MemoryChangeRecord: `memory-change-c989999d`
- Resolution evidence: `resolution-evidence-e88fa522-8f8a-46bc-a128-ce70a050543c`

The stored lesson had exactly one authored signal:

`sso certificate rotation`

The second persisted ticket retrieved the correct KnowledgeItem and lesson. Its
lesson evidence was:

- `score = 1`
- `multiTokenMatches = 1`
- `ticketEvidenceCoverage = 2` in the first reproduction

The old `isStrongLessonEvidence` contract rejected every lesson with `score < 2`.
Therefore the first bad stage was the final lesson-evidence authorization gate in
`lib/drafting.ts`, not database persistence, retrieval, candidate selection, lesson
loading, compatibility, or provenance. The UI correctly exposed the resulting
state as strong memory relevance, weak lesson evidence, and “Not authorized for
grounded reuse”; it then produced a generic response.

## Retrieval-to-send trace

The verified path is:

1. `processTicket` loads persisted KnowledgeItems through the server persistence
   adapter.
2. Retrieval and pre-discrimination select the authentication KnowledgeItem.
3. `findMatchingLesson` loads the persisted lesson and finds its one specific
   signal.
4. Compatibility and contradiction checks pass for the compatible SSO ticket.
5. The old evidence gate rejects the one-signal match solely because its score is
   one.
6. `draftResponse` therefore refuses `lesson_grounded` mode and returns the
   generic/no-template path.
7. No lesson-grounded response is eligible to send until a human review step;
   the failure is an authorization false negative, not an unsafe send.

Persistence inspection confirmed that the lesson was not discarded. The lesson's
`sourceTicketId` is intentionally opaque (`evidence-*`) as required by NC-FIX-011;
the KnowledgeItem top-level provenance and candidate/validation audit retain the
real source ticket relationship. NC-FIX-015 preserves that identity-safe boundary.

## Repair

`isStrongLessonEvidence` now has two explicit valid paths:

- the existing multi-signal path remains unchanged, including the stricter rule
  for Uncategorized / General tickets;
- a classified ticket may use one authored signal only when that signal has at
  least three meaningful tokens and the ticket independently confirms at least
  two lexical tokens or at least two bounded semantic concepts.

This is a generalized evidence rule, not an SSO-specific exception. Generic
one-token overlap, weak overlap, negation, contradiction, incompatible domains,
and unclassified one-signal cases remain ineligible for grounded reuse.

## Fresh real-UI verification after repair

After restarting one controlled development server and reloading the browser, a
new ticket was submitted through the real Tickets UI against the persisted lesson:

- Ticket: `NB-20260823-0003`
- Memory found: `Authentication Infrastructure Issue`
- Relevance: `Strong`
- Lesson evidence: `Strong`
- Decision: `Grounded Organizational Memory authorized`
- Matched lesson: the persisted certificate-rotation lesson
- Matched signal: `sso certificate rotation`
- Draft mode: lesson-informed / grounded
- Human review remained required, as expected at trust 20/100.

The browser therefore crossed the previously blocked boundary and rendered the
lesson-informed response from the persisted lesson.

## Permanent probe evidence

Added:

`scripts/nc-fix-015-persisted-lesson-evidence-grounded-reuse-probe.cjs`

Registered as:

`npm run probe:nc-fix-015-grounded-reuse-evidence`

The passing probe verified:

- a new organization starts without the lesson;
- the first case creates the lesson only after durable resolution evidence;
- the lesson is persisted with exactly one signal and opaque lesson provenance;
- the second compatible case retrieves the same KnowledgeItem and lesson with
  `score=1`, `multiTokenMatches=1`, and coverage sufficient for authorization;
- the response is grounded and does not claim certainty beyond current evidence;
- weak generic, explicit negation, unrelated-domain, and cross-tenant controls;
- high-level compatibility and trust boundaries remain governed by existing probes;
- resolution evidence → resolution → Reflection recurrence is classified as
  `trust_update_only` or `merge_existing` (the Matches Existing family), never
  `improves_existing`;
- replaying the same validation commit is idempotent;
- all NC-FIX-015 disposable rows are removed.

Probe result: passed. The last run reported `lessonScore=1`,
`multiTokenMatches=1`, `ticketEvidenceCoverage=3`, and cleanup complete.

## Required verification matrix

Passed:

- NC-FIX-007 retrieval compatibility: 18/18 assertions
- NC-FIX-011 reflection promotion safety
- NC-FIX-012 reflection provenance boundary
- NC-FIX-013 dashboard/open-ticket metric, run with its required port-3000
  controlled server
- NC-FIX-014 resolved Reflection recovery
- NC-ACCEPT-001 learning-loop acceptance
- NC-FIX-006 knowledge reuse/source-ticket integrity
- NC-FIX-009 grounding UI state
- NC-FIX-015 persisted lesson evidence / grounded reuse
- `npx tsc --noEmit`
- `npm run prisma:validate`
- `npx prisma migrate status`: 25 migrations, database up to date
- `npm run build`
- `npm run benchmark:oip-v1`: 1000/1000 checks, 100% overall, 100% critical security
- `npm run probe:developer-demo-integrity`: exit 0; protected-state digest unchanged

NC-FIX-013 initially returned `ECONNREFUSED` because its legacy script expects an
already-running server on port 3000. Once that documented precondition was supplied,
the probe passed; this was harness setup, not a product finding.

## Findings and boundaries

### Completed / verified

- Persisted one-signal lesson grounding false negative: fixed and verified.
- Real browser positive reuse: verified.
- Weak, negated, unrelated, incompatible, and high-trust safety controls: verified
  through NC-FIX-015 and NC-FIX-007.
- Opaque lesson provenance and real source-ticket audit provenance: preserved.
- Recurrence classification and idempotent replay: verified.

### Open QA findings unrelated to NC-FIX-015

Developer-demo integrity still reports pre-existing historical auditability gaps and
fixture-drift findings, including legacy afterState differences, legacy version/source
references, unresolved historical ticket references, and the known derived metric
differences. The run preserved the protected-state digest and did not identify a new
NC-FIX-015 regression. These findings remain open for their own reconciliation task.

### Release state

The production behavior change is documented in `docs/CHANGELOG.md` under
Unreleased. The branch contains uncommitted NC-FIX-015 code, probe, and report work;
the package remains version `0.2.0`. Release certification and publication are not
complete for this change.

## Recommended next task

Review the exact NC-FIX-015 diff and report, then create the separately authorized
NC-FIX-015 commit/release-candidate update. Do not release `v0.2.0` as if this fix
were included until the commit and release manifest explicitly contain the repair,
probe, changelog entry, and this report.
