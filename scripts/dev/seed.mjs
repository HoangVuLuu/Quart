// Fills a fresh local database with the same Presotea team as staging, so the whole loop can be tried without
// creating accounts by hand: the platform admin, Philippe (owner) and 14 staff, two shifts a day, and a period
// where everyone has sent their availability (with notes).
// It only talks to the app the way a browser does, plus Mailpit to "open" the verification emails.
//
//   node scripts/dev/seed.mjs            (once, on an empty database; the app must be running: scripts/dev/start.sh)
//
// Never run it against anything but your own machine: the accounts share one well-known password.
import { spawnSync } from "node:child_process";
import {
  admin,
  Browser,
  mailpit,
  password,
  team,
  workplaceName,
} from "./demo.mjs";
import { fillAvailability } from "./fill-availability.mjs";

/** The token in the link of the newest email to that address, read from Mailpit. */
async function tokenFor(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = await (
      await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      )
    ).json();
    for (const summary of found.messages ?? []) {
      const message = await (
        await fetch(`${mailpit}/api/v1/message/${summary.ID}`)
      ).json();
      const match = /token=([A-Za-z0-9_-]+)/.exec(message.Text ?? "");
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No verification email for ${email} in Mailpit. If the demo accounts already exist, start over with: docker compose down -v`,
  );
}

async function account({ fullName, email, language }) {
  const browser = new Browser();
  await browser.post("/api/auth/sign-up", {
    fullName,
    email,
    password,
    language,
  });
  await browser.post("/api/auth/verify-email", {
    token: await tokenFor(email),
  });
  await browser.post("/api/auth/sign-in", { email, password });
  return browser;
}

/** The next Monday at least a week away, as "yyyy-mm-dd": periods start on a Monday (FR-090). */
function nextMonday() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 7 + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}

try {
  console.log("Creating the platform admin and the owner…");
  const hoang = await account(admin);
  const granted = spawnSync(
    "dotnet",
    [
      "run",
      "--no-build",
      "--project",
      "src/backend/Quart.Api",
      "--launch-profile",
      "http",
      "--",
      "grant-platform-admin",
      admin.email,
    ],
    { stdio: "inherit", cwd: new URL("../..", import.meta.url) },
  );
  if (granted.status !== 0)
    throw new Error(`Could not make ${admin.email} the platform admin.`);

  const philippe = team.find((x) => x.owner);
  const owner = await account(philippe);
  const created = await hoang.post("/api/workplaces", {
    name: workplaceName,
    address: "Laval, QC",
    timeZone: "America/Toronto",
  });
  await owner.post("/api/workplaces/owner-invitations/accept", {
    token: created.invitationToken,
  });
  const workplace = `/api/workplaces/${created.workplaceId}`;
  const view = await owner.get(workplace);
  // FR-036: Philippe works shifts too.
  await owner.send("PATCH", `${workplace}/members/${view.me.membershipId}`, {
    level: philippe.level,
    worksShifts: true,
  });

  console.log("Saving the two shifts a day (2 people, at least one level 3)…");
  const block = (start, end) => ({
    id: null,
    days: [1, 2, 3, 4, 5, 6, 7],
    start,
    end,
    headcount: 2,
    requirements: [{ level: 3, minCount: 1 }],
    conflicts: [],
  });
  await owner.send("PUT", `${workplace}/generator`, {
    periodWeeks: 2,
    maxConsecutiveShifts: 3,
    openingFairness: true,
    closingFairness: true,
    blocks: [block("10:00", "16:00"), block("16:00", "23:00")],
  });

  console.log("The team joins with the code…");
  for (const person of team.filter((x) => !x.owner)) {
    const browser = await account(person);
    await browser.post("/api/workplaces/join", { code: view.joinCode });
    const membershipId = (await browser.get(workplace)).me.membershipId;
    await owner.send("PATCH", `${workplace}/members/${membershipId}`, {
      level: person.level,
      worksShifts: true,
    });
  }

  console.log("Opening a two-week period…");
  // FR-091: availability is due 48 hours before the period starts, the Saturday at 00:00. The length comes
  // from the generator rules saved above (FR-090).
  const startDate = nextMonday();
  const dueDate = new Date(
    Date.parse(`${startDate}T00:00:00Z`) - 2 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  await owner.post(`${workplace}/periods`, {
    startDate,
    dueDate,
    dueTime: "00:00",
  });

  console.log("Everyone sends their availability…");
  await fillAvailability();

  console.log(`
Done. Everyone's password is:  ${password}

  philippe@demo.quart   owner (level 3, works shifts)   -> Schedule tab -> Generate schedule
  kymanh@ jay@ noemie@ aymen@demo.quart                 -> level 3 (Kym-Anh sees French)
  tony@ cecilia@ lili@ wendy@ jason@demo.quart          -> level 2 (Tony sees French)
  emilie@ joseph@ cedric@ selma@ ayman@demo.quart       -> level 1
  hoang@demo.quart      platform admin (creates workplaces, member of none)

Join code for a new account of your own: ${view.joinCode}
`);
} catch (error) {
  console.error(`\n${error.message}`);
  if (/breach|pwned|compromised/i.test(error.message)) {
    console.error(
      "The app refused the demo password as leaked. Change `password` in scripts/dev/demo.mjs.",
    );
  }
  process.exit(1);
}
