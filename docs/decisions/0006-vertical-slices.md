# 0006. Build in vertical slices, generator lab first

- Status: Accepted
- Date: 2026-09-21
- Spec: 15, AD-005, 17 (2026-09-21)

## Context

The first milestone plan was partly layered: foundations, then accounts, then a backend-first generator.
With one part-time developer, weeks of work that cannot be seen are weeks without feedback, and the
riskiest question (does the generator make schedules Philippe would use?) was answered late.

## Decision

Every milestone ends with something you can click on staging, and every feature issue carries both its
backend and its frontend work. The generator moves to M1 behind an internal lab page: a naive version
first, so the page works end to end in the first days, then each algorithm step improves what the page
shows. Philippe's anonymized data is compared against his own schedule in that lab before any product
screen depends on the generator.

## Consequences

The lab page is extra UI that real users never see, and its grid component is reused later by the
schedule screens. Issue order inside a milestone matters more; the issue script enforces that
dependencies always point backwards.
