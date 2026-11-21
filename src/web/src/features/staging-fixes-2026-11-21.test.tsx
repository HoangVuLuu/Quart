import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import type { Schemas } from '../lib/api/client';
import { base, renderApp, signedIn, status } from '../test/app';

// Fixes from testing on staging, 2026-11-21.
const periodId = '55555555-5555-4555-8555-555555555555';
const period: Schemas['PeriodSummary'] = {
  id: periodId,
  startDate: '2099-10-05',
  endDate: '2099-10-11',
  weeks: 1,
  status: 'collecting',
  version: 0,
  locked: false,
  draftSaved: false,
  dueAt: '2099-10-03T04:00:00Z',
};

describe('staging fixes of 2026-11-21', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows staff no role or level on Profile (6)', async () => {
    signedIn('employee');
    renderApp('/profile');
    await screen.findByRole('heading', { name: en.profile.title });
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Barista/)).not.toBeInTheDocument();
  });

  it('turns the Home box green with "Ready to build" once everyone sent (7, 8)', async () => {
    signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { period, myAvailability: 'sent', canEditAvailability: true, sentCount: 2 },
        upcoming: [],
      },
      [`GET ${base}/periods/${periodId}/availability`]: { period, sentCount: 2, total: 2, people: [] },
    });
    renderApp('/');

    const box = (await screen.findByRole('heading', { name: en.home.period.collected })).parentElement!;
    expect(box).toHaveClass('bg-done');
    const buttons = within(box).getAllByRole('link');
    expect(buttons.map((link) => link.textContent)).toEqual(['Ready to build', en.home.period.who]);
    // Side by side, one line.
    expect(buttons[0]!.parentElement).toHaveClass('grid-cols-2');
  });

  it('opens Schedule from "the schedule is published" and marks it read (12)', async () => {
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

    await userEvent.click(await screen.findByRole('link', { name: /published/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/schedule'));
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/notifications/n1/read'))).toBe(
      true,
    );
  });
});
