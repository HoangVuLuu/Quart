import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { formatDue } from '../../i18n/format';
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
  draftSaved: false,
  dueAt: '2099-10-02T22:00:00Z',
  requestAt: '2099-09-21T13:00:00Z',
  requestSent: true,
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
  desiredWeeklyHours: 18,
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
    // BR-032: last period's number is offered and sent with the shifts.
    expect(sent?.body).toEqual({ shiftIds: ['mon-close', 'tue-open'], desiredWeeklyHours: 18 });
  });

  it('tells staff when availability is due, on Home and on the availability page (FR-091, mockup 1a)', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: null, next, upcoming: [] },
      [`GET ${base}/periods/${periodId}/availability/me`]: myAvailability,
    });
    const router = renderApp('/');
    const due = `Due ${formatDue(period.dueAt ?? '', 'en')}`;

    expect(await screen.findByText(due)).toBeInTheDocument();
    await router.navigate('/availability');
    await screen.findByRole('heading', { name: en.availability.title });
    expect(await screen.findByText(due)).toBeInTheDocument();
  });

  it('opens a period with a deadline three days before it starts, at 18:00 unless changed', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: null, upcoming: [] },
      [`POST ${base}/periods`]: period,
    });
    renderApp('/schedule');

    const start = await screen.findByLabelText(en.schedule.open.start);
    await userEvent.clear(start);
    await userEvent.type(start, '2099-10-05');
    await userEvent.click(screen.getByRole('button', { name: en.schedule.open.submit }));

    const opened = calls.find((call) => call.method === 'POST' && call.path === `${base}/periods`);
    expect(opened?.body).toEqual({
      startDate: '2099-10-05',
      dueDate: '2099-10-02',
      dueTime: '18:00',
    });
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

  it('says why "I work shifts too" cannot be turned off while the owner still has shifts (D1)', async () => {
    signedIn('owner', {
      [`PATCH ${base}/members/${workplace('owner').me.membershipId}`]: status(409, {
        code: 'workplace.has_upcoming_shifts',
      }),
    });
    renderApp('/profile');
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: /I work shifts too/ });
    await user.click(toggle);

    await screen.findByText(en.errors.workplace.has_upcoming_shifts);
    expect(toggle).toBeChecked();
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

  it('shows who works my shift on Schedule, and gives it away from My shifts to trade (2.2, 2.3)', async () => {
    const shiftRef = { id: 'mon-close', periodId, date: '2099-10-05', start: '16:00', end: '23:00' };
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        mine: [{ shift: shiftRef, offered: false, tradePending: false }],
      },
      [`POST ${base}/marketplace/give-aways`]: status(204),
    });
    const router = renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: /Closing/ }));
    const people = within(await screen.findByRole('dialog', { name: /Closing/ }));
    expect(people.getByText(en.schedule.sheet.with)).toBeInTheDocument();
    expect(people.queryByRole('button', { name: en.schedule.sheet.giveAway })).toBeNull();

    await router.navigate('/trade/mine');
    await userEvent.click(await screen.findByRole('button', { name: /16:00–23:00/ }));
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
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, sentCount: 1 }, upcoming: [] },
      [`GET ${base}/periods/${periodId}/availability`]: team,
    });
    renderApp('/schedule');

    // 4.1: the box at the top says the period is open, how many sent, and leads to Building Schedule.
    expect(await screen.findByRole('heading', { name: en.schedule.box.open })).toBeInTheDocument();
    expect(await screen.findByText('1 of 2 sent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.schedule.box.build })).toHaveAttribute(
      'href',
      '/schedule/build',
    );
    expect(screen.getByRole('link', { name: en.schedule.editGenerator })).toHaveAttribute(
      'href',
      '/generator',
    );
  });

  it('enters Building Schedule, saves the draft, and asks before leaving with unsaved changes (4.3)', async () => {
    const building = { ...period, status: 'building', locked: true };
    const draft: Schemas['DraftView'] = {
      period: building,
      seed: null,
      score: 0,
      openSlots: 0,
      hasUnpublishedChanges: true,
      hasUnsavedChanges: true,
      shifts: [],
      people: [],
      issues: [],
    };
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, period: building }, upcoming: [] },
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`POST ${base}/periods/${periodId}/draft/save`]: { ...draft, hasUnsavedChanges: false },
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    renderApp('/schedule/build');

    expect(await screen.findByRole('heading', { name: en.building.title })).toBeInTheDocument();
    // Unsaved changes: Save draft is on.
    await waitFor(() => expect(screen.getByRole('button', { name: en.building.save })).toBeEnabled());
    await userEvent.click(await screen.findByRole('button', { name: en.shell.back }));
    const leaving = within(await screen.findByRole('dialog', { name: en.building.leaveTitle }));
    await userEvent.click(leaving.getByRole('button', { name: en.building.save }));

    expect(calls.some((call) => call.path.endsWith('/draft/start'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/draft/save'))).toBe(true);
    expect(await screen.findByRole('heading', { name: en.schedule.title })).toBeInTheDocument();
  });

  it('will not publish a draft with a blocking issue: it opens the issues instead', async () => {
    const building = { ...period, status: 'building', locked: true };
    const draft: Schemas['DraftView'] = {
      period: building,
      seed: 7,
      score: 500,
      openSlots: 1,
      hasUnpublishedChanges: true,
      hasUnsavedChanges: false,
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
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`POST ${base}/periods/${periodId}/draft/assignments`]: { ...draft, issues: [] },
    });
    renderApp('/schedule/build');

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
      hasUnsavedChanges: false,
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
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`POST ${base}/periods/${periodId}/draft/assignments`]: draft,
    });
    renderApp('/schedule/build');

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
        sent: '12',
        total: '15',
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

