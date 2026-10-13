import { describe, expect, it } from 'vitest';
import {
  addPair,
  addPerson,
  blocksOf,
  exportScenario,
  hasSubmitted,
  isAvailable,
  parseScenario,
  removePair,
  removePerson,
  setAllAvailability,
  setMaxConsecutive,
  toggleAvailability,
  updatePerson,
} from './scenario';
import type { LabScenario } from './useLab';

const shift = (id: string, blockId: string, start: string, end: string) => ({
  id,
  blockId,
  date: '2026-10-05',
  start,
  end,
  headcount: 2,
  levelRequirements: [],
});

const base: LabScenario = {
  name: 'Sample',
  people: [
    { id: 'p1', name: 'Ana Lima' },
    { id: 'p2', name: 'Ben Roy' },
  ],
  input: {
    shifts: [
      shift('close', 'closing', '16:00:00', '23:00:00'),
      shift('open', 'opening', '10:00:00', '16:00:00'),
    ],
    members: [
      { id: 'p1', level: 3, desiredWeeklyHours: 20, maxWeeklyHours: null },
      { id: 'p2', level: 1, desiredWeeklyHours: 10, maxWeeklyHours: null },
    ],
    availability: [{ memberId: 'p1', submitted: true, shiftIds: ['open'] }],
    busyTimes: [{ memberId: 'p2', start: '2026-10-05T08:00:00', end: '2026-10-05T09:00:00' }],
    lockedAssignments: [{ shiftId: 'open', memberId: 'p2' }],
    conflictPairs: [{ blockId: 'opening', memberA: 'p1', memberB: 'p2' }],
    rules: { maxConsecutiveShifts: 3, openingFairness: true, closingFairness: true },
    seed: 7,
  },
};

describe('scenario editing', () => {
  it('adds a level 1 person with a free id and nothing marked yet', () => {
    const { scenario, id } = addPerson(base, 'Cleo Diaz');

    expect(id).toBe('p3');
    expect(scenario.people.at(-1)).toEqual({ id: 'p3', name: 'Cleo Diaz' });
    expect(scenario.input.members.at(-1)).toMatchObject({ id: 'p3', level: 1, maxWeeklyHours: null });
    expect(hasSubmitted(scenario, 'p3')).toBe(true);
    expect(base.input.members).toHaveLength(2); // the original is untouched
  });

  it('changes a name, a level, hours and whether they sent availability', () => {
    const scenario = updatePerson(base, 'p2', {
      name: 'Benoît Roy',
      level: 3,
      desiredWeeklyHours: 14,
      maxWeeklyHours: 20,
      submitted: false,
    });

    expect(scenario.people[1]).toEqual({ id: 'p2', name: 'Benoît Roy' });
    expect(scenario.input.members[1]).toEqual({
      id: 'p2',
      level: 3,
      desiredWeeklyHours: 14,
      maxWeeklyHours: 20,
    });
    expect(scenario.input.availability).toContainEqual({ memberId: 'p2', submitted: false, shiftIds: [] });
  });

  it('removes a person from everywhere they appear', () => {
    const scenario = removePerson(base, 'p2');

    expect(scenario.people.map((p) => p.id)).toEqual(['p1']);
    expect(scenario.input.members.map((m) => m.id)).toEqual(['p1']);
    expect(scenario.input.busyTimes).toEqual([]);
    expect(scenario.input.lockedAssignments).toEqual([]);
    expect(scenario.input.conflictPairs).toEqual([]);
  });

  it('toggles one shift at a time, keeping shifts in the input order', () => {
    const on = toggleAvailability(base, 'p1', 'close');
    expect(on.input.availability[0]?.shiftIds).toEqual(['close', 'open']);
    expect(isAvailable(on, 'p1', 'close')).toBe(true);

    const off = toggleAvailability(on, 'p1', 'open');
    expect(off.input.availability[0]?.shiftIds).toEqual(['close']);
  });

  it('marks someone with no entry yet as having sent, when a shift is tapped for them', () => {
    const scenario = toggleAvailability(base, 'p2', 'open');

    expect(scenario.input.availability).toContainEqual({
      memberId: 'p2',
      submitted: true,
      shiftIds: ['open'],
    });
  });

  it('marks every shift or none', () => {
    expect(setAllAvailability(base, 'p1', true).input.availability[0]?.shiftIds).toEqual(['close', 'open']);
    expect(setAllAvailability(base, 'p1', false).input.availability[0]?.shiftIds).toEqual([]);
  });

  it('sets the limit of shifts in a row, or none', () => {
    expect(setMaxConsecutive(base, 2).input.rules.maxConsecutiveShifts).toBe(2);
    expect(setMaxConsecutive(base, null).input.rules.maxConsecutiveShifts).toBeNull();
  });

  it('lists blocks by start time', () => {
    expect(blocksOf(base).map((block) => block.id)).toEqual(['opening', 'closing']);
  });

  it('adds a pair to every block asked, once, in either order', () => {
    const scenario = addPair(base, ['opening', 'closing'], 'p2', 'p1');

    expect(scenario.input.conflictPairs).toEqual([
      { blockId: 'opening', memberA: 'p1', memberB: 'p2' },
      { blockId: 'closing', memberA: 'p2', memberB: 'p1' },
    ]);
    expect(addPair(base, ['opening'], 'p1', 'p1')).toBe(base);
    expect(
      removePair(scenario, { blockId: 'opening', memberA: 'p2', memberB: 'p1' }).input.conflictPairs,
    ).toEqual([{ blockId: 'closing', memberA: 'p2', memberB: 'p1' }]);
  });

  it('reads back what it exports', () => {
    expect(parseScenario(exportScenario(base), 'Imported')).toEqual({ ok: true, scenario: base });
  });

  it('reads a bare generator input, such as a property-test counterexample, naming people by id', () => {
    const input: Partial<LabScenario['input']> = { ...base.input };
    delete input.busyTimes; // an older file, from before busy times
    const result = parseScenario(JSON.stringify(input), 'Imported');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.name).toBe('Imported');
    expect(result.scenario.people).toEqual([
      { id: 'p1', name: 'p1' },
      { id: 'p2', name: 'p2' },
    ]);
    expect(result.scenario.input.busyTimes).toEqual([]);
  });

  it('refuses text that is not JSON, or not a scenario', () => {
    expect(parseScenario('{ nope', 'Imported')).toEqual({ ok: false, error: 'invalid_json' });
    expect(parseScenario('[1, 2]', 'Imported')).toEqual({ ok: false, error: 'not_a_scenario' });
    expect(parseScenario('{"shifts": []}', 'Imported')).toEqual({ ok: false, error: 'not_a_scenario' });
  });
});
