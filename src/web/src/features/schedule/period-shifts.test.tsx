import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn, status } from '../../test/app';

// One period's own shifts (M4-01, 2026-11-23): days that started stay as they are, a closed day reopens, and on a
// published period Save says first that the team is told.
const periodId = '44444444-4444-4444-8444-444444444444';
const shift = (id: string, date: string, start: string, end: string): Schemas['PeriodShift'] => ({
  id,
  date,
  blockId: start === '10:00' ? 'b-open' : 'b-close',
  name: null,
  start,
  end,
  headcount: 2,
  requirements: [],
  addedByHand: false,
  started: date === '2099-10-05',
});
const view: Schemas['PeriodShifts'] = {
  period: {
    id: periodId,
    startDate: '2099-10-05',
    endDate: '2099-10-11',
    weeks: 1,
    status: 'published',
    version: 1,
    locked: true,
    draftSaved: false,
    dueAt: null,
  },
  shifts: ['05', '06', '07', '09', '10', '11'].flatMap((day) => [
    shift(`o${day}`, `2099-10-${day}`, '10:00', '16:00'),
    shift(`c${day}`, `2099-10-${day}`, '16:00', '22:00'),
  ]),
  rules: [
    {
      date: '2099-10-08',
      blockId: 'b-open',
      name: null,
      start: '10:00',
      end: '16:00',
      headcount: 2,
      requirements: [],
    },
  ],
  startedDays: ['2099-10-05'],
};

describe("a period's own shifts (M4-01)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('leaves started days alone, reopens a closed day, removes a shift, and asks before going live', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/periods/${periodId}/shifts`]: view,
      [`PUT ${base}/periods/${periodId}/shifts`]: status(204),
    });
    const router = renderApp(`/schedule/shifts?period=${periodId}`);

    expect(await screen.findByRole('heading', { name: en.dayEditor.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Mon, Oct 5' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Reopen Thu, Oct 8' }));

    await userEvent.click(screen.getByRole('button', { name: 'Edit Tue, Oct 6' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/schedule/shifts/2099-10-06'));
    await userEvent.click(await screen.findByRole('button', { name: /^Closing, 16:00 to 22:00/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Closing' });
    await userEvent.click(within(sheet).getByRole('button', { name: en.dayEditor.delete }));

    // Editing <date> has its own Save (2026-11-23): it saves every day changed, Thursday's reopening too.
    await userEvent.click(await screen.findByRole('button', { name: en.dayEditor.save }));
    const dialog = await screen.findByRole('dialog', { name: en.dayEditor.liveTitle });
    await userEvent.click(within(dialog).getByRole('button', { name: en.dayEditor.liveConfirm }));

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const sent =
      (calls.find((call) => call.method === 'PUT')?.body as Schemas['SavePeriodShifts']).shifts ?? [];
    // Monday has started: not sent, so not removed.
    expect(sent.some((item) => item.date === '2099-10-05')).toBe(false);
    expect(sent.some((item) => item.id === 'c06')).toBe(false);
    expect(sent.filter((item) => item.date === '2099-10-08')).toEqual([
      expect.objectContaining({ id: null, blockId: 'b-open', start: '10:00' }),
    ]);
    expect(sent.find((item) => item.id === 'o06')).toEqual(
      expect.objectContaining({ blockId: null, end: '16:00' }),
    );
  });

  it('going back from a changed day asks before leaving', async () => {
    signedIn('owner', { [`GET ${base}/periods/${periodId}/shifts`]: view });
    renderApp(`/schedule/shifts/2099-10-06?period=${periodId}`);

    expect(await screen.findByRole('heading', { name: 'Editing Tue, Oct 6' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^Closing, 16:00 to 22:00/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Closing' });
    await userEvent.click(within(sheet).getByRole('button', { name: en.dayEditor.delete }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('dialog', { name: en.generator.leave.title })).toBeInTheDocument();
  });
});
