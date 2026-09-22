# The Quart look

The design is set by `docs/prototype/quart-design-prototype.html`. Open it in a browser: it is a
working phone-sized prototype of Home, Schedule, Availability, Requests, News, the shift sheet and
Settings, in both the employee and the owner view. `design-prototype-source.jsx` in this folder is
its source, extracted from the bundle, if you need to see how a screen was built.

Spec section 19 is the short written version of this page. The tokens below are real code in
`src/web/src/styles/index.css`; nothing in the app hard-codes a colour, radius or shadow (AD-048).

## The feel, in one paragraph

Friendly and physical, not corporate. Rounded type, pale periwinkle background, white cards that
float softly, and buttons that sit on a hard 3 px edge so they look pressable. Colour carries
meaning (a shift, a status, a warning) and is always backed by a word or an icon. Big headings,
generous spacing, everything comfortably tappable with a thumb. It should look like a tool made for
a bubble tea shop, not a payroll system.

## Colour

| Token | Light | What it is |
| ----- | ----- | ---------- |
| `bg` | `#E9EEFD` | The app background, behind everything |
| `surface` | `#FFFFFF` | Cards |
| `surface-2` | `#FBFBFD` | Bottom sheets and secondary panels |
| `surface-3` | `#EEF0F7` | Rows and wells inside a card |
| `line` | `#DCE3FA` | Hairlines, used sparingly: shape does most of the separating |
| `ink` | `#1B1B22` | All primary text, and the colour of solid dark buttons |
| `muted` | `#5E6380` | Subtitles, labels, secondary detail |
| `link` | `#3F5FC4` | Links, and the focus ring |
| `primary` | `#7F9FF2` | Hero cards, the selected pill, the logo blob |
| `accent` | `#F48DA0` | Badges and counts only, never a large area |
| `on-primary` | `#1B1B22` | Text and icons drawn on `primary` or `accent`, in **both** themes |
| `success` / `success-soft` | `#11643A` / `#DDF3E4` | Sent, covered, approved |
| `danger` / `danger-soft` | `#8E1A33` / `#FDE1E6` | Missing level 3, blocked publish, not available |
| `warning` / `warning-soft` | `#6B4A00` / `#FFF0C9` | Needs a look: reopened, confirm before publishing |
| `neutral` / `neutral-soft` | `#4A4F66` / `#ECEDF3` | No answer yet |
| `opening` | `#CDD35B` | The opening shift's flavour |
| `closing` | `#ADA8DA` | The closing shift's flavour |

Dark mode keeps every role and hue and darkens the surfaces. It is derived, not designed: the
prototype is light only, so check it on a real phone before the pilot.

`primary` and `accent` keep their light values in dark mode, so text on them uses `on-primary`
rather than `ink`; `ink` flips to near-white and would fall to 2.2:1. Measured: `ink` on `primary`
6.64:1, `ink` on `accent` 7.47:1.

Every pair above passes WCAG AA at 4.5:1 in both themes. The one exception is white on `primary`,
which appears only as the wordmark inside the logo blob. That is a logotype, which the guidelines
exclude, and it must never be used for text.

## Type

**Quicksand** for the entire interface, mostly at 600 and 700. It is rounded and warm, which is the
whole point. **Titan One** appears in exactly two places: the Quart wordmark and the join code.

| Role | Style |
| ---- | ----- |
| Screen title | 700, 32 px, line-height 1.1, tracking −0.01em ("Schedule", "Hi Sophie!") |
| Card title | 700, 17–24 px |
| Body | 600, 14–15 px, line-height 1.4–1.5 |
| Label above a group | 700, 12 px, uppercase, tracking 0.06–0.08em |
| Subtitle and helper text | 600, 12–15 px in `muted` |

Regular 400 weight is not used for interface text.

## Shape

Pills (`radius-pill`, 99 px) for everything tappable: buttons, chips, filters, the tab bar, badges.
Rounded rectangles for anything holding content: `radius-card` 28 px, `radius-hero` 32 px,
`radius-field` 20 px, `radius-chip` 18 px, `radius-sheet` 36 px on the top corners of a sheet.
Circles for avatars, the settings button and the +/− steppers. The logo is a deliberately uneven
blob, tilted −8°, so it reads as drawn rather than generated.

## Elevation

Two shadows, and no borders where a shadow will do.

- `shadow-card` — `0 8px 24px rgba(60,80,160,.08)`: cards resting on the background.
- `shadow-press` — `0 3px 0 rgba(40,50,110,.12)`: a hard offset under pills, buttons and avatars.
  This is what makes the interface feel tactile. Use it on anything you tap.
- `shadow-float` — `0 10px 30px rgba(60,80,160,.18)`: the floating tab bar and open sheets.

## Layout patterns

- **Phone first.** The prototype is 390 × 844. Desktop keeps the same components in a wider column
  with a sidebar instead of the tab bar (NFR-003).
- **Top row:** logo blob on the left; on the right, the settings circle for admins and the person's
  initials in a white circle.
- **Screen header:** muted date or context line, then the 32 px title.
- **Home:** a hero card in `primary` with a large translucent circle bleeding off the corner, then
  smaller cards. The hero is where "next shift" or the current prompt lives.
- **Tab bar:** floating white pill, 12 px from each edge, 22 px from the bottom, five tabs at most
  (NFR-016), each a pill that fills with `primary` when selected. Counts ride in an `accent` badge.
- **Detail lives in a bottom sheet**, not a new page: rounded 36 px top corners, up to 86% of the
  screen, dimmed backdrop, slides up in 0.28 s. The shift panel, publish confirmation and settings
  all use it.
- **Toasts** appear at the top as a dark pill.
- **Switches** are pill tracks with a white knob; steppers are circular +/− buttons.
- **Status chips** pair a soft background with its strong colour and always include a word or a
  symbol ("✓ Sent", "× Needs 1 level 3 — missing").
- Tap targets are at least 44 px, usually 48 px (NFR-009).

## The mascot

A bubble tea cup, drawn entirely in CSS (no image files), with two props:

- **flavour** — the colour of the drink. Opening shifts are lime `#CDD35B`, closing shifts are
  lavender `#ADA8DA`. A blocked publish uses a milk-tea brown `#C9A07A`.
- **mood** — `happy` (open eyes, smile), `sleepy` (closed arcs, for closing shifts) or `wow` (an
  open mouth, for something that needs attention, like a shift with one person).

It appears on the next-shift card, on empty states, on the generate and publish sheets, and never
carries information on its own: whatever the cup says is also written in words beside it. It is
decorative, so it is hidden from screen readers (`aria-hidden`).

## Motion

Sheets slide up over 0.28 s on `ease-sheet`; backdrops fade in 0.2 s; toasts pop in 0.25 s. Nothing
else animates. Everything stops under `prefers-reduced-motion` (NFR-010).

## Words

The prototype's tone is part of the design: short, human, second person. "Hi Sophie!", "Looks
good!", "Most days in a row", "The generator never goes past this", "Philippe is building the
schedule. Ask him to reopen yours if something changed." Write the French first when you can; it is
the shop's working language, and English translations of French phrasing read better than the
reverse.

## When you add a screen

1. Find the closest screen in the prototype and reuse its structure.
2. Use tokens and existing components. If you need a new colour, add a token here and in the spec,
   with its contrast checked, rather than inventing one inline.
3. Check it at 390 px wide, in dark mode, at 200% zoom, and with a keyboard.
