# Quart: plan for the remaining work

Written 2026-11-17, after pull requests #153 and #159; security rules added the same day after a security review. Updated the same day with Hoang's answers (section 6) and a new order: everything that can be built without a domain first, going live last (phase 6). It is a build plan for a coding agent (Claude
Opus) working in this repository, with Hoang reviewing and merging.

**How to read it.** Sections 1 to 3 are rules and method: read them once, fully, before the first
task. Section 1.6 holds the security rules; they apply to every task. Section 4 is the order of work. Section 5 has one entry per feature. Section 6 lists what Hoang
must decide or buy, so you never wait in the middle of a task. Section 7 is what is deliberately left
out.

This plan does not repeat the acceptance criteria. Each feature has a plan ID (for example `M8-06`);
its checklist is in `docs/issues/<milestone>.md` and on the GitHub issue. **The spec and the issue
decide what "done" means. This file decides order, shape and where the traps are.** Where this file
says "check", it means the author did not open that file: look before you rely on it.

---

## 1. Ground rules

They come from `CLAUDE.md` and from what went wrong during the first two pull requests.

### 1.1 Sources of truth, in order

1. `docs/quart-project-spec.txt`: requirements with IDs (FR-, BR-, AD-, NFR-). Cite them in commits and PRs.
2. `docs/issues/*.md` and the GitHub issue: the checklist for one plan ID.
3. `docs/design/mockups/README.md` and `docs/design/mockups/screens/*.png`: layout. Open the image
   before building or changing a screen. If a screen is not drawn, reuse the nearest pattern and say
   so in the PR. If a mockup and the spec disagree and the case is not in the "Known conflicts"
   table, **stop and ask Hoang**.
4. `docs/decisions/*.md`: architecture decisions. Add one (copy `0000-template.md`) when you make a
   choice a later reader would otherwise have to guess (a library, a storage layout, a protocol).

Changing a requirement: edit the spec in place, append to its decision log (section 17, dated
entries, newest last), change the plan file in `docs/issues`, then update the GitHub issue.

### 1.2 Architecture you must keep

- Modular monolith (`docs/decisions/0002`, `0011`). Modules: Identity, Workplaces, Notifications,
  Scheduling, Marketplace, Jobs, plus empty shells for Announcements and Files. Each module has its
  own Postgres schema, its own `DbContext` and its own migrations.
- **Modules never read each other's tables or types.** They talk through the interfaces in
  `src/backend/Quart.SharedKernel`: `IWorkplaceDirectory`, `IWorkplaceAccess`, `IUserDirectory`,
  `INotifier`, `IEmailOutbox`, `IScheduleLedger`, `IJobScheduler` / `IJobHandler`,
  `IMemberLeftHandler`. `tests/Quart.ArchitectureTests` fails the build if you break this. If a
  feature needs data from another module, add a method to one of these interfaces (or a new small
  interface in SharedKernel) and implement it in the owning module.
- `Quart.Generator` is a pure library: no database, no clock, no I/O. `DraftBuilder` is the only
  place that turns database rows into generator input, and the only caller of the evaluator.
- Endpoints are minimal-API static methods grouped per feature (see `MarketplaceEndpoints.cs` as the
  model). Every route under `/api/workplaces/{workplaceId}` must carry `.RequirePermission(...)` or
  `.AllowAnyMember()`; a test walks all routes and fails on an unguarded one.
- Errors are `Problems.*` with a stable `code` string (`"module.snake_case"`). Every new code needs:
  the constant on the endpoint class, a key in `src/web/src/i18n/errors.ts`, and a string in
  `en.json` and `fr.json`.
- Time: NodaTime everywhere, `IClock` injected, never `DateTime.Now`. Shifts store local date and
  time plus the instants `StartsAt` / `EndsAt` (AD-028).
- Background work is a job row run by the tick every 5 minutes (`docs/runbooks/background-jobs.md`).
  There is no always-on worker and no live connection to browsers (AD-031, decision 0005). A handler
  can run twice: make it safe to repeat.
- Web: React 19, TanStack Query, `openapi-fetch` with generated types. Never hand-write an API type.
  Colours, radius and shadows come from tokens in `src/web/src/styles/index.css`; never hard-code one.
  Every string in `en.json` and `fr.json`. Phone width 390 px first, then check 1280 px. Taps only:
  drag and swipe may exist as shortcuts next to a tap path (NFR-002).

### 1.3 Commands

Backend (from the repo root; Postgres 16 must be running, tests create their own databases):

```bash
export QUART_TEST_POSTGRES="Host=localhost;Port=5432;Database=postgres;Username=quart;Password=quart_dev"
CI=true dotnet build Quart.slnx --configuration Release        # warnings are errors
dotnet test Quart.slnx --configuration Release --no-build --filter "Category!=Performance"
dotnet test tests/Quart.Api.Tests --no-build --filter "FullyQualifiedName~MarketplaceTests"   # one class
```

Frontend (from `src/web`):

```bash
npm run api:generate     # after ANY change to an endpoint or a record it returns
npm run typecheck && npm run lint && npm run format:check && npm run i18n:check
npm test                 # vitest
npm run build && npm run csp:check
```

Building the API rewrites `src/web/openapi/quart.json`. Commit it together with
`src/web/src/lib/api/schema.d.ts`; CI fails if either is stale.

New migration (one per module that changed):

```bash
dotnet ef migrations add <Name> --project src/backend/Modules/Quart.Modules.<Module> \
  --context <Module>Db -o Persistence/Migrations
```

Read `docs/runbooks/migrations.md` first: the old version keeps serving while the migration runs, so
every migration must work with the previous code (expand, migrate, contract). A new module must be
added to `src/backend/Quart.Api/Migrations/DatabaseMigrations.cs` and to
`tests/Quart.Api.Tests/MigrationTests.cs`.

Run the app locally: `scripts/dev/start.sh`, then `node scripts/dev/seed.mjs` for the demo Presotea
(`docs/runbooks/local.md`). Emails land in Mailpit at `http://localhost:8025`.

### 1.4 Traps already hit (do not repeat them)

