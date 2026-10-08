import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ToastProvider } from '../ui/Toast';
import { MainNav } from './MainNav';
import { tabs } from './navigation';

// The frame every screen lives in, from docs/prototype/quart-design-prototype.html (spec 19.6):
// the top row, the screen, and the main navigation (a floating tab bar on phones, a sidebar from md).
// Desktop and dark mode are extrapolated from the phone-sized, light-only prototype (19.7, Q-14).
export function AppShell() {
  const { t } = useTranslation();

  return (
    <ToastProvider>
      <div className="min-h-dvh pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-20 focus:rounded-pill focus:bg-ink focus:px-5 focus:py-3 focus:text-bg"
        >
          {t('shell.skipToContent')}
        </a>

        <div className="mx-auto max-w-5xl md:grid md:grid-cols-[14rem_1fr] md:gap-6 md:px-5">
          <header className="flex items-center gap-3 px-5 py-3 md:col-span-2 md:px-0">
            <div className="quart-blob flex h-14 w-16 items-center justify-center">
              <span className="font-display text-lg text-white">{t('app.name')}</span>
            </div>
            <div className="flex-1" />
            <LanguageSwitcher />
            {/* M2 replaces this with the person's initials, and adds the settings circle for admins (NFR-016). */}
            <span
              role="img"
              aria-label={t('shell.account')}
              className="flex size-12 items-center justify-center rounded-full bg-surface shadow-press"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-current text-muted">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" />
              </svg>
            </span>
          </header>

          <MainNav tabs={tabs} />

          {/* Phones keep room under the content for the floating tab bar, so it never covers anything. */}
          <main
            id="main"
            tabIndex={-1}
            className="pb-[calc(120px+env(safe-area-inset-bottom))] outline-none md:pb-10"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
