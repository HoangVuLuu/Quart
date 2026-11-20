import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn } from '../../test/app';

// FR-094, M5-11: a shift that overlaps one the person already works at another workplace is greyed out.
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
  dueAt: '2099-10-02T22:00:00Z',
};
const shift = (id: string, start: string, end: string, busyElsewhere: boolean) => ({
  id,
  blockId: `block-${start}`,
  date: '2099-10-05',
  start,
  end,
  hours: 6,
  selected: false,
  busyElsewhere,
});
const mine: Schemas['MyAvailability'] = {
  period,
  status: 'not_sent',
  canEdit: true,
  hasPrevious: false,
  desiredWeeklyHours: 20,
  shifts: [shift('mon-open', '10:00', '16:00', true), shift('mon-close', '16:00', '22:00', false)],
  notes: [],
};

describe('availability with a shift at another workplace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('greys out the overlapping block and sends only what can be worked', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { period, myAvailability: 'not_sent', canEditAvailability: true, sentCount: null },
        upcoming: [],
      },
      [`GET ${base}/periods/${periodId}/availability/me`]: mine,
      [`POST ${base}/periods/${periodId}/availability/me/send`]: { ...mine, status: 'sent' },
    });
    const router = renderApp('/');
    await screen.findByRole('heading', { name: /Hi/ });
    await router.navigate('/availability');

    expect(await screen.findByText(en.availability.busyElsewhereHint)).toBeInTheDocument();
    const busy = screen.getByText(en.availability.busyElsewhere).closest('button')!;
    expect(busy).toBeDisabled();
    const day = busy.closest('[role="group"]') as HTMLElement;
    const buttons = within(day).getAllByRole('button');
    await userEvent.click(buttons[1]!);
    await userEvent.click(screen.getByRole('button', { name: en.availability.send }));

    expect(calls.find((call) => call.path.endsWith('/availability/me/send'))?.body).toEqual({
      shiftIds: ['mon-close'],
      desiredWeeklyHours: 20,
    });
  });
});
