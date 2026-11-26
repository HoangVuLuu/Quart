import { useTranslation } from 'react-i18next';

/**
 * What the app shows while it starts (2026-11-25): the logo on the app's background, like the launch screen
 * of a phone app. index.html draws the same thing before any script runs, so the hand-over is invisible.
 * It stays until the person and their workplace are known; each page then shows its own placeholders.
 */
export function LaunchScreen() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="flex min-h-dvh items-center justify-center bg-bg">
      <span className="sr-only">{t('ui.loading')}</span>
      <div aria-hidden="true" className="quart-blob flex h-28 w-32 items-center justify-center">
        <span className="font-display text-3xl text-white">Quart</span>
      </div>
    </div>
  );
}
