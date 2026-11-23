# Quart phase 3 plan (agreed with Hoang, 2026-11-23)

Mockups: https://claude.ai/artifact/DQZPV11rG7PTWCGYKHQTrS (design canvas "Quart phase 3 plan").
Five PRs, merged in order. **3.2 is dropped**: Edit Generator never changes a period that is already open.

## PR 1 · Shift names (3.4, M3-04)
- Optional `Name` on each Edit Generator shift (trimmed, max 24, blank = none). Copied to the period's shifts when a period opens.
- Shown everywhere a shift is labelled (schedule, Building, Home, Trade, availability, issues). No name → Opening / Mid / Closing as today (BR-034).
- Opening/closing classification stays automatic (no override).

## PR 2 · Edit a specific day (3.1 part 1, Edit Generator)
- Edit Generator › Shifts: button **Edit a specific day** above "Add a shift". Unsaved Edit Generator changes are saved first.
- **Editing Shift** page: no tab bar, back arrow (asks "Leave without saving?" if changed), week pills (Week 1…N, N = period length), one row per weekday without dates ("Mon · W1"), shift chips, pen at row end, "Changed" under edited days, **Clear all** top right, **Save** at the bottom.
- **Clear all** asks: "You are about to remove all the edits you've made on specific days. Are you sure?" (Cancel / Clear all). Takes effect on Save.
- Pen → **Editing Monday · W1**: Google Calendar style day view (hours down the side, a box per shift, overlaps side by side).
  - Tap a box → hours (15-minute steps) and Delete only. Overlaps allowed.
  - Drag on empty space, or tap the floating **+** (tap path, NFR-002) → full-screen pop-up: X (cancel) top left, Save top right; Name, Starts, Ends, People needed, Requires at least (N of level L), Cannot work together pairs, Days (every day of the period, W1..WN, the dragged day pre-picked).
  - Back returns to Editing Shift; nothing saved until Save there.
- Day changes are generator rules: every period opened afterwards uses them until cleared.
- Opening a period when day changes exist that were made **before the last period was opened** → dialog listing them: **Yes, keep them** / **Clear them and open period** / **Return**.

## PR 3 · Edit a period's shifts (3.1 part 2)
- Building Schedule and Editing Schedule: pen next to each day title. Tapping saves the draft quietly, then opens Editing Shift for that period with real dates ("Editing Mon Nov 23"). Back returns to Building/Editing.
- Same pages as PR 2 without Clear all. Add pop-up: Name, hours, People needed, Requires at least, Days (period dates). No "cannot work together". Tap a box: hours + Delete.
- Published period: days already started are greyed, no pen. Save makes changes live right away: people on a changed or deleted shift are notified, a version is saved, give-aways/trades on a deleted shift close.
- A day with no shifts shows **Closed** + **Reopen** (puts back the generator's shifts for that day).
- Added shifts: staff never answer for them, the generator leaves them empty, filled by hand ("Added · fill by hand").
- Hours changes keep availability (availability belongs to the shift, not the hours) and the people on it. If new hours would double-book someone, Save is refused naming the day.

## PR 4 · Reuse a past schedule (3.3, M5-08)
- Building Schedule: **Reuse a past schedule** under Generate → sheet of past published periods.
- Copies people onto matching shifts (same week index mod source weeks, weekday, source block). Skips people who left / don't work shifts. Kept (locked) people stay; replaces non-kept like Generate. Issues list flags who isn't available.

## PR 5 · Unclaimed give-away alert, trade expiry (3.5, M7-05, M7-08)
- A given-away shift still untaken **36 hours** before it starts → one alert to the managers and the giver. **Fixed 36 hours, no setting** (changes FR-183 / Q-08).
- A pending trade expires after 14 days or when either shift starts; both people are told. Jobs plus the existing lazy cleanup; both safe to run twice.
