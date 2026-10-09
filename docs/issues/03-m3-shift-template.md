---
milestone: M3 — Edit Generator page
description: >-
  Demo: on his phone, Philippe opens the Edit Generator page from Schedule, sets the period to
  2 weeks, max consecutive shifts to 3, fairness on, then switches to Per Day. He creates
  10:00–16:00 Opening on all seven days (2 people, at least 1 level 3), then 16:00–23:00
  Closing likewise, and marks two employees as "cannot work together" on every block.
  The whole setup takes under a minute. Save brings him back to the schedule.
---

## M3-01 · Edit Generator page, General tab
labels: type:feature, stack:full, area:template, area:scheduling, size:L
depends: M2-10
spec: FR-070, FR-073, FR-090, BR-005, BR-020, NFR-002, NFR-016

**Goal.** The Edit Generator page replaces the standalone template editor and the scheduling-rules section of workplace settings. The General tab holds period length and scheduling rules.

**You will see.** An "Edit Generator" button on the schedule page opens a full-screen page with a back arrow (no bottom menu bar). General tab shows: period length (1–4 weeks), maximum consecutive shifts (1, 2, 3, 4, no limit), opening fairness on/off, closing fairness on/off. A Save button at the bottom. Mockup 1k3.

**Backend**
- [ ] Typed settings stored as `jsonb` on the workplace, with defaults (maximum consecutive shifts: 3) and validation.
- [ ] Period length is per-period (FR-090); changing it mid-period adds weeks with no availability.
- [ ] Changing the time zone is refused once any period exists.
- [ ] Endpoints guarded by ManageTemplate permission.

**Frontend**
- [ ] `features/generator/EditGeneratorPage` with General and Per Day tabs.
- [ ] General tab: period length stepper, max consecutive shifts picker (1, 2, 3, 4, no limit), fairness toggles.
- [ ] Sections grouped with headings for future extensibility.

**Tests**
- [ ] Settings save and load correctly; invalid values (e.g. period length 0) are rejected.

**Done when**
- [ ] General tab saves on staging, and the lab's rule inputs match these names and defaults.

## M3-02 · Per Day tab: shift blocks with headcount and level requirements
labels: type:feature, stack:full, area:template, size:L
depends: M3-01
spec: FR-060, FR-061, FR-062, FR-063, FR-064, FR-065, FR-066, FR-067, AD-010

**Goal.** The weekly grid every period is copied from, built entirely by tapping on phones.

**You will see.** Per Day tab shows a Monday-to-Sunday grid. Tap an empty slot → pick start and end time (15-minute steps) → choose the days it repeats on → save. Blocks appear on every chosen day. Tap a block to see its rules. Mockup 1k4.

**Backend**
- [ ] `workplaces.shift_block`: start and end as local times, the set of days it runs on (the 2026-09-11 decision: blocks carry their own days), headcount, and opening/closing overrides.
- [ ] `shift_block_requirement (level, min_count)`. Requirements count inside the headcount, not on top of it (FR-065): reject a total minimum above the headcount.
- [ ] Validation: times on a 15-minute grid (FR-061); end after start on the same day, never crossing midnight (FR-062), with code `template.crosses_midnight`. Overlapping blocks are allowed (FR-063).
- [ ] The ladder rule (FR-066) lives in one shared function the evaluator also uses.
- [ ] CRUD endpoints guarded by ManageTemplate.

**Frontend**
- [ ] Reuses `ScheduleGrid` in template mode. Time pickers are native inputs with `step=900`, which gives phone-friendly wheels.
- [ ] Tap a block → bottom sheet (mockup 1k5) showing headcount stepper, "at least N of level L" rows, and conflict pairs.
- [ ] "Apply to all" button to copy one block's rules to every block.

**Tests**
- [ ] 23:00–00:30 is refused; 10:07 is refused; overlapping blocks save.
- [ ] Headcount 2 with "≥3 level 3" is refused; the ladder function is tested at every level.

**Done when**
- [ ] Presotea's template is created on a phone in two entries, one per block, each applied to all seven days. Both blocks show "2 people · ≥1 level 3" on staging.

## M3-03 · "Cannot work together" pairs per shift block
labels: type:feature, stack:full, area:template, area:generator, size:M
depends: M3-02
spec: BR-036, FR-071

**Goal.** Philippe can mark two employees who must not be on the same shift together.

**You will see.** In the per-block bottom sheet (mockup 1k5), a "Cannot work together" section. Tap "Add pair" → pick two people → save. An "Apply to all" button copies the pair to every block.

**Backend**
- [ ] `shift_block_conflict (shift_block_id, membership_a_id, membership_b_id)` with a constraint enforcing a < b (unordered pair).
- [ ] CRUD endpoints guarded by ManageTemplate.
- [ ] "Apply to all" copies pairs to every shift block in the workplace.

**Frontend**
- [ ] Pair list with remove buttons.
- [ ] "Apply to all" confirmation.

**Tests**
- [ ] Adding the same pair twice is refused; removing a pair works; "Apply to all" copies to all blocks.

**Done when**
- [ ] A conflict pair is visible on every block after "Apply to all" on staging.

## M3-04 · Opening and closing labels, with an override
labels: type:feature, stack:full, area:template, size:S
depends: M3-02
spec: BR-034, BR-013, BR-014

**Goal.** Fairness needs to know which shifts are openings and closings.

**Backend**
- [ ] Automatic: the first and last blocks of each day. An admin override per block (the `is_opening_override` and `is_closing_override` fields in spec 8.1).
- [ ] The same classification function feeds the generator input, so the lab and the product agree.

**Frontend**
- [ ] "Opening" and "Closing" chips on blocks, with an override menu.

**Done when**
- [ ] With a third, middle block added, it is labelled neither, unless overridden.

## M3-05 · Drag to create on desktop, with a keyboard equivalent
labels: type:feature, stack:frontend, area:template, area:a11y, size:M
depends: M3-02
spec: FR-067, NFR-002, NFR-007

**Goal.** A faster path on desktop and iPad, never the only one.

**Frontend**
- [ ] Pointer drag on the week grid creates a block (snapped to 15 minutes) and opens the same form as the tap path, pre-filled.
- [ ] Keyboard: arrow keys move a cursor across day and time, Shift+arrows extend a selection, Enter opens the form. Announce the selection through a live region.
- [ ] Touch devices keep the tap path; the drag must never block scrolling on phones.

**Done when**
- [ ] A block can be created by mouse, by keyboard alone, and by tapping, with identical results.

## M3-06 · Unsaved changes guard and template-affects-future-only rule
labels: type:feature, stack:full, area:template, size:S
depends: M3-01
spec: FR-068, FR-069, FR-072

**Goal.** Template changes only affect future periods, and the user never loses edits by accident.

**Backend**
- [ ] Editing the template affects future, unpublished periods only (FR-068). It never rewrites a published schedule.
- [ ] If a shift block is changed after availability has been collected for a period that uses it, every answer for that block resets to unanswered and the affected employees are notified (FR-069).

**Frontend**
- [ ] Unsaved changes on the Edit Generator page trigger a confirmation popup (mockup 1k6) when the user taps the back arrow or switches away.

**Done when**
- [ ] Navigating away with unsaved changes shows the popup on staging. Saving template changes does not affect the current period.
