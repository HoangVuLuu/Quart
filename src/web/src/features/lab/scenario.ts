// Editing a lab scenario (M1-06): small pure functions that each return a new scenario, so the editor
// can never leave a half-changed one behind. The server checks the result on Generate (validation
// codes and paths); these only keep the scenario consistent, for example removing a person removes
// them everywhere they appear.
import type { GeneratorInput, LabScenario } from './useLab';

type Member = GeneratorInput['members'][number];
type Pair = GeneratorInput['conflictPairs'][number];

/** The lab's cap on people (LabEndpoints.MaxPeople on the server). */
export const maxPeople = 60;

/** The weekly hours a new person starts with. */
const defaultDesiredHours = 12;

export type PersonChanges = Partial<Pick<Member, 'level' | 'desiredWeeklyHours' | 'maxWeeklyHours'>> & {
  name?: string;
  /** Whether they sent availability. The generator never places someone who did not (FR-099). */
  submitted?: boolean;
};

function withInput(scenario: LabScenario, input: Partial<GeneratorInput>): LabScenario {
  return { ...scenario, input: { ...scenario.input, ...input } };
}

/** Adds a level 1 person who sent no shifts yet, and returns their id. */
export function addPerson(scenario: LabScenario, name: string): { scenario: LabScenario; id: string } {
  const taken = new Set([...scenario.people.map((p) => p.id), ...scenario.input.members.map((m) => m.id)]);
  let n = scenario.input.members.length + 1;
  while (taken.has(`p${n}`)) n++;
  const id = `p${n}`;
  return {
    id,
    scenario: {
      ...withInput(scenario, {
        members: [
          ...scenario.input.members,
          { id, level: 1, desiredWeeklyHours: defaultDesiredHours, maxWeeklyHours: null },
        ],
        availability: [...scenario.input.availability, { memberId: id, submitted: true, shiftIds: [] }],
      }),
      people: [...scenario.people, { id, name }],
    },
  };
}

export function updatePerson(scenario: LabScenario, id: string, changes: PersonChanges): LabScenario {
  const { name, submitted, ...member } = changes;
  const hasEntry = scenario.input.availability.some((entry) => entry.memberId === id);
  return {
    ...withInput(scenario, {
      members: scenario.input.members.map((m) => (m.id === id ? { ...m, ...member } : m)),
      availability:
        submitted === undefined
          ? scenario.input.availability
          : hasEntry
            ? scenario.input.availability.map((entry) =>
                entry.memberId === id ? { ...entry, submitted } : entry,
              )
            : [...scenario.input.availability, { memberId: id, submitted, shiftIds: [] }],
    }),
    people:
      name === undefined
        ? scenario.people
        : scenario.people.some((p) => p.id === id)
          ? scenario.people.map((p) => (p.id === id ? { ...p, name } : p))
          : [...scenario.people, { id, name }],
  };
}

/** Removes the person everywhere: their availability, busy times, locks and conflict pairs go too. */
export function removePerson(scenario: LabScenario, id: string): LabScenario {
  const { input } = scenario;
  return {
    ...withInput(scenario, {
      members: input.members.filter((m) => m.id !== id),
      availability: input.availability.filter((entry) => entry.memberId !== id),
      busyTimes: input.busyTimes.filter((busy) => busy.memberId !== id),
      lockedAssignments: input.lockedAssignments.filter((lock) => lock.memberId !== id),
      conflictPairs: input.conflictPairs.filter((pair) => pair.memberA !== id && pair.memberB !== id),
    }),
    people: scenario.people.filter((p) => p.id !== id),
  };
}

export function hasSubmitted(scenario: LabScenario, id: string): boolean {
  return scenario.input.availability.some((entry) => entry.memberId === id && entry.submitted);
}

export function isAvailable(scenario: LabScenario, id: string, shiftId: string): boolean {
  return scenario.input.availability.some(
    (entry) => entry.memberId === id && entry.shiftIds.includes(shiftId),
  );
}

/** Marks or unmarks one shift for one person, as tapping it on the availability screen does (FR-093). */
export function toggleAvailability(scenario: LabScenario, id: string, shiftId: string): LabScenario {
  const on = !isAvailable(scenario, id, shiftId);
  return setShifts(scenario, id, (shiftIds) =>
    on ? [...shiftIds, shiftId] : shiftIds.filter((other) => other !== shiftId),
  );
}

/** Marks every shift, or none, for one person. */
export function setAllAvailability(scenario: LabScenario, id: string, on: boolean): LabScenario {
  return setShifts(scenario, id, () => (on ? scenario.input.shifts.map((shift) => shift.id) : []));
}

