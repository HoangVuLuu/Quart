// Rules of a note on one shift (FR-103a), shared by the availability pages.

/** FR-103a, checked by the server as well. */
export const maxShiftNoteLength = 60;

/** "Opening", "Mid" or "Closing": a shift's name from its place in the day (BR-034). */
export function shiftKindKey(
  index: number,
  count: number,
): 'scheduling.kind.closing' | 'scheduling.kind.opening' | 'scheduling.kind.mid' {
  if (count > 1 && index === count - 1) return 'scheduling.kind.closing';
  return index === 0 ? 'scheduling.kind.opening' : 'scheduling.kind.mid';
}
