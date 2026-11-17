import { useTranslation } from 'react-i18next';
import type { CupFlavour } from '../../ui/Cup';
import type { ShiftPart } from './data';

/** "Opening", "Closing" or "Mid": the first and last shifts of a day are named, the others are not (BR-034). */
export function useShiftName() {
  const { t } = useTranslation();
  return (part: string): string =>
    part === 'closing'
      ? t('scheduling.kind.closing')
      : part === 'mid'
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
