# UI mockups (the screens to build)

These are the current mockups, dated 2026-10-08. **When you build or change any screen, open the
matching image first and make the screen look and behave like it.** Layout, copy, component choice,
what is hidden when empty, and which sheet opens from where all come from these images.

- Source: `Quart-mockups-2026-10-08.pdf` (the full export).
- One image per screen: `screens/<id>.png`. The ID is the small label above each phone in the PDF
  (`1a`, `1b`, …). Issues and pull requests should cite screens by ID ("matches 1a and 1b").
- Colours, type, radius and shadows are not repeated here: use the tokens in `../README.md` and
  `src/web/src/styles/index.css`. The mockups confirm that look, they do not replace it.

## Rules for anyone (or any AI) implementing UI

1. Find the screen below, open its image, and build to it. Do not rebuild a screen from memory of an
   older prototype: `docs/prototype/quart-design-prototype.html` is out of date for layout.
2. If a screen is not here, reuse the nearest pattern from these mockups and say so in the pull
   request. Do not invent a new layout.
3. If a mockup contradicts the spec, **do not pick silently**. See "Known conflicts" below, follow
   the decision recorded there, and if the case is not listed, ask and add it to the list.
4. Sample data in the images (Sophie, Maple Café, Kevin T.) is placeholder. Never hard-code it.
5. Every screen needs French and English (NFR-013), light and dark, and a phone width of 390 px.

## Navigation

Five bottom tabs, always in this order: **Home, Schedule, Trade, Alerts, Profile** (the title of the
Alerts screen is "Notifications"). Admins use the same five tabs. The top row shows the logo on the
left and the team icon on the right (opens "Whole team", 1w / 1x). News and Availability are not
tabs: Availability opens from Schedule ("Fill availability") and from the Home card; the latest news
shows on Home and in the News section of Alerts.

## Employee screens (Sophie, barista level 2)

| ID | Screen | What to build | Issues |
| -- | ------ | ------------- | ------ |
| 1s | Login | Email, password with show/hide, "Forgot password?", Log in, "Continue with Google", link to create an account | M2-04, M2-17 |
| 1t | Forgot password | Email, "Send reset link", confirmation card "Link sent to … Check your inbox and spam folder", back to log in | M2-05 |
| 1u | Create account | Full name, email, password, confirm password (both with show/hide), Create account, Continue with Google | M2-02, M2-17 |
| 1v | Choose workplace | "Hi <name>", the person's workplaces each with Open, a join-by-code box row, Join workplace, Log out | M2-11 |
| 1a | Home | Next shift hero card, Hours this week, Up for grabs (open + trade counts), Availability card with due date and Fill in, Latest news | M5-06 |
| 1b | Home, empty | No next shift and nothing to grab: those cards disappear, Hours this week shows 0 and spans the full width | M5-06 |
| 1w | Whole team | Read-only list: avatar, short name, role and level, Instagram and Facebook icons, "you" marked | M2-18 |
| 1c | Schedule, my shifts | Period title and "published", My shifts / Whole team switch, Fill availability, Upcoming and Completed cards, "Up for grabs · still yours until taken" badge | M5-06, M7-02 |
| 1d | Schedule, whole team | Day cards grouped by week, Opening and Closing rows, your name highlighted. The bottom card sits under the floating tab bar because the image was exported scrolled | M5-06 |
| 1h | Shift sheet | Bottom sheet for one shift: time, who you work with, Give away and Trade | M7-02, M7-06 |
| 1i | Trade sheet | "Trade your <shift>": one-for-one list of coworkers' shifts, each with Ask | M7-06 |
| 1e | Availability | Week pills, a row per day with Opening and Closing toggles, status chip (Not sent), Fill from Google Calendar, Same as last period, Copy week 1 → All, optional note for the manager, Send | M4-02, M4-03, M4-06, M9-02 |
| 1e2 | Availability, locked | Status "Sent"; shift toggles greyed and disabled; the note box stays active with "Send note" | M4-03, M4-07 |
| 1f | Alerts (Notifications) | Sections: Reminders, Open shifts (Claim, or "Waiting for <manager>" when approval is on), Trades (give / get, Accept, Decline), News (unread dot) | M2-14, M7-01, M7-03, M7-06, M8-01 |
| 1g | Profile | Level ("set by <manager>"), weekly hours, Email and Push switches, Language, Dark mode, Connect to Google Calendar, email, Change password, Log out, Delete account | M2-07, M2-08, M2-16 |
| 1g-del | Delete account sheet | Explains what is removed, asks to type the email, red Delete my account, Cancel | M2-16 |

