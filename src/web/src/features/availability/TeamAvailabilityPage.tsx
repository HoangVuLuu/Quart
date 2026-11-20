import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDue, formatNumber } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { initialsOf } from '../identity/session';
import { useCurrentPeriods, useTeamAvailability, useTeamAvailabilityActions } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';

// Mockup 1m: who has answered, what they want, and their notes, which only admins ever see (FR-103).
// Opened from the Home card and from Schedule (known conflict 2).
export function TeamAvailabilityPage() {
  const { t, i18n } = useTranslation();
  const { can } = useWorkplace();
  const periods = useCurrentPeriods();
  const next = periods.data?.next;
  const team = useTeamAvailability(can('ManageSchedule') ? next?.period.id : undefined);

  if (!can('ManageSchedule') || (periods.data && !next)) return <Navigate to="/schedule" replace />;
  if (periods.error ?? team.error) throw periods.error ?? team.error;
  if (!team.data || !next) {
    return (
      <SubPage backTo="/schedule" title={t('teamAvailability.title')}>
        <Skeleton className="h-64" />
      </SubPage>
    );
  }
  const data = team.data;

  return (
    <SubPage
      backTo="/schedule"
      title={t('teamAvailability.title')}
      context={`${formatDateRange(data.period.startDate, data.period.endDate, i18n.language)} · ${t('home.period.sent', { sent: data.sentCount, total: data.total })}`}
    >
      <div className="flex flex-col gap-4">
        {data.period.dueAt && !data.period.locked && (
          <p className="text-sm font-bold">
            {t('teamAvailability.due', { when: formatDue(data.period.dueAt, i18n.language) })}
          </p>
        )}
        <div
          role="progressbar"
          aria-label={t('home.period.sent', { sent: data.sentCount, total: data.total })}
          aria-valuemin={0}
          aria-valuemax={data.total}
          aria-valuenow={data.sentCount}
          className="h-2 overflow-hidden rounded-pill bg-surface"
        >
          <div
            className="h-full rounded-pill bg-primary"
            style={{ width: `${data.total > 0 ? (data.sentCount / data.total) * 100 : 0}%` }}
          />
        </div>
        <People periodId={data.period.id} locked={data.period.locked} people={data.people} />
      </div>
    </SubPage>
  );
}

type Row = NonNullable<ReturnType<typeof useTeamAvailability>['data']>['people'][number];

function People({ periodId, locked, people }: { periodId: string; locked: boolean; people: Row[] }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const actions = useTeamAvailabilityActions(periodId);
  const error = actions.remind.error ?? actions.reopen.error;
  const missing = people.filter((person) => person.status !== 'sent').length;

  return (
    <>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />
      <Card className="p-4">
        <ul className="flex flex-col">
          {people.map((person) => {
            const sent = person.status === 'sent';
            return (
              <li
                key={person.membershipId}
                className="relative flex items-start gap-3 border-b border-line py-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold"
                >
                  {initialsOf(person.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {/* The whole row opens their answer, read-only (2026-11-20): the link covers the row. */}
                    <Link
                      to={`/availability/people/${periodId}/${person.membershipId}`}
                      className="after:absolute after:inset-0"
                    >
                      {person.name}
                    </Link>{' '}
                    <span className="text-xs text-muted">
                      {t('scheduling.levelShort', { level: person.level })}
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    {sent
                      ? t('teamAvailability.offers', {
                          offered: formatNumber(person.hoursOffered, i18n.language),
                          wanted:
                            person.desiredWeeklyHours == null
                              ? '–'
                              : formatNumber(person.desiredWeeklyHours, i18n.language),
                        })
                      : t('teamAvailability.noAnswer')}
                  </p>
                  {person.notes.map((note) => (
                    <p
                      key={note.id}
                      className="mt-2 rounded-field bg-warning-soft px-3 py-2 text-sm whitespace-pre-wrap text-warning"
                    >
                      {note.body}
                    </p>
                  ))}
                </div>
                {/* Above the row's link, so Remind and Reopen stay their own buttons. */}
                <div className="relative z-10 flex flex-col items-end gap-2">
                  <StatusChip tone={sent ? 'success' : person.reopened ? 'warning' : 'neutral'}>
                    {sent
                      ? t('availability.sent')
                      : person.reopened
                        ? t('teamAvailability.reopened')
                        : t('availability.notSent')}
                  </StatusChip>
                  {!sent && !locked && (
                    <Button
                      className="min-h-11 px-4 text-sm"
                      aria-label={t('teamAvailability.remindNamed', { name: person.name })}
                      disabled={actions.remind.isPending}
                      onClick={() =>
                        actions.remind.mutate(person.membershipId, {
                          onSuccess: () => toast(t('teamAvailability.reminded', { count: 1 })),
                        })
                      }
                    >
                      {t('teamAvailability.remind')}
                    </Button>
                  )}
                  {locked && !person.reopened && (
                    <Button
                      variant="white"
                      className="min-h-11 px-4 text-sm"
                      aria-label={t('teamAvailability.reopenNamed', { name: person.name })}
                      disabled={actions.reopen.isPending}
                      onClick={() =>
                        actions.reopen.mutate(person.membershipId, {
                          onSuccess: () => toast(t('teamAvailability.reopenedToast', { name: person.name })),
                        })
                      }
                    >
                      {t('teamAvailability.reopen')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {!locked && missing > 0 && (
        <Button
          loading={actions.remind.isPending}
          onClick={() =>
            actions.remind.mutate(null, {
              onSuccess: (result) => toast(t('teamAvailability.reminded', { count: result.reminded })),
            })
          }
        >
          {t('teamAvailability.remindAll')}
        </Button>
      )}
    </>
  );
}
