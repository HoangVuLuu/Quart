import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DayTimeline } from './DayTimeline';
import { HoursSheet } from './HoursSheet';
import { minutesOf, partsOf, timeOf, type DayInfo, type DayShift } from './model';
import { NewShiftDialog, type NewShift } from './NewShiftDialog';

type DayViewProps = {
  day: DayInfo;
  shifts: DayShift[];
  days: DayInfo[];
  withPairs: boolean;
  label: (shift: DayShift, part: 'opening' | 'mid' | 'closing') => string;
  /** The day's shifts after a change of hours or a delete. */
  onChange: (shifts: DayShift[]) => void;
  /** A new shift, for every day picked. */
  onAdd: (shift: NewShift, days: string[]) => void;
};

// The Editing day page's content (2026-11-23): the day view, the sheet of a tapped shift, and the pop-up of a
// new one. Nothing is saved here: the Editing Shift page saves.
export function DayView({ day, shifts, days, withPairs, label, onChange, onAdd }: DayViewProps) {
  const { t } = useTranslation();
  const [tapped, setTapped] = useState<DayShift | null>(null);
  const [drawn, setDrawn] = useState<{ start: string; end: string } | null>(null);
  const parts = partsOf(shifts);
  const latest = Math.max(10 * 60, ...shifts.map((shift) => minutesOf(shift.end)));
  // The + button: a one-hour shift after the day's last one, or from 10:00.
  const next = Math.min(latest, 22 * 60);

  return (
    <>
      <p className="mb-3 text-sm text-muted">{t('dayEditor.dayHint')}</p>
      <DayTimeline
        shifts={shifts}
        label={label}
        onTapShift={setTapped}
        onCreate={(start, end) => setDrawn({ start, end })}
      />
      <button
        type="button"
        aria-label={t('dayEditor.add')}
        onClick={() => setDrawn({ start: timeOf(next), end: timeOf(next + 60) })}
        className="fixed right-[max(1.25rem,calc(50%-16rem))] bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-ink text-3xl text-bg shadow-float"
      >
        <span aria-hidden="true">+</span>
      </button>
      {tapped && (
        <HoursSheet
          shift={tapped}
          title={label(tapped, parts.get(tapped.key) ?? 'mid')}
          description={`${day.long} · ${t('dayEditor.people', { count: tapped.headcount })}`}
          onClose={() => setTapped(null)}
          onSave={(start, end) => {
            onChange(shifts.map((shift) => (shift.key === tapped.key ? { ...shift, start, end } : shift)));
            setTapped(null);
          }}
          onDelete={() => {
            onChange(shifts.filter((shift) => shift.key !== tapped.key));
            setTapped(null);
          }}
        />
      )}
      {drawn && (
        <NewShiftDialog
          start={drawn.start}
          end={drawn.end}
          days={days}
          day={day.key}
          withPairs={withPairs}
          onClose={() => setDrawn(null)}
          onSave={(shift, picked) => {
            onAdd(shift, picked);
            setDrawn(null);
          }}
        />
      )}
    </>
  );
}
