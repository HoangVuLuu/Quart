import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import type { Schemas } from '../lib/api/client';
import { base, emptyBoard, renderApp, signedIn, status } from '../test/app';

// The change list of 2026-11-18, as people meet it on screen.
const periodId = '44444444-4444-4444-8444-444444444444';
const period: Schemas['PeriodSummary'] = {
  id: periodId,
  startDate: '2099-10-05',
  endDate: '2099-10-11',
  weeks: 1,
  status: 'collecting',
  version: 0,
  locked: false,
  draftSaved: false,
};
const next = { period, myAvailability: 'not_sent', canEditAvailability: true, sentCount: null };
const mine: Schemas['MyAvailability'] = {
  period,
  status: 'not_sent',
  canEdit: true,
  hasPrevious: false,
  desiredWeeklyHours: null,
  shifts: [
    {
      id: 'mon-open',
      blockId: 'block-open',
      date: '2099-10-05',
      start: '10:00',
      end: '16:00',
      hours: 6,
      selected: false,
    },
  ],
  notes: [],
};
const shiftRef = { id: 'mon-open', periodId, date: '2099-10-05', start: '10:00', end: '16:00' };

describe('changes of 2026-11-18', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('needs the hours wanted to send availability, then goes back where it was opened from (1.1, 1.2, 6)', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: { live: null, next, upcoming: [] },
      [`GET ${base}/periods/${periodId}/availability/me`]: mine,
      [`POST ${base}/periods/${periodId}/availability/me/send`]: { ...mine, status: 'sent' },
    });
    const router = renderApp('/');
    await screen.findByRole('heading', { name: /Hi/ });
    await router.navigate('/availability');

    await userEvent.click(await screen.findByRole('button', { name: en.availability.send }));
    expect(await screen.findByText(en.errors.availability.hours_required)).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/availability/me/send'))).toBe(false);

    await userEvent.type(screen.getByLabelText(en.availability.wanted), '22');
    await userEvent.click(screen.getByRole('button', { name: en.availability.send }));

    expect(calls.find((call) => call.path.endsWith('/availability/me/send'))?.body).toEqual({
      shiftIds: [],
      desiredWeeklyHours: 22,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('puts the trade button above the list, counts unopened items on the tab, and opening one marks it (2.1, 2.4)', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/marketplace`]: {
        ...emptyBoard,
        openShifts: [{ shift: shiftRef, openSlots: 1, requested: false, seen: false }],
        unseen: 1,
      },
      [`POST ${base}/marketplace/seen`]: status(204),
    });
    renderApp('/trade');

    const button = await screen.findByRole('link', { name: en.trade.fromSchedule });
    expect(button).toHaveAttribute('href', '/trade/mine');
    expect(await screen.findByRole('link', { name: `${en.nav.trade} 1 waiting` })).toBeInTheDocument();
    const card = (await screen.findByText(en.trade.new)).closest('div')!;
    await userEvent.click(card);

    expect(calls.find((call) => call.path.endsWith('/marketplace/seen'))?.body).toEqual({
      key: 'slot:mon-open',
    });
  });

  it('shows the empty state on My shifts to trade, with a way back to Trade (2.2)', async () => {
    signedIn('employee', { [`GET ${base}/marketplace`]: emptyBoard });
    const router = renderApp('/trade/mine');

    expect(await screen.findByText(en.trade.mine.empty)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.shell.back }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/trade'));
  });

  it('marks a notification read when tapped, and stays on Alerts (5)', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/notifications`]: {
        unread: 1,
        items: [
          {
            id: 'n1',
            type: 'schedule.published',
            parameters: { periodStart: '2099-10-05', version: '1' },
            createdAt: '2099-10-01T12:00:00Z',
            read: false,
          },
        ],
      },
      [`POST ${base}/notifications/n1/read`]: status(204),
    });
    const router = renderApp('/alerts');

    await userEvent.click(await screen.findByRole('button', { name: /Mark as read/ }));

    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/notifications/n1/read'))).toBe(
      true,
    );
    expect(router.state.location.pathname).toBe('/alerts');
  });

  it('opens the next period with the length set in the generator rules (7)', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: null, upcoming: [] },
      [`GET ${base}/generator`]: { periodWeeks: 1 },
      [`POST ${base}/periods`]: period,
    });
    renderApp('/schedule');

    const box = within(
      (await screen.findByRole('heading', { name: en.schedule.open.title })).closest('section, div')!
        .parentElement!,
    );
    await waitFor(() => expect(box.getByText('1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: en.schedule.open.submit }));

    expect(
      (
        calls.find((call) => call.method === 'POST' && call.path === `${base}/periods`)?.body as {
          weeks: number;
        }
      ).weeks,
    ).toBe(1);
  });

  it('lets a manager cancel the next period after an "Are you sure?", then offers to open a new one', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: { ...next, sentCount: 1 }, upcoming: [] },
      [`DELETE ${base}/periods/${periodId}`]: status(204),
      [`GET ${base}/generator`]: { periodWeeks: 1 },
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: en.cancelPeriod.button }));
    const dialog = await screen.findByRole('dialog', { name: en.cancelPeriod.title });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: en.cancelPeriod.confirm }));

    await waitFor(() =>
      expect(
        calls.some((call) => call.method === 'DELETE' && call.path === `${base}/periods/${periodId}`),
      ).toBe(true),
    );
    expect(await screen.findByText(en.cancelPeriod.done)).toBeInTheDocument();
  });
});
