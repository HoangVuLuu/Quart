import { describe, expect, it } from 'vitest';
import { fillOf, shortTime, toWeeks, type GridShift } from './schedule-grid';

function shift(id: string, date: string, start: string, end: string, people = 0, headcount = 2): GridShift {
  return {
    id,
    date,
    start,
    end,
    headcount,
    people: Array.from({ length: people }, (_, i) => ({ id: `${id}-${i}`, name: `P${i}`, level: 1 })),
  };
}

describe('toWeeks', () => {
  it('lists seven days per week from the first shift, including days without shifts', () => {
    const weeks = toWeeks([
      shift('a', '2026-10-05', '10:00', '16:00'),
      shift('b', '2026-10-12', '10:00', '16:00'),
    ]);

    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(weeks[0]?.days[1]?.shifts).toEqual([]);
    expect(weeks[1]?.days[0]?.shifts.map((s) => s.shift.id)).toEqual(['b']);
  });

  it('counts weeks from the period start when given', () => {
    const weeks = toWeeks([shift('a', '2026-10-07', '10:00', '16:00')], '2026-10-05');

    expect(weeks[0]?.days[0]?.date).toBe('2026-10-05');
    expect(weeks[0]?.days[2]?.shifts).toHaveLength(1);
  });

  it('crosses a daylight saving change without losing or repeating a day', () => {
    // Quebec falls back on 1 November 2026.
    const weeks = toWeeks([
      shift('a', '2026-10-26', '10:00', '16:00'),
      shift('b', '2026-11-08', '10:00', '16:00'),
    ]);

    expect(weeks.flatMap((w) => w.days.map((d) => d.date))).toContain('2026-11-01');
    expect(weeks[1]?.days[6]?.date).toBe('2026-11-08');
  });

  it('names the first shift of a day opening, the last closing and the rest mid (BR-034)', () => {
    const weeks = toWeeks([
      shift('close', '2026-10-05', '16:00', '23:00'),
      shift('open', '2026-10-05', '10:00', '16:00'),
      shift('lunch', '2026-10-05', '12:00', '15:00'),
    ]);

    expect(weeks[0]?.days[0]?.shifts.map((s) => [s.shift.id, s.kind])).toEqual([
      ['open', 'opening'],
      ['lunch', 'mid'],
      ['close', 'closing'],
    ]);
  });

  it('has no weeks without shifts', () => {
    expect(toWeeks([])).toEqual([]);
  });
});

describe('fillOf', () => {
  it('compares the people on a shift with its headcount', () => {
    expect(fillOf(shift('a', '2026-10-05', '10:00', '16:00', 1))).toBe('short');
    expect(fillOf(shift('a', '2026-10-05', '10:00', '16:00', 2))).toBe('full');
    expect(fillOf(shift('a', '2026-10-05', '10:00', '16:00', 3))).toBe('over');
  });
});

describe('shortTime', () => {
  it('drops the seconds', () => {
    expect(shortTime('16:00:00')).toBe('16:00');
    expect(shortTime('16:00')).toBe('16:00');
  });
});
