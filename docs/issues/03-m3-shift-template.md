---
milestone: M3 — Shift template
description: >-
  Demo: on his phone, Philippe builds Presotea's week in under a minute (10:00–16:00 on all seven
  days, then 16:00–23:00), sets two people and "at least one level 3" on each, and sees them
  labelled Opening and Closing. The workplace settings screen holds the scheduling rules.
---

## M3-01 · Template editor, tap path
labels: type:feature, stack:full, area:template, size:L
depends: M2-10
spec: FR-060, FR-061, FR-062, FR-063, FR-067, NFR-002, AD-010

**Goal.** The weekly grid every period is copied from, built entirely by tapping.

**You will see.** A Monday-to-Sunday grid. Tap an empty slot → pick start and end time (15-minute steps) → choose the days it repeats on → save. Blocks appear on every chosen day. Tap a block to edit or delete it.

**Backend**
- [ ] `workplaces.shift_block`: start and end as local times, the set of days it runs on (the 2026-09-11 decision: blocks carry their own days), headcount, and opening/closing overrides.
- [ ] Validation: times on a 15-minute grid (FR-061); end after start on the same day, never crossing midnight (FR-062), with code `template.crosses_midnight`. Overlapping blocks are allowed (FR-063).
- [ ] CRUD endpoints guarded by ManageTemplate.

**Frontend**
- [ ] `features/template/TemplatePage`, reusing `ScheduleGrid` in template mode. Time pickers are native inputs with `step=900`, which gives phone-friendly wheels.

**Tests**
- [ ] 23:00–00:30 is refused; 10:07 is refused; overlapping blocks save.

**Done when**
- [ ] Presotea's template is created on a phone in two entries, one per block, each applied to all seven days.

## M3-02 · Headcount and level requirements
labels: type:feature, stack:full, area:template, size:M
depends: M3-01
spec: FR-064, FR-065, FR-066

**Goal.** Each block says how many people it needs and which levels.

**You will see.** A plus/minus headcount control and "at least N of level L" rows on each block. The block card shows "2 people · ≥1 level 3".

**Backend**
- [ ] `shift_block_requirement (level, min_count)`. Requirements count inside the headcount, not on top of it (FR-065): reject a total minimum above the headcount.
- [ ] The ladder rule (FR-066) lives in one shared function the evaluator also uses.

**Tests**
- [ ] Headcount 2 with "≥3 level 3" is refused; the ladder function is tested at every level.

**Done when**
- [ ] Both Presotea blocks show their requirement on staging.

## M3-03 · Opening and closing labels, with an override
labels: type:feature, stack:full, area:template, size:S
depends: M3-01
spec: BR-034, BR-013, BR-014

**Goal.** Fairness needs to know which shifts are openings and closings.

**Backend**
- [ ] Automatic: the first and last blocks of each day. An admin override per block (the `is_opening_override` and `is_closing_override` fields in spec 8.1).
- [ ] The same classification function feeds the generator input, so the lab and the product agree.

**Frontend**
- [ ] "Opening" and "Closing" chips on blocks, with an override menu.

**Done when**
- [ ] With a third, middle block added, it is labelled neither, unless overridden.

## M3-04 · Drag to create on desktop, with a keyboard equivalent
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

## M3-05 · Workplace settings: details and scheduling rules
labels: type:feature, stack:full, area:workplace, size:M
depends: M3-03
spec: FR-030, FR-031, BR-005, BR-020, BR-033, NFR-016

**Goal.** One settings screen that later milestones add their sections to.

**You will see.** Behind the gear on phones, and in the sidebar on desktop: workplace name, address and time zone, plus scheduling rules (maximum consecutive days, opening fairness on/off, closing fairness on/off).

**Backend**
- [ ] Typed settings stored as `jsonb` on the workplace, with defaults (maximum consecutive days: 5 until Q-02 is answered) and validation.
- [ ] Changing the time zone is refused once any period exists.

**Frontend**
- [ ] Sections grouped with headings, so later milestones can add sections (publish checks, approvals, alerts) without a redesign.

**Done when**
- [ ] Settings save on staging, and the lab's rule inputs match these names and defaults.
