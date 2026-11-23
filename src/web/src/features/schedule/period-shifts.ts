import { useOutletContext } from 'react-router';
import type { DayInfo, DayShift, DaysState } from '../day-editor/model';
import type { NewShift } from '../day-editor/NewShiftDialog';

/** What the pages for one period's shifts share while open (M4-01): the edits, saved together. */
export type PeriodShiftsContext = {
  periodId: string;
  title: string;
  context: string;
  published: boolean;
  days: DayInfo[];
  state: DaysState;
  changed: Set<string>;
  dirty: boolean;
  week: number;
  setWeek: (week: number) => void;
  label: (shift: DayShift, part: 'opening' | 'mid' | 'closing') => string;
  setDay: (day: string, shifts: DayShift[]) => void;
  reopen: (day: string) => void;
  add: (shift: NewShift, days: string[]) => void;
  save: () => void;
  saving: boolean;
  saveError: unknown;
};

export function usePeriodShifts(): PeriodShiftsContext {
  return useOutletContext<PeriodShiftsContext>();
}
