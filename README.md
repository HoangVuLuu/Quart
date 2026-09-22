# Quart

Shift scheduling for Presotea Montmorency. Staff tap the shifts they can work, the owner presses
Generate, adjusts, and publishes. Staff give away, claim and trade shifts within rules he controls.

"Quart" is Quebec French for a work shift and the working name in code; the name people see lives in
the translation files.

| Where | What |
| ----- | ---- |
| [`docs/quart-project-spec.txt`](docs/quart-project-spec.txt) | The spec: every requirement (FR, BR, NFR) and architecture decision (AD). The source of truth. |
| [`docs/decisions/`](docs/decisions/) | Short records explaining choices in the code |
| [`docs/issues/`](docs/issues/) | The milestone and issue plan that seeded GitHub |
| [`docs/design/`](docs/design/) | The look: palette, type, shape, motion, and the rules for adding a screen |
| [`docs/prototype/`](docs/prototype/) | Two prototypes: `quart-design-prototype.html` (the look) and `quart-prototype.jsx` (the behaviour) |

## Stack

.NET 10 (ASP.NET Core, EF Core, Identity, NodaTime) as a modular monolith · React 19, TypeScript,
Vite, Tailwind, Radix, TanStack Query · PostgreSQL on Supabase (Montreal) · Azure Container Apps
(Quebec City) · GitHub Actions. One container serves both the API and the web app from one origin.

```
src/backend/
  Quart.Api/              the single host: wires modules, serves /api and the built web app
  Quart.SharedKernel/     error codes and the contracts modules use to talk to each other
  Quart.Generator/        the schedule generator: pure C#, no dependencies
  Modules/                Identity, Workplaces, Scheduling, Marketplace, Announcements,
                          Files, Notifications, Jobs (one database schema each)
src/web/                  React app; src/features mirrors the backend modules
tests/                    architecture rules, API tests, generator tests
docs/                     spec, decisions, issue plan, prototype, runbooks
scripts/github/           seeds labels, milestones and issues
```

The look is set by `docs/prototype/quart-design-prototype.html` and written down in spec section 19.
Colours, radii, shadows and the two fonts live once, as tokens in `src/web/src/styles/index.css`;
screens use token names and never literals (AD-048).

Module rules are enforced by `tests/Quart.ArchitectureTests`: a module references only
`Quart.SharedKernel`, and only Scheduling may use the generator.

## Run it locally

You need the [.NET 10 SDK](https://dotnet.microsoft.com/download), Node 22 (see `.nvmrc`) and Docker.

```bash
docker compose up -d                              # Postgres on 5432, Mailpit on 8025
dotnet run --project src/backend/Quart.Api        # API on http://localhost:5080
cd src/web && npm ci && npm run dev               # web app on http://localhost:5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the API, so the browser sees one
origin, exactly like production. Emails the app sends appear at <http://localhost:8025>.

## Before you push

```bash
dotnet build Quart.slnx && dotnet test Quart.slnx
cd src/web && npm run typecheck && npm run lint && npm run format:check && npm run i18n:check && npm test && npm run build
```

CI runs the same steps, and warnings fail the .NET build there. A missing French or English string
fails `i18n:check`.

## How work flows

1. Pick the next open issue in the current milestone. Issue titles start with their plan ID
   (`M2-03 · ...`); dependencies are linked at the top of each issue.
2. Branch from `main` as `m2-03-short-name`.
3. Open a pull request with `Closes #<number>`. The template's checklist covers tests, both
   languages, phone use and accessibility.
4. Squash-merge when CI is green. After M0-09, merging deploys to staging automatically.

When a decision changes, edit the spec in place **and** add a line to its decision log (section 17).
Anything undecided goes in section 16 as an open question, never invented in code.

## First-time GitHub setup

Do this once, as part of issue M0-01.

1. **Create the repository** on GitHub as **public** (spec AD-060: portfolio, and the container
   registry is free for public images). Create it empty: no README, licence or `.gitignore`.
2. **Push:**
   ```bash
   git init -b main && git add . && git commit -m "Initial scaffold"
   git remote add origin git@github.com:<you>/<repo>.git && git push -u origin main
   ```
3. **Settings:**
   - General: allow squash merging only, and turn on automatic deletion of head branches.
   - Code security: Dependabot alerts and security updates, secret scanning and push protection.
   - Rules: protect `main`, require a pull request and the three CI checks.
4. **Seed the labels, milestones and issues.** Create a fine-grained personal access token limited
   to this repository with **Issues: read and write** (Metadata read-only is added automatically),
   then:
   ```bash
   node scripts/github/create-issues.mjs --check      # validates the plan, no network
   node scripts/github/create-issues.mjs --dry-run    # lists what would be created
   GITHUB_TOKEN=<token> node scripts/github/create-issues.mjs --repo <you>/<repo>
   ```
   It takes about two minutes (it pauses between issues to respect GitHub's limits). It is safe to
   re-run: existing issues are recognised and skipped. `--milestone M0` creates one milestone at a
   time if you prefer. If the GitHub CLI is installed and signed in, the token is picked up
   automatically. Delete the token afterwards.
5. Optional: create a GitHub Project (board view) grouped by milestone, and add the issues to it.
