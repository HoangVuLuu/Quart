---
milestone: M4 — Availability
description: >-
  Demo: Philippe opens a two-week cycle. Staff are notified, tap the shifts they can work, add an
  optional comment and send. Philippe watches the progress list fill up, reads the comments,
  presses "Start building" to lock everything, and reopens one person who forgot.
---

## M4-01 · Periods: dated shifts copied from the template
labels: type:feature, stack:full, area:availability, size:L
depends: M3-05
spec: FR-090, FR-092, AD-010, AD-028, BR-034

**Goal.** A period owns real, dated shifts, so later template edits cannot corrupt it.

**You will see.** Admin → Periods → "New period": start date (a Monday) and length of 1–4 weeks. The period opens as a grid of dated shifts, and any shift can be edited or removed for this period only (a holiday closure, longer December hours).

**Backend**
- [ ] Scheduling module, `scheduling` schema: `period` (start_date, weeks, status), `shift` (local date, local start and end, headcount, source block, opening/closing class) and `shift_requirement`, all copied from the template when the period is created.
- [ ] NodaTime throughout (AD-028): `LocalDate`, `LocalTime`, and the workplace `DateTimeZone`. Also store each shift's instant range, **computed in the application**: Postgres cannot generate it, because time-zone conversion is not immutable (spec AD-011 updated).
- [ ] "Monthly" means 4-week blocks (FR-090). Periods of one workplace cannot overlap.

**Tests**
- [ ] A period spanning the November daylight-saving change keeps a 16:00 shift at 16:00 local time on both sides.
- [ ] Editing the template after creating a period leaves the period's shifts untouched.

**Done when**
- [ ] A 2-week Presotea period exists on staging with 28 dated shifts, and one of them is edited without affecting the template.

## M4-02 · Availability screen: tap the shifts you can work
labels: type:feature, stack:full, area:availability, size:L
depends: M4-01, M2-12
spec: FR-093, FR-098, FR-099, NFR-002, NFR-003, NFR-008

**Goal.** The screen every employee uses each cycle. It must be fast on a phone.

**You will see.** The period's days with their shift blocks. Tap to mark "can work" (colour, check icon and text), tap again to clear. A counter shows "9 shifts · 57 h selected". Send; edit and send again until the period locks.

**Backend**
- [ ] `availability` (period, membership, status `not_sent | sent`, submitted_at) and `availability_block` (availability, shift).
- [ ] Only members with "works shifts" on (FR-036). Saving a draft and sending are separate actions; sending again replaces the previous answer (FR-098).
- [ ] Anyone who has not sent is `not_sent` and is never treated as available (FR-099).

**Frontend**
- [ ] A day view on phones and a week view on wider screens (NFR-003). Optimistic toggles, saved as a draft in the background.

**Tests**
- [ ] A member cannot read or write another member's availability; a non-shift member gets 403; toggles are idempotent.

**Done when**
- [ ] An employee fills a 2-week period on an iPhone in under a minute.

## M4-03 · Optional availability comment, admins only
labels: type:feature, stack:full, area:availability, area:privacy, size:S
depends: M4-02
spec: FR-103, BR-035, FR-040, AD-027, 12.4

**Goal.** People can explain their availability ("exams week 2") to the admin and nobody else.

**Backend**
- [ ] `availability.comment`: plain text, at most 500 characters, **enforced on the server**. It locks and reopens with the availability (FR-100, FR-101).
- [ ] Readable only by its author and holders of ViewAvailabilityComments. Never included in notification parameters (FR-216). The generator never receives it (BR-035).

**Frontend**
- [ ] A text box with a character counter. Always rendered as text, never as HTML.

**Tests**
- [ ] 501 characters are refused by the API even when the UI is bypassed; a coworker's request never contains the field (added to the M2-10 suite).

**Done when**
- [ ] A comment typed by an employee is visible to Philippe and invisible to every other test account.

