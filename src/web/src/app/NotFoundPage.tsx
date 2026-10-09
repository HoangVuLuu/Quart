import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClassName } from '../ui/button-styles';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-2xl px-5 py-6">
      <h1 className="text-3xl">{t('notFound.title')}</h1>
      <Link to="/" className={buttonClassName('dark', 'mt-5')}>
        {t('notFound.back')}
      </Link>
    </section>
  );
}
