import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useWaitingCount } from '../features/alerts/data';
import { useMarketplace } from '../features/marketplace/data';
import { MainNav } from './MainNav';
import { tabs } from './navigation';

// The frame of the five tabs (spec 19.6, mockup 1a): the logo and the team icon in the top row, the
// screen, and the main navigation (a floating tab bar on phones, a sidebar from md).
// Desktop and dark mode are extrapolated from the phone-sized, light-only mockups (19.7, Q-14).
export function AppShell() {
  const { t } = useTranslation();
  const waiting = useWaitingCount();
  // 2.4: items on the Trade tab the person has not opened yet.
  const unseen = useMarketplace().data?.unseen ?? 0;

  return (
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
          <Link
            to="/team"
            aria-label={t('shell.team')}
            className="flex size-12 items-center justify-center rounded-full bg-surface shadow-press"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 19c.5-2.8 2.700-4.500 5.500-4.500s5 1.700 5.500 4.500M5.500 11.500a2.200 2.200 0 1 0 0-4.400M18.500 11.500a2.200 2.200 0 1 1 0-4.400M2.500 17c.2-1.500 1.200-2.600 2.600-3M21.500 17c-.2-1.500-1.200-2.600-2.600-3" />
            </svg>
          </Link>
        </header>

        <MainNav
          tabs={tabs.map((tab) =>
            tab.icon === 'alerts'
              ? { ...tab, count: waiting }
              : tab.icon === 'trade'
                ? { ...tab, count: unseen }
                : tab,
          )}
        />

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
  );
}
