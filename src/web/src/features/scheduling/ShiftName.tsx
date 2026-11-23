import { useTranslation } from 'react-i18next';
import type { CupFlavour } from '../../ui/Cup';
import type { ShiftPart } from './data';

/** A shift as far as its label goes: its place in the day, and the custom name the manager gave it. */
export type NamedShift = { part: string; name?: string | null };

/**
 * The one place that decides a shift's label (M3-04): the custom name exactly as typed, in both languages,
 * else "Opening", "Closing" or "Mid" from its place in the day (BR-034).
 */
export function useShiftName() {
  const { t } = useTranslation();
  return (shift: NamedShift): string =>
    shift.name
      ? shift.name
      : shift.part === 'closing'
        ? t('scheduling.kind.closing')
        : shift.part === 'mid'
          ? t('scheduling.kind.mid')
          : t('scheduling.kind.opening');
}

/** Opening shifts are lime, closing shifts lavender (spec 19.6). */
export function flavourOf(part: string): CupFlavour {
  return (part as ShiftPart) === 'closing'
    ? 'closing'
    : (part as ShiftPart) === 'mid'
      ? 'milk-tea'
      : 'opening';
}
