---
milestone: none
description: Agreed as valuable, deliberately not scheduled. Each needs a decision before it moves into a milestone.
---

## BL-01 · Time-off requests with a written reason
labels: type:feature, stack:full, area:availability, size:L
depends: M6-12
spec: 3.3

**Goal.** An employee asks for a range of full days off with a written reason; any admin approves or declines; approved days are blocked in availability forms and in the generator.

**Before starting.** Decide how the reason is treated. It will often contain personal information (health, family), so it should follow the same rules as availability comments (admin-only, class B, retention in section 13).

**Done when**
- [ ] Specified in the spec as new FR numbers, then broken into slices like the milestones above.

## BL-02 · Payslips (epic)
labels: type:feature, stack:full, area:files, area:security, area:privacy, needs:philippe, size:L
depends: M8-09
spec: FR-300..311, 6.12, 12.4, 12.5, 12.7, 12.8, Q-10, Q-11

**Goal.** The owner uploads PDF payslips to each employee's profile, and each employee opens only their own.

**Do not start until**
- [ ] Q-10 is answered: if Philippe's payroll service already has an employee portal, this feature may only duplicate it while adding the most sensitive data the app would hold.
- [ ] Q-11 is answered: retention, and access for former employees.
- [ ] Every item in 12.7 exists (M8-09).

**Then split into slices**, as in the milestones above: staged upload with matching and review (FR-300..302), recall and replace (FR-303), the employee's tab with step-up to open (FR-304, FR-305), mandatory two-factor for ManagePayslips (FR-309), read auditing (FR-308), former-employee access (FR-310), and optional Key Vault encryption of each file (12.5).

## BL-03 · Swap in OR-Tools CP-SAT behind the generator interface
labels: type:feature, area:generator, stack:backend, size:L
depends: M1-10
spec: 7.7, AD-003

**Goal.** Only if schedule quality disappoints after the pilot. CP-SAT can replace the greedy and local search behind the same `IScheduleGenerator` interface.

**Before starting.** Measure first: collect the cases from the pilot where Philippe preferred his own schedule, and add them as golden tests. The native library also adds to the container image; check its size and licence (Apache-2.0).

## BL-04 · Native app wrapper, if iPhone push proves insufficient
labels: type:feature, area:notifications, stack:frontend, size:L
depends: M8-06
spec: NFR-012

**Goal.** Wrap the same React code with Capacitor only if staff cannot be brought onto home-screen web push.

**Costs to accept first.** $99 USD a year for the Apple developer account, App Store review for every update, and a second release pipeline.

## BL-05 · Planned dependency majors: xUnit v4 and TypeScript 7
labels: type:chore, area:infra, size:S
depends: M0-01
spec: 10.1

**Goal.** Take the two major versions deliberately held back in `docs/decisions/0007`.

**Tasks**
- [ ] xUnit v4: switch to Microsoft Testing Platform in its own pull request; confirm `dotnet test` in CI and the IDE test runners.
- [ ] TypeScript 7: upgrade once `typescript-eslint` supports it.
