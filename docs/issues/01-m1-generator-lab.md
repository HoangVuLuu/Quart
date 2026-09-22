---
milestone: M1 — Generator lab
description: >-
  Demo: on staging, /lab shows the Presotea sample scenario as a two-week grid. Press Generate and
  a schedule appears with its issue list and score; the same seed gives the same schedule; lock a
  shift and regenerate around it; compare against Philippe's real month. This answers the riskiest
  question first: will the generator make schedules Philippe would actually use?
---

## M1-01 · Generator contract, a naive generator and the lab page
labels: type:feature, stack:full, area:generator, area:scheduling, size:L
depends: M0-06, M0-10
spec: AD-003, AD-002, 7.2

**Goal.** The whole pipeline works end to end on day one, with the simplest generator that could possibly work. Every later issue in this milestone makes what the page shows better.

**You will see.** `/lab` renders the Presotea sample (15 people, two shifts a day, two per shift, two weeks) as a week grid. Generate fills it, badly: first available person wins.

**Backend**
- [ ] In `Quart.Generator` (no dependencies, enforced by the architecture test): `GeneratorInput` (shifts with date, start, end, headcount, level requirements; members with level, desired and max weekly hours; availability as member × shift; locked assignments; rules; seed) and `GeneratorResult` (assignments, issues, score, seed). BCL types only: `DateOnly`, `TimeOnly`. NodaTime conversion happens later, in the Scheduling module.
- [ ] `IScheduleGenerator` with a `NaiveGenerator` implementation.
- [ ] The Presotea sample scenario as a JSON fixture, ported from the `PEOPLE` array in `docs/prototype/quart-prototype.jsx`.
- [ ] Lab endpoints in the Scheduling module (the only module allowed to use the generator): `GET /api/lab/scenarios/presotea`, `POST /api/lab/generate`.
- [ ] Mapped only when `Features:Lab` is true (Development and staging, never production). Rate limited, and the input size is capped (at most 8 weeks and 60 people). Staging holds only fictional data. M2-10 restricts the lab to the platform admin.

**Frontend**
- [ ] `ScheduleGrid` in `features/scheduling/components`: week columns with dated shift cards showing time, fill count (2/2) and names (FR-140). Built for reuse: the real schedule screens use it in M5. A day or 3-day view on phones (NFR-003).
- [ ] `features/lab/LabPage`: scenario summary, Generate button, the grid.

**Tests**
- [ ] Generator unit tests for the input and result contract.
- [ ] API test: the lab endpoints are absent when `Features:Lab` is false.

**Done when**
- [ ] Staging `/lab` generates and displays a schedule for the sample in both languages, on a phone and on desktop.

## M1-02 · Evaluator: one rulebook for score and issues
labels: type:feature, stack:full, area:generator, size:M
depends: M1-01
spec: AD-002, FR-143, BR-031, BR-033, BR-034

**Goal.** A single component grades any schedule. The generator optimises its score; the issues dashboard will display its list. They cannot disagree because they are the same code.

**You will see.** An issues panel under the grid, grouped by type with counts, and a score. Tapping an issue highlights the shifts or person it concerns.

**Backend**
- [ ] `Evaluator.Evaluate(input, assignments)` returns the score and the issues, with these types: below headcount; missing required level; assigned while unavailable; assigned without submitting; under desired hours; over desired hours; more consecutive days than allowed; both shifts in one day.
- [ ] Hours count the full shift length (BR-031). Under or over is reported beyond 2 hours over the period (BR-033). Opening and closing are the first and last block of each day (BR-034).
- [ ] Score weights follow the priority order in 7.4, documented beside the constants.
- [ ] Issue codes are stable strings (for example `issue.below_headcount`) plus parameters. The frontend translates them (FR-263).

**Frontend**
- [ ] Issues panel with icon, text and count per type (NFR-008); selecting one highlights the affected cards.

**Tests**
- [ ] One focused test per issue type, including the consecutive-days boundary and the double-shift case.

