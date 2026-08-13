# OIP Landing Page — Option C.3.1 Future Reveal Report

## 1. Branch / commit

- Branch: `landing/option-c31-future-reveal`
- Baseline C.3 commit: `7d750a6`
- Implementation commit: `d428a67` — `feat(landing): add optional oip 2.0 future reveal easter egg`
- Refinement commit: `706dec9` — `feat(landing): refine oip 2.0 reveal and harden meet oip zoom`

## 2. C.3 preservation evidence

The branch was created from `landing/option-c3-interactive` at `7d750a6` with a clean working tree. No previous branch was overwritten:

- `landing/option-a-attio`
- `landing/option-b-cinematic`
- `landing/option-c-refined`
- `landing/option-c1-polished`
- `landing/option-c2-tightened`
- `landing/option-c3-interactive`

Only landing frontend files and one app-level icon asset were changed. No backend, Prisma, trust, retrieval, memory, governance, policy, tenant-isolation, or auth semantics were modified.

## 3. Files changed

- `components/landing/scenes.tsx` — added and refined the OIP 2.0 reveal component and step visuals.
- `components/landing/landing.css` — added the future-reveal layout, motion, responsive, and reduced-motion styles.
- `components/landing/flywheel.tsx` — added ResizeObserver and visualViewport remeasurement to Meet OIP.
- `app/icon.svg` — added a simple OIP favicon to remove the unconfirmed 404.

## 4. Teaser placement

The teaser is placed in `VisionScene`:

1. After the `Memory → Intelligence → Autonomy` progression.
2. Before the `Stop starting from zero.` primary CTA.

It lives in its own `lp-c31-placement` container and remains visually secondary to `Sign Up Now`.

## 5. Trigger behavior

The trigger is:

```text
See where this is going →
```

It is a semantic `<button>` with `aria-expanded` and `aria-controls`. It opens the reveal inline and never navigates to another page. Clicking it again, pressing Escape, or activating `← Back to OIP today` closes the reveal and restores focus to the trigger.

## 6. Reveal architecture

The reveal is a lazy-mounted expandable inline experience:

- Closed by default; the future panel is not in the DOM until opened.
- One shared step-based story instead of a second scrolling page.
- Six concise states controlled by previous/next buttons, step dots, and left/right arrow keys.
- A persistent left copy column and right visual stage on desktop.
- A single `role="region"` with an accessible name and focused panel.

## 7. Narrative states

1. **Tickets were only the beginning.**
2. **What if your whole organization could remember?**
3. **Turn scattered knowledge into living Organizational Memory.**
4. **Memory should evolve as the organization evolves.**
5. **AI agents shouldn't have to start from zero either.**
6. **OIP 2.0 — The memory layer for an organization of humans and AI.**

## 8. Organizational knowledge visualization

Moment 1 shows one Organizational Memory node with a `Tickets` source and a `BEACHHEAD` marker. Moment 2 expands to nine fragmented source chips: Docs, Email, Chat, Decisions, Processes, Cases, Outcomes, Policies, and Expert Knowledge. Moment 3 replaces fragmentation with an OIP 2.0 core node and connected structured source nodes.

## 9. Living-memory / version-update visualization

Moment 4 shows a concise version flow:

```text
v3 → NEW EVIDENCE → REVIEWED → v4
```

Alongside it, a `LIVING MEMORY` node carries the concepts `versioned · evidenced · traceable`, with secondary chips for validation, new evidence, and trust update.

## 10. AI-agent visualization

Moment 5 uses a clean system card, not a humanoid or robot:

- `AI AGENT`
- Task: investigate enterprise SSO onboarding failures and recommend the next action
- `ORGANIZATIONAL CONTEXT LOADED`
- Relevant lessons: 4
- Current process: v7
- Known exceptions: 2
- Validated outcomes: 6
- Policy constraints: loaded

The statement is then carried into the final moment: **Give AI agents more than tools. Give them organizational experience.**

## 11. Future/current capability boundary

The reveal is explicitly labeled:

```text
OIP 2.0 / FUTURE VISION
Where OIP is going — not what ships today.
```

Copy uses future-facing framing such as “the future OIP vision is to give them…” and does not present OIP 2.0 as GA or currently shipped.

## 12. Motion implementation

- The reveal panel and step stage enter with one-shot transform/opacity animations.
- Step changes animate the copy and visual stage with short, state-driven transitions.
- Motion is limited to `transform` and `opacity`.
- No continuous background animation runs while the reveal is closed.

