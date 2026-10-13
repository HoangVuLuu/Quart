import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import en from '../../../i18n/locales/en.json';
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

  it('shows each place nobody fills as open (FR-125)', () => {
    render(<ScheduleGrid shifts={twoWeeks} />);

    const monday = screen.getByRole('region', { name: 'Monday · Oct 5' });
    expect(within(monday).getAllByText(en.scheduling.grid.open)).toHaveLength(1); // the closing has 1 of 2
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

  it('marks kept people, and with a toggle keeps or releases them with a tap (1l, FR-123)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const isLocked = (shiftId: string, memberId: string) =>
      shiftId === 'mon-open' && memberId === 'mon-open-0';

    const { rerender } = render(<ScheduleGrid shifts={twoWeeks} locks={{ isLocked }} />);
    expect(screen.getByText(en.scheduling.grid.kept)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Keep/ })).not.toBeInTheDocument();

    rerender(<ScheduleGrid shifts={twoWeeks} locks={{ isLocked, onToggle }} />);
    expect(screen.getByRole('button', { name: 'Keep Marc-Olivier R. on this shift' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Keep Camille F. on this shift' }));
    expect(onToggle).toHaveBeenCalledWith('mon-open', 'mon-open-1');
  });

  it('turns each card into an availability toggle in availability mode (1e)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ScheduleGrid shifts={twoWeeks} availability={{ isAvailable: (id) => id === 'mon-close', onToggle }} />,
    );

    expect(screen.getByRole('button', { name: /Closing/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Opening/, pressed: false }));
    expect(onToggle).toHaveBeenCalledWith('mon-open');
    expect(screen.queryByText('Marc-Olivier R.')).not.toBeInTheDocument();
  });

  it('shows a level a shift is missing, as "No level 3" (1l)', () => {
    render(<ScheduleGrid shifts={[{ ...twoWeeks[1]!, missingLevels: [3] }]} />);

    expect(screen.getByText('No level 3')).toBeInTheDocument();
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

  it('has no accessibility problems with people to keep, or as availability toggles', async () => {
    const { container, rerender } = render(
      <ScheduleGrid shifts={twoWeeks} locks={{ isLocked: () => true, onToggle: () => undefined }} />,
    );
    expect(await accessibilityProblems(container)).toEqual([]);

    rerender(
      <ScheduleGrid
        shifts={twoWeeks}
        availability={{ isAvailable: () => false, onToggle: () => undefined }}
      />,
    );
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('points at the shifts of a highlight, turning to their week', () => {
    const { rerender } = render(<ScheduleGrid shifts={twoWeeks} />);
    expect(screen.queryByText(en.scheduling.grid.highlighted)).not.toBeInTheDocument();

    rerender(<ScheduleGrid shifts={twoWeeks} highlight={{ shiftIds: ['next-mon-open'], memberIds: [] }} />);

    expect(screen.getByRole('tab', { name: 'Week 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText(en.scheduling.grid.highlighted)).toHaveLength(1);
  });

  it('points at every shift of a person when the highlight names only people', () => {
    render(<ScheduleGrid shifts={twoWeeks} highlight={{ shiftIds: [], memberIds: ['mon-open-1'] }} />);

    // mon-open-1 is Camille F., on Monday's opening only.
    const monday = screen.getByRole('region', { name: 'Monday · Oct 5' });
    expect(within(monday).getAllByText(en.scheduling.grid.highlighted)).toHaveLength(1);
    expect(within(monday).getByText('Camille F.').closest('li')).toHaveClass('underline');
    expect(within(monday).getByText('Marc-Olivier R.').closest('li')).not.toHaveClass('underline');
  });

  it('brings the first highlighted card into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<ScheduleGrid shifts={twoWeeks} />);

    rerender(<ScheduleGrid shifts={twoWeeks} highlight={{ shiftIds: ['mon-close'], memberIds: [] }} />);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toHaveTextContent('Closing');
    // jsdom has no scrollIntoView of its own; take the fake away again.
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
});
