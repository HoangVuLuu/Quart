import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import en from '../../../i18n/locales/en.json';
import { accessibilityProblems } from '../../../test/axe';
import type { ScheduleIssue } from './issues';
import { IssuesPanel } from './IssuesPanel';
import type { GridShift } from './schedule-grid';

const shifts: GridShift[] = [
  { id: 'wed-open', date: '2026-10-07', start: '10:00:00', end: '16:00:00', headcount: 2, people: [] },
  { id: 'wed-close', date: '2026-10-07', start: '16:00:00', end: '23:00:00', headcount: 2, people: [] },
];
const names = new Map([
  ['p1', 'Philippe N.'],
  ['p2', 'Sarah G.'],
]);

const issues: ScheduleIssue[] = [
  {
    code: 'issue.below_headcount',
    shiftIds: ['wed-close'],
    memberIds: [],
    parameters: { assigned: '1', headcount: '2' },
  },
  {
    code: 'issue.missing_level',
    shiftIds: ['wed-close'],
    memberIds: [],
    parameters: { level: '3', required: '1', present: '0' },
  },
  { code: 'issue.under_hours', shiftIds: [], memberIds: ['p2'], parameters: { hours: '13.5', target: '20' } },
  {
    code: 'issue.double_shift',
    shiftIds: ['wed-open', 'wed-close'],
    memberIds: ['p1'],
    parameters: { date: '2026-10-07', count: '2' },
  },
  {
    code: 'issue.double_shift',
    shiftIds: ['wed-open', 'wed-close'],
    memberIds: ['p2'],
    parameters: { date: '2026-10-07', count: '2' },
  },
];

function renderPanel(selected?: ScheduleIssue) {
  const onSelect = vi.fn();
  const view = render(
    <IssuesPanel issues={issues} shifts={shifts} names={names} selected={selected} onSelect={onSelect} />,
  );
  return { ...view, onSelect };
}

describe('IssuesPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('groups issues by type with a count each, in the order of FR-143', () => {
    renderPanel();

    expect(screen.getByText('5 issues')).toBeInTheDocument();
    const groups = screen.getAllByRole('group').map((group) => group.querySelector('summary')?.textContent);
    expect(groups).toEqual([
      `${en.issues.below_headcount.title}11 issue`,
      `${en.issues.missing_level.title}11 issue`,
      `${en.issues.under_hours.title}11 issue`,
      `${en.issues.double_shift.title}22 issues`,
    ]);
  });

  it('writes each issue as a sentence from its code and parameters', async () => {
    const user = userEvent.setup();
    renderPanel();

    for (const summary of document.querySelectorAll('summary')) await user.click(summary);

    expect(screen.getByRole('button', { name: 'Wed, Oct 7 · Closing: 1 of 2 people' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Wed, Oct 7 · Closing: needs 1 at level 3 or above, has 0' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sarah G.: 13.5 h of 20 h wanted' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Philippe N. works 2 shifts on Wed, Oct 7' }),
    ).toBeInTheDocument();
  });

  it('speaks French, numbers included', async () => {
    await i18n.changeLanguage('fr');
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Sous les heures voulues'));

    expect(screen.getByRole('button', { name: 'Sarah G. : 13,5 h sur 20 h voulues' })).toBeInTheDocument();
  });

  it('selects an issue on tap, and lets go of it on a second tap', async () => {
    const user = userEvent.setup();
    const first = renderPanel();
    await user.click(screen.getByText(en.issues.below_headcount.title));

    await user.click(screen.getByRole('button', { name: /1 of 2 people/ }));
    expect(first.onSelect).toHaveBeenCalledWith(issues[0]);
    first.unmount();

    const again = renderPanel(issues[0]);
    await user.click(screen.getByText(en.issues.below_headcount.title));
    const selected = screen.getByRole('button', { name: /1 of 2 people/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    await user.click(selected);
    expect(again.onSelect).toHaveBeenCalledWith(undefined);
  });

  it('says when there is nothing wrong', () => {
    render(
      <IssuesPanel issues={[]} shifts={shifts} names={names} selected={undefined} onSelect={() => {}} />,
    );

    expect(screen.getByText(en.issues.none)).toBeInTheDocument();
  });

  it('has no accessibility problems', async () => {
    const { container } = renderPanel();

    expect(await accessibilityProblems(container)).toEqual([]);
  });
});
