import { describe, expect, it } from 'vitest';
import { countHardRuleBreaks, groupIssues, typeOf, type ScheduleIssue } from './issues';

const issue = (code: string): ScheduleIssue => ({ code, shiftIds: [], memberIds: [], parameters: {} });

describe('issues', () => {
  it('reads the type from the code', () => {
    expect(typeOf('issue.double_shift')).toBe('double_shift');
    expect(typeOf('issue.from_the_future')).toBe('unknown');
  });

  it('groups by type in display order, with unknown codes last so none is hidden', () => {
    const groups = groupIssues([
      issue('issue.double_shift'),
      issue('issue.from_the_future'),
      issue('issue.below_headcount'),
      issue('issue.double_shift'),
    ]);

    expect(groups.map((g) => [g.type, g.issues.length])).toEqual([
      ['below_headcount', 1],
      ['double_shift', 2],
      ['unknown', 1],
    ]);
  });

  it('counts the hard rules broken as the server marks them, unknown codes included', () => {
    expect(
      countHardRuleBreaks([
        { ...issue('issue.unavailable'), hardRule: true },
        { ...issue('issue.from_the_future'), hardRule: true },
        { ...issue('issue.below_headcount'), hardRule: false },
        issue('issue.double_shift'),
      ]),
    ).toBe(2);
  });
});
