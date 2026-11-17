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
  // Published ahead of time: staff read them, and admins edit them, before the current one ends.
  const published = [...(live ? [live] : []), ...(periods.data?.upcoming ?? [])];
  // Admins land on the period that needs them: the next one while it is being prepared.
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const showingNext = manages && next !== null && (chosen === null || chosen === next.period.id);
  const shown = showingNext ? null : (published.find((period) => period.id === chosen) ?? live);

  if (periods.isPending) {
    return (
      <section className="px-5">
        <PageHeader title={t('schedule.title')} />
        <Skeleton className="h-48" />
      </section>
    );
  }
  if (periods.error) throw periods.error;

  const period = showingNext && next ? next.period : shown;
  const range = period ? formatDateRange(period.startDate, period.endDate, i18n.language) : undefined;
  const editingShown = manages && shown !== null && editing === shown.id;
  const draft = manages && ((showingNext && next?.period.status === 'building') || editingShown);
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

      {published.length + (manages && next ? 1 : 0) > 1 && (
        <div role="group" aria-label={t('schedule.which')} className="flex flex-wrap gap-2">
          {published.map((option) => (
            <Pill
              key={option.id}
              selected={!showingNext && shown?.id === option.id}
              onClick={() => setChosen(option.id)}
            >
              {published.length === 1
                ? t('schedule.published')
                : formatDateRange(option.startDate, option.endDate, i18n.language)}
            </Pill>
          ))}
          {manages && next && (
            <Pill selected={showingNext} onClick={() => setChosen(next.period.id)}>
              {t('schedule.next')}
            </Pill>
          )}
        </div>
      )}

      {showingNext && next ? (
        next.period.status === 'collecting' ? (
          <ReadyToBuild periodId={next.period.id} />
        ) : (
          <DraftEditor periodId={next.period.id} />
        )
      ) : shown ? (
        editingShown ? (
          <DraftEditor key={shown.id} periodId={shown.id} onDone={() => setEditing(null)} />
        ) : (
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
                  <button
                    type="button"
                    onClick={() => setEditing(shown.id)}
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
