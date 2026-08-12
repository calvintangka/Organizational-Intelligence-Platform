# NC-FIX-004 — Response Formatting Pipeline Diagnosis

## 1 Executive Summary

NC-FIX-004 traced a formatted support response through raw provider output, the structured AI adapter/parser, the OIP drafting service, PostgreSQL, HTTP JSON, React hydration, the editable textarea, Cases display, and historical TicketMessage rendering. Internal newline characters survived every backend and state boundary. The original dense-paragraph symptom therefore was not caused by persistence, API serialization, or the editable textarea.

Two independent contributors were verified: DeepSeek can generate a single dense paragraph because the former prompt required ordering but did not explicitly request paragraph breaks, and the Cases read-only final-response paragraph collapsed newlines because it lacked a whitespace-preserving class. The smallest repair was correspondingly limited to explicit plain-text paragraph guidance in the draft prompt and `whitespace-pre-wrap` on the Cases final-response display. No persistence contract, schema, migration, rich-text dependency, or unsafe HTML path was introduced.

## 2 Final Verdict

`NC_FIX_004_FORMATTING_PIPELINE_VERIFIED`

## 3 Source Findings — QC-003 / QC-004

QC-003 was reproducible as an AI-generation quality issue: a real browser generation returned one dense response even though the pipeline was capable of preserving newlines. QC-004 also identified a real frontend display defect: the Cases detail surface collapsed a seeded multiline final response. The editable review textarea and historical message surface already preserved line breaks.

## 4 Baseline

- Captured: `2026-08-11T08:13:11.9683445+07:00`
- Timezone: `SE Asia Standard Time`
- Branch: `master`
- Node: `v24.14.1`
- npm: `11.11.0`
- Certified dereference: `v0.1.1-certified` → `d96bdca8e7e7e16d69419fb9873637d73b8a1ddd`
- PostgreSQL: reachable at `127.0.0.1:5432`
- Prisma: 25 migrations, database up to date
- Existing NC-FIX worktree changes were preserved; no reset, stash, clean, commit, push, or tag movement was performed.

## 5 Reproduction

A deterministic fictional NusaCloud HR response was used:

```text
Hi Rina,

Thanks for reaching out.

Please check location permissions.

Best regards,
NusaCloud Support
```

The response passed through the real `processTicket` drafting path, then through authenticated ticket APIs and the real PostgreSQL persistence boundary. The deterministic path retained four paragraphs and seven newline characters before the ticket-reference suffix was added.

## 6 Current Rendering Architecture

The application uses plain text for customer responses. The editable surface is a native `textarea` in `components/HumanReviewEditor.tsx`. Historical messages render as React text inside a `whitespace-pre-wrap` paragraph in `components/views/TicketWorkspace.tsx`. The Cases detail surface renders `resolution.finalResponse` as a normal paragraph and now uses `whitespace-pre-wrap`.

## 7 Raw Provider Output

The permanent probe mocked a safe structured provider completion and captured only a fictional response fingerprint. The raw JSON contained an escaped newline representation, which JSON parsing converted to actual newlines. The safe fingerprint was length `103`, newlines `7`, paragraphs `4`; no key, authorization header, or session token was logged.

Two live DeepSeek draft calls were also run with fictional NusaCloud HR data. Both returned structured JSON with readable paragraph breaks: sample 1 had length `559`, `13` newlines, `7` paragraphs; sample 2 had length `662`, `11` newlines, `6` paragraphs.

## 8 AI Adapter

`lib/ai/lmStudio.ts` trims only the outer provider completion before JSON parsing. The adapter maps `customerResponse` to `draftResponse` without whitespace normalization. The safe deterministic raw-to-adapter assertion passed exactly.

## 9 Structured Parser

`parseJsonObject` calls `JSON.parse` on the trimmed outer JSON string. Escaped `\\n` sequences in the JSON string become actual newline characters. No `replace`, `split/join`, Markdown stripping, or whitespace collapse is applied to the customer response field.

## 10 Drafting Layer

`processTicket` receives the adapter response, personalizes only the first greeting line when needed, appends a ticket reference using `\\n\\n`, then trims only outer whitespace before persistence. The deterministic probe proved that meaningful internal paragraph breaks survived this layer.

## 11 Persistence Layer

NC-FIX-001 stores the draft in `resolution.finalResponse` JSON. The probe compared the value before and after PostgreSQL persistence and found exact equality. Human `save_draft` edits and TicketMessage content also retained internal newlines.

## 12 API Serialization

