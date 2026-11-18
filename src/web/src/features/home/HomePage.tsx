import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDateRange, formatNumber, formatShortDate } from '../../i18n/format';
import { buttonClassName } from '../../ui/button-styles';
import { Card } from '../../ui/Card';
import { Cup } from '../../ui/Cup';
import { HeroCard } from '../../ui/HeroCard';
import { PageHeader } from '../../ui/PageHeader';
import { useDecisionCount } from '../alerts/data';
import { useMe } from '../identity/session';
import { InstallCard } from '../install/InstallCard';
import { useMarketplace } from '../marketplace/data';
import {
  useCurrentPeriods,
  usePublishedSchedule,
  useTeamAvailability,
  type ScheduleShift,
} from '../scheduling/data';
import { flavourOf, useShiftName } from '../scheduling/ShiftName';
import { useWorkplace } from '../workplaces/workplace';

/** Monday of the week a date falls in, as "yyyy-mm-dd": hours are counted per week (BR-032). */
function mondayOf(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function isoDate(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
}

// Mockups 1a and 1b (staff), 1j and 1j2 (admins). FR-230: the next shift is hidden when there is none,
// hours this week always shows, and "Up for grabs" is hidden when there is nothing to take, in which
// case the hours card fills the row. The news cards arrive with M8.
export function HomePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { view, can } = useWorkplace();
  const me = useMe().data;
  const periods = useCurrentPeriods().data;
  const schedule = usePublishedSchedule(periods?.live?.id).data;
  // The next shift may be in a period published ahead of time, once this one has no shift left.
  const later = usePublishedSchedule(periods?.upcoming?.[0]?.id).data;
  const board = useMarketplace().data;
  const shiftName = useShiftName();
  const manages = can('ManageSchedule');
  const now = new Date();

  const mine = [...(schedule?.shifts ?? []), ...(later?.shifts ?? [])].filter((shift) =>
    shift.people.some((person) => person.isMe),
  );
  const next = mine.find((shift) => new Date(shift.startsAt) > now);
  const monday = mondayOf(now);
  const sunday = isoDate(new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000));
  const hours = mine
    .filter((shift) => shift.date >= monday && shift.date <= sunday)
    .reduce((sum, shift) => sum + shift.hours, 0);
  // The number the person gave with this period's availability (BR-032); none means no target to show.
  const wanted = periods?.myLiveWeeklyHours ?? null;
  const open =
    (board?.openShifts.length ?? 0) +
    (board?.offers.filter((offer) => !offer.mine && !offer.onShift).length ?? 0);
  const trades =
    board?.trades.filter((trade) => trade.role === 'coworker' && trade.status === 'requested').length ?? 0;
  const nextPeriod = periods?.next;

  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader
        context={new Intl.DateTimeFormat(language, { weekday: 'long', month: 'long', day: 'numeric' }).format(
          now,
        )}
        title={t('home.hello', { name: me?.displayName.split(' ')[0] ?? '' })}
      />

      <InstallCard />

      {manages && <PeriodHero />}

      {next && !manages && (
        <HeroCard
          eyebrow={t('home.nextShift')}
          title={dayLabel(next, now, t, language)}
          headingLevel={2}
          decoration={<Cup flavour={flavourOf(next.part)} className="w-16" />}
        >
          <p className="font-bold">
            {shiftName(next.part)} · {next.start}–{next.end}
          </p>
          <Coworkers shift={next} />
          <Link to="/schedule" className={buttonClassName('dark', 'mt-4')}>
            {t('home.viewShift')}
          </Link>
        </HeroCard>
      )}

      {manages && <WaitingCard />}

      {next && manages && (
        <Card className="flex items-center gap-3">
          <Cup flavour={flavourOf(next.part)} className="w-9 shrink-0" />
          <div>
            <p className="text-sm text-muted">{t('home.workingNext')}</p>
            <p className="font-bold">
              {dayLabel(next, now, t, language)} · {shiftName(next.part)} {next.start}–{next.end}
            </p>
          </div>
        </Card>
      )}

      {view.me.worksShifts && (
        <div className="grid grid-cols-2 gap-4">
          <Card className={open + trades === 0 ? 'col-span-2' : undefined}>
            <h2 className="text-sm font-bold text-muted">{t('home.hours')}</h2>
            <p className="mt-1">
              <span className="text-2xl font-bold">{formatNumber(hours, language)}</span>
              {wanted != null && (
                <span className="text-sm font-bold text-muted"> / {formatNumber(wanted, language)} h</span>
              )}
            </p>
            {wanted != null && (
              <div
                role="progressbar"
                aria-label={t('home.hours')}
                aria-valuemin={0}
                aria-valuemax={wanted}
                aria-valuenow={Math.min(hours, wanted)}
                className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-3"
              >
                <div
                  className="h-full rounded-pill bg-primary"
                  style={{ width: `${wanted > 0 ? Math.min(100, (hours / wanted) * 100) : 0}%` }}
                />
              </div>
            )}
          </Card>
          {open + trades > 0 && (
            <Card>
              <h2 className="text-sm font-bold text-muted">{t('home.grabs')}</h2>
              <p className="mt-1 text-2xl font-bold">{open + trades}</p>
              <Link to="/trade" className="mt-1 block text-sm font-bold text-link">
                {t('home.grabsDetail', { open, trades })} →
              </Link>
            </Card>
          )}
        </div>
      )}

      {nextPeriod && view.me.worksShifts && (
        <Card className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px]">
              {t('home.availability', {
                range: formatDateRange(nextPeriod.period.startDate, nextPeriod.period.endDate, language),
              })}
            </h2>
            <p className="text-sm text-muted">
              {nextPeriod.myAvailability === 'sent'
                ? t('home.availabilitySent')
                : nextPeriod.canEditAvailability
                  ? t('home.availabilityDue')
                  : t('home.availabilityLocked')}
            </p>
          </div>
          <Link
            to="/availability"
            className={buttonClassName(nextPeriod.myAvailability === 'sent' ? 'white' : 'dark')}
          >
            {nextPeriod.myAvailability === 'sent' || !nextPeriod.canEditAvailability
              ? t('home.view')
              : t('home.fillIn')}
          </Link>
        </Card>
      )}

      {!next && !nextPeriod && !manages && (
        <Card>
          <p className="text-sm text-muted">{t('home.nothing')}</p>
        </Card>
      )}
    </section>
  );
}

