# Background jobs

How Quart runs work later or on a schedule (reminders, expiries, retries, retention) without keeping
the web app awake (AD-029, [decision 0009](../decisions/0009-tick-as-a-job.md)). The code lives in the
Jobs module (`src/backend/Modules/Quart.Modules.Jobs`); the contracts other modules use live in
`src/backend/Quart.SharedKernel/Jobs`.

## How it works

Work waits as rows in `jobs.scheduled_job`. Every 5 minutes a **tick** runs: it takes each row that is
due, runs it with the handler for its type, records the result, and exits.

| Where   | What runs the tick                                                                            |
| ------- | --------------------------------------------------------------------------------------------- |
| Staging | Container Apps job `quart-staging-tick`: cron `*/5 * * * *`, the app's image, argument `tick` |
| Locally | Nothing on a schedule. `POST /internal/tick` (Development only) or `dotnet run ... -- tick`   |
| Tests   | `services.RunTickAsync()`, against a real Postgres (`JobRunnerTests`, `TickCommandTests`)     |

`dotnet Quart.Api.dll tick` exits with **0** when the tick ran, even if some jobs failed (they retry on
their own), and **1** when it could not run at all, for example when the database is unreachable.

Every tick also runs the **heartbeat** job, which records the time in `jobs.heartbeat`. `/api/meta`
returns it as `lastTickAt`, and the home page shows "Last background run: 3 minutes ago". On staging
that time should never be more than about 5 minutes old.

## Adding a job type

1. Write a handler in your module. Name the type `<module>.<snake_case_name>`.

   ```csharp
   internal sealed class SendReminderHandler(/* your services */) : IJobHandler
   {
       public string Type => "notifications.send_reminder";

       public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
       {
           var payload = job.ReadPayload<ReminderPayload>();
           // Check first: was this reminder already sent? A job can run twice.
           ...
           return JobOutcome.Done;
       }
   }
   ```

2. Register it in your module's `Add…Module` method: `services.AddScoped<IJobHandler, SendReminderHandler>();`
3. Schedule work from anywhere, through `IJobScheduler` (no reference to the Jobs module needed):

   ```csharp
   await scheduler.ScheduleAsync(
       new JobRequest("notifications.send_reminder", shiftStartsAt - Duration.FromHours(12))
       {
           Payload = new ReminderPayload(shiftId),
           WorkplaceId = workplaceId,
           DedupeKey = $"reminder:{shiftId}", // scheduling it twice adds it once
       },
       cancellationToken);
   ```

The rules every handler follows:

- **Idempotent.** Running the same job twice changes nothing the second time. A tick can crash after
  doing the work but before recording it, and then the job runs again.
- **Throw to fail.** An exception means "try again later". Exception messages carry IDs, never names,
  emails or comments ([decision 0012](../decisions/0012-logging-without-personal-data.md)).
- **IDs only in payloads.** Payloads stay in the table after the job runs.
- **Recurring work** returns `JobOutcome.RunAgain(next)` instead of `Done`: the same row runs again at
  `next`, with its attempts reset. A job asking to run again right away still waits for the next tick.

## Failures and retries

A job that throws, times out (60 seconds), or has no handler is tried again later. It never stops the
other jobs in the same tick.

| Failed attempts | Next try in                       |
| --------------- | --------------------------------- |
| 1               | 5 minutes                         |
| 2               | 10 minutes                        |
| 3               | 20 minutes                        |
| 4               | 40 minutes                        |
| 5               | 80 minutes                        |
| 6               | 160 minutes                       |
| 7, 8, 9         | 6 hours                           |
| 10              | never: the job is marked `Failed` |

That is about a day in all. Each failure is a `Warning` in the log with the job's ID and type; the
final one is an `Error`. The rules live in `Tick/RetryPolicy.cs`.

## Two ticks at once

Ticks can overlap (a slow one, or a manual run during a scheduled one). Each job still runs once:

- A tick **claims** one job at a time with a single `UPDATE … FOR UPDATE SKIP LOCKED`: a second tick
  skips a row the first is claiming instead of waiting, and once claimed, the row is `Running`.
- The claim **locks** the job for 10 minutes (`locked_until`). If the tick dies, the job is taken over
  once that time passes, and the run counts as an attempt. The job's replica timeout (300 seconds) is
  shorter than the lock, so a live tick never loses its job to another one.
- A tick stops claiming new jobs after 2 minutes, so it ends well before the next one starts.

## Try it locally

```bash
docker compose up -d
dotnet run --project src/backend/Quart.Api                  # API on http://localhost:5080
curl -X POST http://localhost:5080/internal/tick            # {"succeeded":1,"retried":0,"failed":0}
curl http://localhost:5080/api/meta                         # "lastTickAt": "2026-…"
```

Or run the tick exactly as staging does, as a separate process that exits:

```bash
dotnet run --project src/backend/Quart.Api -- tick
```

Look at the table: `docker compose exec postgres psql -U quart -d quart -c "SELECT type, status, attempts, run_at FROM jobs.scheduled_job"`.

## On staging

```bash
# The last few runs, newest first: each should be Succeeded and a few seconds long.
az containerapp job execution list --resource-group rg-quart-staging --name quart-staging-tick \
  --query "[0:5].{status:properties.status, started:properties.startTime, ended:properties.endTime}" -o table

# The web app still sleeps: no replicas once nobody has used it for 5 minutes.
az containerapp replica list --resource-group rg-quart-staging --name quart-staging -o table

# Run one tick now instead of waiting.
az containerapp job start --resource-group rg-quart-staging --name quart-staging-tick
```

The tick's log lines are in Log Analytics (`log-quart-staging`): one `Tick finished` line per run.

**Cost.** A tick takes a few seconds at 0.25 vCPU and 0.5 GiB: about 11,000 vCPU-seconds and
22,000 GiB-seconds a month, well inside the free grant (180,000 and 360,000). It also keeps the free
Supabase project from pausing for inactivity.

## When a job failed for good

Find it: `SELECT id, type, attempts, run_at FROM jobs.scheduled_job WHERE status = 'Failed'`. Read its
log lines (search for the ID), fix the cause, then let it run again at the next tick:

```sql
UPDATE jobs.scheduled_job SET status = 'Pending', attempts = 0, run_at = now() WHERE id = '<id>';
```

If `lastTickAt` on the home page is old: check the job's executions above. A failed execution's log says
why (often the database: check the `db-connection` secret on the job, which the provisioning script sets).

## Not done yet

- **Finished jobs are kept.** Deleting old `Succeeded` and `Failed` rows belongs to retention (M6-05).
  The heartbeat reuses one row, so it adds nothing.
- **Scheduling uses its own connection**, not the caller's transaction. When a module needs a job to be
  saved together with its own change (the outbox, AD-030), extend `IJobScheduler` to take part in the
  caller's transaction.
