import { useOutletContext } from 'react-router';
import type { DayInfo, DayShift, DaysState } from '../day-editor/model';
import type { NewShift } from '../day-editor/NewShiftDialog';

/** What the "Edit a specific day" pages share while they are open (M4-01): the edits, saved together. */
export type SpecificDays = {
  days: DayInfo[];
  state: DaysState;
  changed: Set<string>;
  dirty: boolean;
  week: number;
  setWeek: (week: number) => void;
  label: (shift: DayShift, part: 'opening' | 'mid' | 'closing') => string;
  setDay: (day: string, shifts: DayShift[]) => void;
  add: (shift: NewShift, days: string[]) => void;
  clearAll: () => void;
  save: () => void;
  saving: boolean;
  saveError: unknown;
};

export function useSpecificDays(): SpecificDays {
  return useOutletContext<SpecificDays>();
}
