import { useTranslation } from 'react-i18next';
import { useUpdate } from './update';

/**
 * "A new version is ready · Reload" (M8-05). Not in the mockups: it borrows the toast's dark pill (spec
 * 19.6) and stays until tapped, on every screen, signed in or not.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const reload = useUpdate();
  if (!reload) return null;
  return (
    <div
      role="status"
      className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-pill bg-ink py-2 pr-2 pl-5 text-sm font-bold text-bg shadow-float"
    >
      <span>{t('offline.updateReady')}</span>
      <button
        type="button"
        onClick={reload}
        className="min-h-10 rounded-pill bg-bg px-4 text-sm font-bold text-ink shadow-press"
      >
        {t('offline.reload')}
      </button>
    </div>
  );
}
