import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageSwitcher } from '../../app/LanguageSwitcher';
import { Cup } from '../../ui/Cup';

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  /** Where the round back button goes; screens reached directly (log in) have none. */
  backTo?: string;
  /** The mascot greets people on the screens that have room for it (mockups 1s, 1t). */
  mascot?: boolean;
  children: ReactNode;
};

// The frame of the signed-out screens (mockups 1s, 1t, 1u): one centred column, the logo blob, a title.
export function AuthLayout({ title, subtitle, backTo, mascot = false, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto min-h-dvh max-w-md px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-10">
      <div className="flex min-h-12 items-center justify-between">
        {backTo ? (
          <Link
            to={backTo}
            aria-label={t('auth.back')}
            className="flex size-12 items-center justify-center rounded-full bg-surface text-xl font-bold shadow-press"
          >
            <span aria-hidden="true">‹</span>
          </Link>
        ) : (
          <span />
        )}
        <LanguageSwitcher />
      </div>
      <main id="main" className="mt-6">
        <div className="flex flex-col items-center text-center">
          {mascot && <Cup flavour="milk-tea" className="mb-4 w-16" />}
          <div className="quart-blob flex h-20 w-24 items-center justify-center">
            <span className="font-display text-2xl text-white">{t('app.name')}</span>
          </div>
          <h1 className="mt-4 text-[28px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
