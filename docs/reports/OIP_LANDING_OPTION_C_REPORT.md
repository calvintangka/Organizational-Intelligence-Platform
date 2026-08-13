# OIP Landing Page — Option C Refined Report

## Verdict

**OPTION C READY FOR VISUAL REVIEW**

Option C combines Option A's editorial discipline with the OIP Knowledge Flywheel and four
attention-capturing OIP-specific animations. It is the refined production candidate.

---

## 1. Option C design philosophy

Option C is an evolution of Option A, not a rejection of it. It keeps Option A's typography,
spacing, editorial composition, product visibility, Attio-inspired restraint, and responsive
structure, then adds:

- a **continuous Knowledge Flywheel** (scenes 06–11) where one customer-support case visibly
  progresses through ANALYZE → REMEMBER → GROUND → ASSIST → REVIEW → OBSERVE → LEARN →
  REUSE → AUTOMATE;
- a **sticky flywheel progress rail** (desktop) so the visitor always knows where the story is;
- **four signature animated moments** (forgetting loop, indigo memory connection, learning
  event with counted trust, policy-gated automation);
- a **dark → indigo → light story arc** (CHAOS → CONNECTION → MEMORY → LEARNING → TRUST →
  ACTION → CLARITY).

The recurring OIP visual signature — a problem arrives, an indigo connection activates,
organizational memory responds, an outcome occurs, the organization learns — appears in the
hero, the reveal, and every flywheel stage.

## 2. How Option C differs from Option A

| Aspect | Option A | Option C |
| --- | --- | --- |
| Scene count | 8 | 12 (hero → pressure → tools → AI → reveal → 6 flywheel scenes → vision) |
| Flywheel | Single learning-loop diagram (scene 7) | Continuous 9-stage system across scenes 06–11 with sticky progress rail |
| Motion | 3 looping accents | 4 signature animations + staged reveals + animated trust counters |
| Story case | Implied per scene | One case (`#4821` / `#5103`, "Mobile Attendance — Location Permission Disabled") that persists and evolves |
| Villain | Hero + recurrence | Hero forgetting loop animation + pressure scene + final vision callback (struck-through echo) |
| Integrations | Logo-ish channel rail | Real Gmail interaction: inbound email → OIP analysis → authorized outbound reply, plus uncertain-case human fallback |
| Trust | Static numbers | Counted transitions with visible reasons (42→55, 55→68, 68→79) |

Preserved unchanged from Option A: navigation shell, `/?auth=signup` / `/?auth=login` routing,
authenticated workspace, typography system, `lp-` primitive naming, layout safety patterns.

## 3. What was learned from Option B

Option B proved that motion alone does not make a better website. Its failures — overlapping
text, clipped headlines, tiny fonts, narrow headline columns, oversized empty areas, tiny
product UI, animation-first sections — were all treated as hard constraints for Option C:

