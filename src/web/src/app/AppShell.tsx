import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { LanguageSwitcher } from './LanguageSwitcher';

// The top row of every screen: the wordmark blob on the left, actions on the right.
// The full shell (bottom tabs on phones, sidebar on desktop, at most five tabs) is issue M0-10.
// The look comes from spec section 19; colours, radii and shadows are tokens, never literals.
export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <div className="quart-blob flex h-14 w-16 items-center justify-center">
            <span className="font-display text-lg text-white">{t('app.name')}</span>
          </div>
          <p className="flex-1 text-sm text-muted">{t('app.workplace')}</p>
          <LanguageSwitcher />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