function dayLabel(shift: ScheduleShift, now: Date, t: TFunction, language: string): string {
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));
  return shift.date === today
    ? t('home.today')
    : shift.date === tomorrow
      ? t('home.tomorrow')
      : formatShortDate(shift.date, language);
}

/** "With Kevin T.", or "On your own" when nobody else is on the shift. */
export function Coworkers({ shift }: { shift: ScheduleShift }) {
  const { t } = useTranslation();
  const others = shift.people
    .filter((person) => !person.isMe)
    .map((person) => person.name ?? t('team.former'));
  return <p>{others.length > 0 ? t('home.with', { names: others.join(', ') }) : t('home.alone')}</p>;
}

/** The admin's hero (mockups 1j, 1j2): where the next period stands, and the way to the next step. */
function PeriodHero() {
  const { t, i18n } = useTranslation();
  const periods = useCurrentPeriods().data;
  const next = periods?.next;
  const team = useTeamAvailability(next?.period.status === 'collecting' ? next.period.id : undefined).data;
  if (!periods) return null;

  if (!next) {
    return (
      <HeroCard eyebrow={t('home.period.none')} title={t('home.period.noneTitle')} headingLevel={2}>
        <Link to="/schedule" className={buttonClassName('dark', 'mt-3')}>
          {t('home.period.open')}
        </Link>
      </HeroCard>
    );
  }

  const range = formatDateRange(next.period.startDate, next.period.endDate, i18n.language);
  const sent = team?.sentCount ?? next.sentCount ?? 0;
  const total = team?.total ?? 0;
  const collecting = next.period.status === 'collecting';
  const complete = collecting && total > 0 && sent === total;
  return (
    <HeroCard
      eyebrow={t('home.period.next', { range })}
      title={
        !collecting
          ? t('home.period.building')
          : complete
            ? t('home.period.collected')
            : t('home.period.collecting')
      }
      headingLevel={2}
      className={complete ? 'bg-opening' : undefined}
    >
      {collecting && total > 0 && (
        <>
          <p className="font-bold">{t('home.period.sent', { sent, total })}</p>
          <div
            role="progressbar"
            aria-label={t('home.period.sent', { sent, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={sent}
            className="mt-2 h-2 overflow-hidden rounded-pill bg-glow"
          >
            <div className="h-full rounded-pill bg-ink" style={{ width: `${(sent / total) * 100}%` }} />
          </div>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/schedule" className={buttonClassName('dark')}>
          {collecting
            ? complete
              ? t('home.period.ready')
              : t('home.period.build')
            : t('home.period.continue')}
        </Link>
        {collecting && (
          <Link to="/availability/team" className={buttonClassName('white')}>
            {t('home.period.who')}
          </Link>
        )}
      </div>
    </HeroCard>
  );
}

function WaitingCard() {
  const { t } = useTranslation();
  const waiting = useDecisionCount();
  if (waiting === 0) return null;
  return (
    <Card>
      <h2 className="text-sm font-bold text-muted">{t('home.waiting')}</h2>
      <p className="mt-1 text-2xl font-bold">{waiting}</p>
      <Link to="/alerts" className="mt-1 block text-sm font-bold text-link">
        {t('nav.alerts')} →
      </Link>
    </Card>
  );
}
