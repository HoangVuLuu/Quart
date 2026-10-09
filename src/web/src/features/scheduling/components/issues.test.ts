import { describe, expect, it } from 'vitest';
import { groupIssues, typeOf, type ScheduleIssue } from './issues';

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
});