## M4-04 · Team availability and progress for admins
labels: type:feature, stack:full, area:availability, size:M
depends: M4-03
spec: FR-099, FR-103, FR-141

**Goal.** Philippe sees who has answered, what they can work, and their comments, at a glance.

**You will see.** A progress bar ("11 of 14 sent") and a list of people with status (sent, draft, not sent), hours offered against desired hours, and a comment indicator that expands. A team grid shows how many people are available per shift, with thin shifts highlighted.

**Backend**
- [ ] One endpoint returning the aggregated view, guarded by ManageSchedule. Comments are included only for ViewAvailabilityComments holders.

**Done when**
- [ ] On staging, a shift with fewer available level 3s than required is visibly flagged before anything is generated.

## M4-05 · Availability requests, deadline and reminders
labels: type:feature, stack:full, area:availability, area:notifications, size:M
depends: M4-04, M2-14
spec: FR-091, FR-211, FR-215, AD-029

**Goal.** Nobody has to chase people for their availability.

**You will see.** Period settings for "send the request N days before the period starts" and a deadline. Staff get an in-app notification plus an email (they have no push yet, FR-211). Reminders go only to people who have not sent.

**Backend**
- [ ] Schedule the request and reminder jobs when a period is created or its settings change (via `IJobScheduler`, M0-12). Jobs check the current state when they run, so a reminder never reaches someone who has already sent.
- [ ] Email fallback for actionable items, with a per-user preference.

**Tests**
- [ ] With a fake clock: the request is sent on the right day, reminders skip people who have sent, and changing the deadline reschedules.

**Done when**
- [ ] On staging, creating a period sends requests on schedule, and a reminder reaches only the person who has not answered.

## M4-06 · Helpers: same as last period, copy week 1 to the rest
labels: type:feature, stack:full, area:availability, size:S
depends: M4-02
spec: FR-095, FR-096

**Goal.** Most people's availability barely changes. Make the second cycle take seconds.

**Backend**
- [ ] "Same as last period": map the previous period's answers onto this one by weekday and source block, and report shifts that had no match.
- [ ] "Copy week 1 to the rest": repeat week 1 across the remaining weeks.
- [ ] Both only fill the draft; nothing is sent automatically.

**Done when**
- [ ] A 4-week period is filled in two taps from last period's answers, then adjusted and sent.

## M4-07 · Lock when building starts, reopen one person
labels: type:feature, stack:full, area:availability, size:M
depends: M4-04
spec: FR-100, FR-101, FR-102

**Goal.** Availability stops moving once Philippe starts building, and one latecomer can be let back in.

**You will see.** A "Start building" action on the period (Generate joins it in M5-01). Afterwards, employee screens are read-only with a clear "locked" message. In the progress list, admins get "Reopen for this person", and that person is notified.

**Backend**
- [ ] `period.locked_at`; every availability write checks it. A reopen marks one availability `reopened_at` and allows that person's writes until they send again.
- [ ] Generate (M5-01) and a manual build call the same lock operation (FR-100).

**Tests**
- [ ] Writes after the lock are refused with `availability.locked`; a reopened person can send once; the others still cannot.

**Done when**
- [ ] The lock-and-reopen flow works on staging with two test accounts.

## M4-08 · Template changes after answers are collected
labels: type:feature, stack:full, area:template, area:availability, size:M
depends: M4-07
spec: FR-068, FR-069

**Goal.** Editing the template never silently invalidates a period, and never rewrites a published one.

**Backend**
- [ ] Template edits affect only periods created afterwards (FR-068).
- [ ] For an open period, an explicit "Apply to this period" action updates matching shifts, resets every answer for a changed shift to unanswered, and notifies the affected people (FR-069). It is refused for locked or published periods.

**Frontend**
- [ ] A confirmation that lists how many answers will reset and who will be notified.

**Done when**
- [ ] Changing the closing time and applying it to an open period resets exactly those answers and notifies exactly those people.
