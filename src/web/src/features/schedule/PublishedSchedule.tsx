import { useState } from 'react';
import { useOffline } from '../../lib/connection';
import { useSwipe } from '../../lib/gestures';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { formatDayHeading, formatDayShort, formatNumber, formatShortDate } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Cup } from '../../ui/Cup';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { PersonName } from './PersonName';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { Coworkers } from '../home/HomePage';
import { FormError } from '../identity/FormError';
import { useMarketplace, useMarketplaceActions } from '../marketplace/data';
import {
  byDay,
  usePublishedSchedule,
  weekOf,
  type ScheduleShift,
  type ScheduleView,
} from '../scheduling/data';
import { flavourOf, useShiftName } from '../scheduling/ShiftName';
import { ManagerNote, NoteMark } from './manager-note';

export type ScheduleScope = 'mine' | 'team';

type PublishedScheduleProps = {
  periodId: string;
  /** Kept by the page, so switching periods keeps "Whole team" (2026-11-18). */
  view?: ScheduleScope;
  onViewChange?: (view: ScheduleScope) => void;
  /** A shift whose pop-up starts open, when an alert brought the person here (2026-11-18). */
  initialShift?: string | null;
};

// Mockups 1c (my shifts) and 1d (whole team). Tapping one of my shifts shows who I work with (2.3,
// 2026-11-18); giving away and trading start from the Trade tab instead (1h, 1i).
export function PublishedSchedule({
  periodId,
  view: shownView,
  onViewChange,
  initialShift,
}: PublishedScheduleProps) {
  const { t } = useTranslation();
  const schedule = usePublishedSchedule(periodId);
  const [ownView, setOwnView] = useState<ScheduleScope>('mine');
  const view = shownView ?? ownView;
  const setView = onViewChange ?? setOwnView;
  const [openShift, setOpenShift] = useState<string | null>(initialShift ?? null);
  const swipeViews = useSwipe({ onNext: () => setView('team'), onPrevious: () => setView('mine') });

  if (schedule.error) throw schedule.error;
  if (!schedule.data) return <Skeleton className="h-48" />;
  const selected = schedule.data.shifts.find((shift) => shift.id === openShift);

  return (
    <>
      {/* One pill across the row, like a switch between the two (2026-11-22). */}
      <SegmentedControl
        label={t('schedule.view')}
        segments={[
          { value: 'mine', label: t('schedule.mine') },
          { value: 'team', label: t('schedule.team') },
        ]}
        value={view}
        onChange={setView}
      />
      {/* Swipe left for the whole team, right to come back to my shifts: the same as the two choices. */}
      <div className="flex flex-col gap-4" {...swipeViews}>
        {view === 'mine' ? (
          <MyShifts schedule={schedule.data} onOpen={setOpenShift} />
        ) : (
          <WholeTeam schedule={schedule.data} />
        )}
      </div>
      {selected && <ShiftPeopleSheet shift={selected} onClose={() => setOpenShift(null)} />}
    </>
  );
}

