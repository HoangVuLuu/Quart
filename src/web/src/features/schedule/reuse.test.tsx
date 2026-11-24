import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn, status } from '../../test/app';

// "Reuse a past schedule" (FR-124, M5-08) and the pen next to each day (M4-01) on Building Schedule.
const periodId = '44444444-4444-4444-8444-444444444444';
const period: Schemas['PeriodSummary'] = {
  id: periodId,
  startDate: '2099-10-05',
  endDate: '2099-10-11',
  weeks: 1,
  status: 'building',
  version: 0,
  locked: true,
  draftSaved: false,
  dueAt: null,
};
const shift: Schemas['DraftShift'] = {
  id: 'mon-open',
  blockId: 'b-open',
  date: '2099-10-05',
  start: '10:00',
  end: '16:00',
  hours: 6,
  headcount: 2,
  part: 'opening',
  requirements: [],
  people: [],
  availableIds: [],
  notes: [],
  managerNote: null,
  name: null,
  addedByHand: false,
};
const draft: Schemas['DraftView'] = {
  period,
  seed: null,
  score: 0,
  openSlots: 2,
  hasUnpublishedChanges: true,
  hasUnsavedChanges: true,
  shifts: [shift],
  people: [],
  issues: [],
};

describe('Building Schedule extras', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('reuses a past schedule picked from a sheet', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { period, myAvailability: 'sent', canEditAvailability: false, sentCount: 1 },
        upcoming: [],
      },
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`GET ${base}/periods/${periodId}/draft/reuse`]: [
        { id: 'past', startDate: '2099-09-28', endDate: '2099-10-04', weeks: 1 },
      ],
      [`POST ${base}/periods/${periodId}/draft/reuse`]: draft,
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    renderApp('/schedule/build');

    await userEvent.click(await screen.findByRole('button', { name: en.draft.reuse.button }));
    const sheet = await screen.findByRole('dialog', { name: en.draft.reuse.title });
    await userEvent.click(await within(sheet).findByRole('button', { name: /Sep 28/ }));

    await waitFor(() =>
      expect(
        calls.find((call) => call.method === 'POST' && call.path.endsWith('/draft/reuse'))?.body,
      ).toEqual({
        sourcePeriodId: 'past',
      }),
    );
    expect(await screen.findByText(en.draft.reuse.done)).toBeInTheDocument();
  });

  it('saves the draft before the pen next to a day opens its shifts', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: {
        live: null,
        next: { period, myAvailability: 'sent', canEditAvailability: false, sentCount: 1 },
        upcoming: [],
      },
      [`POST ${base}/periods/${periodId}/draft/start`]: draft,
      [`GET ${base}/periods/${periodId}/draft`]: draft,
      [`POST ${base}/periods/${periodId}/draft/save`]: { ...draft, hasUnsavedChanges: false },
      [`POST ${base}/periods/${periodId}/draft/leave`]: status(204),
    });
    const router = renderApp('/schedule/build');

    await userEvent.click(await screen.findByRole('button', { name: /^Edit Monday/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/schedule/shifts/2099-10-05'));
    expect(router.state.location.search).toBe(`?period=${periodId}`);
    expect(calls.some((call) => call.path.endsWith('/draft/save'))).toBe(true);
  });
});
