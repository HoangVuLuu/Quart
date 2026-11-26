import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { formatDateRange } from '../../i18n/format';
import { EmptyState } from '../../ui/EmptyState';
import { buttonClassName } from '../../ui/button-styles';
import { PageHeader } from '../../ui/PageHeader';
import { CardSkeleton, Loading, Skeleton } from '../../ui/Skeleton';
import { useCurrentPeriods } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { OfflineBanner } from '../offline/OfflineBanner';
import { NextPeriodBox } from './NextPeriod';
import { PublishedSchedule, type ScheduleScope } from './PublishedSchedule';
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
  // An alert can open a shift: /schedule?period=…&shift=… shows that period with the shift's pop-up (2026-11-18).
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState<string | null>(params.get('period'));
  const [scheduleView, setScheduleView] = useState<ScheduleScope>('mine');
  const shown = published.find((period) => period.id === chosen) ?? live;

  if (periods.isPending) {
    return (
      <section className="px-5">
        <PageHeader title={t('schedule.title')} />
        <Loading>
          <Skeleton className="h-12 rounded-pill" />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </Loading>
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

      <OfflineBanner />

      {manages && <NextPeriodBox next={next} after={live?.endDate} />}

      {published.length > 1 && (
        // The periods share the row equally: one takes it all, two take half each (2026-11-22).
        <div role="group" aria-label={t('schedule.which')} className="flex gap-2">
          {published.map((option) => (
            <Pill
              key={option.id}
              className="min-w-0 flex-1 px-2"
              selected={shown?.id === option.id}
              onClick={() => setChosen(option.id)}
            >
              {formatDateRange(option.startDate, option.endDate, i18n.language)}
            </Pill>
          ))}
        </div>
      )}

      {shown ? (
        <>
          <PublishedSchedule
            key={shown.id}
            periodId={shown.id}
            view={scheduleView}
            onViewChange={setScheduleView}
            initialShift={shown.id === params.get('period') ? params.get('shift') : null}
          />
          {/* After the last shift, across the whole width, in both views (2026-11-22). */}
          {manages && (
            <Link to={`/schedule/edit?period=${shown.id}`} className={buttonClassName('dark', 'w-full')}>
              {t('schedule.edit')}
            </Link>
          )}
        </>
      ) : (
        <EmptyState title={t('schedule.emptyTitle')} mood="sleepy">
          {next && view.me.worksShifts ? t('schedule.emptyCollecting') : t('schedule.emptyText')}
        </EmptyState>
      )}
    </section>
  );
}