describe('changes of 2026-11-19', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('puts the trash and pen icons in the next-period box, and the edit pen on the My shifts row (1, 2, 3)', async () => {
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: published, next: { ...next, sentCount: 0 }, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/schedule');

    const box = (await screen.findByRole('heading', { name: en.schedule.box.open })).parentElement!;
    expect(within(box).getByRole('button', { name: en.cancelPeriod.button })).toBeInTheDocument();
    expect(within(box).getByRole('link', { name: en.schedule.editGenerator })).toHaveAttribute(
      'href',
      '/generator',
    );
    const row = (await screen.findByRole('button', { name: en.schedule.mine })).parentElement!;
    expect(within(row).getByRole('link', { name: en.schedule.edit })).toHaveAttribute(
      'href',
      `/schedule/edit?period=${periodId}`,
    );
  });

  it('opens who works the next shift from Home, without leaving Home (5)', async () => {
    const router = (() => {
      signedIn('employee', {
        [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
        [`GET ${base}/periods/${periodId}/schedule`]: schedule,
      });
      return renderApp('/');
    })();

    await userEvent.click(await screen.findByRole('button', { name: en.home.viewShift }));
    const people = within(await screen.findByRole('dialog'));
    expect(people.getByText(en.schedule.sheet.with)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps Whole team when switching periods (8)', async () => {
    const laterId = '66666666-6666-4666-8666-666666666666';
    const later = { ...published, id: laterId, startDate: '2099-10-19', endDate: '2099-11-01' };
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [later] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
      [`GET ${base}/periods/${laterId}/schedule`]: { period: later, shifts: [] },
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: en.schedule.team }));
    const which = screen.getByRole('group', { name: en.schedule.which });
    await userEvent.click(within(which).getAllByRole('button')[1]!);

    expect(await screen.findByRole('button', { name: en.schedule.team })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens a shift from an alert link, with who works it (10)', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp(`/schedule?period=${periodId}&shift=mon-close`);

    const people = within(await screen.findByRole('dialog', { name: /Closing/ }));
    expect(people.getByText('Kevin T.')).toBeInTheDocument();
  });

  it('gives each alert an eye that marks it read, and links the ones that lead somewhere (6, 7, 10)', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/notifications`]: {
        unread: 2,
        items: [
          {
            id: 'n1',
            type: 'claim.approved',
            parameters: {
              date: '2099-10-05',
              start: '16:00',
              end: '23:00',
              name: 'Sophie L.',
              periodId,
              shiftId: 'mon-close',
            },
            createdAt: '2099-10-01T12:00:00Z',
            read: false,
          },
          {
            id: 'n2',
            type: 'availability.sent',
            parameters: { name: 'Kevin T.', periodStart: '2099-10-05', periodId, membershipId: kevin },
            createdAt: '2099-10-01T12:00:00Z',
            read: false,
          },
          {
            id: 'n3',
            type: 'member.joined',
            parameters: { name: 'Amélie T.' },
            createdAt: '2099-10-01T12:00:00Z',
            read: true,
          },
        ],
      },
      [`POST ${base}/notifications/n1/read`]: status(204),
    });
    renderApp('/alerts');

    expect(await screen.findByRole('link', { name: /is yours/ })).toHaveAttribute(
      'href',
      `/schedule?period=${periodId}&shift=mon-close`,
    );
    expect(screen.getByRole('link', { name: /sent their availability/ })).toHaveAttribute(
      'href',
      `/availability/people/${periodId}/${kevin}`,
    );
    expect(screen.queryByRole('link', { name: /joined the team/ })).not.toBeInTheDocument();
    // A read alert has no eye.
    expect(screen.getAllByRole('button', { name: /Mark as read/ })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: /Mark as read/ })[0]!);
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/notifications/n1/read'))).toBe(
      true,
    );
  });

  it('shows a manager one person’s answer, read-only (6)', async () => {
    signedIn('owner', {
      [`GET ${base}/periods/${periodId}/availability/${kevin}`]: {
        period,
        membershipId: kevin,
        name: 'Kevin T.',
        status: 'sent',
        desiredWeeklyHours: 24,
        shifts: myAvailability.shifts.map((shift) => ({ ...shift, selected: shift.id === 'mon-close' })),
        notes: [{ id: 'note-1', body: 'Exams that week', createdAt: '2099-10-01T12:00:00Z' }],
      },
    });
    renderApp(`/availability/people/${periodId}/${kevin}`);

    expect(await screen.findByRole('heading', { name: 'Kevin T.' })).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Exams that week')).toBeInTheDocument();
    const monday = within(screen.getByRole('list', { name: 'Mon 5' }));
    expect(monday.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '– Opening not available10:00–16:00',
      '✓ Closing available16:00–23:00',
    ]);
    // Nothing to change: no shift buttons and no Send.
    expect(screen.queryByRole('button', { name: /Closing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.availability.send })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.shell.back })).toBeInTheDocument();
  });

  it('lists trades above open shifts on the Trade tab (9)', async () => {
    const gives = { id: 'mon-close', periodId, date: '2099-10-05', start: '16:00', end: '23:00' };
    const gets = { id: 'tue-open', periodId, date: '2099-10-06', start: '10:00', end: '16:00' };
    signedIn('employee', {
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        openShifts: [{ shift: gets, openSlots: 1, requested: false, seen: true }],
        trades: [
          {
            id: 'trade-1',
            status: 'requested',
            role: 'coworker',
            requesterName: 'Kevin T.',
            gives,
            coworkerName: 'Sophie L.',
            gets,
            wouldMissLevel: false,
            seen: true,
          },
        ],
      },
    });
    renderApp('/trade');

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (heading) => heading.textContent,
    );
    expect(headings.indexOf(en.marketplace.trades)).toBeLessThan(headings.indexOf(en.marketplace.open));
    expect(headings.indexOf(en.marketplace.trades)).toBeGreaterThanOrEqual(0);
  });
});
