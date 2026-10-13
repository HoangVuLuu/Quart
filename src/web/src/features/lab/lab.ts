// Pure helpers for the generator lab: names, periods, seeds and the grid's view of a result.
import type { GridShift } from '../scheduling/components/ScheduleGrid';
import type { GeneratorResult, LabScenario } from './useLab';

/** From the first shift's date to the last one's; none for a scenario without shifts. */
export function periodOf(scenario: LabScenario): { start: string; end: string } | undefined {
  const dates = scenario.input.shifts.map((shift) => shift.date).sort();
  const [start, end] = [dates[0], dates.at(-1)];
  return start && end ? { start, end } : undefined;
}

/** "Marc-Olivier Roy" -> "Marc-Olivier R.", as on the shift cards in the mockups. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts.at(-1)?.charAt(0)}.`;
}

/** Short names by member id; a member with no name in the scenario shows as their id. */
export function namesOf(scenario: LabScenario): Map<string, string> {
  return new Map(scenario.people.map((person) => [person.id, shortName(person.name) || person.id]));
}

/** The scenario's shifts with the people the result put on them. */
export function gridShifts(scenario: LabScenario, result: GeneratorResult | undefined): GridShift[] {
  const names = namesOf(scenario);
  const levels = new Map(scenario.input.members.map((member) => [member.id, member.level]));
  const assignments = result?.assignments ?? [];

  return scenario.input.shifts.map((shift) => ({
    id: shift.id,
    date: shift.date,
    start: shift.start,
    end: shift.end,
    headcount: shift.headcount,
    people: assignments
      .filter((assignment) => assignment.shiftId === shift.id)
      .map((assignment) => ({
        id: assignment.memberId,
        name: names.get(assignment.memberId) ?? assignment.memberId,
        level: levels.get(assignment.memberId) ?? 0,
      })),
  }));
}

/** A whole number the server's int can hold, or undefined. */
export function parseSeed(text: string): number | undefined {
  if (!/^-?\d+$/.test(text.trim())) return undefined;
  const seed = Number(text);
  return seed >= -2147483648 && seed <= 2147483647 ? seed : undefined;
}

/** A new positive seed for "Generate again". */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}