**Done when**
- [ ] The naive schedule from M1-01 shows its many issues, and every issue type can be triggered from a hand-built test input.

## M1-03 · Hard rules the generator never breaks, proven by property tests
labels: type:feature, stack:full, area:generator, size:M
depends: M1-02
spec: BR-001, BR-002, BR-003, BR-004, BR-005, FR-125, AD-005, NFR-014

**Goal.** No schedule the generator produces can ever break a hard rule. A gap is reported instead (FR-125).

**You will see.** A "Hard rules: 0 violations" badge in the lab, and empty slots shown as open rather than filled illegally.

**Backend**
- [ ] One candidate filter used by every phase of the algorithm: available for that exact shift (BR-001); no time overlap with another assignment, including external busy intervals from other workplaces (BR-002); never above headcount (BR-003); locks untouched (BR-004); never beyond max consecutive days (BR-005). BR-005 is hard everywhere, including local search: the prototype put the owner on 28 straight shifts when it was a penalty.
- [ ] Add CsCheck to the test project for property tests.

**Tests**
- [ ] Property tests over thousands of random inputs (people 1–30, 1–4 weeks, random availability, levels, locks): no hard rule is ever broken, no shift is overfilled, and every lock survives.
- [ ] Shrunk counterexamples are printed as JSON you can paste into the lab.

**Done when**
- [ ] Property tests run in CI in under 30 seconds and pass.

## M1-04 · Greedy construction: scarcity first, level first, hours-aware, seeded
labels: type:feature, stack:full, area:generator, size:M
depends: M1-03
spec: AD-004, BR-010, BR-011, BR-012, FR-122

**Goal.** A good first schedule, reproducible from its seed.

**You will see.** Far fewer issues than the naive version. A seed field, a "Generate again" button that picks a new seed, and a table of hours per person shown as assigned/desired (for example 13/13).

**Backend**
- [ ] Order shifts by scarcity (fewest available candidates first), with small jitter from `SeededRandom`.
- [ ] For each shift, satisfy level requirements first, then fill the remaining slots. Score candidates by distance from their desired hours, and break ties randomly among the top few.
- [ ] All randomness flows from the single seed; `GeneratorResult` returns it.

**Tests**
- [ ] The same input and seed give identical output, compared byte for byte as JSON.
- [ ] On the sample scenario, every shift with enough available level 3s gets one.

**Done when**
- [ ] Pasting a previous seed into the lab reproduces that exact schedule.

## M1-05 · Local search, fairness and last-resort doubles
labels: type:feature, stack:full, area:generator, size:M
depends: M1-04
spec: AD-004, BR-013, BR-014, BR-015, BR-020, BR-021, BR-022, BR-023

**Goal.** Improve the greedy schedule without ever breaking a hard rule.

**You will see.** The score before and after local search, opening and closing fairness toggles, and per person: openings and closings actual against expected.

**Backend**
- [ ] Local search: repeatedly try substituting one person for another, and keep any change that improves the evaluator score. Hard rules are re-checked before each change is applied. Bound it by iterations and time.
- [ ] Fairness is proportional to what each person is available for (BR-022): expected openings = total shifts × share of openings in that person's own availability. Two independent switches (BR-020). No weekend rule (BR-023).
- [ ] A double shift in one day is used only when nothing else fills the slot (BR-015).

**Tests**
- [ ] Someone only ever free in the evenings is never penalised for zero openings.
- [ ] A scenario with a spare evening-free person never produces a double.

**Done when**
- [ ] With fairness on, the opening and closing counts in the lab track the expected values within one shift on the sample.

## M1-06 · Scenario editor in the lab
labels: type:feature, stack:full, area:generator, size:M
depends: M1-04
spec: FR-035, FR-037, FR-093, BR-005, BR-020, 7.2

**Goal.** Try "what if" questions before they reach Philippe: two level 3s instead of five, someone who only works weekends.