The ticket and message routes return values through `NextResponse.json` without normalization. The authenticated API round-trip returned the exact multiline string after JSON decode.

## 13 Frontend Hydration

Resume hydration assigns `record.resolution.finalResponse` directly to `reviewedResponse`. The browser acceptance copied the resumed textarea value and verified the exact paragraph structure.

## 14 Editor Rendering

The native textarea preserved newlines by default. Browser copy/paste verification returned the exact multiline text, including blank lines and bullets. No editor or rich-text redesign was required.

## 15 Historical Message Rendering

Sent agent responses are persisted as `TicketMessage.content` and rendered with `whitespace-pre-wrap`. Browser screenshots showed separated paragraphs and bullets in the conversation history. The permanent multi-turn probe verified two formatted agent responses after customer follow-up and server restart.

## 16 Root Cause

The primary technical pipeline was lossless. The observed dense output had two verified contributors: AI generation quality was under-specified by the old prompt, and the Cases read-only renderer collapsed whitespace. The editable textarea was not the loss layer.

## 17 Fix Strategy

Apply only the two smallest fixes that correspond to observed evidence: request plain-text blank-line paragraph structure in the shared draft prompt, and preserve whitespace in the Cases final-response paragraph. Keep responses plain text and organization-specific; do not force a signature or introduce raw HTML.

## 18 Implementation

- Added one concise response-format instruction to `draftStructureInstructions` in `lib/ai/prompts.ts`.
- Added `whitespace-pre-wrap` to the Cases final-response display in `components/views/CaseLookupView.tsx`.
- Added `scripts/nc-fix-004-response-formatting-probe.cjs`.
- Added package alias `probe:nc-fix-004-response-formatting`.
- No schema or migration change.

## 19 Security Review

No `dangerouslySetInnerHTML` or equivalent execution path was introduced. Browser acceptance submitted `<script>alert(1)</script>` as disposable customer text; it rendered as harmless text and no JavaScript dialog appeared. React text rendering remains the security boundary.

## 20 Deterministic Formatting Test

PASS. Raw structured JSON, adapter output, `processTicket` output, and final draft all retained explicit `\\n\\n` paragraph separators. The permanent probe passed.

## 21 Persistence Round Trip

PASS. Generated draft, human-edited multiline draft, and sent TicketMessage values round-tripped through PostgreSQL and authenticated APIs without internal whitespace loss.

## 22 Human Edit Test

PASS. Browser input added blank lines and a two-item troubleshooting list. Clipboard readback matched the exact edited string.

## 23 Resume / Refresh

PASS. Navigate-away/resume restored the multiline editor value. After browser refresh, Cases reopened the disposable case and the sent history remained present. A server restart in the permanent probe also preserved the history.

## 24 Multi-Turn Test

PASS. The permanent probe exercised customer message → formatted agent response #1 → customer follow-up → formatted agent response #2. Both agent messages retained independent paragraph structure and ordering.

## 25 Browser Acceptance

PASS on a fresh controlled browser runtime and disposable NusaCloud HR organization. The Cases display visibly separated greeting, body paragraphs, and closing; the editor and clipboard preserved human formatting; resume and refresh restored it; sent history displayed paragraphs; and HTML-like text was harmless.

## 26 Real DeepSeek Samples

Two controlled DeepSeek draft calls were run with fictional data and no mature-case mutation. Both direct adapter samples produced structured multiline responses. A browser-generated sample during acceptance was still a dense paragraph, confirming that prompt guidance improves but cannot guarantee model formatting on every completion.

## 27 Raw-to-UI Comparison

| Layer | Length | Newlines | Paragraphs | Same as previous? |
|---|---:|---:|---:|---|
| Raw synthetic provider text after JSON decode | 103 | 7 | 4 | baseline |
| AI adapter | 103 | 7 | 4 | YES |
| OIP drafting layer with ticket reference | 157 | 9 | 5 | YES plus expected suffix |
| PostgreSQL persisted draft | 157 | 9 | 5 | YES |
| API response after JSON decode | 157 | 9 | 5 | YES |
| React/editor value | 157 | 9 | 5 | YES |
| Human-edited editor value | 175 | 10 | 5 | expected edit |
| Sent TicketMessage #1 | 175 | 10 | 5 | YES |

Live DeepSeek direct adapter samples were structured: `559/13/7` and `662/11/6` for length/newlines/paragraphs. The browser live generation demonstrated the remaining model-variability case: readable content can still arrive as `0` newline dense text.

## 28 NC-FIX Regression Results

