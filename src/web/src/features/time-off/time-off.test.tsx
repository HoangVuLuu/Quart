import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { base, renderApp, signedIn, status, type ApiCall } from '../../test/app';

// BL-01 (Hoang, 2026-11-25): staff ask from Home, managers answer from Alerts.
const nothing = { canRequest: true, current: null };
const waiting = {
  canRequest: false,
  current: { id: 'to-1', firstDay: '2099-12-14', lastDay: '2099-12-20', status: 'pending', now: false },
};

describe('time off', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('asks from the bottom of Home, with a first and a last day', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/time-off/mine`]: nothing,
      [`POST ${base}/time-off`]: status(201, waiting.current),
    });
    const router = renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: en.timeOff.home.request }));
    expect(await screen.findByRole('heading', { name: en.timeOff.title })).toBeInTheDocument();
    await user.type(screen.getByLabelText(en.timeOff.firstDay), '2099-12-14');
    await user.type(screen.getByLabelText(en.timeOff.lastDay), '2099-12-20');
    await user.type(
      screen.getByLabelText(new RegExp(en.timeOff.reason.replace(/[()]/g, '.'))),
      'Family trip',
    );
    expect(screen.getByText(/7 days/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.timeOff.send }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(calls.find((call) => call.method === 'POST' && call.path === `${base}/time-off`)?.body).toEqual({
      firstDay: '2099-12-14',
      lastDay: '2099-12-20',
      reason: 'Family trip',
    });
  });

  it('"Undetermined" sends no last day', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/time-off/mine`]: nothing,
      [`POST ${base}/time-off`]: status(201, waiting.current),
    });
    renderApp('/time-off');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(en.timeOff.firstDay), '2099-12-14');
    await user.click(screen.getByRole('switch', { name: new RegExp(en.timeOff.undetermined) }));
    expect(screen.queryByLabelText(en.timeOff.lastDay)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.timeOff.send }));

    await waitFor(() =>
      expect(calls.find((call: ApiCall) => call.method === 'POST')?.body).toEqual({
        firstDay: '2099-12-14',
        lastDay: null,
        reason: null,
      }),
    );
  });

  it('going back without sending asks first', async () => {
    signedIn('employee', { [`GET ${base}/time-off/mine`]: nothing });
    renderApp('/time-off');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(en.timeOff.firstDay), '2099-12-14');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('dialog', { name: en.timeOff.leave.title })).toBeInTheDocument();
  });

  it('shows the waiting request on Home, which can be cancelled', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/time-off/mine`]: waiting,
      [`POST ${base}/time-off/to-1/cancel`]: status(204),
    });
    renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByText(en.timeOff.home.pending)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: en.timeOff.home.request })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.timeOff.home.cancel }));

    await waitFor(() =>
      expect(calls.some((call) => call.path === `${base}/time-off/to-1/cancel`)).toBe(true),
    );
  });

  it('a manager accepts from Alerts, warned about the shifts it opens', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/time-off`]: [
        {
          id: 'to-1',
          membershipId: 'm-1',
          name: 'Jasmine K.',
          firstDay: '2099-12-14',
          lastDay: '2099-12-20',
          reason: 'Family trip',
          shiftsInDays: 2,
        },
      ],
      [`POST ${base}/time-off/to-1/accept`]: status(204),
    });
    renderApp('/alerts');
    const user = userEvent.setup();

    const card = (await screen.findByText('Jasmine K. asks for time off')).closest('div')!.parentElement!;
    expect(within(card).getByText('Works 2 shifts in those days')).toBeInTheDocument();
    expect(within(card).getByText(/Family trip/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: en.timeOff.alerts.accept }));

    await waitFor(() =>
      expect(calls.some((call) => call.path === `${base}/time-off/to-1/accept`)).toBe(true),
    );
  });
});
