import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGoBack } from './useGoBack';

type SubPageProps = {
  /** Where the round back button goes when there is no earlier page to return to (6, 2026-11-18). */
  backTo: string;
  title: string;
  context?: string;
  /** Overrides going back, for a page that must ask before leaving (mockup 1k6). */
  onBack?: () => void;
  children: ReactNode;
};

const backClassName =
  'flex size-12 items-center justify-center rounded-full bg-surface text-xl font-bold shadow-press';

// A full-screen page opened from a tab: a back arrow, a title, and no tab bar (mockups 1e, 1w, 1k3).
export function SubPage({ backTo, title, context, onBack, children }: SubPageProps) {
  const { t } = useTranslation();
  const goBack = useGoBack(backTo);
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={onBack ?? goBack} aria-label={t('shell.back')} className={backClassName}>
        <span aria-hidden="true">‹</span>
      </button>
      <main id="main" className="mt-4">
        <header className="mb-4">
          <h1 className="text-[32px] leading-[1.1]">{title}</h1>
          {context && <p className="mt-1 text-sm text-muted">{context}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}