- NC-FIX-001 permanent probe: PASS
- NC-FIX-002 permanent probe: PASS
- NC-FIX-003 permanent probe: PASS
- NC-FIX-004 permanent probe: PASS

The NC-FIX-001 and NC-FIX-002 probes were rerun on isolated ports after one concurrent startup attempt; NC-FIX-003 was rerun serially and passed.

## 29 RSS Regression Results

- RSS-2.1: PASS
- RSS-2.6: PASS
- RSS-2.7: PASS
- RSS-2.8: PASS

## 30 TypeScript / Prisma / Build

- `npx tsc --noEmit`: PASS
- `npx prisma validate`: PASS
- `npx prisma migrate status`: PASS; up to date
- `npm run build`: PASS

## 31 Benchmark

OIP Benchmark v1: `1000/1000` checks, `100%` overall, `100%` critical security.

## 32 Protected Data Integrity

PASS. Developer Demo integrity reported `protectedOrganizationsUnchanged: true`; the protected mature-state digest was unchanged:

`f62a563cfc037f4a946add12178309036f25ac65e219893a88bfb723c6fcc9b4`

The existing non-blocking historical integrity findings were unchanged and are not attributable to NC-FIX-004.

## 33 Cleanup

PASS. Disposable browser and API fixtures, accounts, sessions, tickets, messages, and organizations were deleted. A direct database residue check found zero organizations with the NC-FIX-004 fixture prefix. Controlled servers were stopped and browser tabs finalized with none kept.

## 34 Files Changed

NC-FIX-004 changes:

- `lib/ai/prompts.ts`
- `components/views/CaseLookupView.tsx`
- `scripts/nc-fix-004-response-formatting-probe.cjs`
- `package.json`
- `docs/NC-FIX-004-RESPONSE-FORMATTING-PIPELINE-DIAGNOSIS-REPORT.md`

Existing dirty files from NC-FIX-001/002/003 and earlier work were preserved and are not attributed to this fix.

## 35 Remaining Limitations

DeepSeek output remains probabilistic: two direct samples were multiline, while one browser generation remained dense. The prompt now explicitly encourages readable structure, but the product must continue treating AI text as reviewable plain text rather than assuming a guaranteed paragraph count. No email-client-specific HTML behavior was tested or required.

## 36 Recommendation

Accept NC-FIX-004 as verified. Keep the permanent formatting probe in the regression suite. The next independent task may measure AI draft latency, but should not conflate latency with formatting correctness.

## 37 Final Verdict

Task: NC-FIX-004 — Response Formatting Pipeline Diagnosis

Final verdict: `NC_FIX_004_FORMATTING_PIPELINE_VERIFIED`

Source findings: QC-003 / QC-004

Root cause: AI output structure was under-specified and the Cases display collapsed newlines; backend, API, editor state, persistence, and historical messages were lossless.

Root-cause category: `MULTIPLE_LAYERS`

Raw provider preserves newlines: YES

AI adapter preserves newlines: YES

Parser preserves newlines: YES

Draft layer preserves newlines: YES

Persistence preserves newlines: YES

API preserves newlines: YES

Frontend state preserves newlines: YES

Editor/display preserves newlines: YES after the Cases rendering fix

Historical sent messages preserve newlines: YES

Product source changed: YES

Prompt changed: YES

Frontend rendering changed: YES

Persistence changed: NO

Schema changed: NO

Migration: NONE

Human multiline edit: PASS

Navigate/resume formatting: PASS

Refresh formatting: PASS

Multi-turn formatting: PASS

HTML/script safety: PASS

Browser acceptance: PASS

Real DeepSeek samples: 2

DeepSeek structured formatting: MIXED

Permanent probe: `scripts/nc-fix-004-response-formatting-probe.cjs`

Probe: PASS

NC-FIX-001: PASS

NC-FIX-002: PASS

NC-FIX-003: PASS

RSS-2.1: PASS

RSS-2.6: PASS

RSS-2.7: PASS

RSS-2.8: PASS

TypeScript: PASS

Prisma validation: PASS

Migration status: PASS

Production build: PASS

OIP Benchmark: 1000/1000

Critical security: 100%

Protected mature data changed: NO

Disposable cleanup: PASS

Secret review: PASS

Files changed: see Section 34

Report: `docs/NC-FIX-004-RESPONSE-FORMATTING-PIPELINE-DIAGNOSIS-REPORT.md`

Commit created: NO

Push performed: NO

Certified tags modified: NO

Remaining blockers: NONE

Recommended next step: NC-FIX-005 — AI Draft Latency Measurement
