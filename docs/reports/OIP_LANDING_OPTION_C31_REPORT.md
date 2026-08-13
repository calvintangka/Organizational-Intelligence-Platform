# OIP Landing Page — Option C.3.1 Future Reveal Report

## 1. Branch and commit

- Branch: `landing/option-c31-future-reveal`
- Implementation commit: `d428a67` — `feat(landing): add optional oip 2.0 future reveal easter egg`
- This report is committed separately on the same branch.

## 2. How C.3 was preserved

The new branch was created from `landing/option-c3-interactive` at `7d750a6`.

Before the change, `git status` was clean. Only two landing files were modified:

- `components/landing/scenes.tsx`
- `components/landing/landing.css`

No backend, auth, Prisma, trust, retrieval, memory, governance, AI-routing, or tenant-isolation logic was changed.

The existing C.3 architecture remains intact:

- villain opening
- support pressure
- current memory story
- AI/context section
- interactive Meet OIP cycle
- redesigned Knowledge Flywheel
- reuse/trust/automation story
- final vision + CTA

## 3. Where the OIP 2.0 teaser is placed

The teaser is inserted in `VisionScene` after the Memory → Intelligence → Autonomy progression and before the final `Stop starting from zero.` CTA.

It sits in its own `lp-c31-placement` container, so the default page remains clean and the primary signup CTA stays the dominant conversion action.

## 4. Trigger behavior

The trigger is a subtle secondary button:

```text
See where this is going →
```

It is rendered only as a curiosity invitation and does not compete visually with the primary `Sign Up Now` button.

On activation:

- the trigger toggles `aria-expanded`
- the reveal mounts lazily below the trigger
- focus moves to the reveal panel

The visitor can close the reveal with:

- the `← Back to OIP today` button
- the Escape key
- toggling the trigger again

Closing returns focus to the trigger so the user stays in the main landing flow.

## 5. Reveal architecture

The implementation uses an expandable inline panel rather than a fullscreen modal:

- `OIP20FutureReveal` owns open/closed state.
- The panel is mounted only when opened, so hidden state performs no work.
- The panel is a named `role="region"` with `aria-live`-friendly focus behavior.
- The narrative is one concise six-step arc inside a single reveal.

This keeps the experience immersive without creating a second full landing page.

## 6. Narrative steps

The reveal follows the requested future arc:

1. **Tickets were only the beginning.** Resolved support work becomes the first structured memory layer; the rest of the organization is still fragmented.
2. **What if your whole organization could remember?** Knowledge lives in documents, email, chat, decisions, processes, cases, and outcomes — disconnected.
3. **OIP 2.0 structures scattered knowledge into living memory.** The same validated, versioned, connected memory model expands beyond tickets.
4. **Memory that stays updated as the organization changes.** New knowledge enters, old knowledge revises, and the network reflects what is true now.
5. **AI agents shouldn't have to start from zero either.** An agent connects to accumulated organizational experience before it begins difficult work.
6. **OIP 2.0 — The memory layer for an organization of humans and AI.** Give AI agents more than tools. Give them organizational experience.

The reveal is explicitly framed as future direction and avoids overclaiming current GA capability.

## 7. Motion system

- The reveal panel enters with a short opacity/translate animation.
- The six steps stagger upward in sequence.
- All motion uses CSS `transform` and `opacity`.
- `prefers-reduced-motion: reduce` removes the reveal and step animations while keeping the content fully readable and interactive.

No continuous background animation runs while the teaser is hidden.

## 8. Responsive behavior

- Desktop shows each step in a two-column layout: narrative copy beside a small product-like visual.
- At `max-width: 900px`, steps stack into a single column.
- At `max-width: 720px`, the panel tightens its padding and the AI-agent visual stacks vertically.

Mobile QA at `390×844` confirmed:

- the panel opens at `354px` wide inside a `390px` viewport
- no horizontal page overflow
- six steps remain readable and clearly separated

## 9. Accessibility

- The trigger is a semantic `<button>` with `aria-expanded` and `aria-controls`.
- The reveal is a focusable `role="region"` with an accessible label.
- Escape closes the reveal and restores focus to the trigger.
- The return button is a semantic `<button>` and also restores focus to the trigger.
- Visible focus states are provided for the trigger and return control.
- Reduced-motion users get direct, non-animated transitions.

## 10. Performance considerations

- The reveal is lazy-mounted: it does not exist in the DOM until requested.
- The teaser contributes no background animation before opening.
- Motion is limited to transform/opacity and staggered one-shot entrances.
- No product logic or data fetching is involved.

## 11. Validation/build results

- `npx tsc --noEmit`: Pass
- `npm run build`: Pass
- Desktop `1440×900` teaser open/close: Pass
- Keyboard Escape/return focus: Pass
- Reduced-motion animation removal: Pass
- Mobile `390×844` open/responsive/no overflow: Pass
- Console QA: no runtime or page errors observed; the same expected `401 /api/auth/me` and an unconfirmed `404` resource message appear on the landing page.

## 12. Known limitations

- The reveal is a concise inline expansion rather than a multi-scroll cinematic stage. This is intentional to keep it a teaser and avoid trapping the visitor in a second website.
- The structured-knowledge visual uses styled source chips rather than a dense connected graph; on small screens this keeps labels readable and interactions unnecessary.

## 13. Exact branch restore commands

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
