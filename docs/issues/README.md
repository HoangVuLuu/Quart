# Issue plan

One file per milestone. `scripts/github/create-issues.mjs` turns these files into GitHub labels,
milestones and issues. Once the issues exist, **GitHub is where work is tracked**; these files stay as
the original plan. To change an issue, edit it on GitHub. To add a batch of new issues, add them here
and re-run the script: it skips everything that already exists.

## How the milestones are cut

Every milestone ends with something you can click on staging, and every feature issue carries its
backend and frontend work together (`docs/decisions/0006`). v1 is M0 to M6; Presotea goes live at the
end of M6.

| Milestone | Demo at the end |
| --------- | --------------- |
| M0 Walking skeleton | Staging shows the shell, the deployed commit, database status and the last background run |
| M1 Generator lab | `/lab` generates schedules for the Presotea sample and for Philippe's real month |
| M2 Accounts and workplaces | Sign up, verify, create Presotea, invite Philippe, staff join with a code |
| M3 Shift template | Philippe builds the weekly grid on his phone in under a minute |
| M4 Availability | A cycle opens, staff tap their shifts, Philippe watches progress and locks it |
| M5 Build and publish | Generate, adjust, publish v1, update with targeted notifications |
| M6 Go live | One real cycle in production alongside Excel |
| M7 Give away, claim, trade | Shifts change hands with approvals and re-validation |
| M8 News and push | Recipe posts with photos, push notifications, installable app |
| M9 Google and calendar feed | Google sign-in, free/busy import, calendar subscription |

## Format

```markdown
---
milestone: M2 — Accounts and workplaces
description: >-
  One paragraph shown on the GitHub milestone. Start with "Demo:".
---

## M2-03 · Short imperative title
labels: type:feature, stack:full, area:auth, size:M
depends: M2-01, M2-02
spec: FR-004, AD-030, 12.1

**Goal.** One or two sentences.

**You will see.** What is visible when it is done.

**Backend**
- [ ] ...

**Frontend**
- [ ] ...

**Tests**
- [ ] ...

**Done when**
- [ ] ...
```

Rules the script enforces with `--check`:

- IDs are unique and start with the milestone's number (`BL-` in the backlog).
- Exactly one `type:` label and one `size:` label; every label is defined in the script.
- `depends` lists only issues that appear **earlier** in the plan.
- Every `FR-`, `BR-`, `AD-`, `NFR-` and `Q-` ID in `spec` exists in `docs/quart-project-spec.txt`,
  and every section number (`12.7`) is a real heading.
- Every milestone issue has a **Done when** section.

## Labels

| Label | Meaning |
| ----- | ------- |
| `type:feature` · `type:chore` · `type:decision` · `type:bug` | What kind of work |
| `stack:full` · `stack:backend` · `stack:frontend` | Which side; most slices are full stack |
| `size:S` · `size:M` · `size:L` | About a day, a few days, a week or more |
| `area:*` | Which part of the product |
| `needs:philippe` | Blocked on input or approval from the owner |
| `payslip-readiness` | One of the 13 foundations in spec 12.7 |
| `good-first-issue` | Small and well defined |
