import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router';
import { buttonClassName } from '../ui/button-styles';
import { Card } from '../ui/Card';
import { ErrorNotice } from './ErrorNotice';

// The root error boundary: whatever throws while rendering a screen lands here instead of a blank page.
export function RootErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();

  return (
    <section role="alert" className="mx-auto max-w-2xl px-5 py-6">
      <h1 className="text-3xl">{t('errors.page.title')}</h1>
      <Card className="mt-4">
        <ErrorNotice error={error} />
      </Card>
      <Link to="/" reloadDocument className={buttonClassName('dark', 'mt-5')}>
        {t('errors.page.home')}
      </Link>
    </section>
  );
}
