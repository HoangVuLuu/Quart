# 0012. Logs are small, structured and free of personal data

- Status: Accepted
- Date: 2026-09-30
- Spec: 11.5, 12.2, AD-023

## Context

Logs are how we find out what broke on staging, but they are also a classic surprise bill on Azure
(10.3), and anything written to them leaves our control: it is copied into Log Analytics and kept for
30 days. Request URLs, bodies and exception messages can carry email addresses, names, tokens and
availability comments. The person who hits an error needs a way to point us at the right log line.

## Decision

- **Serilog, compact JSON on stdout** (`CompactJsonFormatter`). Container Apps collects stdout; there
  is no other sink. Everything is set up in `src/backend/Quart.Api/Logging/QuartLogging.cs`.
- **Levels:** `Warning` by default outside Development (`Serilog:MinimumLevel` in `appsettings.json`).
  Staging can be turned up without a deploy with `Serilog__MinimumLevel__Default=Information`.
- **One summary line per request**, always kept whatever the level: method, **route template**,
  status and duration. Never the path, the query string, headers or the body. `5xx` is logged as
  `Error`; a healthy `/health` probe is not logged at all.
- **ASP.NET Core's own request logs are pinned to `Warning` in code**, because they include full URLs.
  The `RequestPath` property ASP.NET Core attaches to every event during a request is removed.
- **Identify people by ID only**: user IDs (and membership IDs once AD-026 lands) go on the summary
  line through `IDiagnosticContext.Set`. Never names, emails, availability comments or file names.
- **Exception messages must not contain personal data.** Throw with IDs, not values. Npgsql already
  hides parameter values and error details; never turn on `Include Error Detail` or EF Core's
  `EnableSensitiveDataLogging` outside a local database.
- **One failure, one log entry.** An unhandled exception rides on its request's summary line instead
  of being logged again by the exception handler.
- **Trace IDs join the two halves.** Every problem-details response carries `traceId`, the W3C trace ID
  that is also the `@tr` field of every log line for that request. The web app shows it under the
  translated error message, so a screenshot is enough to find the line.
- **Checking it:** outside Production, `/diagnostics/error` in the web app calls
  `GET /api/diagnostics/exception`, which fails on purpose.

## Consequences

A log line on its own rarely says *who* hit a problem, only which user ID; finding the person means
looking the ID up in the database, which is the point. Debugging a bad request cannot rely on seeing
its URL or body; reproduce it locally instead. `LoggingTests` send a sign-in-shaped request full of an
email address and fail if the address reaches any log line; extend them when a new kind of personal
data appears. Revisit if log volume on staging exceeds the Log Analytics daily cap.
