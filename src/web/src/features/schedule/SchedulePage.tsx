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
import { DraftEditor } from './DraftEditor';
import { OpenPeriodCard, ReadyToBuild } from './NextPeriod';
import { PublishedSchedule } from './PublishedSchedule';
import { Pill } from './Pill';

// The Schedule tab. Staff see the published period (mockups 1c, 1d). Admins also see the next period:
// "Ready to build?" while availability comes in (1k, 1k2), then the draft (1l). Staff never see a draft (AD-012).
export function SchedulePage() {
  const { t, i18n } = useTranslation();
  const { can, view } = useWorkplace();
  const periods = useCurrentPeriods();
  const manages = can('ManageSchedule');
  const live = periods.data?.live ?? null;
  const next = periods.data?.next ?? null;
  // Admins land on the period that needs them: the next one while it is being prepared.
  const [chosen, setChosen] = useState<'live' | 'next' | null>(null);
  const [editingLive, setEditingLive] = useState(false);
  const showing = chosen ?? (manages && next ? 'next' : 'live');

  if (periods.isPending) {
    return (
      <section className="px-5">
        <PageHeader title={t('schedule.title')} />
        <Skeleton className="h-48" />
      </section>
    );
  }
  if (periods.error) throw periods.error;

  const period = showing === 'next' && manages && next ? next.period : live;
  const range = period ? formatDateRange(period.startDate, period.endDate, i18n.language) : undefined;
  const draft =
    manages &&
    ((showing === 'next' && next?.period.status === 'building') || (showing === 'live' && editingLive));
  const state = !period
    ? undefined
    : draft
      ? t('schedule.state.draft')
      : period.status === 'collecting'
        ? t('schedule.state.collecting')
        : period.status === 'building'
          ? t('schedule.state.draft')
          : t('schedule.state.published');

  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader title={t('schedule.title')} subtitle={range ? `${range} · ${state}` : undefined} />

      {manages && live && next && (
        <div role="group" aria-label={t('schedule.which')} className="flex gap-2">
          <Pill selected={showing === 'live'} onClick={() => setChosen('live')}>
            {t('schedule.published')}
          </Pill>
          <Pill selected={showing === 'next'} onClick={() => setChosen('next')}>
            {t('schedule.next')}
          </Pill>
        </div>
      )}

      {showing === 'next' && manages && next ? (
        next.period.status === 'collecting' ? (
          <ReadyToBuild periodId={next.period.id} />
        ) : (
          <DraftEditor periodId={next.period.id} />
        )
      ) : live ? (
        editingLive && manages ? (
          <DraftEditor periodId={live.id} onDone={() => setEditingLive(false)} />
        ) : (
          <PublishedSchedule
            periodId={live.id}
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
                  <button
                    type="button"
                    onClick={() => setEditingLive(true)}
                    className={buttonClassName('white', 'min-h-11 px-4 text-sm')}
                  >
                    {t('schedule.edit')}
                  </button>
                )}
              </>
            }
          />
        )
      ) : (
        <EmptyState title={t('schedule.emptyTitle')} mood="sleepy">
          {next && view.me.worksShifts ? t('schedule.emptyCollecting') : t('schedule.emptyText')}
        </EmptyState>
      )}

      {!live && next && !manages && view.me.worksShifts && next.canEditAvailability && (
        <Link to="/availability" className={buttonClassName('dark', 'self-center')}>
          {t('schedule.fillAvailability')}
        </Link>
      )}
      {manages && !next && <OpenPeriodCard after={live?.endDate} />}
    </section>
  );
}
