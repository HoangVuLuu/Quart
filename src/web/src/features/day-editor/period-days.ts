import type { Schemas } from '../../lib/api/client';
import { newKey, type DayInfo, type DayShift, type DaysState } from './model';

// One period's own shifts on the Editing Shift and Editing day pages (M4-01, 2026-11-23): real dates, days that
// started cannot change, and what saving sends back.

type View = Schemas['PeriodShifts'];

function datesOf(view: View): string[] {
  const dates: string[] = [];
  const day = new Date(`${view.period.startDate}T00:00:00Z`);
  const end = new Date(`${view.period.endDate}T00:00:00Z`);
  for (; day <= end; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  return dates;
}

export function periodDays(view: View, language: string): DayInfo[] {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' });
  const short = format({ weekday: 'short', day: 'numeric' });
  const long = format({ weekday: 'short', month: 'short', day: 'numeric' });
  return datesOf(view).map((date, index) => {
    const day = new Date(`${date}T00:00:00Z`);
    return {
      key: date,
      short: short.format(day),
      long: long.format(day),
      week: Math.floor(index / 7),
      chip: String(day.getUTCDate()),
      locked: view.startedDays.includes(date),
    };
  });
}

export function periodState(view: View): DaysState {
  const state: DaysState = Object.fromEntries(datesOf(view).map((date) => [date, [] as DayShift[]]));
  for (const shift of view.shifts) {
    state[shift.date]?.push({
      key: shift.id,
      blockId: shift.blockId,
      name: shift.name ?? null,
      start: shift.start,
      end: shift.end,
      headcount: shift.headcount,
      requirements: shift.requirements,
      pairs: [],
    });
  }
  return state;
}

/** "Reopen": the shifts the generator rules give a closed day. */
export function rulesOf(view: View, date: string): DayShift[] {
  return view.rules
    .filter((rule) => rule.date === date)
    .map((rule) => ({
      key: newKey(),
      blockId: rule.blockId,
      name: rule.name ?? null,
      start: rule.start,
      end: rule.end,
      headcount: rule.headcount,
      requirements: rule.requirements,
      pairs: [],
    }));
}

/** What saving sends: every shift of the days that have not started. A shift left out is removed. */
export function periodShifts(view: View, state: DaysState): Schemas['PeriodShiftSetup'][] {
  const existing = new Set(view.shifts.map((shift) => shift.id));
  return Object.entries(state)
    .filter(([date]) => !view.startedDays.includes(date))
    .flatMap(([date, shifts]) =>
      shifts.map((shift) => ({
        id: existing.has(shift.key) ? shift.key : null,
        date,
        // A new shift with a block is a reopened day's: the generator's own shift comes back.
        blockId: existing.has(shift.key) ? null : shift.blockId,
        name: shift.name,
        start: shift.start,
        end: shift.end,
        headcount: shift.headcount,
        requirements: shift.requirements,
      })),
    );
}
