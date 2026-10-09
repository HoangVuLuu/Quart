# Database migrations

How the database schema changes without taking the app down (spec 11.3). Each module owns its own
schema and migrations ([decision 0011](../decisions/0011-persistence-per-module.md)).

## How they run

The API image has three modes:

| Command                        | What it does                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `dotnet Quart.Api.dll`         | Starts the web server. Never migrates, except in Development.                                                     |
| `dotnet Quart.Api.dll migrate` | Applies every module's pending migrations in a fixed order, then exits. Exit code 0 on success, 1 on any failure. |
| `dotnet Quart.Api.dll tick`    | Runs the background jobs that are due, then exits ([background-jobs.md](background-jobs.md)).                     |

Deployed environments run `migrate` as its own step, **before** the new version takes traffic, with
the Container Apps job `quart-staging-migrate` (same image, `migrate` argument). The deploy (M0-09)
starts the job, waits for it, and stops if it fails, so the app is never updated onto a schema it
does not expect. Running `migrate` when nothing is pending changes nothing. EF Core holds a database
lock while migrating, so two runs at once cannot both apply a migration.

The order lives in `src/backend/Quart.Api/Migrations/DatabaseMigrations.cs`. A module adds itself
there, and its schema to `tests/Quart.Api.Tests/MigrationTests.cs`, with its first migration.

## Expand, migrate, contract

During a deploy the **old version keeps serving** until the new one is ready, and the migration runs
first. So every migration must work with the code that is still running. Split any breaking change
across releases:

1. **Expand** (release N): add the new thing alongside the old. New columns are nullable or have a
   default; new tables are unused by old code. Old code keeps working.
2. **Migrate** (release N, or N+1): the code writes both, then reads the new; backfill old rows with
   a migration or a job.
3. **Contract** (a later release): remove the old column or table, **only in the release after the
   code stopped using it**.

Example, renaming `shift.note` to `shift.comment`:

| Release | Migration                              | Code                             |
| ------- | -------------------------------------- | -------------------------------- |
| N       | add `comment` (nullable)               | writes both `note` and `comment` |
| N+1     | copy `note` into `comment` where empty | reads and writes `comment` only  |
| N+2     | drop `note`                            | (unchanged)                      |

Never in one release: renaming or dropping a column, making a column `NOT NULL` without a default,
or changing a column's type. EF Core generates a rename when a property is renamed; rewrite such a
migration into the steps above.

## Run it

**Locally:** Development applies migrations on startup. To run the command itself:

```bash
docker compose up -d
dotnet run --project src/backend/Quart.Api -- migrate
```

**Staging, by hand** (normally the deploy does this):

```bash
az containerapp job start --resource-group rg-quart-staging --name quart-staging-migrate
az containerapp job execution list --resource-group rg-quart-staging --name quart-staging-migrate \
  --query "[0].{status:properties.status, started:properties.startTime}" -o table
```

The job's log lines are in Log Analytics (`log-quart-staging`): look for `Quart.Api.Migrations`.

## When a migration fails

The deploy stops and the old version keeps running on the old schema. Read the job's log, fix the
migration in a new pull request, and merge it; the next deploy runs it again. A migration that fails
halfway leaves that migration unapplied (Postgres runs each one in a transaction), so it is safe to
retry once fixed.
