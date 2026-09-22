# 0010. The visual design comes from the design prototype

- Status: Accepted
- Date: 2026-09-22
- Spec: 19, AD-048, NFR-017, NFR-009

## Context

The scaffold shipped with placeholder design tokens: a warm paper palette, Inter Tight and
Newsreader. They were a reasonable default, not a decision. The owner of the project then produced a
phone-sized design prototype of the whole app — Home, Schedule, Availability, Requests, News, the
shift sheet and Settings — and it is the look he wants.

## Decision

`docs/prototype/quart-design-prototype.html` is the visual reference. Its language is written down
in spec section 19 and, in more practical detail, in `docs/design/README.md`:

- Quicksand for the interface at 600 and 700; Titan One only for the wordmark and the join code.
- A pale periwinkle background, white cards, `#7F9FF2` as the brand colour, status pairs of a strong
  colour on a soft one.
- Pills for everything tappable, 28–32 px rounding for content, bottom sheets for detail.
- Two shadows: a soft one under cards, a hard 3 px offset under anything you tap.

The tokens live once, in `src/web/src/styles/index.css`, and components use their names (AD-048).
The placeholder fonts and palette are removed; the shell, home page and 404 page already use the new
ones, so the look is in the code from the first commit rather than retrofitted at the end.

## Consequences

Every contributor has one reference to copy from, and a screen that drifts is visible immediately.
Two things the prototype does not answer, both flagged rather than invented:

- **Dark mode.** The prototype is light only. The dark tokens are derived (same hues and roles,
  darker surfaces) and all pass AA, but they need a look on a real phone before the pilot.
- **Desktop.** The prototype is a phone. Wider screens keep the same components, swap the floating
  tab bar for a sidebar, and widen the column (NFR-003).

White on the brand blue is 2.6:1. It is used only inside the logo blob, which WCAG treats as a
logotype, and never for text.
