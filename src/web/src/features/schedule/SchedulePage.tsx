import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDateRange } from '../../i18n/format';
import { buttonClassName } from '../../ui/button-styles';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { Skeleton } from '../../ui/Skeleton';
import { useCurrentPeriods } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { NextPeriodBox } from './NextPeriod';
import { PublishedSchedule } from './PublishedSchedule';
import { Pill } from './Pill';

// The Schedule tab. Everyone sees the published period (mockups 1c, 1d). Managers also get the next-period
// box at the top (4.1, 2026-11-18), which leads to Building Schedule; a published period is changed on
// Editing Schedule (4.4). The draft itself never shows here, and staff never see one (AD-012).
export function SchedulePage() {
  const { t, i18n } = useTranslation();
  const { can, view } = useWorkplace();
  const periods = useCurrentPeriods();
  const manages = can('ManageSchedule');
  const live = periods.data?.live ?? null;
  const next = periods.data?.next ?? null;
  // Published ahead of time: staff read them, and managers edit them, before the current one ends.
  const published = [...(live ? [live] : []), ...(periods.data?.upcoming ?? [])];
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = published.find((period) => period.id === chosen) ?? live;

  if (periods.isPending) {
    return (
      <section className="px-5">
        <PageHeader title={t('schedule.title')} />
        <Skeleton className="h-48" />
      </section>
    );
  }
  if (periods.error) throw periods.error;

  const range = shown ? formatDateRange(shown.startDate, shown.endDate, i18n.language) : undefined;

  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader
        title={t('schedule.title')}
        subtitle={range ? `${range} · ${t('schedule.state.published')}` : undefined}
      />

      {manages && (
        <>
          <NextPeriodBox next={next} after={live?.endDate} />
          <Link to="/generator" className={buttonClassName('white', 'self-start')}>
            {t('schedule.editGenerator')}
          </Link>
        </>
      )}

      {published.length > 1 && (
        <div role="group" aria-label={t('schedule.which')} className="flex flex-wrap gap-2">
          {published.map((option) => (
            <Pill key={option.id} selected={shown?.id === option.id} onClick={() => setChosen(option.id)}>
              {formatDateRange(option.startDate, option.endDate, i18n.language)}
            </Pill>
          ))}
        </div>
      )}

      {shown ? (
        <PublishedSchedule
          key={shown.id}
          periodId={shown.id}
          action={
            <>
              {next?.canEditAvailability && view.me.worksShifts && (
                <Link
                  to="/availability"
                  className={buttonClassName('dark', 'min-h-11 bg-opening px-4 text-sm text-on-primary')}
                >
                  {t('schedule.fillAvailability')}
                </Link>
              )}
              {manages && (
                <Link
                  to={`/schedule/edit?period=${shown.id}`}
                  className={buttonClassName('white', 'min-h-11 px-4 text-sm')}
                >
                  {t('schedule.edit')}
                </Link>
              )}
            </>
          }
        />
      ) : (
        <EmptyState title={t('schedule.emptyTitle')} mood="sleepy">
          {next && view.me.worksShifts ? t('schedule.emptyCollecting') : t('schedule.emptyText')}
        </EmptyState>
      )}

      {!live && next && view.me.worksShifts && next.canEditAvailability && (
        <Link to="/availability" className={buttonClassName('dark', 'self-center')}>
          {t('schedule.fillAvailability')}
        </Link>
      )}
    </section>
  );
}
