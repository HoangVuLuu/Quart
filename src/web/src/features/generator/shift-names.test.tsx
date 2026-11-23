import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { base, renderApp, signedIn, status } from '../../test/app';

// M3-04: a shift can have a name of its own, shown wherever the shift is named.
const setup: Schemas['GeneratorSetup'] = {
  periodWeeks: 1,
  maxConsecutiveShifts: 3,
  openingFairness: true,
  closingFairness: true,
  blocks: [
    {
      id: 'block-open',
      days: [1, 2, 3, 4, 5, 6, 7],
      start: '10:00',
      end: '16:00',
      headcount: 2,
      requirements: [],
      conflicts: [],
      name: null,
    },
  ],
};

describe('shift names (M3-04)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('names a shift in Edit Generator, shows it on the card and saves it', async () => {
    const calls = signedIn('owner', {
      [`GET ${base}/generator`]: setup,
      [`PUT ${base}/generator`]: status(204),
    });
    renderApp('/generator');

    await userEvent.click(await screen.findByRole('button', { name: en.generator.shifts }));
    await userEvent.click(await screen.findByRole('button', { name: /10:00–16:00/ }));
    const sheet = await screen.findByRole('dialog', { name: en.generator.block.edit });
    await userEvent.type(within(sheet).getByLabelText(en.generator.block.name), 'Rush');
    await userEvent.click(within(sheet).getByRole('button', { name: en.generator.block.done }));

    expect(await screen.findByRole('button', { name: /Rush · 10:00–16:00/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.generator.save }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const body = calls.find((call) => call.method === 'PUT')?.body as Schemas['GeneratorSetup'];
    expect(body.blocks?.[0]?.name).toBe('Rush');
  });
});
