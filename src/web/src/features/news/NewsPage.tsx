import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

// Placeholder until this screen is built; the tab and its route are real.
export function NewsPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-2xl px-5 md:px-0">
      <PageHeader context={t('news.context')} title={t('news.title')} />
      <EmptyState title={t('news.emptyTitle')}>{t('news.emptyText')}</EmptyState>
    </section>
  );
}
