import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn } from '../../test/app';

// FR-103a: a short note on one chosen shift, from a strip on the right of its pill.
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
const shift = (id: string, start: string, end: string, selected = false, note: string | null = null) => ({
  id,
  blockId: `block-${start}`,
  date: '2099-10-05',
  start,
  end,
  hours: 6,
  selected,
  busyElsewhere: false,
  note,
});
const mine = (shifts: Schemas['AvailabilityShift'][], canEdit = true): Schemas['MyAvailability'] => ({
  period,
  status: 'not_sent',
  canEdit,
  hasPrevious: false,
  desiredWeeklyHours: 20,
  shifts,
  notes: [],
});

async function openForm(answer: Schemas['MyAvailability']) {
  const calls = signedIn('employee', {
    [`GET ${base}/periods/current`]: {
      live: null,
      next: { period, myAvailability: 'not_sent', canEditAvailability: answer.canEdit, sentCount: null },
      upcoming: [],
    },
    [`GET ${base}/periods/${periodId}/availability/me`]: answer,
    [`POST ${base}/periods/${periodId}/availability/me/send`]: { ...answer, status: 'sent' },
  });
  const router = renderApp('/');
  await screen.findByRole('heading', { name: /Hi/ });
  await router.navigate('/availability');
  // The form, not the skeleton.
  await screen.findByLabelText(en.availability.wanted);
  return calls;
}

// "Add a note for Mon 5 · Closing", whatever the date's format.
const strip = (verb: 'add' | 'edit', shiftName: string) => (name: string) =>
  name.startsWith(en.shiftNote[verb].split('{{day}}')[0]!) && name.endsWith(`· ${shiftName}`);

describe('a note on one shift (FR-103a)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the strip only on a chosen shift, and a note is saved, shown under the day and sent', async () => {
    const calls = await openForm(
      mine([shift('mon-open', '10:00', '16:00'), shift('mon-close', '16:00', '22:00')]),
    );
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: strip('add', 'Closing') })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Closing/, pressed: false }));
    await user.click(screen.getByRole('button', { name: strip('add', 'Closing') }));

    const sheet = await screen.findByRole('dialog', {
      name: (name) => name.startsWith(en.shiftNote.title.split('{{day}}')[0]!) && name.endsWith('· Closing'),
    });
    expect(within(sheet).getByText(en.shiftNote.hint)).toBeInTheDocument();
    const field = within(sheet).getByLabelText(en.shiftNote.label);
    // Opening the sheet does not pop the keyboard up (2026-11-23).
    expect(field).not.toHaveFocus();
    expect(field).toHaveAttribute('maxLength', '60');
    await user.type(field, 'Until 21:00 only');
    expect(within(sheet).getByText('16/60')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: en.shiftNote.save }));

    // Tapping the strip did not change the choice; the note reads under the day.
    expect(screen.getByRole('button', { name: /Closing/, pressed: true })).toBeInTheDocument();
    expect(await screen.findByText('Closing: Until 21:00 only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strip('edit', 'Closing') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en.availability.send }));
    expect(calls.find((call) => call.path.endsWith('/availability/me/send'))?.body).toEqual({
      shiftIds: ['mon-close'],
      desiredWeeklyHours: 20,
      shiftNotes: [{ shiftId: 'mon-close', note: 'Until 21:00 only' }],
    });
  });

  it('Return saves the note and closes the sheet (2026-11-23)', async () => {
    await openForm(mine([shift('mon-open', '10:00', '16:00'), shift('mon-close', '16:00', '22:00')]));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Closing/, pressed: false }));
    await user.click(screen.getByRole('button', { name: strip('add', 'Closing') }));
    const sheet = await screen.findByRole('dialog');

    await user.type(within(sheet).getByLabelText(en.shiftNote.label), 'Until 21:00 only{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Closing: Until 21:00 only')).toBeInTheDocument();
  });

  it('unselecting the shift removes its note without asking, and the sheet can remove it too', async () => {
    const calls = await openForm(
      mine([
        shift('mon-open', '10:00', '16:00', true, 'Can start later'),
        shift('mon-close', '16:00', '22:00', true, 'Prefer not'),
      ]),
    );
    const user = userEvent.setup();
    expect(screen.getByText('Opening: Can start later')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Opening/, pressed: true }));
    expect(screen.queryByText('Opening: Can start later')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strip('edit', 'Opening') })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: strip('edit', 'Closing') }));
    await user.click(await screen.findByRole('button', { name: en.shiftNote.remove }));
    expect(screen.queryByText('Closing: Prefer not')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en.availability.send }));
    expect(calls.find((call) => call.path.endsWith('/availability/me/send'))?.body).toEqual({
      shiftIds: ['mon-close'],
      desiredWeeklyHours: 20,
      shiftNotes: [],
    });
  });

  it('once locked, a note still reads but cannot be changed', async () => {
    await openForm(
      mine(
        [
          shift('mon-open', '10:00', '16:00', true, 'Until 15:00'),
          shift('mon-close', '16:00', '22:00', true),
        ],
        false,
      ),
    );

    expect(screen.getByText('Opening: Until 15:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strip('edit', 'Opening') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strip('add', 'Closing') })).not.toBeInTheDocument();
  });
});
