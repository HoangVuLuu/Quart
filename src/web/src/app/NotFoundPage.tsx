import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-2xl px-5 py-6">
      <h1 className="text-3xl">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="mt-5 inline-flex min-h-11 items-center rounded-pill bg-ink px-5 font-bold text-bg shadow-press"
      >
        {t('notFound.back')}
      </Link>
    </section>
  );
}
