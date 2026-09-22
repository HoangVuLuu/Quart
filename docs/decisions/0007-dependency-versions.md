# 0007. Dependency versions and upgrade policy

- Status: Accepted
- Date: 2026-09-21

## Context

Several tools shipped new major versions shortly before the scaffold was written. Two of them could not
be adopted safely on day one.

## Decision

- **xunit.v3 stays on 3.x (3.2.2).** Version 4.0 (15 Aug 2026) switched its default runner to Microsoft
  Testing Platform, which changes how `dotnet test` discovers and runs tests. Move to it deliberately,
  in its own pull request, when there is time to verify CI and IDE test runners.
- **TypeScript stays on 6.0.x.** TypeScript 7 is the new native compiler, but `typescript-eslint` 8.70
  supports TypeScript below 6.1 only. Upgrade once the linter supports it.
- Everything else starts on the current major (React 19, Vite 8, React Router 8, Vitest 5, ESLint 10,
  Tailwind 4, .NET 10).
- Dependabot groups minor and patch updates weekly; each major version arrives as its own pull request.
  Merge minors when CI is green. Read the release notes for every major.

## Consequences

A few red Dependabot pull requests for majors we are deliberately not taking yet. Close them with a
comment pointing here.
