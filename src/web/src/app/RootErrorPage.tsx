import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router';
import { ErrorNotice } from './ErrorNotice';

// The root error boundary: whatever throws while rendering a screen lands here instead of a blank page.
export function RootErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();

  return (
    <section role="alert" className="mx-auto max-w-2xl px-5 py-6">
      <h1 className="text-3xl">{t('errors.page.title')}</h1>
      <div className="mt-4 rounded-card bg-surface p-5 shadow-card">
        <ErrorNotice error={error} />
      </div>
      <Link
        to="/"
        reloadDocument
        className="mt-5 inline-flex min-h-11 items-center rounded-pill bg-ink px-5 font-bold text-bg shadow-press"
      >
        {t('errors.page.home')}
      </Link>
    </section>
  );
}
