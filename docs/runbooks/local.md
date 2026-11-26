# Try Quart on your computer and your phone

Everything runs on your Mac. Your phone only needs to be on the same Wi-Fi.

## What you need (once)

- Docker Desktop, **open and running**
- .NET SDK 10 and Node 22
- If Postgres.app is running, quit it first: it uses the same port (5432) as the database in Docker.

## Start

```bash
scripts/dev/start.sh
```

It starts the database and the email catcher in Docker, then the API and the web app, and prints
three addresses:

| What | Address |
| ---- | ------- |
| The app, on this computer | http://localhost:5173 |
| The app, on your phone | `http://<your Mac's address>:5173` (the script prints it) |
| Every email the app sends (Mailpit) | http://localhost:8025 |

No real email is ever sent. Verification and password-reset emails land in Mailpit; open them there
and tap the link. From a phone, Mailpit is at `http://<your Mac's address>:8025`.

Notification emails (schedule published or changed, availability requested, claims and trades,
FR-211) are sent by a background job, and nothing runs jobs on a schedule locally. To see them in
Mailpit, run one tick: `curl -X POST http://localhost:5080/internal/tick`
([background-jobs.md](background-jobs.md)).

Stop everything with Ctrl+C.

## Demo data (once)

In a second terminal, while the app is running:

```bash
node scripts/dev/seed.mjs
```

It creates Presotea Montmorency with the same team as staging: Philippe (owner) and 14 staff, five at each
level, the two shifts a day, and a two-week period where everyone has sent their availability, some with
notes. Everyone's password is `!apple1755`; every email is the first name, lower case, `@demo.quart`.

| Log in as | Who |
| --------- | --- |
| `philippe@demo.quart` | The owner: Schedule → Generate schedule → fix → Publish |
| `kymanh@` `jay@` `noemie@` `aymen@` | Level 3 (Kym-Anh sees the app in French) |
| `tony@` `cecilia@` `lili@` `wendy@` `jason@` | Level 2 (Tony sees the app in French) |
| `emilie@` `joseph@` `cedric@` `selma@` `ayman@` | Level 1 |
| `hoang@demo.quart` | The platform admin: creates workplaces, member of none |

## Commands for testing

Run them in a second terminal while `scripts/dev/start.sh` is running. They only touch your own computer.

| Command | What it does |
| ------- | ------------ |
| `node scripts/dev/reset-workplace.mjs` | Takes Presotea back to "no period yet": every period goes, with its availability, notes, shifts and schedules, plus give-aways, trades and alerts. People, levels, generator rules, settings and time off stay. Add a name in quotes to reset another workplace. |
| `node scripts/dev/fill-availability.mjs` | Everyone on the team sends availability for the period that is open, and Cecilia, Wendy, Joseph, Emilie, Lili and Jay add a note. Each person answers like their note says (Wendy prefers openings, Lili is away one Saturday…), Selma, Tony and Kym-Anh add shift notes, and every shift gets enough people free, with a level 3. Anyone who already sent keeps their answer. |

A typical round: reset, then as Philippe *Open the next period*, then fill availability, then *Generate*.

## A walk through the whole loop

1. **Philippe**: Schedule → *Generate schedule*. Tap a shift to add, remove or keep people. Open
   *issues*, then *Publish*.
2. **Cecilia** (on your phone): Home shows her next shift. Trade → *Give away or trade one of my
   shifts* → pick a shift → *Give away*.
3. **Jason** (`jason@demo.quart`): Trade → *Claim*. The shift is his; Cecilia and Philippe are told.
4. **Cecilia**: the same page, another shift → *Trade* → *Ask* a coworker. They accept in Trade.
5. **Philippe**: Profile → turn on *Approve claims* or *Approve trades* and repeat 2 to 4: requests
   now wait for him in Alerts.
6. **Philippe**: Schedule → *Edit current period* → move someone → *Update*. Only the people whose
   shifts changed are notified.
7. To start the next cycle: Schedule → *Open the next period*, then `node scripts/dev/fill-availability.mjs`.

## Start again from nothing

```bash
docker compose down -v      # deletes the local database, accounts included
scripts/dev/start.sh
node scripts/dev/seed.mjs
```

To keep the accounts and only clear the schedule, use `node scripts/dev/reset-workplace.mjs` instead.

## Your own account instead of the demo ones

1. Create an account in the app and verify it from Mailpit.
2. Make it the platform admin (there is no screen for this, on purpose):
   `dotnet run --project src/backend/Quart.Api -- grant-platform-admin you@example.com`
3. Log in → *Create a workplace* → open the invitation link it shows, logged in as the future owner.

## Browser tests (the whole loop in Chromium and Safari's engine)

```bash
scripts/dev/e2e.sh                     # both engines, from an empty test database
scripts/dev/e2e.sh --project webkit    # Safari's engine only
scripts/dev/e2e.sh --headed            # watch the browsers do it
```

It builds the API and the web app, then plays the core loop at phone size: Edit Generator saved twice,
a period opened, availability sent by two staff, generate, edit, publish, give away and claim, update.
It uses port 5090 and its own database (`quart_e2e`), so `scripts/dev/start.sh` can keep running. When a
step fails, open its replay: `cd tests/e2e && npx playwright show-trace test-results/<folder>/trace.zip`.
The same test runs on every pull request ("Browser tests" in CI; a failed run keeps the traces as an
artifact named `playwright-traces`).

## Push notifications (optional)

Push is off locally until the app has VAPID keys. Make a pair and keep it in .NET's user secrets (never in a
file in the repository):

```bash
dotnet run --project src/backend/Quart.Api -- push-keys   # prints Push__PublicKey=… and Push__PrivateKey=…
cd src/backend/Quart.Api
dotnet user-secrets set "Push:PublicKey" "<the public key>"
dotnet user-secrets set "Push:PrivateKey" "<the private key>"
```

Browsers allow push only on https or on `localhost`, so try it on the computer itself, not on a phone over
Wi-Fi; phones are tried on staging. Pushes leave with the background tick: run it with
`curl -X POST http://localhost:5080/internal/tick` ([background-jobs.md](background-jobs.md#try-it-locally)).

## If something does not work

| What you see | What to do |
| ------------ | ---------- |
| `port is already allocated` for 5432 | Quit Postgres.app, then start again |
| The phone cannot open the page | Same Wi-Fi? Some guest networks block devices from seeing each other. macOS may also ask to allow incoming connections: allow them |
| "No verification email … in Mailpit" from the seed script | The demo accounts already exist. Start again from nothing (above), or use the testing commands |
| "No period is collecting availability" | As Philippe: Schedule → *Open the next period*, then run the command again |
| The log-in page says the session needs a refresh | Reload the page once |