function setShifts(scenario: LabScenario, id: string, change: (shiftIds: string[]) => string[]): LabScenario {
  const entry = scenario.input.availability.find((e) => e.memberId === id);
  // In the input's order of shifts, so an export reads in date order.
  const order = new Map(scenario.input.shifts.map((shift, index) => [shift.id, index]));
  const shiftIds = change(entry?.shiftIds ?? []).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return withInput(scenario, {
    availability: entry
      ? scenario.input.availability.map((e) => (e.memberId === id ? { ...e, shiftIds } : e))
      : [...scenario.input.availability, { memberId: id, submitted: true, shiftIds }],
  });
}

/** 1 to 4 shifts in a row, or null for no limit (BR-005). */
export function setMaxConsecutive(scenario: LabScenario, max: number | null): LabScenario {
  return withInput(scenario, { rules: { ...scenario.input.rules, maxConsecutiveShifts: max } });
}

export function setFairness(
  scenario: LabScenario,
  fairness: Partial<Pick<GeneratorInput['rules'], 'openingFairness' | 'closingFairness'>>,
): LabScenario {
  return withInput(scenario, { rules: { ...scenario.input.rules, ...fairness } });
}

/** The scenario's shift blocks, each with its first shift (for its times and kind), in order of start time. */
export function blocksOf(
  scenario: LabScenario,
): { id: string; shiftId: string; start: string; end: string }[] {
  const blocks = new Map<string, { id: string; shiftId: string; start: string; end: string }>();
  for (const shift of scenario.input.shifts) {
    if (!blocks.has(shift.blockId)) {
      blocks.set(shift.blockId, { id: shift.blockId, shiftId: shift.id, start: shift.start, end: shift.end });
    }
  }
  return [...blocks.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function samePair(pair: Pair, blockId: string, a: string, b: string): boolean {
  return (
    pair.blockId === blockId &&
    ((pair.memberA === a && pair.memberB === b) || (pair.memberA === b && pair.memberB === a))
  );
}

/**
 * "a cannot work with b" on each of the given blocks (BR-036). Pass every block for the mockup's
 * "Apply to all" (1k5). A pair that already exists is not added twice.
 */
export function addPair(scenario: LabScenario, blockIds: string[], a: string, b: string): LabScenario {
  if (a === b) return scenario;
  const added = blockIds
    .filter((blockId) => !scenario.input.conflictPairs.some((pair) => samePair(pair, blockId, a, b)))
    .map((blockId) => ({ blockId, memberA: a, memberB: b }));
  return withInput(scenario, { conflictPairs: [...scenario.input.conflictPairs, ...added] });
}

export function removePair(scenario: LabScenario, pair: Pair): LabScenario {
  return withInput(scenario, {
    conflictPairs: scenario.input.conflictPairs.filter(
      (p) => !samePair(p, pair.blockId, pair.memberA, pair.memberB),
    ),
  });
}

/** The scenario as a file, in the same format import reads back. */
export function exportScenario(scenario: LabScenario): string {
  return `${JSON.stringify(scenario, null, 2)}\n`;
}

export type ImportResult =
  { ok: true; scenario: LabScenario } | { ok: false; error: 'invalid_json' | 'not_a_scenario' };

/**
 * Reads a scenario exported from the lab, or a bare generator input such as a shrunk counterexample
 * printed by the property tests (M1-03), whose people are then named by their ids. Lists older files
 * lack default to empty. Whether the input is consistent is the server's call, on Generate.
 */
export function parseScenario(text: string, importedName: string): ImportResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!isObject(value)) return { ok: false, error: 'not_a_scenario' };

  const wrapped = isObject(value.input);
  const input = wrapped ? value.input : value;
  if (
    !isObject(input) ||
    !Array.isArray(input.shifts) ||
    !Array.isArray(input.members) ||
    !Array.isArray(input.availability) ||
    !isObject(input.rules)
  ) {
    return { ok: false, error: 'not_a_scenario' };
  }

  const full = {
    busyTimes: [],
    lockedAssignments: [],
    conflictPairs: [],
    seed: 1,
    ...input,
  } as unknown as GeneratorInput;
  const people =
    wrapped && Array.isArray(value.people)
      ? (value.people as LabScenario['people'])
      : full.members.map((member) => ({ id: member.id, name: member.id }));
  const name = wrapped && typeof value.name === 'string' ? value.name : importedName;
  return { ok: true, scenario: { name, people, input: full } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
