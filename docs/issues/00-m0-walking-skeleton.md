---
milestone: M0 — Walking skeleton
description: >-
  Demo: open the staging address and see the Quart shell in French or English, with a home page
  showing the deployed commit, that the database answered, and when the background tick last ran.
  Every later milestone ships through this pipeline.
---

## M0-01 · Push the scaffold and get CI green
labels: type:chore, area:infra, size:S, good-first-issue
depends: -
spec: AD-060, AD-061, 11.1

**Goal.** The repository exists on GitHub with the scaffold, and every pull request is checked automatically.

**Why this matters.** The three test projects have never been compiled: the scaffold was written in a sandbox that could not reach NuGet. This is the first place they build, so fix whatever the first run finds before anything else lands.

**Tasks**
- [ ] Create the repository as **public** (AD-060: portfolio, and free GitHub Container Registry for public images). Push the scaffold to `main`.
- [ ] Run everything locally once, following the README: `docker compose up -d`, `dotnet test Quart.slnx`, `npm ci && npm test` in `src/web`.
- [ ] Settings → General: allow squash merging only, delete branches after merge.
- [ ] Settings → Code security: Dependabot alerts and security updates on, secret scanning and push protection on.
- [ ] Settings → Rules: protect `main`; require a pull request and the `Backend (.NET)`, `Frontend (React)` and `Container image` checks to pass.
- [ ] Create the labels and milestones, and these issues, with `scripts/github/create-issues.mjs` (see the README).

**Done when**
- [ ] CI is green on `main` and on a test pull request.
- [ ] A pull request with a failing test cannot be merged.
- [ ] Dependabot has opened its first pull requests (close any major-version ones with a link to `docs/decisions/0007`).

## M0-02 · Turn on two-factor for every infrastructure account
labels: type:chore, area:security, payslip-readiness, size:S
depends: -
spec: 11.5, 12.5, 12.7

**Goal.** No single stolen password can reach Presotea's data.

**Tasks**
- [ ] Two-factor (authenticator app or passkey) on GitHub, the Azure account, and Supabase. Store recovery codes offline.
- [ ] Add the registrar and the email provider to this checklist when they are created (M2-01, M6-02), and tick them here.
- [ ] Create an Azure budget of **$1/month** with an email alert at 100% of actual and forecast spend (11.5).
- [ ] Write `docs/runbooks/accounts.md`: which accounts exist, who owns them, where recovery codes live (never the codes themselves).

**Done when**
- [ ] Every account in the runbook shows two-factor enabled.
- [ ] The budget alert exists and a test notification reached your inbox.

## M0-03 · Connect to Postgres and show it on the home page
labels: type:feature, stack:full, area:infra, size:M
depends: M0-01
spec: AD-015, AD-050, AD-028, 10.5

**Goal.** The app talks to Postgres through EF Core, with one schema per module, tested against a real database.

