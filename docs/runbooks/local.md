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

Stop everything with Ctrl+C.

## Demo data (once)

In a second terminal, while the app is running:

```bash
node scripts/dev/seed.mjs
```

It creates Presotea Montmorency with nine people, the two shifts a day, and a two-week period where
everyone but Liam has sent their availability. Everyone's password is `tapioca-pearls-4-everyone`.

| Log in as | To see |
| --------- | ------ |
| `philippe@demo.quart` | The owner: Schedule → Generate schedule → fix → Publish |
| `sophie@demo.quart` | Staff: Home, My shifts, Give away, Trade |
| `liam@demo.quart` | Someone who has not sent their availability |
| `hoang@demo.quart` | The platform admin: creates workplaces, member of none |

## A walk through the whole loop

1. **Philippe**: Schedule → *Generate schedule*. Tap a shift to add, remove or keep people. Open
   *issues*, then *Publish*.
2. **Sophie** (on your phone): Home shows her next shift. Schedule → tap a shift → *Give away*.
3. **Kevin** (`kevin@demo.quart`): Alerts → *Claim*. The shift is his; Sophie and Philippe are told.
4. **Sophie**: tap another shift → *Trade* → *Ask* a coworker. They accept in Alerts.
5. **Philippe**: Profile → turn on *Approve claims* or *Approve trades* and repeat 2 to 4: requests
   now wait for him in Alerts.
6. **Philippe**: Schedule → *Edit* → move someone → *Update*. Only the people whose shifts changed
   are notified.
7. To start the next cycle: Schedule → *Open the next period*. Staff fill in Availability.

## Start again from nothing

```bash
docker compose down -v      # deletes the local database
scripts/dev/start.sh
node scripts/dev/seed.mjs
```

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

## If something does not work

| What you see | What to do |
| ------------ | ---------- |
| `port is already allocated` for 5432 | Quit Postgres.app, then start again |
| The phone cannot open the page | Same Wi-Fi? Some guest networks block devices from seeing each other. macOS may also ask to allow incoming connections: allow them |
| "No verification email … in Mailpit" from the seed script | The demo accounts already exist. Start again from nothing (above) |
| The log-in page says the session needs a refresh | Reload the page once |
