import { useTranslation } from 'react-i18next';
import { useConnection } from '../../lib/connection';
import { savedAt } from './saved-at';

/**
 * Shown on Home and Schedule while offline (M8-05): the copy on screen and when it was saved, and that
 * changes need a connection. Not in the mockups: it reuses the muted notice box of the shift sheet.
 */
export function OfflineBanner() {
  const { t, i18n } = useTranslation();
  const { online, copyFrom } = useConnection();
  if (online && !copyFrom) return null;
  return (
    <div role="status" className="rounded-field bg-surface-3 px-4 py-3 text-sm">
      <p className="font-bold">{t('offline.title')}</p>
      <p className="text-muted">
        {copyFrom ? t('offline.copy', { time: savedAt(copyFrom, i18n.language) }) : t('offline.noCopy')}
      </p>
    </div>
  );
}
