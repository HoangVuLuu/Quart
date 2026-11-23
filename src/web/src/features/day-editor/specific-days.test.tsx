import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn, status, type ApiCall } from '../../test/app';
import { columnsOf, type DayShift } from './model';
import { templateChanges, templateState } from './template-days';

// "Edit a specific day" (M4-01, 2026-11-23): Editing Shift, Editing <day>, Clear all, and opening a period.
const block = (id: string, start: string, end: string): Schemas['BlockSetup'] => ({
  id,
  days: [1, 2, 3, 4, 5, 6, 7],
  start,
  end,
  headcount: 2,
  requirements: [],
  conflicts: [],
  name: null,
});
const setup: Schemas['GeneratorSetup'] = {
  periodWeeks: 2,
  maxConsecutiveShifts: 3,
  openingFairness: true,
  closingFairness: true,
  blocks: [block('open', '10:00', '16:00'), block('close', '16:00', '22:00')],
};
const bodyOf = (calls: ApiCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).at(-1)?.body;

describe('the day model', () => {
  it('turns days back into changes against the weekly shifts, and puts overlapping shifts side by side', () => {
    const blocks = setup.blocks ?? [];
    const state = templateState(blocks, [], 2);
    state['1-3'] = [
      { ...state['1-3']![0]!, end: '15:00' },
      {
        key: 'x',
        blockId: null,
        name: 'Rush',
        start: '11:00',
        end: '14:00',
        headcount: 1,
        requirements: [],
        pairs: [],
      },
    ];
    expect(templateChanges(blocks, state).map((change) => [change.week, change.day, change.kind])).toEqual([
      [1, 3, 'changed'],
      [1, 3, 'removed'],
      [1, 3, 'added'],
    ]);

    const columns = columnsOf(state['1-3'] as DayShift[]);
    expect(columns.get('x')).toEqual({ column: 1, columns: 2 });
  });
});

describe('Edit a specific day (M4-01)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('adds a named shift to two days and moves a shift, then saves only those changes', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/generator`]: setup,
      [`GET ${base}/generator/days`]: { changes: [] },
      [`PUT ${base}/generator/days`]: status(204),
      [`GET ${base}/members`]: [],
    });
    const router = renderApp('/generator');

    await userEvent.click(await screen.findByRole('button', { name: en.generator.shifts }));
    await userEvent.click(screen.getByRole('button', { name: en.dayEditor.open }));
    expect(await screen.findByRole('heading', { name: en.dayEditor.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.dayEditor.save })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Wednesday · W1' }));
    expect(await screen.findByRole('heading', { name: 'Editing Wednesday · W1' })).toBeInTheDocument();

    // The tap path next to the drag: + opens the new shift's pop-up (NFR-002).
    await userEvent.click(screen.getByRole('button', { name: en.dayEditor.add }));
    const popup = await screen.findByRole('dialog', { name: en.dayEditor.newTitle });
    await userEvent.type(within(popup).getByLabelText(en.dayEditor.name), 'Rush');
    await userEvent.click(within(popup).getByRole('button', { name: 'Saturday · W1' }));
    await userEvent.click(within(popup).getByRole('button', { name: en.dayEditor.save }));
    expect(await screen.findByRole('button', { name: /^Rush, 22:00 to 23:00/ })).toBeInTheDocument();

    // A shift's hours, that day only.
    await userEvent.click(screen.getByRole('button', { name: /^Opening, 10:00 to 16:00/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Opening' });
    const end = within(sheet).getByLabelText(en.generator.block.end);
    await userEvent.clear(end);
    await userEvent.type(end, '15:00');
    await userEvent.click(within(sheet).getByRole('button', { name: en.generator.block.done }));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/generator/days'));
    expect(screen.getAllByText(en.dayEditor.changed)).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: en.dayEditor.save }));

    await waitFor(() => expect(bodyOf(calls, 'PUT', `${base}/generator/days`)).toBeDefined());
    const sent = (bodyOf(calls, 'PUT', `${base}/generator/days`) as Schemas['DayChanges']).changes ?? [];
    expect(sent.map((change) => [change.week, change.day, change.kind, change.name, change.end])).toEqual([
      [1, 3, 'changed', null, '15:00'],
      [1, 3, 'added', 'Rush', '23:00'],
      [1, 6, 'added', 'Rush', '23:00'],
    ]);
  });

  it('clears every day change after an "Are you sure?"', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/generator`]: setup,
      [`GET ${base}/generator/days`]: {
        changes: [
          {
            id: 'c1',
            week: 1,
            day: 1,
            kind: 'removed',
            blockId: 'open',
            start: null,
            end: null,
            name: null,
            headcount: null,
            requirements: [],
            conflicts: [],
          },
        ],
      },
      [`PUT ${base}/generator/days`]: status(204),
    });
    renderApp('/generator/days');

    expect(await screen.findByText(en.dayEditor.changed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.dayEditor.clearAll }));
    const dialog = await screen.findByRole('dialog', { name: en.dayEditor.clearTitle });
    await userEvent.click(within(dialog).getByRole('button', { name: en.dayEditor.clearAll }));
    expect(screen.queryByText(en.dayEditor.changed)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.dayEditor.save }));

    await waitFor(() => expect(bodyOf(calls, 'PUT', `${base}/generator/days`)).toEqual({ changes: [] }));
  });

  it('asks before opening a period with the day changes the last one used, and can clear just those', async () => {
    let opened = 0;
    const calls = signedIn('owner', {
      [`GET ${base}/periods/current`]: { live: null, next: null, upcoming: [] },
      [`GET ${base}/generator`]: setup,
      [`POST ${base}/periods`]: () =>
        ++opened === 1
          ? status(409, {
              code: 'period.old_day_changes',
              since: '2026-11-20T12:00:00+00:00',
              days: [{ week: 1, day: 3 }],
            })
          : {
              id: 'p1',
              startDate: '2099-10-05',
              endDate: '2099-10-18',
              weeks: 2,
              status: 'collecting',
              version: 0,
              locked: false,
              draftSaved: false,
              dueAt: null,
            },
      [`GET ${base}/generator/days`]: {
        changes: [
          {
            id: 'old',
            week: 1,
            day: 3,
            kind: 'removed',
            blockId: 'open',
            start: null,
            end: null,
            name: null,
            headcount: null,
            requirements: [],
            conflicts: [],
            savedAt: '2026-11-19T12:00:00+00:00',
          },
          {
            id: 'new',
            week: 1,
            day: 4,
            kind: 'removed',
            blockId: 'open',
            start: null,
            end: null,
            name: null,
            headcount: null,
            requirements: [],
            conflicts: [],
            savedAt: '2026-11-21T12:00:00+00:00',
          },
        ],
      },
      [`PUT ${base}/generator/days`]: status(204),
    });
    renderApp('/schedule');

    await userEvent.click(await screen.findByRole('button', { name: en.schedule.open.submit }));
    const dialog = await screen.findByRole('dialog', { name: en.schedule.oldChanges.title });
    expect(within(dialog).getByText('Wednesday · W1')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: en.schedule.oldChanges.clear }));

    await waitFor(() => expect(opened).toBe(2));
    const kept = (bodyOf(calls, 'PUT', `${base}/generator/days`) as Schemas['DayChanges']).changes ?? [];
    expect(kept.map((change) => change.id)).toEqual(['new']);
  });
});
