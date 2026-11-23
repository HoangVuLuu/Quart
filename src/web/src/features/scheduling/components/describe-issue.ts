import type { TFunction } from 'i18next';
import { formatNumber, formatShortDate } from '../../../i18n/format';
import { typeOf, type ScheduleIssue } from './issues';
import { kindsById, type GridShift } from './schedule-grid';

// Turns an issue's code and parameters into a sentence in the reader's language (FR-263).
export function describer(t: TFunction, language: string, shifts: GridShift[], names: Map<string, string>) {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  const kinds = kindsById(shifts);
  const shiftName = (id: string | undefined) => {
    const shift = id ? byId.get(id) : undefined;
    if (!shift) return id ?? '';
    return `${formatShortDate(shift.date, language)} · ${shift.name || t(`scheduling.kind.${kinds.get(shift.id) ?? 'mid'}`)}`;
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
      case 'above_headcount':
        return t('issues.above_headcount.item', {
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
      case 'overlapping_shifts':
        return t('issues.overlapping_shifts.item', {
          person: person(first),
          shift,
          other: shiftName(issue.shiftIds[1]),
        });
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
      case 'over_max_hours':
        return t('issues.over_max_hours.item', {
          person: person(first),
          hours: number(p.hours),
          week: number(p.week),
          max: number(p.max),
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