## 13. Responsive implementation

- Desktop uses a two-column copy/stage layout.
- At `max-width: 900px`, the layout stacks into one column.
- At `max-width: 720px`, the stage and typography tighten and the agent context list becomes single-column.

Multi-viewport QA is recorded in section 22.

## 14. Accessibility

- Semantic trigger and return buttons.
- `aria-expanded` and `aria-controls` on the trigger.
- Named, focusable `role="region"` reveal panel.
- Escape close with focus restoration.
- Arrow-key step navigation.
- Semantic previous/next buttons and step tabs with `aria-selected`.
- Visible focus states throughout.

## 15. Reduced motion

`prefers-reduced-motion: reduce` removes the reveal panel and stage entrance animations. All content, meaning, interaction, and step sequence remain available. The Meet OIP orbit and Knowledge Flywheel reduced-motion behavior are unchanged.

## 16. Performance

- The reveal is lazy-mounted and contributes nothing while closed.
- Motion uses CSS transform/opacity only.
- Step transitions are short and state-based.
- No per-frame React state, canvas, WebGL, or heavy filters were added.

## 17. C.3 regression results

Verified after the addition:

- Meet OIP orbit still runs (`lpCycleSpin`, 45s).
- Organizational Memory center remains static.
- Six Meet OIP nodes remain interactive.
- Knowledge Flywheel remains one shared product stage.
- `lp-conn` purple middle-object count inside the flywheel remains `0`.
- Desktop flywheel scroll budget remains `240vh`.
- Flywheel remains materially shorter than C.2.
- Reuse, Learn, and governed Automation remain intact.
- Main `Sign Up Now` CTA remains intact.

## 18. Meet OIP zoom robustness

The C.3 limitation was investigated and hardened. The OIP cycle now re-measures its selected-stage connection line using:

- `window.resize`
- `window.visualViewport.resize`
- `ResizeObserver` on the cycle element

QA confirmed that resizing the viewport from `1000px` to `600px` while a stage was selected changed the connection line endpoint from `531.24` to `290.19` and the cycle width from `640px` to `340px`. The fix is event-driven and does not add continuous measurement.

## 19. 401 investigation

`/api/auth/me` returns `401` for anonymous landing-page visitors. This is expected authentication-state behavior: the app checks the current session and reports unauthenticated. No user-facing error, hydration issue, or repeated noisy request loop was observed. Authentication semantics were intentionally left unchanged.

## 20. 404 investigation

The previous unconfirmed `404` was identified as the browser requesting `/favicon.ico` when no icon was present.

Classification: `LANDING_ASSET_BUG`

Fix: added `app/icon.svg` with a simple OIP mark. Next.js now injects `/icon.svg` as the favicon, and the `404` console error no longer appears. Re-verification showed only the expected `401` remains.

## 21. Build / TypeScript results

- `npx tsc --noEmit`: Pass
- `npm run build`: Pass

## 22. Known limitations

- The reveal is a concise six-state teaser, not a multi-scroll cinematic stage; this is intentional to avoid a second full landing page.
- The structured-knowledge visual uses a representative connected-node composition rather than an exhaustive knowledge graph.
- The Meet OIP zoom fix is event-driven; if a future browser exposes zoom changes without a resize event, the line may still wait for the next selection.

Multi-viewport QA results:

| Viewport | Trigger | Reveal opens | Overflow | Flywheel |
| --- | --- | --- | --- | --- |
| 1920×1080 | Pass | Pass | None | 240vh |
| 1536×864 | Pass | Pass | None | 240vh |
| 1440×900 | Pass | Pass | None | 240vh |
| 1366×768 | Pass | Pass | None | 240vh |
| 1280×720 | Pass | Pass | None | 240vh |
| 1024×768 | Pass | Pass | None | vertical story |
| 768×900 | Pass | Pass | None | vertical story |
| 390×844 | Pass | Pass | None | vertical story |
| 375×812 | Pass | Pass | None | vertical story |

## 23. Exact branch restore commands

```powershell
git switch landing/option-c3-interactive
git switch landing/option-c31-future-reveal
git switch landing/option-a-attio
git switch landing/option-b-cinematic
git switch landing/option-c-refined
git switch landing/option-c1-polished
git switch landing/option-c2-tightened
```

The C.3 baseline remains recoverable at `7d750a6`.
