# OIP Landing Page — Option C.2 Refinement Report

## 1. Branch used

- `landing/option-c2-tightened`
- Base preserved from Option C.1 at `7ac6d43` (`landing/option-c1-polished`).

## 2. Preservation status

All prior options remain independently recoverable:

- Option A: `landing/option-a-attio` at `9af6917`
- Option B: `landing/option-b-cinematic` at `ea57352`
- Option C: `landing/option-c-refined` at `180f740`
- Option C.1: `landing/option-c1-polished` at `7ac6d43`

Only the landing-page flywheel component, landing styles, OIP reveal scene, C.2 screenshots, and this report are changed. No backend, Prisma, trust, retrieval, governance, tenant, or auth semantics were modified.

## 3. What changed from C/C.1

- Reframed the Knowledge Flywheel as one pinned desktop product stage instead of six stacked sticky scenes.
- Kept the nine internal stages and six reader-facing moments: Understand, Remember, Assist, Learn, Reuse, Automate.
- Replaced the heavy vertical progress treatment with a thin indigo horizontal rail and understated nodes.
- Tightened desktop stage padding and secondary metadata while enlarging the primary product surfaces.
- Added a fragment-to-memory convergence layer to Meet OIP.
- Preserved the forgetting, remembering, learning/trust, and governed automation motion systems.

## 4. Unified flywheel architecture

Desktop uses one `.lp-fw-zone` with a `440vh` scroll budget, one `100vh` sticky stage, and a six-panel horizontal track. Normal vertical scrolling calculates the active moment; the track advances by one-sixth of its width per moment. The current panel is dominant, while the remaining panels are clipped outside the stage and remain available to the same story model.

Mobile and tablet remove the pinned rail and horizontal transform. The same six moments render as a compact vertical sequence with the existing one-shot scene reveals.

## 5. Vertical length reduction

At the 1440px desktop QA viewport, the rendered page is approximately `10,447px`, down from the C.1 measurement of `11,579px` (about 9.8% shorter). The flywheel itself is one `3,960px` pinned zone instead of a long series of viewport-height scenes. Final CTA spacing remains tight and arrives immediately after Memory → Intelligence → Autonomy.

## 6. Information-density reduction

- The rail exposes six readable moments rather than nine competing checkpoints.
- Secondary memory metadata and duplicate review controls are hidden inside the desktop stage while the key evidence, trust, review, outcome, and policy states remain visible.
- The Meet OIP ring keeps six audience-facing nodes and now adds only six small source fragments (tickets, docs, chat, outcomes, policy, agents) to make convergence legible.
- Automation is reduced to Memory ✓, Trust ✓, Policy ✓ → Authorized, with a single human-review fallback and a concise integration row.

## 7. Collision and alignment fixes

The single sticky stage owns both the rail and horizontal track, so following section headlines cannot enter the active frame during a panel transition. Desktop boundary QA at 1440×900 kept every active heading at a consistent top anchor and every stage panel inside the stage viewport; the automation panel ends before the CTA copy begins. No page-level horizontal overflow was found in the requested sweep.

## 8. Meet OIP signature motion

The six source fragments begin as quiet, scattered labels around the ring. When the reveal scene becomes live, they converge inward with a short transform/opacity animation while the central OIP ring performs one controlled orbit iteration and settles. The result reads as fragmented work becoming organized Organizational Memory, not a perpetual spinner. The existing reduced-motion guard disables the animation for users who request reduced motion.

## 9. Responsive checks

| Viewport | Page height | Flywheel mode | Overflow | Result |
| --- | ---: | --- | --- | --- |
| 1920×1080 | 11,239px | pinned horizontal | none | Pass |
| 1536×864 | 10,288px | pinned horizontal | none | Pass |
| 1440×900 | 10,447px | pinned horizontal | none | Pass |
| 1366×768 | 9,834px | pinned horizontal | none | Pass |
| 1280×720 | 9,546px | pinned horizontal | none | Pass |
| 1024×768 | 14,533px | compact vertical | none | Pass |
| 768×900 | 14,330px | compact vertical | none | Pass |
| 390×844 | 16,444px | compact vertical | none | Pass |
| 375×812 | 16,425px | compact vertical | none | Pass |

Mobile QA confirmed `display: block`, `transform: none`, hidden desktop rail, stacked product content, and no horizontal overflow. Auth routes `/?auth=signup` and `/?auth=login` rendered their expected forms.

## 10. Validation

- `npm.cmd run build`: pass (Prisma generation, Next production compile, type validation, static generation).
- `npx.cmd tsc --noEmit`: pass.
- Browser console errors/warnings during landing and auth-route checks: none.
- Reduced-motion stylesheet guard present and verified in the built page.
- No standalone test script is defined.

## 11. Known limitations

- `npm run lint` remains an interactive repository setup prompt; no ESLint configuration was created as part of this landing-only pass.
- The page is intentionally a frontend presentation surface; backend/product logic was not exercised or changed.

## 12. Exact branch restore commands

```bash
git switch landing/option-c2-tightened
git switch landing/option-c1-polished
git switch landing/option-c-refined
git switch landing/option-b-cinematic
git switch landing/option-a-attio
```

## Screenshots

- `docs/reports/assets/option-c2-desktop-hero.png`
- `docs/reports/assets/option-c2-meet-oip.png`
- `docs/reports/assets/option-c2-flywheel-understand.png`
- `docs/reports/assets/option-c2-automation.png`
- `docs/reports/assets/option-c2-mobile-390.png`
