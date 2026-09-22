---
milestone: M5 — Build and publish
description: >-
  Demo: Philippe presses Generate on the real period, adjusts two shifts in the shift panel,
  clears the issues list and publishes v1. Staff see their own shifts and the team schedule. He
  changes one shift, and only that person is notified, with a summary. This is the core loop the
  whole app exists for.
---

## M5-01 · Generate a draft for a real period
labels: type:feature, stack:full, area:scheduling, area:generator, size:L
depends: M4-07, M1-07
spec: FR-120, FR-122, FR-125, FR-100, AD-003, AD-011, 8.1

**Goal.** The lab's generator runs on real data and produces a stored draft.

**You will see.** On a period, Generate locks availability (after a confirmation) and fills the draft grid within a couple of seconds. "Generate again" gives a different valid schedule.

**Backend**
- [ ] Map the period's shifts, members (level, desired and maximum hours), sent availability, locks and workplace rules to `GeneratorInput`, and NodaTime values to BCL types at this boundary only.
- [ ] `scheduling.assignment` (shift, membership, user_id, `schedule_version_id` null for the draft, is_locked, source, instant range). An **exclusion constraint** on `(user_id, time_range)` over current published rows only, using the `btree_gist` extension, makes double-booking impossible for live schedules (AD-011). The evaluator checks drafts.
- [ ] `generation_run` stores the seed, a settings snapshot, the score and who ran it (FR-122).
- [ ] Generating replaces unlocked draft assignments only.

**Frontend**
- [ ] The draft page reuses `ScheduleGrid` from the lab. The score and a count of open slots appear in the header.

**Tests**
- [ ] Generating with a stored seed and the same inputs reproduces the same draft.
- [ ] Two overlapping live assignments for one person are rejected by the database itself.

**Done when**
- [ ] A real draft for the staging Presotea period is generated from the team's submitted availability.

## M5-02 · Shift panel: roster, candidates and live hours
labels: type:feature, stack:full, area:scheduling, size:L
depends: M5-01
spec: FR-121, FR-140, FR-141, FR-142, FR-103, NFR-008

**Goal.** Philippe fixes anything by hand, with everything he needs in one panel.

**You will see.** Tap a shift → a panel with the current roster and everyone who could be added. Each name shows availability (available, not available or no answer: colour plus icon plus text), level, hours for that week as assigned/desired (for example 13/20), and a comment indicator. Add and remove are one tap each.

**Backend**
- [ ] Draft edit endpoints: add, remove. Manual placement of an unavailable or unsubmitted person is allowed and flagged (FR-121); the generator never does it.
- [ ] Every edit returns the updated evaluator result, so issues and hours update immediately.
- [ ] A manual build with no Generate goes through the same lock operation (FR-100).

**Frontend**
- [ ] A bottom sheet on phones and a side panel on desktop. Red styling plus a text label for flagged assignments.

**Tests**
- [ ] The hours counter uses the week the shift falls in; an unavailable placement produces the right issue.

**Done when**
- [ ] Philippe's test account swaps two people on a shift in four taps on a phone.

## M5-03 · Lock assignments and regenerate around them
labels: type:feature, stack:full, area:scheduling, size:S
depends: M5-02
spec: FR-123, BR-004

**Goal.** "Keep these, redo the rest", now on real data.

**Backend**
- [ ] Lock and unlock endpoints. Generate passes locks to the generator (behaviour already proven in M1-07).

**Frontend**
- [ ] A lock toggle in the shift panel; a lock icon on grid cards with an accessible label.

**Done when**
- [ ] Locked assignments survive five regenerations on staging.

## M5-04 · Issues dashboard for admins and employees
labels: type:feature, stack:full, area:scheduling, size:M
depends: M5-02
spec: FR-143, AD-002

**Goal.** One list of everything wrong with the schedule, from the one evaluator.

**You will see.** Admins: issues grouped by type, each linking to the shift or person. Employees: only the issues that concern them, plus open shifts.

**Backend**
- [ ] Endpoints return the evaluator's issues for the draft (admins) and for the published version (employees, filtered to themselves).

**Tests**
- [ ] An employee never sees another person's hours or availability issues.

**Done when**
- [ ] Every issue type from M1-02 can be reached from the dashboard on staging.

## M5-05 · Publish checks and publishing v1
labels: type:feature, stack:full, area:scheduling, area:notifications, size:M
depends: M5-04
spec: FR-144, FR-160, FR-165, AD-012, FR-215

**Goal.** Publishing makes the schedule official and tells everyone, with Philippe's own guard rails.

**You will see.** Settings → Publishing: for each issue type, choose block, ask to confirm, or just show (defaults from FR-144). Publish either stops with the blocking issues, asks to confirm the listed ones, or publishes v1 and notifies every member.

**Backend**
- [ ] `schedule_version` (period, version, published_at, published_by). Publishing copies the draft into version 1, marks it current, and leaves the draft for future edits (AD-012).
- [ ] Empty slots are allowed and become open shifts (FR-165).
- [ ] One notification per member, plus an email fallback (FR-211).

**Tests**
- [ ] A "missing level" issue blocks by default; a confirm-type issue needs an explicit confirmation flag; publishing is atomic.

**Done when**
- [ ] v1 is published on staging and every test account is notified.

