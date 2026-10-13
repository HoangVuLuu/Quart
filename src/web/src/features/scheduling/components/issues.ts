// The issues the evaluator reports (FR-143), shaped as the API sends them: a stable code, the shifts
// and people concerned, and parameters for the sentence. The server never sends the sentence (FR-263).

export interface ScheduleIssue {
  code: string;
  shiftIds: string[];
  memberIds: string[];
  parameters: Record<string, string>;
  /** True when a hard rule is broken (spec 7.3). The generator never causes one; only a lock or a manual edit can. */
  hardRule?: boolean;
}

/** The issue types, in the order the list shows them: the order of Quart.Generator.IssueCodes. */
export const issueTypes = [
  'below_headcount',
  'above_headcount',
  'missing_level',
  'unavailable',
  'not_submitted',
  'overlapping_shifts',
  'under_hours',
  'over_hours',
  'consecutive_shifts',
  'double_shift',
  'incompatible_pair',
] as const;

export type IssueType = (typeof issueTypes)[number];

/** "issue.below_headcount" -> "below_headcount"; a code this version of the app does not know -> "unknown". */
export function typeOf(code: string): IssueType | 'unknown' {
  const type = code.replace(/^issue\./, '');
  return (issueTypes as readonly string[]).includes(type) ? (type as IssueType) : 'unknown';
}

/** How many issues break a hard rule. The server decides which do, so a code this app does not know still counts. */
export function countHardRuleBreaks(issues: ScheduleIssue[]): number {
  return issues.filter((issue) => issue.hardRule === true).length;
}

export interface IssueGroup {
  type: IssueType | 'unknown';
  issues: ScheduleIssue[];
}

/** One group per type that has issues, in display order; unknown codes last, so a newer server never hides an issue. */
export function groupIssues(issues: ScheduleIssue[]): IssueGroup[] {
  const groups = new Map<IssueType | 'unknown', ScheduleIssue[]>();
  for (const issue of issues) {
    const type = typeOf(issue.code);
    groups.set(type, [...(groups.get(type) ?? []), issue]);
  }
  return [...issueTypes, 'unknown' as const]
    .filter((type) => groups.has(type))
    .map((type) => ({ type, issues: groups.get(type) ?? [] }));
}