| Trap | What to do |
| --- | --- |
| EF Core: a new child row with its key already set, added to the **collection of a parent that was read from the database**, is saved as an UPDATE and fails. This broke availability notes and the second save of Edit Generator. | Add children through their own `DbSet` with the foreign key set (`db.ShiftBlockRequirements.Add(...)`), never through `parent.Children.Add(...)` on a tracked parent. |
| Unique or exclusion violations surfacing as HTTP 500 on a double tap | Catch `DbUpdateException` with `PostgresException { SqlState: UniqueViolation / ExclusionViolation }` and return a `Problems.Conflict(code)`. |
| `NodaTime.Period` clashes with the `Period` entity | `using Period = Persistence.Period;` |
| A request body type in TypeScript wants every nullable field | Send `null` explicitly for fields you do not change. |
| ESLint `react-refresh/only-export-components` | A file exports components **or** helpers, not both. Put hooks and helpers in `data.ts` / `*.ts`. |
| A sheet's content is rendered elsewhere in the page, but React still bubbles its events to the component that opened it | Guard handlers on a parent with `target.closest('[role="dialog"]')` (see `lib/gestures.ts`). |
| Text fields smaller than 16 px make iOS zoom the page | Use the `TextField` / `Select` components; do not shrink inputs. |
| `gh pr create` and other GraphQL calls may be blocked in the sandbox | Use REST: `gh api repos/HoangVuLuu/Quart/pulls --input -` with a JSON body built by `jq`. |
| Rate limits (429) while seeding or testing by hand | Development allows 300 per minute (`appsettings.Development.json`); tests override per case. |
| Rules of a period are a copy (`Period.Rules`, `PeriodConflict`) | They are refreshed from the template at Start and Generate **only while the period is unpublished** (FR-068). Shifts themselves are copied once, when the period opens. |
| Staff must never see a draft (AD-012) | Staff endpoints read `IsDraft == false` rows only. Anything that changes the published schedule from outside Scheduling goes through `IScheduleLedger`, which also keeps the admin's draft in step. |
| Personal data in logs (decision 0012) | Log IDs only: no names, emails, URLs or bodies. |
| Signing up again with an unconfirmed address used to keep the **first** person's password, so a stranger could pre-register someone's email | Each verification link carries its own attempt's password (`AccountLink.PendingPasswordHash`). Keep this when touching sign-up, email change or Google sign-in. |
| One-time links stayed readable in the email outbox after sending | `EmailOutbox.SendAsync` empties the parameters once sent. Do not add a second place that stores a raw token. |
| Tests run on `TestServer`, which ignores Kestrel limits | A limit that must hold is also enforced in middleware (see the body-size check in `SecurityHeaders.cs`), and tested. |

### 1.5 Commit and pull-request format

