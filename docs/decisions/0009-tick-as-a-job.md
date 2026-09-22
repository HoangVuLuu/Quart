# 0009. The background tick runs as a short job, not an HTTP call

- Status: Accepted
- Date: 2026-09-21
- Spec: AD-029, AD-030, NFR-006

## Context

The spec first said an external scheduler would call an authenticated tick endpoint every 5 minutes.
Azure Container Apps scales an app to zero only after 300 seconds without requests. A request every
300 seconds would therefore keep the replica running around the clock, which uses up the monthly free
grant and defeats scale-to-zero.

## Decision

A Container Apps scheduled job (cron `*/5 * * * *`) runs the application's own image with the `tick`
argument. The process connects to the database, runs every due job idempotently, and exits. The web app
is never woken up. Database migrations use the same pattern with the `migrate` argument (M0-08), so
there is only one image to build.

Emails are dispatched right after the transaction that created them commits. The tick only retries
failures, so a verification or reset email arrives in seconds rather than at the next tick.

In development, `POST /internal/tick` runs one tick on demand.

## Consequences

Each tick costs a few seconds of job time instead of keeping a replica alive. The tick also keeps the
free Supabase projects from pausing for inactivity. Scheduled work runs up to 5 minutes late, which is
fine for reminders, expiries and retention. Anything that must feel instant (emails) does not wait for
the tick.
