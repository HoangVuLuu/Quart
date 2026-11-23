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
    busyElsewhere: false,
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
    await userEvent.click(within(monday).getByRole('button', { name: /^Closing/ }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Tue 6' })).getByRole('button', { name: /^Opening/ }),
    );

    // Colour is never the only sign (NFR-008): the state is exposed as pressed.
    expect(within(monday).getByRole('button', { name: /^Closing/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(monday).getByRole('button', { name: /^Opening/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('2 shifts · 13 h selected');

    await userEvent.click(screen.getByRole('button', { name: en.availability.send }));

    const sent = calls.find((call) => call.path.endsWith('/availability/me/send'));
    // BR-032: last period's number is offered and sent with the shifts.
    expect(sent?.body).toEqual({
      shiftIds: ['mon-close', 'tue-open'],
      desiredWeeklyHours: 18,
      shiftNotes: [],
    });
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

  it('opens a period with a deadline 48 hours before it starts: the Saturday at 00:00', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: null, upcoming: [] },
      [`POST ${base}/periods`]: period,
    });
    renderApp('/schedule');

    // 2026-11-21: "Starts on" offers only Mondays, so no other day can be picked.
    const start = await screen.findByLabelText(en.schedule.open.start);
    const mondays = within(start)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(mondays).toHaveLength(12);
    expect(mondays.every((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    await userEvent.selectOptions(start, mondays[1]!);
    await userEvent.click(screen.getByRole('button', { name: en.schedule.open.submit }));

    const opened = calls.find((call) => call.method === 'POST' && call.path === `${base}/periods`);
    const saturday = new Date(Date.parse(`${mondays[1]}T00:00:00Z`) - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(opened?.body).toEqual({
      startDate: mondays[1],
      dueDate: saturday,
      dueTime: '00:00',
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
          hoursOffered: 13,
          desiredWeeklyHours: 14,
          notes: [],
        },
        {
          membershipId: kevin,
          name: 'Kevin T.',
          level: 3,
          status: 'not_sent',
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
    // 2026-11-21: the generator rules are changed only before a period is opened.
    expect(screen.queryByRole('link', { name: en.schedule.editGenerator })).not.toBeInTheDocument();
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
          notes: [{ membershipId: kevin, note: 'Until 21:00 only' }],
          managerNote: null,
          name: null,
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
      [`GET ${base}/periods/${periodId}/availability`]: {
        period: building,
        sentCount: 2,
        total: 2,
        people: [
          {
            membershipId: kevin,
            name: 'Kevin T.',
            level: 3,
            status: 'sent',
            hoursOffered: 20,
            desiredWeeklyHours: 20,
            notes: [
              { id: 'note-1', body: 'Exams on Thursday, evenings only', createdAt: '2099-10-01T12:00:00Z' },
            ],
          },
        ],
      },
    });
    renderApp('/schedule/build');

    expect(await screen.findByText('No level 3')).toBeInTheDocument();
    expect(screen.getByText(en.scheduling.grid.kept)).toBeInTheDocument();
    // FR-103a: the card says someone who can work it left a note.
    expect(screen.getByText(en.draft.editor.hasNotes)).toBeInTheDocument();
    // 2026-11-21: Publish is at the bottom, across the whole width.
    const publish = screen.getByRole('button', { name: en.draft.publish });
    expect(publish).toHaveClass('w-full');
    await userEvent.click(publish);

    const issues = await screen.findByRole('dialog', { name: en.issues.title });
    expect(within(issues).getByText(en.draft.severity.block)).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/draft/publish'))).toBe(false);

    // A missing level only asks (FR-144).
    expect(within(issues).getByText(en.draft.severity.confirm)).toBeInTheDocument();

    // From the issue to the shift, then add the level 3 who is available (mockup 1p).
    await userEvent.click(within(issues).getByRole('button', { name: /needs 1 at level 3/ }));
    const editor = await screen.findByRole('dialog', { name: /Closing/ });
    expect(within(editor).getByText(en.draft.editor.available)).toBeInTheDocument();
    // FR-103a: this shift's note shows by the name; the week notes wait in a closed section (2026-11-23).
    expect(within(editor).getByText('Until 21:00 only')).toBeInTheDocument();
    expect(within(editor).queryByText('Exams on Thursday, evenings only')).not.toBeInTheDocument();
    const weekNotes = within(editor).getByRole('button', { name: new RegExp(en.draft.editor.weekNotes) });
    expect(weekNotes).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(weekNotes);
    expect(await within(editor).findByText('Exams on Thursday, evenings only')).toBeInTheDocument();
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
          notes: [],
          managerNote: null,
          name: null,
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
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/trade');

    expect(await screen.findByText('Offered by Kevin T.')).toBeInTheDocument();
    // 2026-11-20: no Claim on the card; tapping it opens the shift with who works it.
    expect(screen.queryByRole('button', { name: en.marketplace.claim })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Open .*16:00–23:00/ }));
    const sheet = within(await screen.findByRole('dialog', { name: /Closing/ }));
    expect(sheet.getByText(en.marketplace.sheet.with)).toBeInTheDocument();
    // Kevin gives it away, so Sophie would work it with nobody else yet.
    expect(sheet.getByText(en.marketplace.sheet.alone)).toBeInTheDocument();
    // FR-186: a warning, not a block.
    expect(sheet.getByText(en.marketplace.wouldMissLevel)).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('button', { name: en.marketplace.claim }));

    // "Are you sure?" first: No changes nothing, Yes claims.
    const ask = within(await screen.findByRole('dialog', { name: en.marketplace.sheet.askClaim }));
    expect(calls.some((call) => call.path.endsWith('/marketplace/claims'))).toBe(false);
    await userEvent.click(ask.getByRole('button', { name: en.marketplace.sheet.yes }));

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

  it('puts the trash icon in the next-period box, and "Edit current period" under the shifts (1, 2, 3)', async () => {
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: published, next: { ...next, sentCount: 0 }, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/schedule');

    const box = (await screen.findByRole('heading', { name: en.schedule.box.open })).parentElement!;
    expect(within(box).getByRole('button', { name: en.cancelPeriod.button })).toBeInTheDocument();
    expect(within(box).queryByRole('link', { name: en.schedule.editGenerator })).not.toBeInTheDocument();
    // A full-width button after the last shift, in both views (2026-11-22).
    const edit = await screen.findByRole('link', { name: en.schedule.edit });
    expect(edit).toHaveAttribute('href', `/schedule/edit?period=${periodId}`);
    const last = screen.getAllByRole('heading').at(-1)!;
    expect(last.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: en.schedule.team }));
    expect(await screen.findByRole('link', { name: en.schedule.edit })).toBeInTheDocument();
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

describe('changes of 2026-11-20', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('says Request in the claim pop-up when a manager must approve, and No changes nothing', async () => {
    const shift = { id: 'mon-open', periodId, date: '2099-10-05', start: '10:00', end: '16:00' };
    const calls = signedIn('employee', {
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        claimsNeedApproval: true,
        openShifts: [{ shift, openSlots: 1, requested: false, seen: true }],
      },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/trade');

    await userEvent.click(await screen.findByRole('button', { name: /^Open .*10:00–16:00/ }));
    const sheet = within(await screen.findByRole('dialog', { name: /Opening/ }));
    expect(sheet.getByText('Kevin T.')).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('button', { name: en.marketplace.sheet.request }));
    const ask = within(await screen.findByRole('dialog', { name: en.marketplace.sheet.askRequest }));
    await userEvent.click(ask.getByRole('button', { name: en.marketplace.sheet.no }));

    expect(calls.some((call) => call.path.endsWith('/marketplace/claims'))).toBe(false);
  });

  it('opens someone’s answer from anywhere on their row in Team availability, not only the name', async () => {
    const team: Schemas['TeamAvailability'] = {
      period,
      sentCount: 0,
      total: 1,
      people: [
        {
          membershipId: kevin,
          name: 'Kevin T.',
          level: 3,
          status: 'not_sent',
          hoursOffered: 0,
          desiredWeeklyHours: null,
          notes: [],
        },
      ],
    };
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, sentCount: 0 }, upcoming: [] },
      [`GET ${base}/periods/${periodId}/availability`]: team,
    });
    renderApp('/availability/team');

    const link = await screen.findByRole('link', { name: 'Kevin T.' });
    expect(link).toHaveAttribute('href', `/availability/people/${periodId}/${kevin}`);
    // The link is stretched over the row; Remind stays its own button above it.
    expect(link.className).toContain('after:inset-0');
    expect(link.className).not.toContain('underline');
    expect(screen.getByRole('button', { name: 'Remind Kevin T.' })).toBeInTheDocument();
  });

  it('opens the availability form from "Availability is open", and back returns to Alerts', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/notifications`]: {
        unread: 1,
        items: [
          {
            id: 'n1',
            type: 'availability.requested',
            parameters: { periodStart: '2099-10-05', weeks: '1' },
            createdAt: '2099-10-01T12:00:00Z',
            read: false,
          },
        ],
      },
      [`POST ${base}/notifications/n1/read`]: status(204),
      [`GET ${base}/periods/current`]: { live: null, next, upcoming: [] },
      [`GET ${base}/periods/${periodId}/availability/me`]: myAvailability,
    });
    const router = renderApp('/alerts');

    await userEvent.click(await screen.findByRole('link', { name: /Availability is open/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/availability'));
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/notifications/n1/read'))).toBe(
      true,
    );

    await userEvent.click(await screen.findByRole('button', { name: en.shell.back }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/alerts'));
  });
});

describe('the next-period box once open (2026-11-21)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the deadline without a way to move it, no generator pen, and turns green when everyone sent', async () => {
    const dueAt = new Date(2099, 9, 3, 0, 0).toISOString();
    signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { ...next, period: { ...period, dueAt }, sentCount: 2 },
        upcoming: [],
      },
      [`GET ${base}/periods/${periodId}/availability`]: {
        period: { ...period, dueAt },
        sentCount: 2,
        total: 2,
        people: [],
      },
    });
    renderApp('/schedule');

    const box = (await screen.findByRole('heading', { name: en.schedule.box.open })).parentElement!;
    expect(await within(box).findByText(/Deadline:/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deadline/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: en.schedule.editGenerator })).not.toBeInTheDocument();
    expect(within(box).getByRole('link', { name: en.schedule.ready.team })).toHaveTextContent(
      'Availabilities',
    );
    await waitFor(() => expect(box).toHaveClass('bg-done'));
  });
});

describe('changes of 2026-11-22', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const building = { ...period, status: 'building', locked: true, draftSaved: true };
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

  it('on Home, "You\'re working next" opens the shift on Schedule, and the box goes straight to building (5, 7)', async () => {
    const nextId = '77777777-7777-4777-8777-777777777777';
    signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: published,
        next: { ...next, period: { ...building, id: nextId } },
        upcoming: [],
      },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/');

    expect(await screen.findByRole('link', { name: new RegExp(en.home.workingNext) })).toHaveAttribute(
      'href',
      `/schedule?period=${periodId}&shift=mon-close`,
    );
    expect(screen.getByRole('link', { name: 'Open draft' })).toHaveAttribute('href', '/schedule/build');
  });

  it('on Building Schedule: Save draft at the top, Generate and Clear on one row, the issues under them (6)', async () => {
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, period: building }, upcoming: [] },
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    renderApp('/schedule/build');

    const save = await screen.findByRole('button', { name: en.building.save });
    const title = screen.getByRole('heading', { name: en.building.title });
    expect(title.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const generate = screen.getByRole('button', { name: en.draft.generate });
    expect(generate.parentElement).toContainElement(screen.getByRole('button', { name: en.building.clear }));
    const issues = screen.getByRole('button', { name: en.issues.none });
    expect(generate.parentElement).not.toContainElement(issues);
  });

  it('on Editing Schedule: no Clear, and Cancel period at the bottom under Update (6)', async () => {
    const editing = { ...draft, period: published, hasUnpublishedChanges: false, hasUnsavedChanges: false };
    signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`POST ${base}/periods/${periodId}/draft/start`]: editing,
      [`GET ${base}/periods/${periodId}/draft`]: editing,
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    renderApp(`/schedule/edit?period=${periodId}`);

    const update = await screen.findByRole('button', { name: en.draft.update });
    expect(screen.queryByRole('button', { name: en.building.clear })).not.toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: en.cancelPeriod.button });
    expect(update.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('switches My shifts and Whole team from one row (3)', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: schedule,
    });
    renderApp('/schedule');

    const views = await screen.findByRole('group', { name: en.schedule.view });
    expect(within(views).getByRole('button', { name: en.schedule.mine })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(views).getByRole('button', { name: en.schedule.team }));
    expect(within(views).getByRole('button', { name: en.schedule.team })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('the manager’s note on a shift (FR-145)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const noted: Schemas['ScheduleView'] = {
    period: published,
    shifts: [
      { ...scheduleShift('mon-open', '2099-10-05', 'opening', [kevinT]), note: 'Bring the keys' },
      { ...scheduleShift('mon-close', '2099-10-05', 'closing', [sophie, kevinT]), note: 'Leaving at 5pm' },
    ],
  };

  it('marks my shift, reads in its sheet, and shows under every shift for the whole team', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: noted,
    });
    renderApp('/schedule');

    const card = await screen.findByRole('button', { name: new RegExp(en.managerNote.has) });
    expect(screen.queryByText('Leaving at 5pm')).not.toBeInTheDocument();
    await userEvent.click(card);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(en.managerNote.title)).toBeInTheDocument();
    expect(within(sheet).getByText('Leaving at 5pm')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    // Whole team: a mark on each shift with a note; tapping the shift opens it, tapping again closes it.
    await userEvent.click(screen.getByRole('button', { name: en.schedule.team }));
    const opening = await screen.findByRole('button', { name: /^Opening.*Has a note/ });
    expect(screen.getAllByText(en.managerNote.has)).toHaveLength(2);
    expect(screen.queryByText('Bring the keys')).not.toBeInTheDocument();
    await userEvent.click(opening);
    expect(opening).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Bring the keys')).toBeInTheDocument();
    expect(screen.queryByText('Leaving at 5pm')).not.toBeInTheDocument();
    await userEvent.click(opening);
    expect(screen.queryByText('Bring the keys')).not.toBeInTheDocument();
  });

  it('marks the next shift on Home when it has a note', async () => {
    signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: published, next: null, upcoming: [] },
      [`GET ${base}/periods/${periodId}/schedule`]: noted,
    });
    renderApp('/');

    expect(await screen.findByText(en.managerNote.has)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.home.viewShift }));
    expect(within(await screen.findByRole('dialog')).getByText('Leaving at 5pm')).toBeInTheDocument();
  });

  it('is written in the shift sheet on Building Schedule and shows on the card', async () => {
    const building = { ...period, status: 'building', locked: true, draftSaved: true };
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
          availableIds: [mine],
          notes: [],
          managerNote: 'Bring the keys',
          name: null,
        },
      ],
      people: [
        {
          membershipId: mine,
          name: 'Sophie L.',
          level: 2,
          desiredWeeklyHours: 20,
          maxWeeklyHours: null,
          availability: 'sent',
          weeklyHours: [7],
          noteCount: 0,
        },
      ],
      issues: [],
    };
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, period: building }, upcoming: [] },
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`PUT ${base}/periods/${periodId}/draft/shifts/mon-close/note`]: {
        ...draft,
        shifts: [{ ...draft.shifts[0]!, managerNote: 'Leaving at 5pm' }],
      },
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    renderApp('/schedule/build');

    expect(await screen.findByText('Bring the keys')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Closing/ }));
    const editor = await screen.findByRole('dialog', { name: /Closing/ });
    const field = within(editor).getByLabelText(en.managerNote.label);
    expect(field).toHaveValue('Bring the keys');
    expect(field).toHaveAttribute('maxLength', '100');
    await userEvent.clear(field);
    await userEvent.type(field, 'Leaving at 5pm');
    await userEvent.click(within(editor).getByRole('button', { name: en.managerNote.save }));

    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/draft/shifts/mon-close/note'))?.body).toEqual({
        note: 'Leaving at 5pm',
      }),
    );
  });
});
