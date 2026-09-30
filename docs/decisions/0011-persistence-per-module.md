# 0011. Each module owns one DbContext, one schema and one migrations table

- Status: Accepted
- Date: 2026-09-30
- Spec: AD-015, AD-028, AD-050

## Context

AD-015 says every module owns its tables in its own Postgres schema. That needs a concrete convention
before the second module adds tables, or each module will invent its own. (The plan named this record
0010, but 0010 is taken by the visual design language.)

## Decision

- **One `DbContext` per module**, `internal` to the module, calling `HasDefaultSchema("<module>")`.
  Nothing lives in the `public` schema.
- **One migrations history table per module**: `<module>.__ef_migrations`, set with
  `MigrationsHistoryTable("__ef_migrations", "<module>")`. Modules migrate independently.
- **No foreign keys across schemas.** A module stores another module's ID as a plain value and asks that
  module's public interface about it (AD-015). Integrity across modules is the application's job.
- **Names:** tables singular and snake_case (`scheduled_job`), columns snake_case, set explicitly in
  `OnModelCreating` so the model does not depend on a naming-convention package.
- **One `NpgsqlDataSource`**, built by the API host with the NodaTime plugin and shared by every
  module's `DbContext` (AD-028). A module never reads the connection string itself.
- **Migrations:** each module exposes `Migrate<Module>ModuleAsync`. In Development the host calls it on
  startup; every other environment uses the explicit `migrate` step (M0-08).
- **Generate a migration** from the repository root:
  `dotnet tool restore`, then
  `dotnet ef migrations add <Name> --project src/backend/Modules/Quart.Modules.<Module> --output-dir Persistence/Migrations`.
  Each module has an `IDesignTimeDbContextFactory`, so this needs neither a running database nor the API.
- **Tests** run against a real Postgres through the shared `PostgresFixture` (Testcontainers), never an
  in-memory provider. `MigrationTests` lists every module schema; a new module adds its schema there.

## Consequences

A module's tables can be moved to their own database later without untangling foreign keys. The cost
is that cross-module consistency (for example a shift pointing at a deleted workplace) is checked in
code and tests rather than by the database. Running the tests needs Docker, locally and in CI.
Revisit if a module genuinely needs a join across schemas on a hot path; prefer a read model first.