function MyShifts({ schedule, onOpen }: { schedule: ScheduleView; onOpen: (shiftId: string) => void }) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const offers = useMarketplace().data?.offers ?? [];
  const now = new Date();
  const mine = schedule.shifts.filter((shift) => shift.people.some((person) => person.isMe));
  const upcoming = mine.filter((shift) => new Date(shift.startsAt) > now);
  const completed = mine.filter((shift) => new Date(shift.startsAt) <= now).reverse();

  if (mine.length === 0) {
    return <EmptyState title={t('schedule.noShiftsTitle')}>{t('schedule.noShiftsText')}</EmptyState>;
  }

  const card = (shift: ScheduleShift, done: boolean) => {
    const offered = offers.some((offer) => offer.mine && offer.shift.id === shift.id);
    const body = (
      <>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-bold tracking-[0.06em] text-muted uppercase">
            {formatDayHeading(shift.date, i18n.language)}
          </p>
          <p className="flex items-center gap-2 text-xl font-bold">
            {shiftName(shift)}
            {/* FR-145: the manager left a note; it reads in the shift's sheet. */}
            {shift.note && <NoteMark />}
          </p>
          <div className="text-sm">
            <span>
              {shift.start}–{shift.end} ·{' '}
            </span>
            <span className="inline-block">
              <Coworkers shift={shift} />
            </span>
          </div>
          {offered && (
            <StatusChip tone="danger" className="mt-2">
              {t('schedule.offered')}
            </StatusChip>
          )}
          {done && (
            <StatusChip tone="success" className="mt-2">
              {t('schedule.completedChip')}
            </StatusChip>
          )}
        </div>
        <Cup flavour={flavourOf(shift.part)} mood={done ? 'sleepy' : 'happy'} className="w-9 shrink-0" />
      </>
    );
    return (
      <li key={shift.id}>
        {done ? (
          <Card className="flex items-center gap-3 opacity-70">{body}</Card>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(shift.id)}
            className="flex w-full items-center gap-3 rounded-card bg-surface p-5 shadow-card"
          >
            {body}
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      {upcoming.length > 0 && (
        <>
          <h2 className="text-xl">{t('schedule.upcoming')}</h2>
          <ul className="flex flex-col gap-3">{upcoming.map((shift) => card(shift, false))}</ul>
        </>
      )}
      {completed.length > 0 && (
        <>
          <h2 className="text-xl">{t('schedule.completed')}</h2>
          <ul className="flex flex-col gap-3">{completed.map((shift) => card(shift, true))}</ul>
        </>
      )}
    </>
  );
}

/** Mockup 1d: one card per day, grouped by week, a row per shift, the person's own name highlighted. */
function WholeTeam({ schedule }: { schedule: ScheduleView }) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  // Shifts whose note is open (FR-145).
  const [reading, setReading] = useState<ReadonlySet<string>>(new Set());
  const toggleNote = (shiftId: string) =>
    setReading((current) => {
      const next = new Set(current);
      if (!next.delete(shiftId)) next.add(shiftId);
      return next;
    });
  const weeks = Array.from({ length: schedule.period.weeks }, (_, week) =>
    byDay(schedule.shifts.filter((shift) => weekOf(schedule.period, shift.date) === week)),
  );

  return (
    <>
      {weeks.map((days, week) => (
        <section
          key={week}
          aria-label={t('scheduling.grid.week', { number: week + 1 })}
          className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-x-4"
        >
          <h2 className="text-xs font-bold tracking-[0.06em] text-muted uppercase lg:col-span-2">
            {t('scheduling.grid.week', { number: week + 1 })}
          </h2>
          {days.map((day) => {
            const mine = day.shifts.some((shift) => shift.people.some((person) => person.isMe));
            return (
              <Card key={day.date} className={cx('flex gap-3 p-4', mine && 'outline-2 outline-primary')}>
                <p
                  className={cx(
                    'w-14 shrink-0 rounded-chip p-2 text-center text-sm font-bold',
                    mine ? 'bg-primary text-on-primary' : 'bg-surface-3',
                  )}
                >
                  {formatDayShort(day.date, i18n.language)}
                </p>
                {/* FR-145: a shift with a note has the mark; tapping it opens the note, tapping again closes it. */}
                <ul className="min-w-0 flex-1">
                  {day.shifts.map((shift) => {
                    const open = reading.has(shift.id);
                    const header = (
                      <>
                        <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.06em] text-muted uppercase">
                          {shiftName(shift)} · {shift.start}–{shift.end}
                          {shift.note && <NoteMark />}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-1.5">
                          {shift.people.map((person) => (
                            <span
                              key={person.membershipId}
                              className={cx(
                                'rounded-pill px-2.5 py-0.5 text-sm font-bold',
                                // Starts earlier (2026-11-25): red on light red, readable whoever it is.
                                person.startsEarly
                                  ? 'bg-danger-soft text-danger'
                                  : person.isMe
                                    ? 'bg-primary text-on-primary'
                                    : 'bg-surface-3',
                              )}
                            >
                              {person.isMe ? t('schedule.you') : (person.name ?? t('team.former'))}
                              {person.startsEarly && (
                                <span className="sr-only"> ({t('schedule.startsEarly')})</span>
                              )}
                            </span>
                          ))}
                          {shift.people.length < shift.headcount && (
                            <StatusChip tone="warning">
                              {t('schedule.openSlots', { count: shift.headcount - shift.people.length })}
                            </StatusChip>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <li key={shift.id} className="mb-2 last:mb-0">
                        {shift.note ? (
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggleNote(shift.id)}
                            className="block w-full text-left"
                          >
                            {header}
                          </button>
                        ) : (
                          <div>{header}</div>
                        )}
                        {open && <ManagerNote note={shift.note} compact />}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </section>
      ))}
    </>
  );
}

/**
 * One of my shifts on the Schedule tab: who else works it, and its empty spots (2.3, 2026-11-18). The same
 * pop-up as the trade sheet, without its buttons.
 */
export function ShiftPeopleSheet({ shift, onClose }: { shift: ScheduleShift; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const open = Math.max(0, shift.headcount - shift.people.length);
  return (
    <Sheet
      open
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={shiftName(shift)}
      description={`${formatDayHeading(shift.date, i18n.language)} · ${shift.start}–${shift.end} · ${formatNumber(shift.hours, i18n.language)} h`}
    >
      {/* Everyone on the shift, the viewer included (Hoang, 2026-11-25). */}
      <h3 className="text-sm font-bold text-muted">{t('schedule.sheet.onShift')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {shift.people.map((person) => (
          <li key={person.membershipId} className="rounded-field bg-surface-3 px-4 py-3 font-bold">
            <PersonName person={person} />
          </li>
        ))}
        {shift.people.length === 0 && open === 0 && (
          <li className="rounded-field bg-surface-3 px-4 py-3 text-sm text-muted">
            {t('schedule.sheet.alone')}
          </li>
        )}
      </ul>
      {open > 0 && (
        <StatusChip tone="warning" className="mt-3">
          {t('schedule.sheet.openSpots', { count: open })}
        </StatusChip>
      )}
      <ManagerNote note={shift.note} />
    </Sheet>
  );
}

/**
 * Mockup 1h: one of my shifts, with Give away and Trade, opened from "My shifts to trade" (2.2). Giving
 * away never removes me until someone takes it (FR-181).
 */
export function ShiftTradeSheet({
  schedule,
  shift,
  onClose,
}: {
  schedule: ScheduleView;
  shift: ScheduleShift;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const toast = useToast();
  const actions = useMarketplaceActions();
  const offer = useMarketplace().data?.offers.find((item) => item.mine && item.shift.id === shift.id);
  const [trading, setTrading] = useState(false);
  const offline = useOffline();
  const error = actions.giveAway.error ?? actions.cancelOffer.error;

  if (trading) return <TradeSheet schedule={schedule} mine={shift} onClose={onClose} />;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={shiftName(shift)}
      description={`${formatDayHeading(shift.date, i18n.language)} · ${shift.start}–${shift.end} · ${formatNumber(shift.hours, i18n.language)} h`}
    >
      <div className="flex items-center gap-3 rounded-field bg-surface-3 px-4 py-3 font-bold">
        <Cup flavour={flavourOf(shift.part)} className="w-8 shrink-0" />
        <Coworkers shift={shift} />
      </div>
      <ManagerNote note={shift.note} />
      {offer && <p className="mt-3 text-sm text-muted">{t('schedule.sheet.offeredText')}</p>}
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />
      {offline && <p className="mt-3 text-sm text-muted">{t('offline.needsConnection')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {offer ? (
          <Button
            variant="white"
            disabled={offline}
            loading={actions.cancelOffer.isPending}
            onClick={() => actions.cancelOffer.mutate(offer.id, { onSuccess: onClose })}
          >
            {t('schedule.sheet.keep')}
          </Button>
        ) : (
          <Button
            disabled={offline}
            loading={actions.giveAway.isPending}
            onClick={() =>
              actions.giveAway.mutate(shift.id, {
                onSuccess: () => {
                  toast(t('schedule.sheet.offeredToast'));
                  onClose();
                },
              })
            }
          >
            {t('schedule.sheet.giveAway')}
          </Button>
        )}
        {/* Its own variant: "white" with a periwinkle class on top lost its text in dark mode (2026-11-22). */}
        <Button variant="primary" disabled={offline} onClick={() => setTrading(true)}>
          {t('schedule.sheet.trade')}
        </Button>
      </div>
    </Sheet>
  );
}

/** Mockup 1i: pick one coworker's shift to swap for mine, one for one (FR-188). */
function TradeSheet({
  schedule,
  mine,
  onClose,
}: {
  schedule: ScheduleView;
  mine: ScheduleShift;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const toast = useToast();
  const { requestTrade } = useMarketplaceActions();
  const now = new Date();
  // A swap only makes sense with a shift I am not on, held by someone who is not on mine.
  const onMine = new Set(mine.people.map((person) => person.membershipId));
  const options = schedule.shifts
    .filter(
      (shift) =>
        new Date(shift.startsAt) > now && shift.id !== mine.id && !shift.people.some((person) => person.isMe),
    )
    .flatMap((shift) =>
      shift.people
        .filter((person) => person.name && !onMine.has(person.membershipId))
        .map((person) => ({ shift, person })),
    );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('trade.sheet.title', {
        shift: `${formatDayShort(mine.date, i18n.language)} · ${shiftName(mine)}`,
      })}
      description={t('trade.sheet.text')}
    >
      <FormError message={requestTrade.error ? t(messageKeyFor(requestTrade.error)) : undefined} />
      {options.length === 0 && <p className="text-sm text-muted">{t('trade.sheet.none')}</p>}
      <ul className="flex flex-col gap-2">
        {options.map(({ shift, person }) => (
          <li
            key={`${shift.id}-${person.membershipId}`}
            className="flex items-center gap-3 rounded-field bg-surface-3 px-4 py-3"
          >
            <Cup flavour={flavourOf(shift.part)} className="w-6 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{person.name}</p>
              <p className="text-sm text-muted">
                {formatShortDate(shift.date, i18n.language)} · {shiftName(shift)} {shift.start}–{shift.end}
              </p>
            </div>
            <Button
              variant="white"
              className="min-h-11 px-4"
              disabled={requestTrade.isPending}
              aria-label={t('trade.sheet.askNamed', { name: person.name })}
              onClick={() =>
                requestTrade.mutate(
                  { myShiftId: mine.id, theirShiftId: shift.id, theirMembershipId: person.membershipId },
                  {
                    onSuccess: () => {
                      toast(t('trade.sheet.asked', { name: person.name }));
                      onClose();
                    },
                  },
                )
              }
            >
              {t('trade.sheet.ask')} →
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
