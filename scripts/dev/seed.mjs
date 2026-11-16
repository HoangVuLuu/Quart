// Fills a fresh local database with a small Presotea, so the whole loop can be tried without creating
// ten accounts by hand: an owner, eight staff, the two shifts a day, and a period collecting availability.
// It only talks to the app the way a browser does, plus Mailpit to "open" the verification emails.
//
//   node scripts/dev/seed.mjs            (the app must be running: scripts/dev/start.sh)
//
// Never run it against anything but your own machine: the accounts share one well-known password.
import { spawnSync } from 'node:child_process';

const api = process.env.QUART_API ?? 'http://localhost:5080';
const mailpit = process.env.QUART_MAILPIT ?? 'http://localhost:8025';
const password = 'tapioca-pearls-4-everyone';

/** One browser: its own cookies, and the anti-forgery header on every request (AD-025). */
class Browser {
  cookies = new Map([['XSRF-TOKEN', 'seed']]);

  async send(method, path, body) {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': 'seed',
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      this.cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    return text ? JSON.parse(text) : undefined;
  }

  get = (path) => this.send('GET', path);
  post = (path, body = {}) => this.send('POST', path, body);
}

/** The token in the link of the newest email to that address, read from Mailpit. */
async function tokenFor(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    for (const summary of found.messages ?? []) {
      const message = await (await fetch(`${mailpit}/api/v1/message/${summary.ID}`)).json();
      const match = /token=([A-Za-z0-9_-]+)/.exec(message.Text ?? '');
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No verification email for ${email} in Mailpit. If the demo accounts already exist, start over with: docker compose down -v`,
  );
}

async function account(fullName, email, language = 'fr') {
  const browser = new Browser();
  await browser.post('/api/auth/sign-up', { fullName, email, password, language });
  await browser.post('/api/auth/verify-email', { token: await tokenFor(email) });
  await browser.post('/api/auth/sign-in', { email, password });
  return browser;
}

/** The next Monday at least a week away, as "yyyy-mm-dd": periods start on a Monday (FR-090). */
function nextMonday() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 7 + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}

const staff = [
  ['Amélie Tremblay', 'amelie@demo.quart', 3, 26],
  ['Marc-Olivier Roy', 'marc@demo.quart', 3, 26],
  ['Jasmine Khalil', 'jasmine@demo.quart', 3, 24],
  ['Sophie Lapointe', 'sophie@demo.quart', 2, 20],
  ['Kevin Tran', 'kevin@demo.quart', 2, 20],
  ['Noah Bergeron', 'noah@demo.quart', 2, 16],
  ['Léa Bouchard', 'lea@demo.quart', 1, 12],
  ['Liam O’Connor', 'liam@demo.quart', 1, 9],
];

console.log('Creating the platform admin and the owner…');
const admin = await account('Hoang Vu Luu', 'hoang@demo.quart', 'en');
const granted = spawnSync(
  'dotnet',
  ['run', '--no-build', '--project', 'src/backend/Quart.Api', '--launch-profile', 'http', '--', 'grant-platform-admin', 'hoang@demo.quart'],
  { stdio: 'inherit', cwd: new URL('../..', import.meta.url) },
);
if (granted.status !== 0) throw new Error('Could not make hoang@demo.quart the platform admin.');

const owner = await account('Philippe Nguyen', 'philippe@demo.quart');
const created = await admin.post('/api/workplaces', { name: 'Presotea Montmorency', address: 'Laval, QC', timeZone: 'America/Toronto' });
await owner.post('/api/workplaces/owner-invitations/accept', { token: created.invitationToken });
const workplace = `/api/workplaces/${created.workplaceId}`;
const view = await owner.get(workplace);
// FR-036: Philippe works shifts too.
await owner.send('PATCH', `${workplace}/members/${view.me.membershipId}`, {
  level: 3, worksShifts: true, desiredWeeklyHours: 26, maxWeeklyHours: null, clearMaxWeeklyHours: null,
});

console.log('Saving the two shifts a day (2 people, at least one level 3)…');
const block = (start, end) => ({
  id: null, days: [1, 2, 3, 4, 5, 6, 7], start, end, headcount: 2, requirements: [{ level: 3, minCount: 1 }], conflicts: [],
});
await owner.send('PUT', `${workplace}/generator`, {
  periodWeeks: 2, maxConsecutiveShifts: 3, openingFairness: true, closingFairness: true,
  blocks: [block('10:00', '16:00'), block('16:00', '23:00')],
});

console.log('Staff join with the code…');
const people = [];
for (const [fullName, email, level, desiredWeeklyHours] of staff) {
  const browser = await account(fullName, email);
  await browser.post('/api/workplaces/join', { code: view.joinCode });
  const membershipId = (await browser.get(workplace)).me.membershipId;
  await owner.send('PATCH', `${workplace}/members/${membershipId}`, {
    level, worksShifts: true, desiredWeeklyHours, maxWeeklyHours: null, clearMaxWeeklyHours: null,
  });
  people.push({ browser, email });
}

console.log('Opening a two-week period; everyone but Liam sends their availability…');
const period = await owner.post(`${workplace}/periods`, { startDate: nextMonday(), weeks: 2 });
const availability = `${workplace}/periods/${period.id}/availability/me`;
for (const { browser, email } of [...people, { browser: owner, email: 'philippe@demo.quart' }]) {
  if (email === 'liam@demo.quart') continue;
  const shifts = (await browser.get(availability)).shifts;
  // Léa only opens; everyone else can work anything except one day off, different for each.
  const dayOff = people.findIndex((person) => person.email === email) + 1;
  const can = shifts.filter((shift) =>
    email === 'lea@demo.quart' ? shift.start === '10:00' : new Date(`${shift.date}T00:00:00Z`).getUTCDay() !== dayOff % 7,
  );
  await browser.post(`${availability}/send`, { shiftIds: can.map((shift) => shift.id) });
}
await people[1].browser.post(`${availability}/notes`, { body: 'Examens la 2e semaine, soirs seulement si possible.' });

console.log(`
Done. Everyone's password is:  ${password}

  philippe@demo.quart   owner (level 3, works shifts)   -> press Generate on the Schedule tab
  sophie@demo.quart     barista, level 2                -> staff view
  liam@demo.quart       barista, level 1                -> has not sent availability yet
  amelie@ marc@ jasmine@ kevin@ noah@ lea@demo.quart    -> the rest of the team
  hoang@demo.quart      platform admin (creates workplaces, member of none)

Join code for a new account of your own: ${view.joinCode}
`);