**You will see.** The home page gains a line "Database: connected" (or "unavailable", in the reader's language).

**Backend**
- [ ] Add `Npgsql.EntityFrameworkCore.PostgreSQL` and its NodaTime plugin, `Microsoft.EntityFrameworkCore.Design`, and `Testcontainers.PostgreSql` to `Directory.Packages.props`.
- [ ] Convention, written down in `docs/decisions/0010-persistence-per-module.md`: each module owns one `DbContext` with `HasDefaultSchema("<module>")` and its own migrations history table (`__ef_migrations` in that schema). No foreign keys across schemas (AD-015).
- [ ] First migration: the `jobs` schema with the `scheduled_job` table M0-12 needs (`id, type, workplace_id?, run_at, status, attempts, payload jsonb, locked_until`).
- [ ] Development only: apply pending migrations on startup. Other environments use the explicit step from M0-08.
- [ ] Health check that opens a connection; `/health` and `/api/meta` report it. `/api/meta` returns `database: "ok" | "unavailable"`, never an exception message.

**Frontend**
- [ ] Home page shows the database status with an icon and text (NFR-008), translated.

**Tests**
- [ ] A shared `PostgresFixture` (Testcontainers) used by every database test from now on.
- [ ] Migrations apply cleanly to an empty database; every table lands in its module's schema.
- [ ] `/api/meta` reports `unavailable` when the database is down, and the page still renders.

**Done when**
- [ ] `docker compose up -d` then `dotnet run` shows "Database: connected" locally.
- [ ] CI runs the database tests against a container (GitHub's Ubuntu runners have Docker).

## M0-04 · Structured logging that stays cheap and never logs personal data
labels: type:feature, stack:full, area:infra, size:S
depends: M0-01
spec: 11.5, 12.2, AD-023

**Goal.** When something breaks on staging, the logs say what happened without leaking names or emails, and without an Azure log bill.

**Backend**
- [ ] `Serilog.AspNetCore` with compact JSON to the console (Container Apps collects stdout).
- [ ] Production minimum level `Warning`, plus one summary line per request (method, route template, status, duration). Never request bodies, query strings, emails, names or availability comments; log user and membership IDs only.
- [ ] Every problem-details response carries `traceId`; the same ID appears in the log line.

**Frontend**
- [ ] A root error boundary and the API client show a friendly translated message plus the trace ID, so a screenshot from Philippe is enough to find the log line.

**Tests**
- [ ] An integration test captures log output for a failed sign-in-shaped request containing an email address and asserts the address never appears.

**Done when**
- [ ] A forced exception on staging shows a translated error with a trace ID, and that ID finds exactly one log entry.

## M0-05 · Security headers and a strict Content-Security-Policy
labels: type:feature, stack:full, area:security, payslip-readiness, size:S
depends: M0-01
spec: AD-046, 12.3, 12.7

**Goal.** Every response carries the browser protections the spec requires, before there is any data worth stealing.

**Backend**
- [ ] Middleware adding to every response: `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` turning off camera, microphone and geolocation.
- [ ] `UseForwardedHeaders` for Container Apps ingress (clear `KnownNetworks`/`KnownProxies`, trust `X-Forwarded-Proto`), then `UseHsts` outside Development.
- [ ] Keep a relaxed policy in Development only, because the Vite dev server injects styles.

**Frontend**
- [ ] Confirm the production build has no inline scripts or inline `style="..."` attributes in `index.html`. React's `style={}` prop is fine: it goes through the DOM, which CSP allows.

**Tests**
- [ ] Integration test: the headers are present on `/api/meta`, on `index.html`, and on a 404.

**Done when**
- [ ] The staging site loads with zero CSP violations in the browser console, in Safari and Chrome.

## M0-06 · Generate the TypeScript API client from OpenAPI
labels: type:feature, stack:full, area:infra, size:M
depends: M0-03
spec: AD-021, AD-022, AD-023

**Goal.** A renamed field breaks the frontend build, not production.

**Backend**
- [ ] Built-in `Microsoft.AspNetCore.OpenApi` (`AddOpenApi`/`MapOpenApi` in Development). Build-time document generation with `Microsoft.Extensions.ApiDescription.Server`, written to `src/web/openapi/quart.json`.
- [ ] Document the problem-details shape once, including `code` and `traceId`, and reference it from every endpoint.

**Frontend**
- [ ] `openapi-typescript` generates `src/lib/api/schema.d.ts`; `openapi-fetch` becomes the client. Keep `ApiError` and the translated error-code handling from `client.ts`.
- [ ] `npm run api:generate` script. Replace the hand-written `MetaResponse` type.

**CI**
- [ ] The backend job builds the document; the frontend job regenerates the types and fails on `git diff --exit-code`, so a stale client cannot merge.

**Done when**
- [ ] Renaming a property on `MetaResponse` without regenerating fails CI, and regenerating fixes it.

## M0-07 · Provision staging: Supabase in Montreal, Container Apps in Quebec City
labels: type:chore, area:infra, size:M
depends: M0-02
spec: AD-050, AD-051, 11.2, 12.1

**Goal.** The staging environment exists and is written down, so it can be rebuilt from the runbook alone.

**Tasks** (record every command in `docs/runbooks/staging.md`)
- [ ] Supabase project `quart-staging` in **Canada (Central)**. Use the **session pooler** connection string (IPv4); the direct connection is IPv6-only on the free plan. Confirm both in the dashboard before relying on them.
- [ ] Azure resource group `rg-quart-staging` in **canadaeast**. A Log Analytics workspace with a small daily ingestion cap and 30-day retention, because default logging is the classic surprise bill (10.3).
- [ ] Container Apps environment (Consumption) and container app `quart-staging`: ingress external on port 8080, **min 0 / max 1 replica**, 0.25 vCPU / 0.5 GiB. Connection string stored as a Container App secret, never in GitHub.
- [ ] An Entra app registration with a **federated credential** for this repository's `staging` GitHub environment, and `Contributor` on the resource group only (AD-061).
- [ ] GitHub environment `staging` with `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

**Done when**
- [ ] The container app answers on its `*.azurecontainerapps.io` address with any placeholder image.
- [ ] Azure Cost Management shows $0 after 48 hours.

## M0-08 · Run database migrations as a separate deploy step
labels: type:feature, area:infra, stack:backend, size:S
depends: M0-03, M0-07
spec: 11.3, AD-061

**Goal.** Migrations run once, before the new version takes traffic, and never race inside a starting web server.

**Backend**
- [ ] `Quart.Api` accepts a command: no argument starts the web server; `migrate` applies every module's pending migrations in a fixed order and exits with a non-zero code on failure.
- [ ] A Container Apps **job** `quart-staging-migrate` (manual trigger) runs the same image with the `migrate` argument, so there is no second image to build.
- [ ] `docs/runbooks/migrations.md`: expand, migrate, contract. A column is removed only in the release after the code stopped using it.

**Done when**
- [ ] Running the job against the staging database creates the `jobs` schema, and running it again is a no-op.

## M0-09 · Publish the image and deploy staging on every merge to main
labels: type:feature, area:infra, size:M
depends: M0-06, M0-08
spec: AD-061, AD-060, 11.3

**Goal.** Merging a pull request puts it on staging within minutes, with no stored cloud password.

**Tasks**
- [ ] Workflow `deploy-staging.yml`, triggered when CI succeeds on `main`: build and push `ghcr.io/<owner>/quart:<sha>` and `:staging`, passing `VERSION=<sha>`.
- [ ] After the first push, set the package's visibility to **public** in GitHub (packages start private). Otherwise Azure cannot pull it.
- [ ] `azure/login` with OIDC; start the migrate job with the new image and wait for success; then `az containerapp update --image ...:<sha>`.
- [ ] Smoke test: poll `/health` until healthy, then check that `/api/meta` reports the new version. Fail the workflow otherwise.
- [ ] Remove the "build only" comment from `ci.yml`.

**You will see.** The staging home page shows the merged commit's SHA.

**Done when**
- [ ] Two consecutive merges each appear on staging automatically.
- [ ] A migration that fails stops the deploy before the app is updated.

## M0-10 · App shell: bottom tabs on phones, sidebar on wider screens
labels: type:feature, stack:frontend, area:ui, area:a11y, size:M
depends: M0-01
spec: NFR-001, NFR-002, NFR-003, NFR-007, NFR-009, NFR-011, NFR-016, NFR-017, 19

**Goal.** The frame every screen lives in, built to match `docs/prototype/quart-design-prototype.html`. Open that prototype first; spec section 19 and `docs/design/README.md` are its written form, and the tokens are already in `src/web/src/styles/index.css`.

**You will see.** The top row (logo blob, settings circle for admins, initials avatar) and the floating white tab bar from the design prototype: Home, Schedule, Availability, Requests and News, each opening a translated placeholder page with an empty state.

**Frontend**
- [ ] Layout route in React Router: top row, content area, the floating tab-bar pill on phones (never more than five tabs, selected tab filled with `primary`, counts in an `accent` badge), sidebar from the `md` breakpoint up.
- [ ] Tokens only: no literal colour, radius or shadow anywhere (AD-048, NFR-017).
- [ ] The desktop layout and dark mode are extrapolations from a phone-sized, light-only prototype (19.7). Screenshot both and review them with Philippe; that is Q-14.
- [ ] Safe-area insets for the iPhone notch and home indicator; the bottom bar never covers content.
- [ ] `aria-current="page"` on the active tab, a skip-to-content link, visible focus rings, 44×44 px targets.
- [ ] Light and dark follow the device (tokens already in `styles/index.css`).

**Tests**
- [ ] Component tests: the active tab follows the route; the tab bar never renders more than five items.

**Done when**
- [ ] Usable on an iPhone in Safari, on an iPad, and on desktop, by tapping and by keyboard alone.
- [ ] Side by side with the design prototype at 390 px, the shell reads as the same app.

## M0-11 · Base UI kit on Radix, with a gallery page
labels: type:feature, stack:frontend, area:ui, area:a11y, size:M
depends: M0-10
spec: AD-038, AD-048, NFR-007, NFR-008, NFR-009, NFR-010, NFR-017, 19

**Goal.** Accessible building blocks, so feature issues never hand-roll a dialog again.

**Frontend**
- [ ] Components in `src/ui/`, each matching its counterpart in the design prototype: Button (dark solid, white, danger, loading — all pill-shaped on a 3 px hard shadow), TextField and PasswordField with error text wired to `aria-describedby`, Select, Switch (pill track, white knob), Stepper (circular +/−), Card, HeroCard, Dialog, bottom **Sheet** (the main way detail opens), Toast (dark pill at the top), StatusChip (soft background, strong text, always a word or symbol), Badge, EmptyState, Skeleton.
- [ ] The Sheet is the workhorse: 36 px top corners, up to 86% height, dimmed backdrop, 0.28 s slide. The shift panel, publish confirmation and settings all reuse it.
- [ ] Built on Radix primitives (the `radix-ui` package) for focus trapping and keyboard behaviour.
- [ ] Motion only through tokens, switched off under `prefers-reduced-motion`.
- [ ] `/dev/ui` gallery route, included only in development builds and on staging (`VITE_SHOW_DEV_PAGES`).

**Tests**
- [ ] Dialog traps focus and returns it to the trigger on close; Escape closes it.
- [ ] An automated accessibility check (axe-core) runs over the gallery in the test suite with zero violations.

**Done when**
- [ ] Every component is shown in the gallery in light and dark, in both languages.
- [ ] Nothing in `src/ui/` contains a literal colour, radius or shadow.

## M0-12 · Background jobs: a short-lived tick job every 5 minutes
labels: type:feature, stack:full, area:infra, size:M
depends: M0-09
spec: AD-029, 11.2

**Goal.** Reliable scheduled work (reminders, expiries, retries, retention) without waking the web app.

**Why a job, not an HTTP call.** Container Apps waits 300 seconds after the last request before scaling to zero. An HTTP tick every 5 minutes would keep the app awake permanently and use up the free grant. A job that runs the same image for a few seconds costs almost nothing and leaves the app asleep. Recorded in `docs/decisions/0009`.

**Backend**
- [ ] `Quart.Api tick` command: claims due rows from `jobs.scheduled_job` with `FOR UPDATE SKIP LOCKED`, runs each handler, records attempts, and backs off on failure. Handlers must be idempotent: a job run twice changes nothing the second time.
- [ ] `IJobScheduler` contract in `Quart.SharedKernel`, so any module can schedule work without referencing the Jobs module.
- [ ] A `heartbeat` handler that records the last tick time. `/api/meta` returns `lastTickAt`.
- [ ] Development only: `POST /internal/tick` runs one tick on demand.
- [ ] Container Apps job `quart-staging-tick`, cron `*/5 * * * *`, same image, argument `tick`. Add it to the staging runbook and the deploy workflow (it must use the new image too).

**Frontend**
- [ ] Home page: "Last background run: 3 minutes ago", using the locale's relative time format.

**Tests**
- [ ] Two ticks racing on the same due job run it exactly once.
- [ ] A failing handler is retried with backoff and does not block other jobs.

**Done when**
- [ ] Staging shows a last-run time under 5 minutes old, while the web app's replica count still drops to zero when nobody is using it.

## M0-13 · The cup mascot and the empty states it lives in
labels: type:feature, stack:frontend, area:ui, area:a11y, size:S
depends: M0-11
spec: NFR-008, NFR-010, NFR-017, 19

**Goal.** The one piece of illustration in the product, and the reason the app looks like a bubble tea shop rather than a scheduling tool.

**You will see.** A bubble tea cup on the next-shift card, on empty states and on the generate and publish sheets. Lime for openings, lavender for closings, milk-tea brown when a publish is blocked.

**Frontend**
- [ ] `Cup` component in `src/ui/`, drawn in CSS exactly as in the design prototype (no image files, so it scales and themes for free): props `flavour` (token colour) and `mood` (`happy`, `sleepy`, `wow`).
- [ ] `aria-hidden`, because it is decoration. Whatever the cup implies is always written in words beside it (NFR-008).
- [ ] Empty states for each tab pair the cup with one sentence and, where useful, one action.
- [ ] It does not animate (19.5).

**Tests**
- [ ] Renders at several sizes without distortion; carries no accessible name.

**Done when**
- [ ] Placing it next to the design prototype at the same size, the two cups match.
