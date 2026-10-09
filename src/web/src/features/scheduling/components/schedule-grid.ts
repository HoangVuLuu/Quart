// Pure helpers behind ScheduleGrid: grouping dated shifts into weeks and days, and naming each shift.
// Dates are plain "YYYY-MM-DD" strings in the workplace's time zone; they are only ever compared and
// counted here, never turned into a moment in time, so a phone in another time zone cannot shift a day.

export interface GridPerson {
  id: string;
  /** Already shortened by the caller ("Marc-Olivier R."). */
  name: string;
  level: number;
}

export interface GridShift {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" or "HH:mm:ss" */
  start: string;
  end: string;
  headcount: number;
  people: GridPerson[];
}

/** Opening and closing are the first and last shift of each day (BR-034); anything between is "mid". */
export type ShiftKind = 'opening' | 'mid' | 'closing';

export interface GridDay {
  date: string;
  shifts: { shift: GridShift; kind: ShiftKind }[];
}

export interface GridWeek {
  /** 0 for the period's first week. */
  index: number;
  days: GridDay[];
}

const dayMs = 86_400_000;

function dayNumber(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / dayMs;
}

function dateOf(day: number): string {
  return new Date(day * dayMs).toISOString().slice(0, 10);
}

/** "10:00:00" -> "10:00" */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

function kindsOf(shifts: GridShift[]): GridDay['shifts'] {
  const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return sorted.map((shift, index) => ({
    shift,
    kind: index === 0 ? 'opening' : index === sorted.length - 1 ? 'closing' : 'mid',
  }));
}

/**
 * Splits the shifts into weeks of seven days counted from `periodStart` (the first shift's date when
 * not given). Every day of every week is listed, including days without shifts, so a week view keeps
 * its seven columns.
 */
export function toWeeks(shifts: GridShift[], periodStart?: string): GridWeek[] {
  if (shifts.length === 0) return [];

  const first = periodStart ? dayNumber(periodStart) : Math.min(...shifts.map((s) => dayNumber(s.date)));
  const last = Math.max(...shifts.map((s) => dayNumber(s.date)));
  const byDate = new Map<string, GridShift[]>();
  for (const shift of shifts) {
    byDate.set(shift.date, [...(byDate.get(shift.date) ?? []), shift]);
  }

  const weeks: GridWeek[] = [];
  for (let start = first; start <= last; start += 7) {
    const days: GridDay[] = [];
    for (let day = start; day < start + 7; day++) {
      const date = dateOf(day);
      days.push({ date, shifts: kindsOf(byDate.get(date) ?? []) });
    }
    weeks.push({ index: weeks.length, days });
  }
  return weeks;
}

/** Full, short of a person, or over (only possible through locks): drives the fill badge's colour and words. */
export type Fill = 'full' | 'short' | 'over';

export function fillOf(shift: GridShift): Fill {
  if (shift.people.length < shift.headcount) return 'short';
  if (shift.people.length > shift.headcount) return 'over';
  return 'full';
}
