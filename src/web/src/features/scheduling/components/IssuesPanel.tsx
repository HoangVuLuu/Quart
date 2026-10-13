import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatNumber, formatShortDate } from '../../../i18n/format';
import { Badge } from '../../../ui/Badge';
import { Card } from '../../../ui/Card';
import { StatusChip } from '../../../ui/StatusChip';
import { groupIssues, typeOf, type IssueType, type ScheduleIssue } from './issues';
import { kindsById, type GridShift } from './schedule-grid';

type IssuesPanelProps = {
  issues: ScheduleIssue[];
  /** The schedule's shifts, to name a shift in a sentence ("Wed, Oct 7 · Closing"). */
  shifts: GridShift[];
  /** Short names by member id. */
  names: Map<string, string>;
  selected: ScheduleIssue | undefined;
  /** Called with the issue tapped, or undefined when the selected one is tapped again. */
  onSelect: (issue: ScheduleIssue | undefined) => void;
};

// Everything the evaluator found, one group per type with its icon, its name and its count (NFR-008),
// in the order of FR-143. Open a group to see each issue; tap one to point at its shifts and people
// on the grid. The lab shows it now; the issues dashboard reuses it in M5.
export function IssuesPanel({ issues, shifts, names, selected, onSelect }: IssuesPanelProps) {
  const { t, i18n } = useTranslation();
  const describe = describer(t, i18n.language, shifts, names);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{t('issues.title')}</h2>
        {issues.length > 0 && (
          <p className="text-sm text-muted">{t('issues.count', { count: issues.length })}</p>
        )}
      </div>
      {issues.length === 0 ? (
        <StatusChip tone="success" className="self-start">
          {t('issues.none')}
        </StatusChip>
      ) : (
        <ul className="flex flex-col gap-2">
          {groupIssues(issues).map((group) => (
            <li key={group.type}>
              <details className="group rounded-field bg-surface-3">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-field px-4 py-2 [&::-webkit-details-marker]:hidden">
                  <IssueIcon type={group.type} />
                  <span className="flex-1 font-bold">{t(`issues.${group.type}.title`)}</span>
                  <Badge
                    count={group.issues.length}
                    label={t('issues.count', { count: group.issues.length })}
                  />
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5 fill-none stroke-current stroke-2 text-muted group-open:rotate-180"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <ul className="flex flex-col gap-1 px-2 pb-2">
                  {group.issues.map((issue, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        aria-pressed={issue === selected}
                        onClick={() => onSelect(issue === selected ? undefined : issue)}
                        className="min-h-11 w-full rounded-field px-3 py-2 text-left text-sm hover:bg-surface aria-pressed:bg-surface aria-pressed:font-bold aria-pressed:ring-2 aria-pressed:ring-link"
                      >
                        {describe(issue)}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && <p className="text-xs text-muted">{t('issues.selectHint')}</p>}
    </Card>
  );
}

// Turns an issue's code and parameters into a sentence in the reader's language (FR-263).
function describer(t: TFunction, language: string, shifts: GridShift[], names: Map<string, string>) {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  const kinds = kindsById(shifts);
  const shiftName = (id: string | undefined) => {
    const shift = id ? byId.get(id) : undefined;
    if (!shift) return id ?? '';
    return `${formatShortDate(shift.date, language)} · ${t(`scheduling.kind.${kinds.get(shift.id) ?? 'mid'}`)}`;
  };
  const person = (id: string | undefined) => (id ? (names.get(id) ?? id) : '');
  const number = (value: string | undefined) => (value === undefined ? '' : formatNumber(value, language));

  return (issue: ScheduleIssue): string => {
    const p = issue.parameters;
    const shift = shiftName(issue.shiftIds[0]);
    const [first, second] = issue.memberIds;
    switch (typeOf(issue.code)) {
      case 'below_headcount':
        return t('issues.below_headcount.item', {
          shift,
          assigned: number(p.assigned),
          headcount: number(p.headcount),
        });
      case 'missing_level':
        return t('issues.missing_level.item', {
          shift,
          level: number(p.level),
          required: number(p.required),
          present: number(p.present),
        });
      case 'unavailable':
        return t('issues.unavailable.item', { person: person(first), shift });
      case 'not_submitted':
        return t('issues.not_submitted.item', { person: person(first), shift });
      case 'under_hours':
        return t('issues.under_hours.item', {
          person: person(first),
          hours: number(p.hours),
          target: number(p.target),
        });
      case 'over_hours':
        return t('issues.over_hours.item', {
          person: person(first),
          hours: number(p.hours),
          target: number(p.target),
        });
      case 'consecutive_shifts':
        return t('issues.consecutive_shifts.item', {
          person: person(first),
          total: number(p.count),
          start: shift,
          max: number(p.max),
        });
      case 'double_shift':
        return t('issues.double_shift.item', {
          person: person(first),
          total: number(p.count),
          day: p.date ? formatShortDate(p.date, language) : '',
        });
      case 'incompatible_pair':
        return t('issues.incompatible_pair.item', { first: person(first), second: person(second), shift });
      case 'unknown':
        return t('issues.unknown.item', { code: issue.code });
    }
  };
}

// One simple line drawing per type, so a group is recognisable at a glance. Decoration: the group's
// name says the same in words (NFR-008).
const iconPaths: Record<IssueType | 'unknown', string> = {
  below_headcount: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-1a6 6 0 0 1 11-3.3M16 19h6',
  missing_level: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z',
  unavailable: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  not_submitted: 'M3 6h18v12H3ZM3 6l9 7 9-7',
  under_hours: 'M12 4v16M6 14l6 6 6-6',
  over_hours: 'M12 20V4M6 10l6-6 6 6',
  consecutive_shifts: 'm4 7 5 5-5 5M11 7l5 5-5 5M18 7v10',
  double_shift: 'M8 4h12v12H8ZM4 8v12h12',
  incompatible_pair: 'M7 12a4 4 0 1 0 0-.01M17 12a4 4 0 1 0 0-.01M10 5l4 14',
  unknown: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.01',
};

function IssueIcon({ type }: { type: IssueType | 'unknown' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 flex-none fill-none stroke-current stroke-2 text-danger [stroke-linecap:round] [stroke-linejoin:round]"
    >
      <path d={iconPaths[type]} />
    </svg>
  );
}