**You will see.** Editable people (name, level, desired and maximum hours), tap-to-toggle availability per person and shift, rule settings (maximum consecutive days, fairness switches), and JSON import and export.

**Backend**
- [ ] Validate scenario input with translated error codes and field paths.

**Frontend**
- [ ] Editing uses the `ScheduleGrid` in an "availability" mode; phones stay tap-only (NFR-002).
- [ ] Export downloads the scenario as JSON; import accepts the same format and the counterexamples from M1-03.

**Done when**
- [ ] Setting Q-01's worst case (two level 3s) and regenerating shows the resulting gaps clearly, as open slots and "missing level" issues.

## M1-07 · Lock assignments and regenerate around them
labels: type:feature, stack:full, area:generator, size:S
depends: M1-05
spec: FR-123, BR-004

**Goal.** Philippe's "keep this, redo the rest" workflow, proven in the lab first.

**You will see.** Tap an assignment to lock it (a lock icon plus text for screen readers). Generate again keeps every locked assignment and rebuilds the rest.

**Backend**
- [ ] Locked assignments are placed first and counted in hours, consecutive days and levels. A lock that itself breaks a rule (for example an unavailable person) is kept and reported, never removed.

**Tests**
- [ ] Property: across random seeds, every lock survives.

**Done when**
- [ ] Locking three assignments and regenerating ten times never moves them.

## M1-08 · Performance budget: four weeks in under two seconds
labels: type:chore, area:generator, stack:backend, size:S
depends: M1-05
spec: NFR-004, AD-005

**Goal.** Catch a slow algorithm the day it is written.

**Tasks**
- [ ] A test generating a 4-week period for 15 people (56 shifts, 112 slots) fails above 2 seconds on the CI runner, averaged over several seeds.
- [ ] A larger stress case (30 people, 4 weeks) is reported but not gating.
- [ ] The lab shows generation time next to the score.

**Done when**
- [ ] The test runs in CI, and the lab shows the time for every run.

## M1-09 · Golden test against Philippe's real month
labels: type:feature, stack:full, area:generator, needs:philippe, size:L
depends: M1-06, M1-07
spec: AD-005, Q-03, 12.1

**Goal.** The best available evidence that the generator is good enough: compare it with what Philippe built by hand from the same availability.

**Privacy first.** The raw Google Form export and Excel sheet contain personal information. They stay on your machine under `data/private/` (gitignored) and are never committed or uploaded. Only the anonymized result is committed.

**Tasks**
- [ ] Ask Philippe for one month of Google Form responses and the matching Excel schedule (Q-03), with his agreement to this use.
- [ ] `scripts/anonymize/anonymize.mjs`: replaces names with P01, P02, and so on (the same mapping across both files), drops emails and timestamps, and writes a scenario JSON plus the reference schedule to `tests/golden/`.
- [ ] Lab: a "Compare" view with the generated and reference schedules side by side, and metrics for both: filled slots, level-3 coverage, hours deviation per person, longest run of consecutive days, doubles, and the evaluator score.
- [ ] A golden test asserting the generator is at least as good as the reference on filled slots and level-3 coverage, and reporting the rest.

**Done when**
- [ ] The comparison runs on the real month, and its results are written in the issue before closing.

## M1-10 · Review the lab with Philippe and settle the scheduling rules
labels: type:decision, area:generator, needs:philippe, size:S
depends: M1-09
spec: Q-01, Q-02, Q-04, 7, 17

**Goal.** Philippe trusts Generate before any screen depends on it.

**Tasks**
- [ ] A 30-minute session: show the lab on staging with his anonymized month, then the "only two level 3s" scenario.
- [ ] Get answers to Q-01 (how many level 3s), Q-02 (maximum consecutive days) and Q-04 (unwritten rules).
- [ ] Write every new rule into spec section 7 and the decision log. Open follow-up generator issues for anything that changes behaviour.

**Done when**
- [ ] Q-01, Q-02 and Q-04 are answered in the spec, and Philippe has said whether the generated month is one he would publish.
