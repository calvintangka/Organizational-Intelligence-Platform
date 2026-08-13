# OIP Landing Page — Option C.3 Refinement Report

## 1. Branch and commit

- Branch: `landing/option-c3-interactive`
- Implementation commit: `7b08e01` — `feat(landing): implement option c3 interactive cycle and flywheel journey`
- This report is committed separately on the same branch.

## 2. C.2 preservation evidence

Before starting, `git status` on `landing/option-c2-tightened` returned a clean working tree at commit `cbb0342` (`feat(landing): tighten option c2 flywheel journey`).

The new branch was created with:

```powershell
git checkout -b landing/option-c3-interactive
```

All prior landing options remain on their own branches and were not overwritten:

- `landing/option-a-attio`
- `landing/option-b-cinematic`
- `landing/option-c-refined`
- `landing/option-c1-polished`
- `landing/option-c2-tightened`

No destructive Git operations were used, and no unrelated user changes were included in the C.3 commit.

## 3. Meet OIP interaction architecture

The static `OIPRevealScene` ring was replaced with `OIPCycle`, a client component in `components/landing/flywheel.tsx`.

The component exposes:

- Six real `<button>` stage nodes: Understand, Remember, Assist, Learn, Reuse, Automate.
- One real `<button>` Organizational Memory core.
- A compact `region`/`aria-live` explanation panel below the ring.
- An SVG relationship line from the selected stage to Organizational Memory.
- Keyboard support: Tab, Enter, Space, and Escape.

Clicking a stage pauses the orbit, highlights the node in OIP Indigo, dims the others through state classes, draws the center connection, and reveals the concise explanation. Clicking again, pressing Escape, or waiting 8 seconds deselects and resumes the cycle.

## 4. Orbit animation implementation

The cycle uses GPU-friendly CSS transforms only:

- `.lp-cycle-orbit` rotates `360deg` over `45s` with a linear timing function.
- Each stage slot is positioned with `rotate(var(--angle)) translateY(calc(0px - var(--cycle-radius)))`.
- An inner counter-rotation layer keeps every label upright while the orbit moves.
- `animation-play-state` is driven by the `--cycle-play-state` CSS variable, so hover, focus, and selection pause the movement without unmounting or recalculating nodes.
- `prefers-reduced-motion: reduce` removes the orbit animation entirely while preserving interaction.

The center Organizational Memory button has no orbit animation and remains anchored.

## 5. Stage explanation content

Each stage uses the requested concise copy:

- **UNDERSTAND** — Understand the problem. OIP analyzes incoming work to identify what is actually happening, including the underlying problem and relevant signals. Supporting state: Problem identified.
- **REMEMBER** — Remember what the organization knows. OIP searches Organizational Memory for validated lessons, evidence, and outcomes from similar problems. Supporting state: Memory match found.
- **ASSIST** — Help people act with context. OIP uses trusted organizational knowledge to prepare a grounded response or recommended action. Supporting state: Grounded response prepared.
- **LEARN** — Learn from what actually happened. After the outcome is known, OIP preserves evidence, strengthens or revises knowledge, and records what the organization learned. Supporting state: Outcome confirmed → Memory updated.
- **REUSE** — Use the lesson when the problem returns. When a similar issue appears again, OIP brings the relevant Organizational Memory back into the workflow. Supporting state: Knowledge reused.
- **AUTOMATE** — Act when trust and policy allow it. Repeatedly validated knowledge can eventually support policy-controlled automation while uncertain cases stay with humans. Supporting state: Trust ✓ · Policy ✓ · Authorized.

The center node shows the Organizational Memory explanation: the persistent layer where validated lessons, evidence, outcomes, trust, provenance, and version history remain reusable across future work.

## 6. New flywheel visual architecture

`KnowledgeFlywheel` replaces the six separate full-screen flywheel scenes with one shared product stage.

Desktop renders:

- One thin six-step rail at the top (Understand → Automate), with clickable buttons for navigation.
- One persistent product panel with a seven-node intelligence path: Customer Issue → Understand → Remember → Assist → Learn → Reuse → Automate.
- One evolving body that keeps the same ticket and Organizational Memory objects visible across relevant moments.

The purple `ConnectionLine` middle-object language was removed. The new relationship visual is a thin Indigo path with a subtle traveling pulse, reading as the case moving left-to-right through organizational intelligence.

