import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';

// Placeholder until this screen is built; the tab and its route are real.
export function SchedulePage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-2xl px-5 md:px-0">
      <PageHeader context={t('schedule.context')} title={t('schedule.title')} />
      <EmptyState title={t('schedule.emptyTitle')}>{t('schedule.emptyText')}</EmptyState>
    </section>
  );
}
