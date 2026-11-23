import type { Schemas } from '../../lib/api/client';
import { newKey, type DayInfo, type DayShift, type DaysState } from './model';

// "Edit a specific day" in Edit Generator (M4-01, 2026-11-23): the days of the week of weeks 1 to N, without dates.
// The page edits whole days; saving turns them back into changes against the weekly shifts.

type Block = Schemas['BlockSetup'];
type Change = Schemas['DayChangeSetup'];

/** "Mon", "lun." or "Monday", "lundi": a weekday's name from its ISO number (1 is Monday). */
export function weekdayName(day: number, language: string, width: 'short' | 'long' | 'narrow'): string {
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(language, { weekday: width, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, day)),
  );
}

export function dayKey(week: number, day: number): string {
  return `${week}-${day}`;
}

/** <paramref name="weekLabel"/> turns 1 into "W1" (English) or "S1" (French). */
export function templateDays(
  weeks: number,
  language: string,
  weekLabel: (week: number) => string,
): DayInfo[] {
  const days: DayInfo[] = [];
  for (let week = 1; week <= weeks; week++) {
    for (let day = 1; day <= 7; day++) {
      days.push({
        key: dayKey(week, day),
        short: `${weekdayName(day, language, 'short')} · ${weekLabel(week)}`,
        long: `${weekdayName(day, language, 'long')} · ${weekLabel(week)}`,
        week: week - 1,
        chip: weekdayName(day, language, 'narrow'),
      });
    }
  }
  return days;
}

function fromBlock(block: Block, key: string): DayShift {
  return {
    key: `${block.id}@${key}`,
    blockId: block.id ?? null,
    name: block.name ?? null,
    start: block.start,
    end: block.end,
    headcount: block.headcount,
    requirements: block.requirements ?? [],
    pairs: block.conflicts ?? [],
  };
}

/** Every day of weeks 1 to <paramref name="weeks"/>, with the day changes applied. */
export function templateState(blocks: Block[], changes: Change[], weeks: number): DaysState {
  const state: DaysState = {};
  for (let week = 1; week <= weeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const key = dayKey(week, day);
      const here = changes.filter((change) => change.week === week && change.day === day);
      const shifts: DayShift[] = [];
      for (const block of blocks.filter((block) => block.days.includes(day))) {
        const change = here.find((item) => item.blockId === block.id);
        if (change?.kind === 'removed') continue;
        const shift = fromBlock(block, key);
        if (change?.kind === 'changed' && change.start && change.end) {
          shift.start = change.start;
          shift.end = change.end;
        }
        shifts.push(shift);
      }
      for (const added of here.filter((item) => item.kind === 'added')) {
        shifts.push({
          key: added.id ?? newKey(),
          blockId: null,
          name: added.name ?? null,
          start: added.start ?? '',
          end: added.end ?? '',
          headcount: added.headcount ?? 1,
          requirements: added.requirements ?? [],
          pairs: added.conflicts ?? [],
        });
      }
      state[key] = shifts;
    }
  }
  return state;
}

/** One day's changes against the weekly shifts: what saving sends for it. */
export function changesOfDay(blocks: Block[], week: number, day: number, shifts: DayShift[]): Change[] {
  const changes: Change[] = [];
  for (const block of blocks.filter((block) => block.days.includes(day))) {
    const shift = shifts.find((item) => item.blockId === block.id);
    if (!shift) {
      changes.push(change(week, day, 'removed', { blockId: block.id ?? null }));
    } else if (shift.start !== block.start || shift.end !== block.end) {
      changes.push(
        change(week, day, 'changed', { blockId: block.id ?? null, start: shift.start, end: shift.end }),
      );
    }
  }
  for (const shift of shifts.filter((item) => item.blockId === null)) {
    changes.push(
      change(week, day, 'added', {
        start: shift.start,
        end: shift.end,
        name: shift.name,
        headcount: shift.headcount,
        requirements: shift.requirements,
        conflicts: shift.pairs,
      }),
    );
  }
  return changes;
}

function change(week: number, day: number, kind: string, rest: Partial<Change>): Change {
  return {
    id: null,
    week,
    day,
    kind,
    blockId: null,
    start: null,
    end: null,
    name: null,
    headcount: null,
    requirements: null,
    conflicts: null,
    savedAt: null,
    ...rest,
  };
}

/** Every change of the page, in the shape saving sends. */
export function templateChanges(blocks: Block[], state: DaysState): Change[] {
  return Object.entries(state).flatMap(([key, shifts]) => {
    const [week, day] = key.split('-').map(Number);
    return changesOfDay(blocks, week ?? 1, day ?? 1, shifts);
  });
}
