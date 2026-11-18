// The one flow that must never break (M6-09, spec 10.1, NFR-001): the owner sets up the shifts, opens a
// period, two staff send their availability, the owner generates, edits one shift and publishes, staff see
// their shifts and pass one along, and an update tells only the person whose shifts changed.
//
// Accounts, the workplace and the team go in through the API (M6-09: "test data is created through the
// API"); everything after that is tapped in the browser, at phone size, in Chromium and in WebKit.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { Person, grantPlatformAdmin, nextMonday } from '../support/quart';

type Workplace = { me: { membershipId: string }; joinCode: string };

test('the core loop, from an empty workplace to an updated schedule', async ({ browser }) => {
  // ---- Test data, through the API ----
  const admin = await Person.create(browser, 'Hoang Admin');
  grantPlatformAdmin(admin.email);
  await admin.signInByApi();
  const owner = await Person.create(browser, 'Philippe Owner');
  // Sophie only closes and Kevin only opens, so the generator has exactly one answer.
  const sophie = await Person.create(browser, 'Sophie Closer');
  const kevin = await Person.create(browser, 'Kevin Opener');

  const created = await admin.send<{ workplaceId: string; invitationToken: string }>(
    'POST',
    '/api/workplaces',
    {
      name: 'Presotea Montmorency',
      address: 'Laval, QC',
      timeZone: 'America/Toronto',
    },
  );
  const workplace = `/api/workplaces/${created.workplaceId}`;
  await owner.signInByApi();
  await owner.send('POST', '/api/workplaces/owner-invitations/accept', { token: created.invitationToken });
  const { joinCode } = await owner.send<Workplace>('GET', workplace);
  for (const [person, level] of [
    [sophie, 2],
    [kevin, 3],
  ] as const) {
    await person.signInByApi();
    await person.send('POST', '/api/workplaces/join', { code: joinCode });
    const { me } = await person.send<Workplace>('GET', workplace);
    await owner.send('PATCH', `${workplace}/members/${me.membershipId}`, {
      level,
      worksShifts: true,
      desiredWeeklyHours: 42,
      maxWeeklyHours: null,
      clearMaxWeeklyHours: null,
    });
  }
  // The owner signs in through the page; the others are signed in already.
  await owner.send('POST', '/api/auth/sign-out');

  const page = owner.page;

  await test.step('the owner logs in and opens the workplace', async () => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(owner.email);
    await page.getByLabel('Password', { exact: true }).fill('tapioca-pearls-4-everyone');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.getByRole('button', { name: 'Open Presotea Montmorency' }).click();
    await expect(page.getByRole('heading', { name: 'Hi Philippe!' })).toBeVisible();
  });

  await test.step('Edit Generator: one-week periods, no limit in a row, and the opening shift', async () => {
    await page.goto('/generator');
    await page.getByRole('radio', { name: '1 week' }).click();
    await page.getByRole('radio', { name: 'No limit' }).click();
    await page.getByRole('button', { name: 'Shifts' }).click();
    await addShift(page, '10:00', '16:00');
    await page.getByRole('button', { name: 'Save changes' }).click();
    // A save goes back to the Schedule tab, and the toast comes along.
    await expect(page.getByRole('heading', { name: 'Open the next period' })).toBeVisible();
    await expect(toast(page, 'Saved')).toBeVisible();
  });

  await test.step('Edit Generator, saved a second time: the closing shift and a level on the opening', async () => {
    // The second save once failed on rows the first had written (EF Core treated new children as updates).
    await page.getByRole('link', { name: 'Edit generator rules' }).first().click();
    await page.getByRole('button', { name: 'Shifts' }).click();
    await addShift(page, '16:00', '23:00');
    await page.getByRole('button', { name: /^10:00–16:00/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit shift' });
    await sheet
      .getByRole('group', { name: /Requires at least/ })
      .getByRole('button', { name: 'Increase' })
      .click();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^10:00–16:00/ })).toContainText('at least 1 of level 3');
    await page.getByRole('button', { name: 'Save changes' }).click();
    // A save goes back to the Schedule tab, and the toast comes along.
    await expect(page.getByRole('heading', { name: 'Open the next period' })).toBeVisible();
    await expect(toast(page, 'Saved')).toBeVisible();
  });

  await test.step('the owner opens a one-week period', async () => {
    await page.getByLabel('Starts on').fill(nextMonday());
    // The length starts from the generator rules (one week), not from 2 (7, 2026-11-18).
    await expect(page.getByRole('group', { name: 'Weeks' })).toContainText('1');
    await page.getByRole('button', { name: 'Open period' }).click();
    await expect(page.getByRole('heading', { name: 'Next period is open' })).toBeVisible();
  });

  await test.step('both staff send their availability', async () => {
    for (const [person, part] of [
      [sophie, 'Closing'],
      [kevin, 'Opening'],
    ] as const) {
      const staff = person.page;
      await staff.goto('/');
      await staff.getByRole('button', { name: 'Open Presotea Montmorency' }).click();
      await staff.getByRole('link', { name: 'Fill in' }).click();
      const shifts = staff.getByRole('main').getByRole('button', { name: new RegExp(`^${part}`) });
      await expect(shifts).toHaveCount(7);
      for (const shift of await shifts.all()) {
        await shift.click();
      }
      await expect(staff.getByRole('status')).toContainText('7 shifts');
      // A note typed before the first Send goes with it (it was once lost when the form rebuilt itself).
      if (person === sophie) await staff.getByLabel('Note for your manager').fill('Exams that week');
      // The hours wanted come with the availability, once per period (1.1, 2026-11-18).
      await staff.getByLabel('Hours you want per week').fill('30');
      await staff.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(toast(staff, 'Availability sent')).toBeVisible();
      // Back to where it was opened from: Home (1.2).
      await expect(staff.getByRole('heading', { name: /^Hi / })).toBeVisible();
    }
    await sophie.page.getByRole('link', { name: 'Change availability' }).click();
    await expect(sophie.page.getByText('Exams that week', { exact: true })).toBeVisible();
  });

  await test.step('the owner generates, takes Sophie off the last closing, and publishes', async () => {
    // No live connection (AD-031): the owner sees new answers when the page loads again.
    await page.reload();
    await expect(page.getByText('2 of 2 sent')).toBeVisible();
    await page.getByRole('link', { name: 'Build', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Building Schedule' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    const days = page.getByRole('main').getByRole('region');
    await expect(days).toHaveCount(7);
    await expect(days.first().getByRole('button', { name: /^Opening/ })).toContainText('Kevin O.');
    await expect(days.first().getByRole('button', { name: /^Closing/ })).toContainText('Sophie C.');

    await days
      .last()
      .getByRole('button', { name: /^Closing/ })
      .click();
    const editor = page.getByRole('dialog', { name: /Closing/ });
    await editor.getByRole('button', { name: 'Remove Sophie C.' }).click();
    await expect(editor.getByText('Nobody yet.')).toBeVisible();
    await editor.getByRole('button', { name: 'Close' }).click();

    // An empty place only asks (FR-144): publishing it makes an open shift staff can claim.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Publish with these issues?' })
      .getByRole('button', { name: 'Publish anyway' })
      .click();
    await expect(toast(page, 'Schedule published')).toBeVisible();
    // After publishing, back to the Schedule page (4.3).
    await expect(page.getByRole('heading', { name: 'Schedule', exact: true })).toBeVisible();
  });

  await test.step('Sophie sees her six closings in My shifts', async () => {
    const staff = sophie.page;
    await staff.goto('/');
    await staff.getByRole('link', { name: 'Schedule' }).click();
    await expect(staff.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(staff.getByRole('main').getByRole('button', { name: /Closing/ })).toHaveCount(6);
  });

  await test.step('Sophie gives her first closing away and Kevin claims it', async () => {
    const staff = sophie.page;
    // From the Trade tab now (2.1, 2.2); the Schedule tab only shows who works the shift (2.3).
    await staff.getByRole('link', { name: /^Trade/ }).first().click();
    await staff.getByRole('link', { name: 'Give away or trade one of my shifts' }).click();
    await staff
      .getByRole('main')
      .getByRole('button', { name: /16:00–23:00/ })
      .first()
      .click();
    await staff.getByRole('button', { name: 'Give away' }).click();
    await expect(toast(staff, 'Offered to the team. Still yours until taken.')).toBeVisible();

    await kevin.page.goto('/trade');
    // The card around the offer: the innermost block holding both its text and its Claim button.
    const offer = kevin.page
      .getByRole('main')
      .locator('div')
      .filter({ hasText: 'Offered by Sophie C.' })
      .filter({ has: kevin.page.getByRole('button', { name: 'Claim' }) })
      .last();
    await offer.getByRole('button', { name: 'Claim' }).click();
    await expect(toast(kevin.page, 'The shift is yours')).toBeVisible();

    await staff.goto('/schedule');
    await expect(staff.getByRole('main').getByRole('button', { name: /Closing/ })).toHaveCount(5);
  });

  await test.step('the owner updates the schedule, and only Kevin is told', async () => {
    await sophie.page.goto('/alerts');
    const sophieChanges = await sophie.page.getByText(/^Your schedule changed/).count();

    await page.goto('/schedule');
    await page.getByRole('link', { name: 'Edit current schedule' }).click();
    await expect(page.getByRole('heading', { name: 'Editing Schedule' })).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('region')
      .first()
      .getByRole('button', { name: /^Opening/ })
      .click();
    const editor = page.getByRole('dialog', { name: /Opening/ });
    await editor.getByRole('button', { name: 'Remove Kevin O.' }).click();
    await editor.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Publish with these issues?' })
      .getByRole('button', { name: 'Update anyway' })
      .click();
    await expect(toast(page, 'Schedule updated')).toBeVisible();

    await kevin.page.goto('/alerts');
    await expect(kevin.page.getByText('Your schedule changed: 0 added, 1 removed')).toBeVisible();
    await sophie.page.reload();
    await expect(sophie.page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(sophie.page.getByText(/^Your schedule changed/)).toHaveCount(sophieChanges);
  });
});

/** The newest toast with that text: the confirmation the person just got. */
function toast(page: Page, text: string): Locator {
  return page
    .getByRole('region', { name: /^Notifications/ })
    .getByText(text, { exact: true })
    .last();
}

/** Adds a shift that runs every day, from the Shifts section of Edit Generator. */
async function addShift(page: Page, start: string, end: string): Promise<void> {
  await page.getByRole('button', { name: 'Add a shift' }).click();
  const sheet = page.getByRole('dialog', { name: 'New shift' });
  await sheet.getByLabel('Starts').fill(start);
  await sheet.getByLabel('Ends').fill(end);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${start}–${end}`) })).toBeVisible();
}
