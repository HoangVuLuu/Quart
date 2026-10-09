import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { accessibilityProblems } from '../../../test/axe';
import { ScheduleGrid, type GridShift } from './ScheduleGrid';

function shift(id: string, date: string, start: string, end: string, names: string[] = []): GridShift {
  return {
    id,
    date,
    start,
    end,
    headcount: 2,
    people: names.map((name, i) => ({ id: `${id}-${i}`, name, level: i === 0 ? 3 : 1 })),
  };
}

const twoWeeks: GridShift[] = [
  shift('mon-open', '2026-10-05', '10:00:00', '16:00:00', ['Marc-Olivier R.', 'Camille F.']),
  shift('mon-close', '2026-10-05', '16:00:00', '23:00:00', ['Sarah G.']),
  shift('next-mon-open', '2026-10-12', '10:00:00', '16:00:00'),
];

describe('ScheduleGrid', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows each shift with its time, fill count and people (FR-140)', () => {
    render(<ScheduleGrid shifts={twoWeeks} />);

    const monday = screen.getByRole('region', { name: 'Monday · Oct 5' });
    const [opening, closing] = within(monday)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement?.parentElement === monday);
    expect(opening).toHaveTextContent('Opening');
    expect(opening).toHaveTextContent('10:00–16:00');
    expect(within(opening!).getByText('2 of 2 people')).toBeInTheDocument();
    expect(within(opening!).getByText('Marc-Olivier R.')).toBeInTheDocument();
    expect(within(opening!).getByText('Level 3')).toBeInTheDocument();
    expect(closing).toHaveTextContent('Closing');
    expect(within(closing!).getByText('1 of 2 people')).toBeInTheDocument();
  });

  it('shows one week at a time, with a tab per week', async () => {
    const user = userEvent.setup();
    render(<ScheduleGrid shifts={twoWeeks} />);

    expect(screen.getByRole('tab', { name: 'Week 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Monday · Oct 12' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Week 2' }));

    expect(screen.getByRole('region', { name: 'Monday · Oct 12' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Monday · Oct 5' })).not.toBeInTheDocument();
  });

  it('has no week tabs for a single week', () => {
    render(<ScheduleGrid shifts={twoWeeks.slice(0, 2)} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    render(<ScheduleGrid shifts={twoWeeks} />);

    expect(screen.getByRole('tab', { name: 'Semaine 1' })).toBeInTheDocument();
    const monday = screen.getByRole('region', { name: 'Lundi · 5 oct.' });
    expect(within(monday).getByText('Ouverture')).toBeInTheDocument();
    expect(within(monday).getByText('1 sur 2 personnes')).toBeInTheDocument();
  });

  it('has no accessibility problems', async () => {
    const { container } = render(<ScheduleGrid shifts={twoWeeks} />);

    expect(await accessibilityProblems(container)).toEqual([]);
  });
});
