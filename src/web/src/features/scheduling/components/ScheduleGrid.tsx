import { Tabs } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDayHeading, formatDayShort } from '../../../i18n/format';
import { cx } from '../../../ui/cx';
import { Cup } from '../../../ui/Cup';
import {
  fillOf,
  highlightedShifts,
  shortTime,
  toWeeks,
  type Fill,
  type GridDay,
  type GridHighlight,
  type GridShift,
  type ShiftKind,
} from './schedule-grid';

export type { GridHighlight, GridPerson, GridShift } from './schedule-grid';

type ScheduleGridProps = {
  shifts: GridShift[];
  /** The period's first day ("YYYY-MM-DD"); weeks are counted from it. Defaults to the first shift's date. */
  periodStart?: string;
  /** Shifts and people to point at, such as those of a selected issue. The grid turns to their week. */
  highlight?: GridHighlight;
};

type Marks = { shifts: Set<string>; memberIds: Set<string> };

// The schedule as dated shift cards, each with its time, its fill count and the people on it (FR-140),
// one week at a time. On phones the days run down the page, two cards side by side (mockup 1l); from
// lg the same days stand in seven columns, a week view (NFR-003). One markup for both: only the
// layout classes change, so nothing is rendered twice.
//
// Built for reuse: the lab shows it now, and the real schedule screens use it from M5.
export function ScheduleGrid({ shifts, periodStart, highlight }: ScheduleGridProps) {
  const { t } = useTranslation();
  const weeks = toWeeks(shifts, periodStart);
  const marks: Marks = {
    shifts: highlightedShifts(shifts, highlight),
    memberIds: new Set(highlight?.memberIds),
  };
  const [selected, setSelected] = useState('0');

  // A new highlight turns to the week of its first shift. Done while rendering, not in an effect, so
  // the right week shows in the same paint (react.dev: "adjusting state when a prop changes").
  const [shownHighlight, setShownHighlight] = useState(highlight);
  if (highlight !== shownHighlight) {
    setShownHighlight(highlight);
    const week = weeks.find((w) =>
      w.days.some((d) => d.shifts.some(({ shift }) => marks.shifts.has(shift.id))),
    );
    if (week) setSelected(String(week.index));
  }

  // On a phone the grid can be far above whatever set the highlight (an issue in a list below), so
  // bring the first highlighted card into view. No smooth scrolling for reduced motion (NFR-010).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlight) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    root.current
      ?.querySelector('[data-highlighted]')
      ?.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [highlight]);

  // A shorter period (a new scenario) must not leave the selection on a week that is gone.
  const current = Number(selected) < weeks.length ? selected : '0';

  if (weeks.length === 0) return null;

  return (
    <Tabs.Root ref={root} value={current} onValueChange={setSelected}>
      {weeks.length > 1 && (
        <Tabs.List aria-label={t('scheduling.grid.weeks')} className="mb-4 flex flex-wrap gap-2">
          {weeks.map((week) => (
            <Tabs.Trigger
              key={week.index}
              value={String(week.index)}
              className={cx(
                'min-h-11 rounded-pill bg-surface px-5 font-bold shadow-press',
                'data-[state=active]:bg-primary data-[state=active]:text-on-primary',
              )}
            >
              {t('scheduling.grid.week', { number: week.index + 1 })}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      )}
      {weeks.map((week) => (
        <Tabs.Content
          key={week.index}
          value={String(week.index)}
          className="flex flex-col gap-5 lg:grid lg:grid-cols-7 lg:gap-1.5"
        >
          {week.days.map((day) => (
            <Day key={day.date} day={day} marks={marks} />
          ))}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

function Day({ day, marks }: { day: GridDay; marks: Marks }) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const empty = day.shifts.length === 0;

  return (
    // A phone lists only the days that have shifts; the week view keeps every column.
    <section aria-labelledby={headingId} className={cx('flex-col gap-2', empty ? 'hidden lg:flex' : 'flex')}>
      {/* Screen readers always hear the full date; the week view's narrow columns show it short. */}
      <h3 id={headingId} className="px-1 font-bold">
        <span className="lg:sr-only">{formatDayHeading(day.date, i18n.language)}</span>
        <span aria-hidden="true" className="hidden text-sm lg:inline">
          {formatDayShort(day.date, i18n.language)}
        </span>
      </h3>
      {empty ? (
        <p className="px-1 text-sm text-muted">{t('scheduling.grid.noShifts')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-2">
          {day.shifts.map(({ shift, kind }) => (
            <ShiftCard key={shift.id} shift={shift} kind={kind} marks={marks} />
          ))}
        </ul>
      )}
    </section>
  );
}

const fillTones: Record<Fill, string> = {
  full: 'bg-success-soft text-success',
  short: 'bg-danger-soft text-danger',
  over: 'bg-warning-soft text-warning',
};

function ShiftCard({ shift, kind, marks }: { shift: GridShift; kind: ShiftKind; marks: Marks }) {
  const { t } = useTranslation();
  const fill = fillOf(shift);
  const marked = marks.shifts.has(shift.id);

  return (
    <li
      className={cx(
        'min-w-0 rounded-card bg-surface p-2.5 shadow-card lg:rounded-field lg:p-2',
        fill === 'short' && !marked && 'ring-2 ring-danger/50',
        // A thick outline in the link colour: a change of shape as well as colour (NFR-008).
        marked && 'ring-4 ring-link',
      )}
      data-highlighted={marked || undefined}
    >
      {marked && <span className="sr-only">{t('scheduling.grid.highlighted')}</span>}
      {/* Phones: cup | name and time | fill count, as in 1l. The week view's columns are narrow, so
          there the cup goes and the time takes its own line under the name and the fill count. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-1">
        {/* The cup's walls are white, so it sits in a pale well; it only decorates what the words say. */}
        <span className="row-span-2 flex size-7 items-center justify-center rounded-full bg-surface-3 lg:hidden">
          <Cup
            flavour={kind === 'closing' ? 'closing' : 'opening'}
            mood={fill === 'short' ? 'wow' : kind === 'closing' ? 'sleepy' : 'happy'}
            className="w-4"
          />
        </span>
        <p className="truncate text-sm leading-tight font-bold lg:text-xs">{t(`scheduling.kind.${kind}`)}</p>
        <span
          className={cx(
            'rounded-pill px-2 py-0.5 text-xs font-bold lg:px-1.5 lg:text-[11px]',
            fillTones[fill],
          )}
        >
          <span aria-hidden="true">
            {shift.people.length}/{shift.headcount}
          </span>
          <span className="sr-only">
            {t('scheduling.grid.fill', { filled: shift.people.length, headcount: shift.headcount })}
          </span>
        </span>
        <p className="col-start-2 text-xs whitespace-nowrap text-muted lg:col-span-2 lg:col-start-1 lg:text-[11px]">
          {shortTime(shift.start)}–{shortTime(shift.end)}
        </p>
      </div>
      {shift.people.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {shift.people.map((person) => (
            <li
              key={person.id}
              className={cx(
                'flex min-w-0 items-center gap-1.5 text-sm lg:gap-1 lg:text-[11px]',
                marked && marks.memberIds.has(person.id) && 'font-bold text-link underline',
              )}
            >
              <span className="flex-none rounded-pill bg-surface-3 px-1.5 text-[11px] font-bold text-muted lg:px-1 lg:text-[10px]">
                <span aria-hidden="true">{t('scheduling.levelShort', { level: person.level })}</span>
                <span className="sr-only">{t('scheduling.level', { level: person.level })}</span>
              </span>
              <span className="truncate" title={person.name}>
                {person.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
