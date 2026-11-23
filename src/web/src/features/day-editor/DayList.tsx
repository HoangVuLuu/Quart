import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { Pill } from '../schedule/Pill';
import { byTime, partsOf, type DayInfo, type DayShift, type DaysState } from './model';

const chipClass = { opening: 'bg-opening/35', mid: 'bg-milk-tea/35', closing: 'bg-closing/35' } as const;

type DayListProps = {
  days: DayInfo[];
  state: DaysState;
  changed: Set<string>;
  label: (shift: DayShift, part: 'opening' | 'mid' | 'closing') => string;
  week: number;
  onWeek: (week: number) => void;
  onEdit: (day: string) => void;
  /** What a day with no shifts shows besides "Closed", such as Reopen. */
  closedAction?: (day: DayInfo) => ReactNode;
};

// The Editing Shift page's days (2026-11-23): one week at a time, one row per day with its shifts and a pen.
export function DayList({ days, state, changed, label, week, onWeek, onEdit, closedAction }: DayListProps) {
  const { t } = useTranslation();
  const weeks = [...new Set(days.map((day) => day.week))];
  return (
    <>
      {weeks.length > 1 && (
        <div role="group" aria-label={t('dayEditor.weeks')} className="mb-3 flex flex-wrap gap-2">
          {weeks.map((index) => (
            <Pill key={index} selected={index === week} onClick={() => onWeek(index)}>
              {t('dayEditor.week', { week: index + 1 })}
            </Pill>
          ))}
        </div>
      )}
      <ul className="rounded-card bg-surface px-4 py-1.5 shadow-card">
        {days
          .filter((day) => day.week === week)
          .map((day) => {
            const shifts = [...(state[day.key] ?? [])].sort(byTime);
            const parts = partsOf(shifts);
            return (
              <li
                key={day.key}
                className={cx(
                  'flex items-center gap-2 border-b border-surface-3 py-2 last:border-b-0',
                  day.locked && 'opacity-50',
                )}
              >
                <span className="w-16 shrink-0 text-sm leading-tight font-bold">
                  {day.short}
                  {changed.has(day.key) && (
                    <span className="block text-[11px] text-danger">{t('dayEditor.changed')}</span>
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {shifts.length === 0 ? (
                    <span className="flex min-h-10 flex-1 items-center justify-between gap-2 rounded-chip border-2 border-dashed border-line px-3 text-sm font-bold text-muted">
                      {t('dayEditor.closed')}
                      {closedAction?.(day)}
                    </span>
                  ) : (
                    shifts.map((shift) => {
                      const part = parts.get(shift.key) ?? 'mid';
                      return (
                        <span
                          key={shift.key}
                          className={cx(
                            'min-w-19 flex-1 rounded-chip px-2 py-1 text-xs leading-tight',
                            chipClass[part],
                          )}
                        >
                          <span className="block truncate text-[13px] font-bold">{label(shift, part)}</span>
                          {shift.start}–{shift.end}
                        </span>
                      );
                    })
                  )}
                </div>
                {day.locked ? (
                  <span className="w-11 shrink-0" />
                ) : (
                  <button
                    type="button"
                    aria-label={t('dayEditor.editDay', { day: day.long })}
                    onClick={() => onEdit(day.key)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg"
                  >
                    <Icon name="pen" className="size-4.5" />
                  </button>
                )}
              </li>
            );
          })}
      </ul>
    </>
  );
}