## M5-06 · My schedule, team schedule and the home cards
labels: type:feature, stack:full, area:scheduling, size:M
depends: M5-05
spec: FR-040, FR-230, NFR-003, NFR-006

**Goal.** What staff open the app for.

**You will see.** Home: next shift, hours this week against target, open shifts. Schedule tab: "Mine" and "Team" views of the current published version, a week view on desktop and a day or 3-day view on phones.

**Backend**
- [ ] Endpoints read only the current published version; drafts are never visible to employees (AD-012).

**Frontend**
- [ ] Dates and times in fr-CA or en-CA (FR-262). Open shifts link to the Requests tab, which comes in M7.

**Tests**
- [ ] An employee request never returns draft assignments.

**Done when**
- [ ] Staff test accounts see the right shifts on phones and desktop.

## M5-07 · Update after publishing: diff, conflicts and targeted notifications
labels: type:feature, stack:full, area:scheduling, area:notifications, size:L
depends: M5-06
spec: FR-161, FR-162, FR-163, FR-164

**Goal.** Changes after publishing reach exactly the people they affect, and never overwrite a change made in between.

**You will see.** An Update button appears only when the draft differs from what is live. It shows a summary ("Thu 16:00 — Sarah → Kevin") before confirming.

**Backend**
- [ ] The draft records the published version it is based on. Update compares the draft with the live schedule as it stands now. If a live shift changed since the draft's base (a claim or trade, M7), report a conflict for that shift instead of overwriting it (FR-162).
- [ ] Version N+1 is stored; history is kept (FR-164).
- [ ] Notify only the people whose own shifts changed, with a per-person summary (FR-163). Everyone else gets nothing.

**Tests**
- [ ] A simulated live edit on the same shift produces a conflict; a person with unchanged shifts receives no notification.

**Done when**
- [ ] Moving one person on staging notifies only the two people involved, each with their own summary.

## M5-08 · Reuse a past schedule
labels: type:feature, stack:full, area:scheduling, size:S
depends: M5-05
spec: FR-124

**Goal.** A good schedule from last month becomes this month's starting point.

**Backend**
- [ ] Copy assignments from a chosen past period onto matching shifts (same weekday offset and source block) as draft assignments. Re-check each one against current availability, and let the evaluator flag conflicts.

**Done when**
- [ ] Reusing a period shows the copied draft with any newly unavailable people flagged.

## M5-09 · Export a schedule to CSV and PDF
labels: type:feature, stack:full, area:scheduling, size:M
depends: M5-06
spec: 13, FR-214, FR-262

**Goal.** Philippe keeps his own records, and can print the schedule like his Excel sheet.

**Backend**
- [ ] CSV: one row per assignment (date, start, end, name, level), with UTF-8 BOM so Excel opens accents correctly.
- [ ] PDF: a week-per-page grid in the requester's language. Pick an MIT or Apache-licensed PDF library and record the choice. The same generator will serve the monthly email (M6-06).

**Frontend**
- [ ] Export buttons on the published schedule (admins).

**Done when**
- [ ] The exported PDF looks close enough to Philippe's printed sheet that he would pin it up.

## M5-10 · Leaving releases future shifts
labels: type:feature, stack:backend, area:scheduling, size:S
depends: M5-07, M2-15
spec: FR-038

**Goal.** Nobody who has left stays on the schedule.

**Backend**
- [ ] Consume the `MemberLeft` event: remove that membership from every future live and draft assignment (past shifts stay), bump the live version, and notify admins that shifts are open.
- [ ] Idempotent: handling the event twice changes nothing.

**Tests**
- [ ] Past assignments are untouched; the event handled twice is a no-op.

**Done when**
- [ ] Removing a scheduled test account on staging turns their future shifts into open shifts.

## M5-11 · Cross-workplace conflicts
labels: type:feature, stack:full, area:availability, area:scheduling, area:privacy, size:M
depends: M5-10
spec: FR-094, BR-002, FR-039

**Goal.** Someone working at two workplaces in Quart can never be booked twice, and neither admin learns where else they work.

**Backend**
- [ ] A contract returning a user's busy instant ranges from other workplaces' live schedules, without saying which workplace.
- [ ] Overlapping blocks grey out on the availability screen (FR-094) and feed the generator's external busy input (BR-002). The other admin sees only "unavailable".

**Tests**
- [ ] No response from workplace A contains workplace B's name or ID.

**Done when**
- [ ] With a second staging workplace, a shift held there greys out the overlapping Presotea block.

## M5-12 · Audit log for schedule changes
labels: type:feature, stack:full, area:scheduling, area:security, payslip-readiness, size:M
depends: M5-07
spec: AD-016, 12.7

**Goal.** Answer "nobody told me I was working Saturday" with facts.

**You will see.** Admins: a per-period history of who changed what and when, including publishes, updates and manual edits.

**Backend**
- [ ] An `IAuditLog` contract in the SharedKernel; `audit_event` rows (workplace, actor, action, target, before, after, occurred_at).
- [ ] Designed to record **reads** as well as writes (an action like `file.viewed` must fit), which payslips will need (12.7, item 10).

**Tests**
- [ ] Every schedule-changing endpoint writes exactly one event; the audit endpoint is admin-only.

**Done when**
- [ ] The history for the staging period shows the generation, the manual edits and both published versions.
