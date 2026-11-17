import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import fr from '../../i18n/locales/fr.json';
import type { Schemas } from '../../lib/api/client';
import { base, emptyBoard, renderApp, signedIn, status, workplace } from '../../test/app';
import { notificationText, notificationTypes } from '../alerts/notification-text';

const periodId = '44444444-4444-4444-8444-444444444444';
const mine = workplace().me.membershipId;
const kevin = '55555555-5555-4555-8555-555555555555';
const period: Schemas['PeriodSummary'] = {
  id: periodId,
  startDate: '2099-10-05',
  endDate: '2099-10-11',
  weeks: 1,
  status: 'collecting',
  version: 0,
  locked: false,
};
const next = { period, myAvailability: 'not_sent', canEditAvailability: true, sentCount: null };

function availabilityShift(
  id: string,
  date: string,
  start: string,
  end: string,
  selected = false,
): Schemas['AvailabilityShift'] {
  return {
    id,
    blockId: start === '10:00' ? 'block-open' : 'block-close',
    date,
    start,
    end,
    hours: start === '10:00' ? 6 : 7,
    selected,
  };
}

const myAvailability: Schemas['MyAvailability'] = {
  period,
  status: 'not_sent',
  canEdit: true,
  hasPrevious: false,
  shifts: [
    availabilityShift('mon-open', '2099-10-05', '10:00', '16:00'),
    availabilityShift('mon-close', '2099-10-05', '16:00', '23:00'),
    availabilityShift('tue-open', '2099-10-06', '10:00', '16:00'),
  ],
  notes: [],
};

function scheduleShift(
  id: string,
  date: string,
  part: string,
  people: Schemas['SchedulePerson'][],
): Schemas['ScheduleShift'] {
  const opening = part === 'opening';
  return {
    id,
    blockId: opening ? 'block-open' : 'block-close',
    date,
    start: opening ? '10:00' : '16:00',
    end: opening ? '16:00' : '23:00',
    hours: opening ? 6 : 7,
    startsAt: `${date}T${opening ? '14' : '20'}:00:00+00:00`,
    headcount: 2,
    part,
    people,
  };
}

const sophie: Schemas['SchedulePerson'] = { membershipId: mine, name: 'Sophie L.', level: 2, isMe: true };
const kevinT: Schemas['SchedulePerson'] = { membershipId: kevin, name: 'Kevin T.', level: 3, isMe: false };
const published = { ...period, status: 'published', version: 1, locked: true };
const schedule: Schemas['ScheduleView'] = {
  period: published,
  shifts: [
    scheduleShift('mon-open', '2099-10-05', 'opening', [kevinT]),
    scheduleShift('mon-close', '2099-10-05', 'closing', [sophie, kevinT]),
  ],
};

describe('availability', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('counts the shifts tapped and sends exactly those', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: null, next },
      [`GET ${base}/periods/${periodId}/availability/me`]: myAvailability,
      [`POST ${base}/periods/${periodId}/availability/me/send`]: { ...myAvailability, status: 'sent' },
    });
    renderApp('/availability');

    const monday = await screen.findByRole('group', { name: 'Mon 5' });
    await userEvent.click(within(monday).getByRole('button', { name: /Closing/ }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Tue 6' })).getByRole('button', { name: /Opening/ }),
    );

    // Colour is never the only sign (NFR-008): the state is exposed as pressed.
    expect(within(monday).getByRole('button', { name: /Closing/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(monday).getByRole('button', { name: /Opening/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('2 shifts · 13 h selected');

    await userEvent.click(screen.getByRole('button', { name: en.availability.send }));

    const sent = calls.find((call) => call.path.endsWith('/availability/me/send'));
    expect(sent?.body).toEqual({ shiftIds: ['mon-close', 'tue-open'] });
  });

  it('locks the shifts once building has started, but still takes a note', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { ...next, myAvailability: 'sent', canEditAvailability: false },
      },
      [`GET ${base}/periods/${periodId}/availability/me`]: {
        ...myAvailability,
        status: 'sent',
        canEdit: false,
      },
      [`POST ${base}/periods/${periodId}/availability/me/notes`]: {
        ...myAvailability,
        status: 'sent',
        canEdit: false,
      },
    });
    renderApp('/availability');

    const monday = await screen.findByRole('group', { name: 'Mon 5' });
    expect(within(monday).getByRole('button', { name: /Opening/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: en.availability.send })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(en.availability.note), 'Exams that week');
    await userEvent.click(screen.getByRole('button', { name: en.availability.sendNote }));

    // FR-103: notes stay possible after the lock.
    expect(calls.find((call) => call.path.endsWith('/availability/me/notes'))?.body).toEqual({
      body: 'Exams that week',
    });
  });
});