## Admin screens (Philippe, owner)

| ID | Screen | What to build | Issues |
| -- | ------ | ------------- | ------ |
| 1j | Home, collecting | Next period hero with "13 of 15 sent" progress and Build the schedule, Waiting on you, "You're working next", news composer (text, Photo 0/6, "Post and notify team"), Latest news | M4-04, M5-01, M8-01, M8-03 |
| 1j2 | Home, all collected | Same card turns green: "Availability collected · Ready to build schedule" | M4-04 |
| 1x | Whole team (admin) | As 1w plus an Edit button on each person | M2-12, M2-18 |
| 1z | Edit level sheet | Level 1, 2, 3 choice and Save level | M2-12 |
| 1k | Schedule, before generating | "Ready to build?" with Generate schedule and By hand, list of people who have not sent | M4-07, M5-01 |
| 1k2 | Schedule, all collected | Green card, everyone has sent | M5-01 |
| 1l | Schedule, draft | Generate again, "N issues", Publish, a seed hint, Week 1 / Week 2, shift cards with fill count, levels, KEPT for locked people, red card with "No level 3" | M5-01, M5-03, M5-04, M5-05 |
| 1p | Shift editor sheet | Blocking issue banner, "On this shift" with Keep and Remove, "Add someone" with level, availability status, hours counter and Add | M5-02 |
| 1q | Issues sheet | List with severity tags (Blocks, Asks, Info). The source image is clipped at the right edge | M5-04 |
| 1m | Team availability | Progress bar, "Fill in my availability", a row per person with Sent / Not sent, hours wanted, notes in a highlighted box, Remind | M4-04, M4-05 |
| 1m2 | My availability | Same as 1e for the owner | M4-02 |
| 1n | Alerts (admin) | Availability reminders with Remind and "Remind everyone who is missing", Open shifts with "Give it to <person>", Trades with Approve and Decline plus the validation line | M4-05, M7-04, M7-07 |
| 1o | Profile (admin) | "I work shifts too", join code with copy, Members and levels, Weekly shift template, Scheduling rules, then the same notification, preference and account rows as 1g | M2-09, M2-12, M3-05 |
| 1o2 | Weekly shift template | Day list with each block's people count and rules, pencil to edit, note that edits apply to the next schedule only | M3-01, M3-02 |
| 1o3 | Edit shifts, Monday | Per block: People needed stepper, "Requires at least N of level X" rules with remove and Add rule, Save changes | M3-01, M3-02 |
| 1y | Scheduling rules sheet | Approve claims, Approve trades, Spread openings fairly, Spread closings fairly, Most days in a row stepper | M3-05, M7-04 |

## Known conflicts and open points

These are places where the mockups and the spec disagree, or where the mockups are silent. Until
Hoang decides, build what is written in the "Do this" column.

| # | What the mockup shows | Spec says | Do this |
| - | --------------------- | --------- | ------- |
| 1 | The PDF's first page says the tabs are "Home, Schedule, Availability, Notifications, Profile", but every tab bar shows Trade and Alerts | NFR-016 now lists Home, Schedule, Trade, Notifications, Profile | Use the tab bars in the images. There is no full-page "Trade" screen in the mockups: trades are started from the shift sheet (1h, 1i) and answered in Alerts (1f, 1n). Ask before building a Trade tab page (M7-01) |
| 2 | 1m (admin team availability) is shown with the Trade tab highlighted, and no entry point is shown | n/a | Open it from the Home card (1j) and from Schedule (1k). Do not add a sixth tab |
| 3 | 1v asks for a 6-character join code; 1o shows PRESTEA24X (10 characters) | FR-033: 10 characters, no look-alikes | Keep 10 characters; use a row of boxes only if it fits on a 390 px screen, otherwise one field |
| 4 | 1g lets the employee edit "Wants per week" | FR-037: desired hours are set by an admin | Ask. Until decided, show it read-only for employees |
| 5 | 1g and 1o have a Dark mode switch | NFR-011: follows the device setting | Follow the device by default, with the switch as an override |
| 6 | 1f lists News inside Alerts; 1j has a composer on Home | M8-01 plans a News page, FR-231 | Build the News section in Alerts and the composer on Home as shown; keep the page for the full list |
| 7 | 1w shows Instagram and Facebook icons for everyone | FR-040: shown only if the member opted in | Show an icon only when that person chose to share the link |
| 8 | 1e2 allows a note after the lock | FR-103 (updated 2026-10-08) | Matches the spec |
