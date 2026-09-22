# 0002. Modular monolith in a single container

- Status: Accepted
- Date: 2026-09-21
- Spec: AD-020, AD-015, 9.2

## Context

One developer, about 15 users, free hosting tiers. Microservices would multiply deployments, network
failure modes and cost for no benefit at this size. A single unstructured project, on the other hand,
lets every part reach into every other part until nothing can change safely.

## Decision

One ASP.NET Core host (`Quart.Api`) and one container image. Features live in module projects under
`src/backend/Modules`. Each module owns its own database schema, exposes one public entry class, and
references only `Quart.SharedKernel`. The schedule generator is a separate pure library that only the
Scheduling module uses. `Quart.ArchitectureTests` enforces all of this on every build.

The spec called the background-job module "Scheduler". The code calls it `Jobs`, because
"Scheduler" and "Scheduling" side by side invite mistakes.

## Consequences

One thing to deploy and debug. Boundaries are real because a test fails when they are crossed, so a
module could later move into its own service without untangling shared tables.