- Branch from up-to-date `main`: `claude/<plan-id>-<short-name>`, for example `claude/m8-06-web-push`.
- One plan ID per PR where possible. Under about 800 changed lines excluding generated files
  (`schema.d.ts`, `quart.json`, migrations' `Designer.cs`). If a feature is bigger, split it by the
  slices given in section 5.
- Commit subject: what changed and the IDs, for example
  `Web push: subscribe, send on notify, prune dead subscriptions (FR-212, M8-06)`.
- PR body: what the user will see, mockup screen IDs used, what was not done and why, how it was
  checked, the "Security" answers from section 1.6, and `Closes #<issue>` on its own line **only when every box of the issue is done**. If
  part remains, write `Part of #<issue>` and list what is left, so the issue stays open.
- Follow the attribution lines your session gives you for commits and PR descriptions.

### 1.6 Security rules

Staff trust this app with their name, email, schedule and notes to their manager. These rules apply
to **every** task. Section 5 adds notes for the features where a mistake would hurt most. If a rule
here and a convenience disagree, the rule wins; if a rule and the spec disagree, stop and ask.

**Who may do what**

- Every route under `/api/workplaces/{workplaceId}` has `.RequirePermission(...)` or
  `.AllowAnyMember()`. Every other route that needs a signed-in person has `.RequireUser()`. A route
  with none of these is public: there must be a comment saying why.
- The guard proves the caller belongs to the workplace in the URL. It does **not** prove that an ID in
  the body or the path (a shift, a period, a membership, a claim, a trade, a file) belongs to that
  workplace. Every query that loads something by ID also filters by `WorkplaceId` (or by the period
  that was itself loaded with it). Write the test: the same call from a member of **another**
  workplace answers 404, never 403 and never the data.
- "Mine" means the caller's `MembershipId` from `http.Member()`, never an ID the client sent.
- A person who lacks the permission gets the same answer as if the thing did not exist, when knowing
  it exists is itself information (drafts, other people's trades and notes).
- Staff never receive: drafts, other people's availability or notes, other people's hours wanted,
  emails of people outside their workplace, another workplace's name or times (FR-094).

**Accounts, sessions and secrets**

- Passwords only through `UserManager` and `AccountRules` (length limits, breached-password check).
  Never log, email or return a password or a hash.
- A one-time link or code (verify, reset, invitation, email change, calendar feed, second-factor
  step): 32 random bytes from `RandomNumberGenerator`, **only its SHA-256 stored**, single use, an
  expiry, retired when a sibling is used. Follow `AccountLink` in `AccountEndpoints.cs`.
- Never say whether an email has an account. Sign-up, forgot-password and resend answer the same for
  known and unknown addresses, and take the same time (see the dummy hash in `SignInAsync`).
- Anything that changes how someone signs in (password, email, second factor, Google link) ends their
  other sessions and sends a notice to the address on file **before** the change.
- Nothing unconfirmed is trusted: an email address proves nothing until its link was opened; a Google
  account links to an existing account only when both sides are verified (task 4.4).
- Session keys are stored hashed (`SessionTicketStore`). Keep it that way for any new token table.
- Secrets (SMTP password, VAPID private key, Google client secret, connection strings) come from
  configuration, set as Container Apps secrets or GitHub secrets. Never in the repository, never in
  `appsettings*.json`, never in a log, a test snapshot or a PR description. If one is committed by
  mistake, say so at once: it must be rotated, not just deleted.

**Input and output**

- Validate on the server, with a length limit on every string and a range on every number, and
  answer with a field error code. The browser's validation is for comfort only.
- Database access through EF Core LINQ. Raw SQL only with parameters (`FromSql($"... {value}")`,
  never string concatenation), as in `LockShiftsAsync`.
- The web app renders text through React only: no `dangerouslySetInnerHTML`, no `innerHTML`, no
  `eval`, no inline `<script>` or `style=""` in HTML (the CSP forbids them and `npm run csp:check`
  fails). A link built from user data uses an allowlist of hosts and `rel="noopener noreferrer"`.
- Emails are plain text built from fixed templates. User-typed text (names, notes, post bodies) is
  never put in a subject line and never in a URL. No tracking pixels.
- Never redirect to a URL taken from the request. After sign-in, return to a path the app itself
  remembered, and only if it starts with a single `/`.
- Files (task 5.1): check the type by reading the bytes, re-encode images, cap the size, store under a
  random name, serve only through short-lived signed links after a permission check, with
  `Content-Disposition: attachment` for anything that is not a re-encoded image.
- The request size limit is 256 KB (`SecurityHeaders.MaxRequestBodyBytes`). Raise it on the upload
  routes only, never globally.

**Abuse**

- A public or guessable endpoint gets a rate limit (`RequireRateLimiting`, as on `/api/auth` and the
  join code). Anything that sends an email or a push on request is throttled **per recipient**, not
  only per address (see `LinkEmailInterval`).
- Rate limits live in memory, which is correct only while the app runs **one** replica. If production
  ever runs more, move them to the database first.
- Lists are bounded: a maximum page size, a maximum count per parent (notes per period, blocks per
  template). An endpoint that does heavy work (generate) is behind a permission.

**Browser**

- State changes are never done by GET. Every non-GET request needs the antiforgery header; the API
  client adds it. Do not add an exception.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`. Nothing sensitive in `localStorage` (today: theme,
  language, last workplace ID, install-card dismissal). The service worker caches only the allowlist
  and clears it on sign-out (task 2.1).
- Do not loosen the Content-Security-Policy in `SecurityHeaders.cs`. If a library needs an inline
  script, a remote font or `unsafe-eval`, choose another library. A new outside host in `connect-src`
  or `img-src` needs a decision record.
- No third-party scripts, analytics, fonts or embeds: everything is served from our own origin.

**Data and logs**

- Logs hold IDs only (decision 0012): no names, emails, tokens, request bodies or query strings.
- Collect the least that works. A new personal field needs a line in the privacy page and
  a retention rule (task 1.7) in the same PR. The privacy page comes late (task 6.2): until it exists,
  add the line to the list in `docs/legal/privacy-items.md` (create it if missing) so 6.2 picks it up.
- Deleting is real: when a person leaves or deletes their account, their future data goes and their
  past data loses their name (FR-009).

**Dependencies and CI**

- CI fails on a NuGet package with a known vulnerability and on a shipped npm package with a high
  one. Fix by updating; never by removing the check.
- Before adding a library: is it needed, is it maintained (a release in the last year), what is its
  licence, how many packages does it pull in? Record the choice (decision 0007 shows how). Prefer
  the framework's own features for cryptography; never write your own.
- GitHub workflows keep `permissions:` minimal and read secrets only in the job that needs them. A
  workflow triggered by a pull request must not have access to deploy secrets.

**For every pull request**, answer these in the description under a "Security" heading (one line
each; "not applicable" is a fine answer when true):

1. New or changed routes, and the guard on each.
2. IDs taken from the client, and where each is checked against the workplace.
3. New personal data stored, who can read it, and when it is deleted.
4. New tokens or secrets, and how they are stored.
5. Anything that sends email or push, and what stops it being used to flood someone.
6. The test that proves a stranger and a member of another workplace are refused.

**Known gaps, accepted for now** (do not "fix" in passing; each needs a decision):

- Five wrong passwords lock an account for 15 minutes (FR-007). Someone who knows an email can keep
  it locked. Two-factor (4.2) and a per-address limit reduce the value of guessing; a softer lockout
  is a product decision.
- The lockout answer reveals that the account exists, after five tries.
- Cookies do not use the `__Host-` prefix. Add it together with the custom domain (6.3), since it
  signs everyone out.
- The antiforgery token is a double-submit cookie, not bound to the session. Safe while no other
  site shares the domain; revisit if a subdomain ever hosts something else.
- `/api/meta` is public and shows the version and whether the database is up.

---

## 2. Working method for one task

Do these in order. Do not skip the reading steps; they are what keeps the work short.

1. **Read**: the issue file section for the plan ID, the spec lines it cites (search the ID in
   `docs/quart-project-spec.txt`), the mockup rows in `docs/design/mockups/README.md`, then the image.
2. **Find the neighbour**: open the closest existing feature and copy its shape. Good models:
   - a guarded CRUD-like feature with notifications: `Quart.Modules.Marketplace/MarketplaceEndpoints.cs`
   - a feature with a state machine and checks: `Scheduling/Drafts/DraftEndpoints.cs`
   - a job: the handler described in `docs/runbooks/background-jobs.md`
   - a page with a sheet and optimistic refresh: `src/web/src/features/schedule/DraftEditor.tsx`
   - a settings page: `src/web/src/features/profile/ProfilePage.tsx`
   - API tests: `tests/Quart.Api.Tests/MarketplaceTests.cs` with `Team.cs` and `TestApp.cs`
   - web tests: `src/web/src/features/schedule/core-loop.test.tsx` with `src/web/src/test/app.tsx`
3. **Write the API test first** for the main path and for each refusal (wrong person, wrong state,
   too late). Tests read like sentences: `A_trade_that_went_stale_is_rejected_instead_of_applied`.
4. **Backend**: entity and migration, endpoint, notification types, job if needed. Build. Run the
   one test class.
5. **Regenerate types**, then the web: data hooks in `features/<name>/data.ts`, page, strings in both
   languages, a web test for the main path.
6. **Look at it**: run the app, open the page at 390 px in English and French, light and dark, then
   at 1280 px. Compare with the mockup image side by side.
7. **Security pass**: go through the six questions at the end of section 1.6 and write the answers
   for the PR. If a question has no good answer, fix the code before pushing.
8. **Full checks** (section 1.3), all green locally, before pushing.
9. **Docs**: spec decision log if a requirement moved; runbook if an operator must do something;
   `docs/runbooks/local.md` if the way to try it locally changed.
10. **PR**, then wait for the CI jobs (Backend, Frontend, Container image). Fix red CI before
   starting the next task.

To spend few tokens: read with `grep -n` and line ranges instead of whole files; run one test class
while iterating and the full suite once at the end; never paste generated files into the
conversation; do not re-read a file you just edited.

When to stop and ask Hoang: a mockup and the spec disagree and the case is not listed; a decision in
section 6 is still open and the task depends on it; a change would delete or rewrite real data; a
secret or a paid account is needed.

---

## 3. What exists today (baseline)

Built and tested: accounts (sign up, verify email, sign in, reset, sessions, lockout, rate limits),
workplaces (create, owner invitation, join code, members, levels, hours wanted, staff editing their
own hours), Edit Generator (shifts, level requirements, cannot-work-together pairs, fairness, shifts
in a row), periods and availability (send, notes, reopen, manual remind), draft building (generate,
keep, add and remove by hand, issues with block / confirm / show), publishing and updating with
versions, published schedule for staff, periods published ahead of time, give away, claim, trade with
optional approval, in-app notifications, installable web app (manifest and icons, no service worker),
French and English, dark mode, swipe shortcuts, and a browser test of the whole core loop in
Chromium and WebKit, run in CI (task 0.1, #162).

Not built: everything in section 5.

Numbers at the time of writing: 130 API tests, 145 generator tests, 4 architecture tests, 173 web
tests. Keep them green; add to them with every feature.

---

## 4. Order of work

Each line is one pull request unless it says otherwise. "Needs" means a decision or an account from
section 6. Do phases in order; inside a phase the order is a suggestion.

Hoang's rule (2026-11-17): build and test every feature first, locally and on staging; go live last.
Nothing in phases 1 to 5 needs the domain. Emails are built and checked in Mailpit; files go to a
local folder in Development. Only phase 6 needs the domain and production.

### Phase 0: safety net (done)

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 0.1 | M6-09 (part) | Playwright end-to-end test of the core loop, run in CI. **Done in #162.** | nothing |

### Phase 1: core features staff need

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 1.1 | review items | Three review fixes: "works shifts" off with future shifts (refuse); version on leave; open-period shift edits note. **Done in #165.** | nothing (D1 answered) |
| 1.2 | M5-05, FR-211 | Notification emails, built and checked in Mailpit. **Done in #166.** | nothing (real provider in 6.1) |
| 1.3 | M2-07 | Change password while signed in; change email. **Done in #167.** | nothing |
| 1.4 | M4-05 | Availability request with a deadline and automatic reminders; request N days before (Edit Generator). **Done in #168.** | nothing |
| 1.5 | M5-11 | Same person in two workplaces. **Done in #170.** | nothing |
| 1.6 | M2-16 | Delete my account. **Done in #170** (step-up waits for 4.1). | nothing (D3 answered) |
| 1.7 | M6-05 | Retention: nightly deletion. **Done in #170.** | nothing (D3 answered) |

### Phase 2: phone experience

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 2.1 | M8-05 | Service worker: instant opening, offline "My shifts". **Done in #171.** | nothing (tried on staging) |
| 2.2 | M8-06 | Web push with the iPhone install guide | nothing (tried on staging) |
| 2.3 | M8-07 | Notification preferences and bundling | nothing |

### Phase 3: scheduling extras

The agreed details and mockups for this phase (2026-11-23) are in
`docs/plans/phase-3.md` and the design canvas linked from it. They override the notes in
section 5 where the two differ (for example 3.1 has two pages, Editing Shift and Editing day).

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 3.1 | M4-01 | Edit one period's shifts (closure, longer hours) | nothing |
| 3.2 | M4-08 | ~~Template changes reach an open period (FR-069)~~ **Dropped by Hoang on 2026-11-23**: Edit Generator never changes an open period. | n/a |
| 3.3 | M5-08 | Reuse a past schedule | nothing |
| 3.4 | M3-04 | Rename a shift | nothing |
| 3.5 | M7-05, M7-08 | Unclaimed give-away alert (fixed at 36 hours, no setting, Hoang 2026-11-23); tell both people when a trade expires | nothing |

### Phase 4: accounts and team extras

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 4.1 | M2-06 | Step-up: confirm the password before sensitive actions | nothing |
| 4.2 | M2-08 | Two-factor authentication | nothing |
| 4.3 | M2-13 | Admins, permission grants, ownership transfer | nothing |
| 4.4 | M2-17 | Sign in with Google (Google's app verification waits for 6.3) | D6 |
| 4.5 | M2-18 | Social links on the team page | nothing |

### Phase 5: later milestones

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 5.1 | M8-02 | Stored files (needed by photos and payslips) | nothing (local folder now; production storage in 6.3) |
| 5.2 | M8-01, M8-03, M8-04 | News: posts, photos, thumbs-up (3 PRs) | nothing |
| 5.3 | M9-03 | Calendar feed of my shifts | nothing |
| 5.4 | M9-01, M9-02, M9-04 | Google Calendar free/busy import; app verification waits for 6.3 | D6 |
| 5.5 | M3-05 | Drag to create shifts on a desktop calendar | nothing |
| 5.6 | BL-01 | Time-off requests. **Not now: after the pilot (D7).** | D7 |
| 5.7 | BL-02 | Payslips. **Not now: after the pilot (D7).** | D7 |

### Phase 6: go live (last)

Start only when Hoang says the app is ready. Staff must install the app from the final address,
never from staging: an installed app and its push subscriptions are tied to the web address.

| # | Plan ID | Work | Needs |
| --- | --- | --- | --- |
| 6.1 | M2-01, M6-02 (part) | Turn on real email: Amazon SES account, domain records, settings | D5 (domain) |
| 6.2 | M6-03, M6-04 | Privacy policy page, data arrangement, incident runbook | D4 |
| 6.3 | M6-01, M6-02 | Production environment, release deploys, custom domain | D5 |
| 6.4 | M6-08 | Encrypted nightly backup | D5 |

---

## 5. Features

Each entry: what it is, the shape of the solution, the traps, and how to check it. "Size" is S (under
300 lines), M (300 to 800), L (more: split as shown).

### 0.1 End-to-end test of the core loop (M6-09, part). Size M

**Why first.** Every later task changes flows that only unit and API tests cover today. One browser
test of the whole loop catches the breakages that those miss (the Edit Generator double-save bug was
one).

**Shape.**
- New folder `tests/e2e` (check that no such folder exists) with `@playwright/test`. Projects:
  Chromium at 390x844 with touch, and WebKit at the same size (the issue asks for Safari's engine).
- The test starts from an empty database: the API in Development with `migrate`, Mailpit for emails,
  the built web app served by Vite preview. Reuse `scripts/dev/start.sh` if it can run headless;
  otherwise add `scripts/dev/e2e.sh`.
- One spec, written as the walkthrough in `docs/runbooks/local.md`: platform admin creates the
  workplace, owner accepts the invitation (read the link from Mailpit's HTTP API), two staff sign up,
  verify and join with the code, owner creates two shifts in Edit Generator **and saves twice**,
  opens a period, staff send availability, owner generates, publishes with confirmation, staff sees
  "My shifts", staff gives a shift away, the other claims it, owner updates the schedule.
- Use roles and visible text as selectors (`getByRole`, `getByLabel`). Add no test IDs unless a
  control has no accessible name; in that case fix the accessible name instead.
- CI: a fourth job in `.github/workflows/ci.yml` with a `postgres:16` service. Upload the Playwright
  trace on failure.

**Traps.** Rate limits: run the API with the Development limits. The breached-password check calls
an outside service: stub it in the same way the API tests do (see `PwnedPasswordsStub` in
`tests/Quart.Api.Tests/TestApp.cs`), behind a Development-only setting; do not call the real service
from CI. Flaky waits: wait for text, never for a fixed time.

**Done when** the job is green in CI in both engines in under 5 minutes. Leave issue #83 open if the
accessibility or real-device parts of it remain.

### 1.1 Three review fixes. Size S each, one PR

1. **"Works shifts" turned off while the person holds future shifts.** Today the shifts stay but the
   person vanishes from the evaluator and the draft tools (`DraftBuilder.LoadAsync` keeps only
   `WorksShifts` members). Decided (D1): **refuse the switch** with a conflict code
   such as `workplace.has_upcoming_shifts`, and tell the admin to remove the shifts first. Workplaces
   must not read Scheduling tables: add `Task<bool> HasUpcomingAsync(Guid workplaceId, Guid
   membershipId, ...)` to `IScheduleLedger` (count draft and published assignments with
   `StartsAt > now`) and call it from `UpdateMemberAsync` in `WorkplaceEndpoints.cs` when
   `worksShifts` goes from true to false. Web: show the message in the team sheet and on Profile.
2. **A member leaves: save a schedule version.** `ReleaseShiftsOnLeave` in
   `Scheduling/Published/PublishedSchedule.cs` deletes assignments without a version. After the
   delete, for each affected published period, add a `ScheduleVersion` the same way
   `ScheduleLedger.BumpAsync` does (move that method somewhere both can call). Test: version goes up
   by one and the snapshot no longer has the person.
3. **Shift edits and open periods.** Nothing to code: 3.2 is planned (D1). Keep the note on the Edit
   Generator page as it is until then.

### 1.2 Notification emails (M5-05, FR-211). Size M

**What exists.** `IEmailOutbox.EnqueueAsync(EmailRequest(To, Template, Language, Parameters))`,
an outbox table in the Notifications module, templates for verification and reset, SMTP settings in
`EmailOptions` (`Email:SmtpHost`, `Port`, `User`, `Password`, `UseTls`, `From`, `PublicUrl`).
Staging has none of these set, so no email leaves staging today.

**Shape.**
- Provider (D2, decided): Amazon SES in Montreal. **Not in this task.** There is no domain yet, so
  every email here is built and checked in Mailpit; the code speaks SMTP, so 6.1 connects SES with
  settings only. Do not add `Email__*` secrets to staging here.
- Notification emails (FR-211; check the exact wording in the spec): when `INotifier.NotifyAsync`
  stores a notification of a type that deserves an email, also enqueue an email for the recipient.
  Start with: schedule published, schedule changed, availability requested, availability reminder,
  claim approved or declined, trade requested, trade applied or rejected. Put the list in one place
  (a set of types in the Notifications module) so 2.3 can turn it into preferences.
- Templates: one generic layout with a subject and two or three lines built from the same parameters
  the in-app text uses, plus a button to `Email:PublicUrl` + the relevant path. Both languages; the
  language is the recipient's (`WorkplaceMember.Language`). Reuse the wording of
  `src/web/src/features/alerts/notification-text.ts` and keep the two in step by a test that every
  email type has both languages.
- Outbox delivery: check how it retries today. It must back off, give up after a number of tries, and
  never send twice (mark sent in the same transaction as the provider accepted it; a repeat after a
  crash is acceptable, a loop is not).

**Traps.** Never put names of other people's shifts or notes in an email subject. No tracking pixels
or link rewriting (turn the provider's tracking off). `From` must be on the domain that has DKIM.
Emails to an unverified address: only the verification email.

**Check.** API test with `CapturedEmails` (in `TestApp.cs`): publishing sends one email per member in
their language. By hand: Mailpit shows them.

### 1.3 Change password while signed in; change email (M2-07). Size M

- `POST /api/me/password` with current and new password: verify the current one, run the same rules
  as sign-up (`AccountRules.cs`, breached-password check included), update, **end every other
  session** of the user, keep this one, send a "your password was changed" email.
- Email change in two steps: `POST /api/me/email` (new address, current password) stores a pending
  change and sends a link to the **new** address; `POST /api/me/email/confirm` with the token swaps
  it, ends other sessions, and emails the **old** address a notice. The token is single use and
  expires (reuse the lifetime and storage pattern of the verification token). If the new address
  already has an account, answer the same as success and send nothing, so addresses cannot be probed.
- Web: Profile, account section, as in mockup `1g` ("Change password" row; the email row opens a
  sheet). Both forms show field errors from the API codes.
- When 4.1 (step-up) lands, replace "current password in the body" by the step-up guard.

**Security.** Both changes need the current password, end the other sessions and notify the old
address. The email-change link follows the one-time link rules of section 1.6 and is retired if the person
asks again. Never reveal whether the new address already has an account.

### 1.4 Availability request, deadline and reminders (M4-05). Size M

- `Period` gains `AvailabilityDueAt` (instant, nullable). The create-period request takes an optional
  deadline (local date and time in the workplace's zone); validate it is in the future and before the
  period starts.
- When a period opens, schedule jobs with `IJobScheduler`: one reminder at each offset the issue
  lists (check the issue; for example 48 h and 24 h before the deadline). Job type
  `scheduling.availability_reminder`, payload `{ periodId, kind }`. The handler notifies only people
  who work shifts and have not sent, and does nothing if the period is locked or gone. Use a
  deduplication key per period and kind so opening twice cannot double them (see how `JobRequest`
  expresses that; `ScheduleAsync` returns `false` when the job already exists).
- At the deadline nothing locks by itself (check FR-100: building starts when the admin starts or
  generates). Notify the admins "availability is due: N of M sent".
- Web: the open-period card gets a deadline field (date and time pickers already used elsewhere);
  staff see "Send by Thursday 18:00" on Home and on the availability page; the team availability page
  shows the deadline.
- Tests: with `FakeClock`, advance past each offset and run the tick (`services.RunTickAsync()`).

### 1.5 Same person in two workplaces (M5-11). Size S to M

- The generator input already has a slot for busy times at other workplaces; `DraftBuilder.ToInput`
  passes an empty list with the comment "arrive with M5-11".
- In `DraftBuilder.LoadAsync`, load published assignments (`IsDraft == false`) whose `UserId` is one
  of this period's members and whose `PeriodId` belongs to **another** workplace, overlapping the
  period's dates. Same module, same `SchedulingDb`: no cross-module call is needed. Map them to the
  generator's busy-time type (check its shape in `Quart.Generator`).
- Privacy (FR-094): the other workplace is never named. The evaluator already reports such a shift as
  "not available". The draft view must not expose which workplace or what time; only the status.
- The publish path already turns the database's exclusion violation into `schedule.double_booking`.
- Test: one user in two workplaces, published in A; generating in B never places them on an
  overlapping shift; placing by hand shows "not available".

**Security.** This is the one place a query crosses workplaces on purpose. Select only the start and
end instants and the user ID; never return, log or put in an error which workplace or shift it was.
Test that the draft view of workplace B contains nothing that identifies workplace A.

### 1.6 Delete my account (M2-16). Size M

- Read FR-009 and the issue for what stays: past shifts stay on schedules without the name (the
  published schedule already shows a former member as nameless).
- Flow: confirm by typing the email (mockup `1g-del`) and the password. Refuse while the user owns a
  workplace (ownership must be transferred first; until 4.3 exists the message says to contact
  support). For each membership, run the same code path as leaving (`EndMembershipAsync`), then
  anonymise the Identity row (email, name, password hash removed, marked deleted), delete sessions,
  account links and notifications, and cancel queued emails.
- Other modules hold `UserId` in assignments and claims: they keep it as an opaque ID. Do not cascade
  deletes across modules. `IUserDirectory.GetAsync` already drops unknown users; check every caller
  handles a missing name.
- Send a last "your account was deleted" email before the address is erased.
- Tests: the full flow, the owner refusal, and that signing up again with the same email works.

### 1.7 Retention: nightly deletion (M6-05). Size S to M

- One job per module that owns data, each `IJobHandler`, scheduled daily (see how the heartbeat or
  any recurring job re-schedules itself; if none recurs yet, schedule the next run at the end of each
  run, with a dedup key per day).
- What to delete and after how long is in the spec's retention table (search "retention"): typically
  expired sessions and tokens, old notifications, sent outbox rows, availability notes of old
  periods, finished marketplace requests. Delete in batches with a limit per run; log counts only.
- One constant per period, shared by the job. The privacy page (6.2, built later) shows a table of
  the same periods from those constants, with a test that the page text matches.

### 2.1 Service worker: instant opening and offline "My shifts" (M8-05). Size M

- Decide by a decision record: `vite-plugin-pwa` (Workbox) or a small hand-written worker. The
  worker must pass `npm run csp:check` (no inline script) and be served with `Service-Worker-Allowed`
  and no long cache on `sw.js` itself (check `SecurityHeaders.cs` and the static file settings).
- Cache: the app shell (HTML, JS, CSS, fonts, icons) cache-first with revisioned names. API: **only
  the allowlist in the issue** (published schedule, current periods, me, workplace) with
  network-first and a fallback to the last copy. Never cache drafts, team availability, notes, or
  anything under `/api/auth`.
- On sign-out and on a 401, delete all API caches. Key caches by user and workplace so a shared phone
  never shows another person's shifts.
- Update flow: when a new worker is waiting, show a small "Update available" toast with a Reload
  button; do not reload under the user's hands.
- Web: an offline banner ("Showing your shifts as of 14:05") on Schedule and Home; actions that need
  the network are disabled with an explanation.
- Check on WebKit in the e2e suite: load, go offline, reload, "My shifts" still shows.

### 2.2 Web push (M8-06). Size L: two PRs

**PR A, server.** New table in Notifications: `push_subscription` (user, endpoint unique, keys,
user agent label, created, last success). Endpoints: `GET /api/push/key` (VAPID public key),
`POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/{id}`. VAPID keys are settings
(`Push:PublicKey`, `Push:PrivateKey`, `Push:Subject`), generated once per environment and stored as
secrets. Sending: when a notification is stored, enqueue a job `notifications.send_push` per
subscription; the handler posts to the push service and **deletes the subscription on 404 or 410**.
Pick a maintained .NET Web Push library and record it in a decision; check its licence and last
release before adding it (decision 0007 lists how dependencies are chosen).
The payload is small and carries no private detail on the lock screen: a title such as "Schedule
published", a generic body, and the path to open.

**PR B, client.** In the service worker: `push` shows the notification, `notificationclick` focuses
or opens the app at the path. In Profile (mockup `1g`, "Push on this phone"): a switch that asks
permission **only after the tap**, subscribes, and posts the subscription. iPhone: push works only
in the installed app, so in Safari the row explains "Add to Home Screen first" and reuses the
install card (`features/install`). Handle "denied" with instructions instead of a dead switch.

**Check.** API tests with a fake push sender. By hand on Chrome desktop. Real iPhone and Android are
Hoang's check; write the steps in the PR.

**Security.** A subscription belongs to the signed-in user who posted it; deleting or listing is
limited to one's own. The endpoint URL comes from the browser: accept only `https` and send only to
it as given (no following redirects). Nothing private in the payload: a locked phone shows it.

### 2.3 Notification preferences and bundling (M8-07). Size M

- Per user and workplace: email on or off, push on or off (mockup `1g` shows two switches). Store in
  Notifications; `INotifier` consults them when fanning out to email and push. In-app is always on.
- Bundling: several notifications of the same type to the same person inside a short window become
  one email or push ("3 shifts are up for grabs"). Implement as a delayed job per (user, type) that
  sends whatever accumulated; in-app rows are not bundled.

### 3.1 Edit one period's shifts (M4-01). Size M to L

- Endpoints under `/periods/{periodId}/shifts` (permission `ManageSchedule`): add a shift on a date,
  change its times or headcount, remove it. Allowed while the period is collecting or building;
  for a published period only shifts that have not started.
- Consequences to handle explicitly, each with a test:
  - Removing a shift deletes its availability answers and draft assignments; if published, its
    holders are notified and a version is saved; open marketplace requests on it are closed (the
    lazy cleanup in `MarketplaceEndpoints.Context.ExpireAsync` already closes requests whose shift is
    gone; confirm with a test).
  - Changing times recomputes `StartsAt` / `EndsAt` on the shift **and on its assignments** (they
    carry copies for the no-double-booking constraint). An overlap created this way must be refused
    with a clear message.
  - Changing times after answers were collected resets the answers for that shift and tells those
    people (same rule as FR-069).
  - Opening and closing labels are computed per day from the shifts (`DayParts`), so they follow.
- `Shift.SourceBlockId` stays for shifts that came from the template; a shift added by hand needs a
  value that cannot match a template block (check whether the column is nullable; if not, give
  hand-made shifts a fresh ID and make sure "cannot work together" pairs and the "previous
  availability" suggestion simply ignore them).
- Web: on the period (mockups `1k` and nearby; check which screen shows a period's days), a day sheet
  with its shifts and "Add shift", "Close this day". Reuse the block editor fields from
  `features/generator`.

### 3.2 Template changes reach an open period (M4-08, FR-069). Size M

- When Edit Generator is saved and an **unpublished** period exists: for each changed block, update
  that period's shifts from it (times, headcount, level requirements, days added or removed), reset
  availability answers for the shifts whose times changed, and notify the affected people.
- Workplaces cannot touch Scheduling's tables: publish the change through a new SharedKernel
  interface (for example `ITemplateChangedHandler.HandleAsync(workplaceId, changedBlockIds)`),
  implemented in Scheduling, called after the template save commits. Same pattern as
  `IMemberLeftHandler`.
- Build on 3.1: both need "change a shift and deal with its answers and assignments". Write that
  once, as an internal service in Scheduling.
- Then change the note on the Edit Generator page (`generator.saveHint` in both languages) and the
  sentence under FR-068 in the spec that says this is not built.

### 3.3 Reuse a past schedule (M5-08). Size M

- `POST /periods/{periodId}/draft/reuse` with the source period. Map each target shift to the source
  shift with the same week index (modulo the source's weeks), day of week and `SourceBlockId`, the
  same mapping `GetPreviousAsync` uses for availability suggestions. Copy the people who still work
  shifts; skip those who left.
- It replaces the non-kept draft assignments, exactly like Generate, and records a `GenerationRun`
  style entry if the issue asks for one. Nothing is checked at copy time: the evaluator then shows
  who is not available, as for any hand-made draft.
- Web: next to Generate, "Reuse a past schedule" opens a sheet listing past published periods.

### 3.4 Rename a shift (M3-04). Size S

- `ShiftBlock.Name` (nullable, trimmed, max about 24 characters), copied to `Shift.Name` when a
  period opens (and refreshed by 3.2). Exposed on every shift DTO.
- Web: one place decides the label, `features/scheduling/ShiftName.tsx` (`useShiftName`): use the
  custom name when present, else Opening, Closing, Mid or the times. A custom name is shown as typed,
  in both languages. Add the field to the block editor in Edit Generator.
- Check every place that prints a shift name: schedule, draft, marketplace, alerts, emails.

### 3.5 Unclaimed give-away alert; trade expiry notice (M7-05, M7-08). Size S to M

- Today expiry is lazy: `Context.ExpireAsync` runs when someone reads the marketplace, and a trade
  that expires by time tells nobody.
- Add jobs: when a trade is created, schedule `marketplace.trade_expiry` at `ExpiresAt`; the handler
  marks it expired if still pending and notifies both people. When an offer is created, schedule
  `marketplace.offer_unclaimed` at the lead time the issue gives before the shift starts; the handler
  notifies the giver and the approvers if the offer is still open.
- Keep the lazy cleanup: jobs can be late. Both paths must be safe to run twice.

### 4.1 Step-up confirmation (M2-06). Size M

- The session records when the password was last confirmed. `POST /api/auth/confirm` with the
  password refreshes it. An endpoint filter `RequireRecentConfirmation(minutes)` answers a specific
  code (for example `auth.confirmation_required`) when it is too old.
- Web: one global handler: on that code, open a password sheet, confirm, and retry the original
  request once. Put it in the API client middleware next to the antiforgery handling
  (`src/web/src/lib/api/client.ts`), not in each page.
- Apply to the actions the spec lists (search "step-up"): email and password change, account
  deletion, ownership transfer, regenerate join code, two-factor changes.

### 4.2 Two-factor authentication (M2-08). Size M to L

- TOTP (RFC 6238) with an authenticator app. Secret encrypted with Data Protection, never returned
  after setup. Setup: show the secret and an `otpauth://` QR code (render the QR in the browser from
  the URI; if a library is added, record it), confirm with a code, then show recovery codes once
  (store only hashes).
- Sign-in becomes two steps when enabled: the password step returns "second factor needed" with a
  short-lived, single-purpose token; `POST /api/auth/second-factor` finishes. Rate-limit and lock
  out the second step like the first. Recovery codes are single use.
- Accept the previous and the next 30-second step for clock drift; refuse a code that was already
  used in its window.
- Turning it off needs step-up (4.1). Reset by "forgot password" must **not** remove the second
  factor.

**Security.** Store the TOTP secret encrypted and recovery codes hashed. The token between the two
sign-in steps is single-purpose, short-lived and useless as a session. Count second-step failures
toward the lockout. Never show the secret again after setup.

### 4.3 Admins, permission grants, ownership transfer (M2-13). Size M to L

- The permission model exists (`Permission` enum, `MembershipPermission` grants, guards by name).
  Check what `Role` values exist and how `PermissionsOf` derives the defaults.
- Add: promote and demote an admin; grant or remove single permissions for an admin (the issue lists
  which are grantable); transfer ownership to another member (step-up, and the old owner becomes an
  admin). Notify the people concerned.
- Rules to test: a workplace always has exactly one owner; nobody changes their own permissions;
  only the owner manages admins; an admin without `ManageMembers` cannot remove anyone.
- Web: team sheet (mockup `1z`) gains a role section visible to the owner; Profile (mockup `1o`)
  gains "Transfer ownership".
- Then let 1.6 (delete account) offer the transfer instead of "contact support".

### 4.4 Sign in with Google (M2-17). Size M

- Authorization code flow with PKCE, handled on the server; the browser never sees tokens. Identity
  already has an `AccountLink` table: use it for (provider, subject) to user.
- Rules (read the issue): link to an existing account only when Google says the email is verified
  and it equals a verified local email; otherwise ask the person to sign in first and link from
  Profile. Never create a second account for the same email. An account created through Google has
  no password until the person sets one.
- The callback creates the same `quart_session` as a password sign-in, including the second factor
  step if the account has one.
- Settings: `Google:ClientId`, `Google:ClientSecret`; the button is hidden when they are missing, so
  local development and tests need no Google project. Tests stub the token endpoint.
- CSP: the redirect needs no script from Google. Do not add Google's JavaScript.

**Security.** Check the `state` value and use PKCE; validate the ID token's signature, audience and
issuer with the framework's handler, not by hand. Trust the email only when Google marks it verified.
Never merge into an account whose local email is unverified: that account is discarded or the person
is asked to sign in first.

### 4.5 Social links on the team page (M2-18). Size S

- Two optional fields on the membership or the account (check the issue for which): Instagram and
  Facebook handles. Validate as handles, not free URLs; build the link on the server from an
  allowlist of hosts. Show as icons on the team list; `rel="noopener noreferrer"`.

### 5.1 Stored files (M8-02). Size M

- The Files module is an empty shell. One model: `stored_file` (owner module and key, content type,
  size, checksum, created by), bytes in object storage (decision D5; a local folder in Development).
- One validation path: size limit, allowed types by **sniffing the bytes**, not the file name.
- Downloads only through short-lived signed links issued after a permission check by the owning
  module (a SharedKernel interface such as `IFileAccess`). Never a public bucket.
- M8-08 (file access tests) and M8-09 (backing files up) belong with this.

### 5.2 News (M8-01, M8-03, M8-04). Size L: three PRs

- Announcements module (empty shell): posts with text, author, time; permission to post (check the
  enum for an existing name, else add one); everyone in the workplace reads.
- Mockups: `1f` lists News inside Alerts and `1j` has a composer on Home; known conflict 6 says build
  both and keep a page for the full list.
- Photos (M8-03) go through 5.1 and are **re-encoded on the server** (strip metadata, cap the
  dimensions). Thumbs-up (M8-04): one row per (post, member), toggle.
- Notify on a new post (subject to 2.3's preferences).

### 5.3 Calendar feed of my shifts (M9-03). Size S to M

- `GET /calendar/{token}.ics`: a secret, revocable token per user and workplace; no session needed
  (calendar apps cannot sign in). Standard iCalendar with stable `UID`s per assignment, times in the
  workplace's zone, cancelled shifts removed. Published shifts only.
- Profile: "Subscribe in your calendar" with copy link and "Reset link". Rate-limit the route and
  never log the token.

**Security.** The token in the URL is the only protection, so: 32 random bytes, stored hashed,
revocable, never logged (the request log already drops query strings; keep the token in the path out
of it too), and the feed holds only the person's own shifts with no co-worker names.

### 5.4 Google Calendar free/busy (M9-01, M9-02, M9-04). Size L

- Needs 4.4. Ask for the calendar scope only when the person taps "Fill from my calendar", not at
  sign-in. Store the refresh token encrypted; let the person disconnect.
- Import suggests availability for the open period from free/busy only (no event titles are read or
  stored); the person reviews and sends as usual.
- Google's verification (M9-04) is paperwork for Hoang: prepare the scope justification and the
  privacy page links.

### 5.5 Drag to create shifts on desktop (M3-05). Size L

- A week grid in Edit Generator at 1024 px and wider: drag to draw a block snapped to 15 minutes,
  resize, move, with a full keyboard equivalent (the issue describes it). Phones keep the list.
- Pointer events, not HTML drag-and-drop. It saves through the existing `PUT /generator`; no backend
  change. Do it last: it is the largest piece of pure UI and nothing depends on it.

### 5.6 Time-off requests (BL-01) and 5.7 Payslips (BL-02)

Backlog items without a settled design. Before any code: write a one-page proposal in
`docs/decisions` (data kept, who sees what, retention, how it meets Law 25; payslips are sensitive
documents and depend on 5.1), get Hoang's answer on D7, then split into issues with
`scripts/github/create-issues.mjs`. **D7 answered 2026-11-17: not before the pilot. Do not start.**

### 6.1 Turn on real email: Amazon SES (M2-01, M6-02 part). Size S

Decided (D2): Amazon SES in the Montreal region (`ca-central-1`), so email stays in Quebec. Task 1.2
already built every email against Mailpit; this task only connects the real provider.

- Needs the domain from D5. Hoang creates the AWS account (two-factor on the root user, then an IAM
  user limited to sending), verifies the domain in SES, and asks AWS for production access (new
  accounts start in a sandbox that only sends to verified addresses). Write each step in
  `docs/runbooks/email.md` with what to click.
- DNS records for SPF, DKIM (SES "Easy DKIM") and DMARC go in the same runbook. `Email:From` is
  `no-reply@<domain>`.
- SMTP credentials as Container Apps secrets on the app **and the tick job**, for staging and then
  production. Turn off any open or click tracking.
- Before go-live, confirm in AWS's data processing terms that SES in `ca-central-1` keeps the data in
  that region (spec 12.1); if not, tell Hoang so Philippe can be told.
- Write `docs/decisions/00NN-email-provider.md` (choice, why, data location, price).

**Check.** A verification email reaches a real Gmail inbox from staging, not in spam, with DKIM and
SPF shown as "PASS" in Gmail's "Show original".

### 6.2 Privacy policy, data arrangement, incident runbook (M6-03, M6-04). Size S (code) plus documents

- A public page `/privacy` in both languages, linked from sign-up, sign-in and Profile. Content from
  the spec's privacy section (search "Law 25"): what is collected, why, where it is stored (Montreal),
  how long, who to contact, how to delete an account. **Mark the text as a draft for Hoang to have
  reviewed; do not present it as legal advice.**
- Sign-up records the version of the policy the person accepted (a column on the account).
- `docs/legal/data-arrangement.md` (the agreement between Hoang and Philippe) and
  `docs/runbooks/incident.md` (who does what within which delay when data leaks): write them as
  fill-in documents from the issue's checklist.

### 6.3 Production environment, release deploys, custom domain (M6-01, M6-02). Size M

- Copy the staging pattern: `scripts/azure/provision-production.sh` from `provision-staging.sh`
  (resource names from a variable, never hard-coded twice), `appsettings.Production.json`, and a
  workflow `deploy-production.yml` triggered by a release tag (`v*`), reusing the staging steps:
  build image, run the migrate job, run the tick job once, update the app, smoke test, and **roll
  back to the previous revision if the smoke test fails** (staging has no rollback today: add it to
  both).
- Production differences: minimum replicas 1 during opening hours or always (decision D5),
  `Auth` and `Workplaces` rate limits at their defaults, `Features:Lab` off, its own database and its
  own Data Protection keys, connection string with a small `Maximum Pool Size` for the Supabase
  session pooler.
- Custom domain: bind it to the Container App with a managed certificate; set `Email:PublicUrl`, the
  cookie domain and the allowed origin to it; redirect the default Azure host to it. Write the DNS
  records Hoang must create in `docs/runbooks/production.md`.
- Everything Hoang must do by hand (Azure login, secrets in GitHub, DNS) goes in that runbook as
  numbered steps with the exact commands.

### 6.4 Encrypted nightly backup (M6-08). Size S to M

- A scheduled GitHub Actions workflow (or a Container Apps job): `pg_dump` in custom format, encrypt
  with a public key (`age` or `gpg`; the private key never enters CI), upload to storage in Canada
  (decision D5), keep N days, delete older ones.
- A restore drill documented in `docs/runbooks/backup.md` and tried once against a scratch database:
  a backup that was never restored is not a backup.
- An alert when the workflow fails (a notification to Hoang's email through GitHub is enough).

---

## 6. What Hoang must decide or provide

Ask for these at the start of the phase that needs them, all at once. Answers given on 2026-11-17
are in the spec's decision log (section 17).

| ID | Question | Answer, or recommended default | Blocks |
| --- | --- | --- | --- |
| D1 | "Works shifts" turned off for someone with future shifts: refuse, or free their shifts? Should shift edits reach an open period (FR-069)? | **Answered:** refuse the switch. Yes, build FR-069 in phase 3. | 1.1, 3.2 |
| D2 | Which email provider, and which address emails come from | **Answered:** Amazon SES, Montreal region (`ca-central-1`). Address `no-reply@<domain>` once the domain exists. | 6.1 |
| D3 | Retention periods and what a deleted account leaves behind | **Answered:** the spec's retention table and FR-009, unchanged, including published schedules kept 2 months with no export. | 1.6, 1.7 |
| D4 | Who reviews the privacy text; contact name and email for privacy requests | Hoang as the contact; a short review by someone qualified before go-live | 6.2 |
| D5 | Domain name (after the final product name, Q-05); Azure subscription for production; always-on or scale to zero; where backups and files are stored | One always-on replica in production; storage in a Canadian region. Hoang owns no domain yet. | 6.1, 6.3, 6.4 |
| D6 | A Google Cloud project with OAuth credentials | Created by Hoang (a free test project is enough to build); client ID and secret given as secrets | 4.4, 5.4 |
| D7 | Whether time-off and payslips are wanted at all, and their rules | **Answered:** after the pilot | 5.6, 5.7 |
| Q-08 | Hours before an unclaimed give-away alerts the admins | **Answered:** 24 hours, a setting; **changed 2026-11-23:** fixed at 36 hours, no setting | 3.5 |

Things only Hoang can do: buy the domain and create DNS records, create accounts (email provider,
Google Cloud), add secrets in GitHub and Azure, try features on a real iPhone and Android phone,
merge pull requests.

---

## 7. Left out on purpose

Hoang asked to skip these for now. Do not build them as a side effect of other work.

- Checking on a real iPhone and Android phone (M6-09 device part, M6-10)
- Comparing the generator with a real month from Philippe (M1-09, M1-10)
- The Android app in Google Play (M8-10)
- Export to CSV and PDF; the monthly email to the owner (M5-09, M6-06)
- Staff seeing the issues that concern them (M5-04, remaining part)
- The warning before generating that a shift has too few level 3s available (M4-04, remaining part)
- The history of who changed what (M5-12)
- The QR code for the join code; approving new members before they get in (M2-11, remaining part)
