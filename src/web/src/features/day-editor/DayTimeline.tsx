import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../ui/cx';
import { columnsOf, minutesOf, partsOf, snap, step, timeOf, type DayShift } from './model';

/** Height of one hour, in CSS pixels. */
const hourHeight = 44;
/** A finger held this long on an empty space starts drawing a shift; moving sooner is a scroll. */
const holdMs = 300;
/** A tap on an empty space makes a shift this long; dragging sets the length. */
const tapMinutes = 60;
/** A shift ends on the day it starts: 23:45 at the latest (FR-062). */
const lastEnd = 24 * 60 - step;

const partClass = { opening: 'bg-opening/45', mid: 'bg-milk-tea/45', closing: 'bg-closing/45' } as const;

type DayTimelineProps = {
  shifts: DayShift[];
  label: (shift: DayShift, part: 'opening' | 'mid' | 'closing') => string;
  onTapShift: (shift: DayShift) => void;
  /** A drag (or a tap) on an empty space: the times it covered, on the 15-minute grid. */
  onCreate: (start: string, end: string) => void;
};

// The day as a phone calendar shows it (2026-11-23): hours down the side, one box per shift, overlapping shifts
// side by side. Dragging on an empty space draws a new shift; with a finger, hold first, so a quick move still
// scrolls the page. Tapping an empty space, or the page's + button, does the same without dragging (NFR-002).
export function DayTimeline({ shifts, label, onTapShift, onCreate }: DayTimelineProps) {
  const { t } = useTranslation();
  const earliest = Math.min(6 * 60, ...shifts.map((shift) => minutesOf(shift.start)));
  const first = Math.floor(earliest / 60);
  const hours = Array.from({ length: 24 - first }, (_, index) => first + index);
  const top = (minutes: number) => ((minutes - first * 60) / 60) * hourHeight;
  const parts = partsOf(shifts);
  const columns = columnsOf(shifts);
  const area = useRef<HTMLDivElement>(null);
  const [ghost, setGhostState] = useState<{ start: number; end: number } | null>(null);
  const ghostNow = useRef<{ start: number; end: number } | null>(null);
  const create = useRef(onCreate);
  useEffect(() => {
    create.current = onCreate;
  });

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    type Press = { from: number; y: number; drawing: boolean; timer: number | undefined; moved: boolean };
    let press: Press | null = null;
    const setGhost = (next: { start: number; end: number } | null) => {
      ghostNow.current = next;
      setGhostState(next);
    };
    const minutesAt = (clientY: number) => {
      const rect = element.getBoundingClientRect();
      const minutes = first * 60 + ((clientY - rect.top) / hourHeight) * 60;
      return Math.min(24 * 60, Math.max(first * 60, minutes));
    };
    const span = (from: number, to: number) => {
      const start = Math.min(from, snap(to));
      const end = Math.max(from + step, snap(to));
      return { start: Math.min(start, lastEnd - step), end: Math.min(end, lastEnd) };
    };
    const begin = (clientY: number, drawing: boolean) => {
      const from = Math.min(Math.floor(minutesAt(clientY) / step) * step, lastEnd - step);
      press = { from, y: clientY, drawing, timer: undefined, moved: false };
      if (drawing) setGhost({ start: from, end: from + step });
      return press;
    };
    const move = (clientY: number) => {
      if (!press) return;
      if (Math.abs(clientY - press.y) > 8) press.moved = true;
      if (press.drawing) setGhost(span(press.from, minutesAt(clientY)));
      else if (press.moved) end(true);
    };
    const end = (cancelled = false) => {
      if (!press) return;
      window.clearTimeout(press.timer);
      const done = press;
      const drawn = ghostNow.current;
      press = null;
      setGhost(null);
      if (cancelled) return;
      const range =
        done.drawing && done.moved && drawn
          ? drawn
          : { start: done.from, end: Math.min(done.from + tapMinutes, lastEnd) };
      create.current(timeOf(range.start), timeOf(range.end));
    };
    const outside = (target: EventTarget | null) =>
      target instanceof Element && target.closest('button') !== null;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || outside(event.target)) return;
      const started = begin(touch.clientY, false);
      started.timer = window.setTimeout(() => {
        if (press !== started || started.moved) return;
        started.drawing = true;
        setGhost({ start: started.from, end: started.from + step });
      }, holdMs);
    };
    // Not passive: once drawing, the finger draws instead of scrolling.
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!press || !touch) return;
      if (press.drawing) event.preventDefault();
      move(touch.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!press) return;
      // The tap is ours: no click after it.
      event.preventDefault();
      end();
    };
    const onTouchCancel = () => end(true);
    const onMouseMove = (event: MouseEvent) => move(event.clientY);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      end();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || outside(event.target)) return;
      event.preventDefault();
      begin(event.clientY, true);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchCancel);
    element.addEventListener('mousedown', onMouseDown);
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);
      element.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (press) window.clearTimeout(press.timer);
    };
  }, [first]);

  return (
    <div className="rounded-card bg-surface py-4 pr-3 pl-16 shadow-card" data-swipe="off">
      <div ref={area} className="relative select-none" style={{ height: hours.length * hourHeight }}>
        {hours.map((hour) => (
          <div
            key={hour}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-line"
            style={{ top: top(hour * 60) }}
          >
            <span className="absolute -top-2.5 -left-14 w-11 text-right text-xs font-bold text-muted">
              {timeOf(hour * 60)}
            </span>
          </div>
        ))}
        {shifts.map((shift) => {
          const part = parts.get(shift.key) ?? 'mid';
          const place = columns.get(shift.key) ?? { column: 0, columns: 1 };
          const start = minutesOf(shift.start);
          const name = label(shift, part);
          return (
            <button
              key={shift.key}
              type="button"
              onClick={() => onTapShift(shift)}
              aria-label={t('dayEditor.shiftLabel', { name, start: shift.start, end: shift.end })}
              className={cx(
                'absolute overflow-hidden rounded-chip border-2 border-surface px-2.5 py-1.5 text-left text-xs leading-tight',
                partClass[part],
              )}
              style={{
                top: top(start),
                height: Math.max(top(minutesOf(shift.end)) - top(start), 24),
                left: `${(place.column / place.columns) * 100}%`,
                width: `${100 / place.columns}%`,
              }}
            >
              <span className="block truncate text-sm font-bold">{name}</span>
              <span className="block truncate">
                {shift.start}–{shift.end}
              </span>
              <span className="block truncate text-muted">
                {t('dayEditor.people', { count: shift.headcount })}
              </span>
            </button>
          );
        })}
        {ghost && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 rounded-chip border-2 border-dashed border-primary bg-primary/20 px-2.5 py-1 text-xs font-bold"
            style={{ top: top(ghost.start), height: top(ghost.end) - top(ghost.start) }}
          >
            {timeOf(ghost.start)}–{timeOf(ghost.end)}
          </div>
        )}
      </div>
    </div>
  );
}
