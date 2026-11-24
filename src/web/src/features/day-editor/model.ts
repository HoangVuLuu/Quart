// The shifts of one day as the Editing Shift and Editing day pages show and change them (M4-01, 2026-11-23).
// The same model serves Edit Generator ("Edit a specific day", days of the week) and a period (real dates).

export type Requirement = { level: number; minCount: number };
export type Pair = { membershipA: string; membershipB: string };

/** One shift of one day, as edited. */
export type DayShift = {
  /** Unique on the page. */
  key: string;
  /** The weekly shift it comes from; null for a shift added for this day only. */
  blockId: string | null;
  name: string | null;
  /** "HH:mm" */
  start: string;
  end: string;
  headcount: number;
  requirements: Requirement[];
  pairs: Pair[];
};

/** One day of the page: a weekday in a week of the period, or a date. */
export type DayInfo = {
  key: string;
  /** In a row: "Wed · W1", "Wed 25". */
  short: string;
  /** In a title: "Wednesday · W1", "Wed, Nov 25". */
  long: string;
  /** The week it is in, from 0: Week 1 is 0. */
  week: number;
  /** On the days picker: "W", "25". */
  chip: string;
  /** Started already: shown but cannot change (a published period). */
  locked?: boolean;
};

export type DaysState = Record<string, DayShift[]>;

/** Minutes since midnight. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** "HH:mm"; 1440 is "24:00", the end of the timeline only. */
export function timeOf(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const step = 15;

export function snap(minutes: number): number {
  return Math.round(minutes / step) * step;
}

export function byTime(a: DayShift, b: DayShift): number {
  return a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
}

/** BR-034: the first shift of a day is the opening, the last the closing, the others mid. */
export function partsOf(shifts: DayShift[]): Map<string, 'opening' | 'mid' | 'closing'> {
  const sorted = [...shifts].sort(byTime);
  return new Map(
    sorted.map((shift, index) => [
      shift.key,
      sorted.length > 1 && index === sorted.length - 1 ? 'closing' : index === 0 ? 'opening' : 'mid',
    ]),
  );
}

/**
 * Side by side where shifts overlap, like a phone calendar's day view: each shift gets a column, and the
 * shifts that overlap one another share the width.
 */
export function columnsOf(shifts: DayShift[]): Map<string, { column: number; columns: number }> {
  const sorted = [...shifts].sort(byTime);
  const placed = new Map<string, { column: number; columns: number }>();
  let group: { key: string; column: number }[] = [];
  let groupEnd = -1;
  const close = () => {
    const columns = Math.max(0, ...group.map((item) => item.column)) + 1;
    for (const item of group) placed.set(item.key, { column: item.column, columns });
    group = [];
  };
  const ends: number[] = [];
  for (const shift of sorted) {
    const start = minutesOf(shift.start);
    if (start >= groupEnd && group.length > 0) {
      close();
      ends.length = 0;
    }
    let column = ends.findIndex((end) => end <= start);
    if (column === -1) column = ends.length;
    ends[column] = minutesOf(shift.end);
    group.push({ key: shift.key, column });
    groupEnd = Math.max(groupEnd, minutesOf(shift.end));
  }
  if (group.length > 0) close();
  return placed;
}

/** The same checks as the server, so a mistake shows before saving (FR-061, FR-062). */
export function timeProblem(
  start: string,
  end: string,
): 'time_invalid' | 'crosses_midnight' | 'off_grid' | null {
  if (!/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end)) return 'time_invalid';
  if (end <= start) return 'crosses_midnight';
  if ([start, end].some((time) => minutesOf(time) % step !== 0)) return 'off_grid';
  return null;
}

let counter = 0;
/** A key for a shift added on the page. */
export function newKey(): string {
  counter += 1;
  return `new-${counter}`;
}

/** Today on this phone, as "yyyy-mm-dd": a day before it has started (the server has the final say). */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * A day can still change until its first shift starts, as the server decides (M4-01). Today counts as started
 * once the earliest start has passed, so the pen is not offered for a day that would only be refused.
 */
export function dayHasStarted(date: string, starts: string[], now = new Date()): boolean {
  const today = localToday();
  if (date !== today) return date < today;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return starts.some((start) => start <= time);
}
