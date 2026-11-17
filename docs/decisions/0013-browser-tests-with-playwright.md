# 0013. Browser tests with Playwright, against the API serving the built web app

- Status: Accepted
- Date: 2026-11-17
- Spec: 10.1, NFR-001, NFR-002 (plan M6-09)

## Context

Unit and API tests passed while the core loop broke in a browser (the second save of Edit Generator).
Staff use iPhones, so Safari's engine must be tested, not only Chromium. The test must run on every
pull request, from an empty database, without secrets and without calling outside services.

## Decision

- **`@playwright/test`** in its own package, `tests/e2e`, apart from the web app's dependencies.
  It is Apache-2.0, maintained by Microsoft with a release every few weeks, pulls in 3 packages, and is
  the only common tool that drives WebKit. Chromium and WebKit both run at 390 x 844 with touch.
- **The API serves the built web app** (`ASPNETCORE_WEBROOT=src/web/dist`), one origin like production,
  with the real security headers. Not Vite's preview server: one process fewer, and no proxy that
  production does not have. The API runs in Development, so it migrates on start and uses the generous
  development rate limits, on port 5090 and its own database `quart_e2e`.
- **Test data through the API, the rest by tapping** (M6-09). Emailed links are read from Mailpit's HTTP
  API. The platform admin is granted with the same `grant-platform-admin` command an operator runs.
- **No real breached-password lookups**: `Auth:OfflineBreachedPasswordCheck` skips the check, and only
  in Development. Every other environment ignores it (tested in `AccountTests`).
- Selectors are roles, labels and visible English text, never test IDs. A control a test cannot name is
  an accessibility bug to fix.

## Consequences

A copy change in the English strings can break the browser test; update the test with it. The CI job
needs about 3 minutes, most of it installing the browsers. Running one test file for the whole loop
keeps it under the 5-minute budget; new flows should be new steps or new files only when they cover
something the loop does not.