## 7. Purple center visual removal confirmation

The old `lp-conn` middle-column treatment is no longer rendered inside the Knowledge Flywheel. Programmatic QA queried every active flywheel moment and found:

```text
lp-conn count per moment: 0
```

The replacement is the understated `lp-c3-intel-arrow` / `lp-c3-journey-line` path. No giant center object, purple wall, or permanent obstruction remains between the ticket and OIP analysis.

## 8. Flywheel scroll budget before/after

- Option C.2 desktop scroll budget: `440vh` (approximately `3,960px` at a 900px viewport).
- Option C.3 desktop scroll budget: `240vh` (exactly `2,160px` at a 900px viewport).

This is below the requested `280vh` maximum and at the preferred `240vh` target.

## 9. Page height before/after

At the `1440×900` desktop QA viewport:

- Option C.2 page height: approximately `10,447px`.
- Option C.3 page height: `8,761px`.

The page is materially shorter and falls within the suggested `8,500–9,500px` target.

## 10. Mobile behavior

At and below `1050px`, `KnowledgeFlywheel` drops the pinned horizontal interaction and renders the same six moments as a compact vertical story using the redesigned visual language.

Mobile QA at `390×844` confirmed:

- Six moments render vertically.
- Each moment uses the same thin intelligence path (rotated to vertical).
- No tiny desktop mockup is used.
- `document.documentElement.scrollWidth` equals `clientWidth` (`390px`), so there is no horizontal page overflow.

## 11. Reduced-motion behavior

`prefers-reduced-motion: reduce` is respected in both redesigned sections:

- Meet OIP orbit and counter-rotation animations are removed.
- The six stages remain in fixed positions.
- Click, tap, hover, focus, and explanation panels remain available.
- The flywheel intelligence-path pulse animation is removed.

## 12. Accessibility

- All six cycle nodes and the Organizational Memory core are semantic `<button>` elements.
- Each control uses `aria-expanded` and `aria-controls`.
- The explanation panel is a named `role="region"` with `aria-live="polite"`.
- Escape closes the explanation and resumes the cycle.
- Visible `:focus-visible` states are provided for nodes, the core, and flywheel rail buttons.
- Flywheel rail navigation is implemented with six semantic buttons and `aria-current="step"`.

Keyboard QA confirmed Enter activates a focused stage and Escape returns to the default hint.

## 13. Performance

- Meet OIP uses CSS `transform` and `animation-play-state`; there is no React state update per animation frame.
- The flywheel uses passive scroll listeners and CSS transform/opacity transitions.
- The pulse animation is transform/opacity only.
- Continuous animated shadows and expensive filters are not used.
- Only six primary cycle nodes orbit; the center remains static.

## 14. QA viewport results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| Desktop `1440×900` horizontal overflow | None |
| Mobile `390×844` horizontal overflow | None |
| Desktop flywheel clip/scroll mismatch | None (`clientHeight === scrollHeight`) |
| Meet OIP orbit present in normal motion | Yes (`lpCycleSpin`, `45s`) |
| Meet OIP center static | Yes (`animation-name: none`) |
| Meet OIP six nodes clickable/focusable | Yes |
| Purple `lp-conn` inside flywheel | 0 |
| Essential desktop flywheel label size | ≥14px (AUTHORIZED and checks verified at 14px) |

## 15. Build/type results

- TypeScript validation passed with `npx tsc --noEmit`.
- Production build passed with `npm run build`; Next.js compiled and statically generated all pages successfully.

## 16. Known limitations

- The flywheel still advances by six discrete moments within the shared stage rather than morphing every object continuously between scroll positions. The persistent journey path, ticket, and Memory object keep the journey legible while keeping scroll progression reliable.
- The Meet OIP connection line is drawn from measured element positions; it is recomputed on selection and window resize, but zoom changes without a resize event may leave the line at the previous coordinate until the next selection.
- A console-level `404` and an expected `401` from `/api/auth/me` appear when loading the landing page. No runtime, hydration, or page errors were observed.

## 17. Exact branch restore commands

```powershell
git switch landing/option-c2-tightened
git switch landing/option-c3-interactive
git switch landing/option-a-attio
git switch landing/option-b-cinematic
git switch landing/option-c-refined
git switch landing/option-c1-polished
```

The C.2 baseline remains recoverable at commit `cbb0342`.