describe('the schedule tab', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('lets staff change the hours they want from Profile (FR-037, mockup 1g)', async () => {
    const calls = signedIn('employee', { [`PATCH ${base}/me`]: status(204) });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit →' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Hours you want per week' }));
    await user.click(sheet.getByRole('button', { name: /Increase|More|\+/ }));
    await user.click(sheet.getByRole('button', { name: 'Save' }));

    await screen.findByText('Saved');
    const sent = calls.find((call) => call.method === 'PATCH' && call.path === `${base}/me`);
    expect(sent?.body).toEqual({
      desiredWeeklyHours: (workplace('employee').me.desiredWeeklyHours ?? 0) + 1,
    });
  });

  it('shows staff their own shifts and never asks for a draft', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/schedule');

    expect(await screen.findByRole('heading', { name: en.schedule.upcoming })).toBeInTheDocument();
    expect(screen.getByText('With Kevin T.')).toBeInTheDocument();
    // One shift is hers; Monday's opening is Kevin's alone.
    expect(within(screen.getByRole('main')).getAllByRole('listitem')).toHaveLength(1);
    // AD-012: drafts are the admin's.
    expect(calls.some((call) => call.path.includes('/draft'))).toBe(false);
    expect(screen.queryByRole('button', { name: en.schedule.edit })).not.toBeInTheDocument();
  });

  it('lists the whole team by day, with open places in words', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: en.schedule.team }));

    expect(screen.getByText(en.schedule.you)).toBeInTheDocument();
    expect(screen.getAllByText('Kevin T.')).toHaveLength(2);
    expect(screen.getByText('1 open place')).toBeInTheDocument();
  });

  it('gives a shift away from its sheet', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
      [`POST ${base}/marketplace/give-aways`]: status(204),
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: /Closing/ }));
    await userEvent.click(await screen.findByRole('button', { name: en.schedule.sheet.giveAway }));

    expect(calls.find((call) => call.path.endsWith('/marketplace/give-aways'))?.body).toEqual({
      shiftId: 'mon-close',
    });
  });

  it('shows an admin who has not sent, and generating starts the draft', async () => {
    const team: Schemas['TeamAvailability'] = {
      period,
      sentCount: 1,
      total: 2,
      people: [
        {
          membershipId: mine,
          name: 'Sophie L.',
          level: 2,
          status: 'sent',
          reopened: false,
          hoursOffered: 13,
          desiredWeeklyHours: 14,
          notes: [],
        },
        {
          membershipId: kevin,
          name: 'Kevin T.',
          level: 3,
          status: 'not_sent',
          reopened: false,
          hoursOffered: 0,
          desiredWeeklyHours: 20,
          notes: [],
        },
      ],
    };
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, sentCount: 1 } },
      [`GET ${base}/periods/${periodId}/availability`]: team,
      [`POST ${base}/periods/${periodId}/draft/generate`]: status(409, { code: 'schedule.double_booking' }),
    });
    renderApp('/schedule');

    expect(await screen.findByRole('heading', { name: en.schedule.ready.title })).toBeInTheDocument();
    expect(await screen.findByText('Kevin T.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.schedule.ready.generate }));

    expect(calls.find((call) => call.path.endsWith('/draft/generate'))?.body).toEqual({ seed: null });
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.schedule.double_booking);
  });

  it('will not publish a draft with a blocking issue: it opens the issues instead', async () => {
    const building = { ...period, status: 'building', locked: true };
    const draft: Schemas['DraftView'] = {
      period: building,
      seed: 7,
      score: 500,
      openSlots: 1,
      hasUnpublishedChanges: true,
      shifts: [
        {
          id: 'mon-close',
          blockId: 'block-close',
          date: '2099-10-05',
          start: '16:00',
          end: '23:00',
          hours: 7,
          headcount: 2,
          part: 'closing',
          requirements: [{ level: 3, minCount: 1 }],
          people: [{ membershipId: mine, locked: true }],
          availableIds: [mine, kevin],
        },
      ],
      people: [
        {
          membershipId: mine,
          name: 'Sophie L.',
          level: 2,
          desiredWeeklyHours: 14,
          maxWeeklyHours: null,
          availability: 'sent',
          weeklyHours: [7],
          noteCount: 0,
        },
        {
          membershipId: kevin,
          name: 'Kevin T.',
          level: 3,
          desiredWeeklyHours: 20,
          maxWeeklyHours: null,
          availability: 'sent',
          weeklyHours: [0],
          noteCount: 1,
        },
      ],
      issues: [
        {
          code: 'issue.missing_level',
          severity: 'confirm',
          shiftIds: ['mon-close'],
          memberIds: [],
          parameters: { level: '3', required: '1', present: '0' },
        },
        // The one thing that always blocks: one person in two places at once (AD-011).
        {
          code: 'issue.overlapping_shifts',
          severity: 'block',
          shiftIds: ['mon-close', 'mon-close'],
          memberIds: [mine],
          parameters: {},
        },
      ],
    };
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { ...next, period: building, canEditAvailability: false },
      },
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`POST ${base}/periods/${periodId}/draft/assignments`]: { ...draft, issues: [] },
    });
    renderApp('/schedule');

    expect(await screen.findByText('No level 3')).toBeInTheDocument();
    expect(screen.getByText(en.scheduling.grid.kept)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.draft.publish }));

    const issues = await screen.findByRole('dialog', { name: en.issues.title });
    expect(within(issues).getByText(en.draft.severity.block)).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/draft/publish'))).toBe(false);

    // A missing level only asks (FR-144).
    expect(within(issues).getByText(en.draft.severity.confirm)).toBeInTheDocument();

    // From the issue to the shift, then add the level 3 who is available (mockup 1p).
    await userEvent.click(within(issues).getByRole('button', { name: /needs 1 at level 3/ }));
    const editor = await screen.findByRole('dialog', { name: /Closing/ });
    expect(within(editor).getByText(en.draft.editor.available)).toBeInTheDocument();
    await userEvent.click(within(editor).getByRole('button', { name: 'Add Kevin T.' }));

    expect(calls.find((call) => call.path.endsWith('/draft/assignments'))?.body).toEqual({
      shiftId: 'mon-close',
      membershipId: kevin,
    });
  });

  it('lets the manager add someone to a shift that is already full (FR-142)', async () => {
    const building = { ...period, status: 'building', locked: true };
    const person = (membershipId: string, name: string) => ({
      membershipId,
      name,
      level: 2,
      desiredWeeklyHours: 14,
      maxWeeklyHours: null,
      availability: 'sent',
      weeklyHours: [7],
      noteCount: 0,
    });
    const draft: Schemas['DraftView'] = {
      period: building,
      seed: 7,
      score: 0,
      openSlots: 0,
      hasUnpublishedChanges: true,
      shifts: [
        {
          id: 'mon-close',
          blockId: 'block-close',
          date: '2099-10-05',
          start: '16:00',
          end: '23:00',
          hours: 7,
          headcount: 1,
          part: 'closing',
          requirements: [],
          people: [{ membershipId: mine, locked: false }],
          availableIds: [mine, kevin],
        },
      ],
      people: [person(mine, 'Sophie L.'), person(kevin, 'Kevin T.')],
      issues: [],
    };
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { ...next, period: building, canEditAvailability: false },
      },
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`POST ${base}/periods/${periodId}/draft/assignments`]: draft,
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: /Closing/ }));
    const editor = await screen.findByRole('dialog', { name: /Closing/ });
    expect(within(editor).getByText(en.draft.editor.full)).toBeInTheDocument();
    await userEvent.click(within(editor).getByRole('button', { name: 'Add Kevin T.' }));

    expect(calls.find((call) => call.path.endsWith('/draft/assignments'))?.body).toEqual({
      shiftId: 'mon-close',
      membershipId: kevin,
    });
  });

  it('lets staff read a schedule published ahead of time, before the current one ends', async () => {
    const laterId = '55555555-5555-4555-8555-555555555555';
    const later = { ...published, id: laterId, startDate: '2099-10-19', endDate: '2099-11-01' };
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [later] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
      [`GET ${base}/periods/${laterId}/schedule`]: { period: later, shifts: [] },
    });
    renderApp('/schedule');

    const which = await screen.findByRole('group', { name: en.schedule.which });
    expect(await screen.findByText('With Kevin T.')).toBeInTheDocument();
    await userEvent.click(within(which).getAllByRole('button')[1]!);

    // The later period has no shift of hers yet.
    expect(screen.queryByText('With Kevin T.')).not.toBeInTheDocument();
    expect(within(which).getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the marketplace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('claims an offered shift and warns when the shift would miss its level', async () => {
    const shift = { id: 'mon-close', periodId, date: '2099-10-05', start: '16:00', end: '23:00' };
    const calls = signedIn('employee', {
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        offers: [
          {
            id: 'offer-1',
            shift,
            fromMembershipId: kevin,
            fromName: 'Kevin T.',
            mine: false,
            requested: false,
            wouldMissLevel: true,
            onShift: false,
          },
        ],
      },
      [`POST ${base}/marketplace/claims`]: { applied: true },
    });
    renderApp('/trade');

    expect(await screen.findByText('Offered by Kevin T.')).toBeInTheDocument();
    // FR-186: a warning, not a block.
    expect(screen.getByText(en.marketplace.wouldMissLevel)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.marketplace.claim }));

    expect(calls.find((call) => call.path.endsWith('/marketplace/claims'))?.body).toEqual({
      shiftId: 'mon-close',
      giveAwayId: 'offer-1',
    });
  });

  it('lets an admin approve a trade, and counts it on the Alerts tab', async () => {
    const gives = { id: 'mon-close', periodId, date: '2099-10-05', start: '16:00', end: '23:00' };
    const gets = { id: 'tue-open', periodId, date: '2099-10-06', start: '10:00', end: '16:00' };
    const calls = signedIn('owner', {
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        tradesNeedApproval: true,
        trades: [
          {
            id: 'trade-1',
            status: 'awaiting_approval',
            role: 'approver',
            requesterName: 'Sophie L.',
            gives,
            coworkerName: 'Kevin T.',
            gets,
            wouldMissLevel: false,
          },
        ],
      },
      [`POST ${base}/marketplace/trades/trade-1/approve`]: status(204),
    });
    renderApp('/alerts');

    expect(await screen.findByText('Sophie L. and Kevin T. want to trade')).toBeInTheDocument();
    expect(screen.getByText(en.marketplace.trade.levelsOk)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${en.nav.alerts} 1 waiting` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.marketplace.trade.approve }));

    expect(
      calls.some((call) => call.method === 'POST' && call.path.endsWith('/trades/trade-1/approve')),
    ).toBe(true);
  });
});

describe('notifications', () => {
  it.each(['en', 'fr'] as const)(
    'has a sentence for every type in %s, with its values filled in',
    async (language) => {
      await i18n.changeLanguage(language);
      const unknown = (language === 'en' ? en : fr).alerts.unknown;
      const parameters = {
        name: 'Kevin T.',
        date: '2099-10-05',
        start: '16:00',
        end: '23:00',
        periodStart: '2099-10-05',
        weeks: '2',
        version: '1',
        added: '1',
        removed: '0',
        reason: 'stale',
      };

      for (const type of notificationTypes) {
        const text = notificationText(
          { id: 'n', type, parameters, createdAt: '2099-10-01T12:00:00Z', read: false },
          i18n.t,
          language,
        );
        expect(text, type).not.toBe(unknown);
        // No placeholder is left unfilled, and no key leaks onto the screen.
        expect(text, type).not.toMatch(/\{\{|alerts\.types/);
      }
    },
  );

  it('never shows a raw type it does not know', () => {
    const text = notificationText(
      { id: 'n', type: 'payslip.available', parameters: {}, createdAt: '2099-10-01T12:00:00Z', read: false },
      i18n.t,
      'en',
    );

    expect(text).toBe(i18n.t('alerts.unknown'));
  });
});