- No headline/body overlap (asserted by automated QA at every viewport).
- No clipped text (asserted: every narrative element's scrollWidth ≤ clientWidth).
- Essential body copy stays ≥ 16px desktop / ≥ 15px mobile; product UI 13–16px; only
  metadata dips to 9–12px.
- Headlines use `clamp()`; no rigid narrow columns; `text-wrap: balance`.
- Product panels occupy 89–100% of the container when they are the storytelling device.
- Animation never gates comprehension: every hidden state defaults to the final, fully
  visible state outside `prefers-reduced-motion: no-preference`, so reduced-motion users,
  no-JS users, and screen readers always see the finished story.

Option B's strongest OIP-specific motion ideas were carried over and refined: the connection
activation (indigo line draw + traveling pulse), evidence attachment, memory anchoring,
match-found scanning, and trust deltas.

## 4. Final scene structure

1. **01 / ORGANIZATIONAL FORGETTING** (dark) — locked opening headline. Support workspace
   where a resolved ticket sinks into history and the same problem returns with no
   connection. *Signature 1.*
2. **02 / THE REAL BOTTLENECK** (dark) — "A few people. Thousands of questions. Every day."
   Growing queue + one agent's split attention. The team is not the problem.
3. **03 / COMPANIES TRIED TO REMEMBER** (light) — seven existing tools treated fairly, the
   "solving ≠ documenting" quote, the human burden chain, and the solved-work → documentation
   vs. lost-learning diagram.
4. **04 / CONTEXT ≠ MEMORY** (light) — AI reads/reasons/drafts fast, but SOURCE? VALIDATED?
   WORKED BEFORE? OUTCOME? STILL CURRENT? TRUST? remain unanswered.
5. **05 / MEET OIP** (dark → indigo) — "What if every solved problem made the next one
   easier?" The 9-stage flywheel ring + the problem → connection → memory signature.
6. **06 / FLYWHEEL 01 — ANALYZE** — case #4821 arrives; signals, category, canonical
   hypothesis refined to "Location permission unavailable."
7. **07 / FLYWHEEL 02–03 — REMEMBER · GROUND** — indigo connection reaches Organizational
   Memory; MATCH FOUND; grounded in v2 (Trust 42). *Signature 2.*
8. **08 / FLYWHEEL 04–05 — ASSIST · REVIEW** — grounded draft with evidence, HUMAN REVIEW
   REQUIRED, agent approves and sends.
9. **09 / FLYWHEEL 06–07 — OBSERVE · LEARN** — "The ticket closes. The learning doesn't."
   Customer confirms; evidence attaches; Trust 42→55, v2→v3, outcomes 2→3. *Signature 3.*
10. **10 / FLYWHEEL 08 — REUSE** — "The same problem comes back. This time, you don't start
    from zero." New case #5103 matched immediately; Trust 55→68.
11. **11 / FLYWHEEL 09 — AUTOMATE** — "Trust unlocks automation." Trust 68→79, policy gate
    authorizes, OIP replies through Gmail; uncertain case routes to human review.
    *Signature 4.*
12. **12 / THE OIP VISION** — MEMORY ↓ INTELLIGENCE ↓ AUTONOMY, villain echo struck through,
    "Stop starting from zero.", Sign Up Now / Sign in, beachhead statement, footer.

## 5. Knowledge Flywheel implementation

`components/landing/flywheel.tsx` introduces:

- `FLYWHEEL_STAGES` — the nine canonical stage labels.
- `FlywheelZone` — owns a single `IntersectionObserver` (rootMargin `-38%/-38%`) that
  reports which stage group is on screen; renders the sticky rail (`position: sticky; top: 0`)
  with per-node done/active/pending states and an animated progress fill.
- `FlywheelScene` — registers its stage indexes with the zone observer; latches `is-live`
  (one-shot reveal animations) on first approach and `is-active` for rail sync.
- `AnimatedValue` — rAF-eased counter (ease-out cubic, ~1s) used only for trust/version/
  outcome changes that have visible reasons; reduced motion jumps straight to the final value.
- `useLatchedLive` — prevents counters from freezing mid-animation when the visitor scrolls
  past (found and fixed during QA).
- `ConnectionLine` — the indigo connection signature: line draw + traveling pulse, with
  green/amber tones and vertical variants for stacked layouts.
- `Stagger` — clone-based stagger helper that keeps grid/flex children as direct items.

Scenes 06–11 are normal document-flow sections — no scroll-jacking, no pinning traps, no
fixed heights. Mobile removes the sticky rail and stacks every stage into a vertical
sequence with vertical connections.

## 6. Animation architecture

CSS-only (transforms/opacity) with IO-triggered state classes. No new dependency was added;
`package.json` is unchanged.

- **Signature 1** (hero): 9s loop — resolved ticket sinks into history, "time passes", the
  same problem arrives NEW with a dashed "no connection" line and an empty memory slot.
- **Signature 2** (remember/ground): indigo line draws (0.75s), pulse travels (1.1s), memory
  card glows and grounds.
- **Signature 3** (learn): customer reply fades in, OUTCOME CONFIRMED, evidence attaches,
  Trust 42→55 / v2→v3 / outcomes 2→3 count up, memory anchors.
- **Signature 4** (automate): history accumulates (68→79), five policy checks pass in
  sequence, the gate toggles to ALLOWED, the authorized reply flows into the Gmail sent card.

Restrained ambient motion: queue slide (15s), agent activity cycle (8s), AI READ/REASON/DRAFT
pipeline (4.8s), ring dash rotation (14s), scan line (2.8s). All durations follow the spec
bands (micro 120–220ms, system 250–550ms, workflow 600–1100ms, reveals 800–1400ms).

Motion gating pattern: base styles always show final states; hidden/starting states and
animations live inside `@media (prefers-reduced-motion: no-preference)` only.

## 7. Typography safeguards

- Headlines: `clamp()` at every size; line-height 0.95–1.08; `text-wrap: balance`.
- Desktop body 16–18px; flywheel lead copy 17px; product UI 12–16px; metadata only 8.5–12px.
- Mobile body ≥ 15px; the "INTELLIGENCE" vision word uses `clamp(34px, 11vw, 58px)` with
  reduced letter-spacing after QA caught a 411px-wide overflow at 375px viewports.
- Automated QA asserts zero overlapping text blocks, zero clipped text, and zero essential
  text below 13.5px at all nine viewports.

## 8. Responsive behavior

- Desktop (≥1051px): sticky flywheel rail; 3-column/2-column stage grids; horizontal
  connections.
- Tablet (720–1050px): rail hidden; stages stack vertically with vertical connections;
  policy flow becomes 3 columns; memory meta becomes 2 columns.
- Mobile (≤720px): single-column everything; hero workspace collapses; ring shrinks to
  320px with compact nodes; per-scene flywheel chips keep the stage story ("FLYWHEEL 02·09").
- Browser zoom emulation at 125% / 150% / 200%: zero horizontal overflow.

## 9. Accessibility

- Semantic `header/nav/main/section/footer`; sections labelled via `aria-labelledby`.
- Skip link preserved; visible focus from globals.css; decorative lines/glyphs `aria-hidden`.
- Complex visuals carry `role="img"` + descriptive `aria-label`; flywheel rail exposes the
  current stage in its accessible label.
- 48px Sign Up CTA; 40px nav CTA; link targets ≥ 44px elsewhere.
- Full `prefers-reduced-motion: reduce` support: loops become static final states, counters
  jump to final values, connection lines render connected, scan/pulse elements hidden.
- Color is never the only state indicator (labels: MATCH FOUND, GROUNDED, OUTCOME CONFIRMED,
  HUMAN REVIEW REQUIRED, AUTHORIZED, TRUST REQUIREMENT NOT MET).

## 10. Performance

- CSS transforms/opacity + SVG-free lines; one IntersectionObserver per concern (zone,
  per-scene latch, per-scene in-view); rAF only for three numeric counters.
- No WebGL, no particles, no backdrop-filter, no new dependencies.
- Production build: `/` route 210 kB, first-load JS 312 kB (unchanged class of budget vs
  Options A/B); 12 static routes generated.

## 11. Files changed

- `components/landing/LandingPage.tsx` — nav anchors (How it works / Memory / Automation /
  Security) and the 12-scene composition.
- `components/landing/flywheel.tsx` — NEW: flywheel zone, rail, scenes, connection line,
  staggered reveals, animated values, shared product primitives.
- `components/landing/scenes.tsx` — all 12 scenes rebuilt on the Option A skeleton.
- `components/landing/landing.css` — full Option C design system + motion + responsive +
  reduced-motion layers.

Untouched: `app/page.tsx`, `app/layout.tsx`, auth routing, Prisma schema, database, trust
engine, retrieval/validation logic, tenant isolation, backend architecture, `package.json`.

## 12. Validation results

- `tsc --noEmit` — **PASS**.
- `npm run build` — **PASS** (Prisma generate, Next 15.5.22 compile, 12/12 routes).
- `npm run lint` — **BLOCKED, NOT MODIFIED**: `next lint` opens the interactive ESLint
  setup prompt because the repository has no checked-in ESLint configuration (same condition
  documented for Option B). The prompt was not answered and lint configuration was not changed.
- Automated browser QA (Playwright/Chromium against the dev server):
  - No horizontal overflow at 1920/1536/1440/1366/1280/1024/768/390/375.
  - No overlapping text blocks and no clipped text at any viewport.
  - No essential tiny text; stage panels ≥ 89% container width.
  - Sticky rail pins at top 0 across the full flywheel zone; all 6 flywheel scenes activate
    (`LIVE:1` … `LIVE:9`); rail NOW label tracks ANALYZE→AUTOMATE.
  - Trust counters settle exactly at 55 / 68 / 79; zoom emulation 125/150/200% clean.
  - Reduced motion: animations at 0.001ms/1e-06s, all content visible and connected.
  - CTAs route to `/?auth=signup` / `/?auth=login`; heights 48px/40px.
  - Only console noise: expected 401 from `/api/auth/me` for anonymous visitors (same as
    Option A) and one favicon 404 on first paint. No hydration warnings, no page errors.
- Visual screenshots were captured for every scene at 1440×900 and 390×844 for human review
  (this session's model cannot consume images, so layout correctness was asserted
  programmatically instead).

## 13. Known limitations

- An already-authenticated browser session shows the existing OIP onboarding/workspace
  instead of the public landing page (inherited Option A behavior — auth bootstrap decides).
- Lint remains unavailable until the repository adopts an ESLint configuration; this was not
  changed per instructions.
- The forgetting-loop, queue slide, and agent-cycle animations are looping CSS loops; they
  pause on hover where interactive and are disabled under reduced motion.
- Landing QA ran against the local dev server; no production URL was deployed.

## 14. Git branches / commits

- **Option A** — branch `landing/option-a-attio`, commit `9af6917` (`feat(landing): preserve option A attio-inspired design`) — untouched.
- **Option B** — branch `landing/option-b-cinematic`, commit `3fb6f42` (`feat(landing): explore option B cinematic learning system`) + review report `ea57352` — untouched.
- **Option C** — branch `landing/option-c-refined`, commit recorded in `git log` after this report (`feat(landing): implement refined option C knowledge flywheel`).

Uncommitted NC-FIX-012/013 work that existed on the Option B worktree before this task was
preserved in a git stash (`WIP: NC-FIX-012/013 uncommitted work preserved from
landing/option-b-cinematic before Option C`) and can be restored with `git stash pop` on that
branch. No user work was modified, committed, or deleted.

## 15. Switching between A / B / C

```text
git switch landing/option-a-attio
git switch landing/option-b-cinematic
git switch landing/option-c-refined
```

All three branches remain independently recoverable.
