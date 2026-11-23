import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { formatDateRange, formatDateTime, formatDayShort, formatNumber } from '../../i18n/format';
import { useSwipe } from '../../lib/gestures';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { Pill } from '../schedule/Pill';
import { byDay, usePersonAvailability, weekOf } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { shiftKindKey } from './shift-note-rules';
import { DayNotes, NoteStrip } from './shift-notes';

/**
 * A manager reads one person's availability (2026-11-18), opened from "Who has sent" or from an alert:
 * the same layout as the form people fill in (mockups 1e, 1e2), but nothing can be changed. Someone who
 * has not sent shows nothing selected, since a draft is private. No tab bar; back goes where you were.
 */
export function PersonAvailabilityPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { can } = useWorkplace();
  const { periodId = '', membershipId = '' } = useParams();
  const person = usePersonAvailability(periodId, membershipId);
  const [week, setWeek] = useState(0);
  const weeks = person.data?.period.weeks ?? 1;
  const swipeWeeks = useSwipe({
    onNext: () => setWeek((current) => Math.min(current + 1, weeks - 1)),
    onPrevious: () => setWeek((current) => Math.max(current - 1, 0)),
  });

  if (!can('ManageSchedule')) return <Navigate to="/" replace />;
  if (person.error) {
    // The period was cancelled, or the person left: say so rather than fail.
    return (
      <SubPage backTo="/availability/team" title={t('availability.title')}>
        <EmptyState title={t('personAvailability.goneTitle')} mood="sleepy">
          {t('personAvailability.goneText')}
        </EmptyState>
      </SubPage>
    );
  }
  if (!person.data) {
    return (
      <SubPage backTo="/availability/team" title={t('availability.title')}>
        <Skeleton className="h-64" />
      </SubPage>
    );
  }

  const data = person.data;
  const sent = data.status === 'sent';
  const chosen = data.shifts.filter((shift) => shift.selected);
  const hours = chosen.reduce((sum, shift) => sum + shift.hours, 0) / data.period.weeks;

  return (
    <SubPage
      backTo="/availability/team"
      title={data.name}
      context={formatDateRange(data.period.startDate, data.period.endDate, language)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">{t('personAvailability.hint')}</p>
          <StatusChip tone={sent ? 'success' : 'neutral'}>
            {sent ? t('availability.sent') : t('availability.notSent')}
          </StatusChip>
        </div>

        {data.period.weeks > 1 && (
          <div role="group" aria-label={t('scheduling.grid.weeks')} className="flex flex-wrap gap-2">
            {Array.from({ length: data.period.weeks }, (_, index) => (
              <Pill key={index} selected={week === index} onClick={() => setWeek(index)}>
                {t('scheduling.grid.week', { number: index + 1 })}
              </Pill>
            ))}
          </div>
        )}

        <Card className="flex flex-col gap-3 p-4" {...swipeWeeks}>
          {byDay(data.shifts)
            .filter((day) => weekOf(data.period, day.date) === week)
            .map((day) => {
              const names = day.shifts.map(
                (shift, index) => shift.name || t(shiftKindKey(index, day.shifts.length)),
              );
              return (
                <div key={day.date} className="flex flex-col gap-1.5">
                  <ul aria-label={formatDayShort(day.date, language)} className="flex items-center gap-2">
                    <li className="w-14 shrink-0 text-sm font-bold" aria-hidden="true">
                      {formatDayShort(day.date, language)}
                    </li>
                    {day.shifts.map((shift, index) => {
                      const name = names[index] ?? '';
                      const note = shift.selected ? (shift.note ?? undefined) : undefined;
                      return (
                        <li
                          key={shift.id}
                          className="flex min-h-12 min-w-0 flex-1 overflow-hidden rounded-chip"
                        >
                          <span
                            className={cx(
                              'block min-w-0 flex-1 px-2 py-1.5 text-center',
                              shift.selected ? 'bg-ink text-bg' : 'bg-surface-3 text-muted',
                            )}
                          >
                            {/* Colour is never the only sign (NFR-008): a tick or a dash, and the words. */}
                            <span className="block text-sm font-bold">
                              <span aria-hidden="true">{shift.selected ? '✓ ' : '– '}</span>
                              {name}
                              <span className="sr-only">
                                {' '}
                                {shift.selected
                                  ? t('personAvailability.can')
                                  : t('personAvailability.cannot')}
                              </span>
                            </span>
                            <span className="block text-[11px] whitespace-nowrap">
                              {shift.start}–{shift.end}
                            </span>
                          </span>
                          {/* FR-103a: their note on this shift, read in full on the line under the day. */}
                          {note && <NoteStrip note={note} label={name} />}
                        </li>
                      );
                    })}
                  </ul>
                  <DayNotes
                    notes={day.shifts.flatMap((shift, index) =>
                      shift.selected && shift.note ? [{ name: names[index] ?? '', note: shift.note }] : [],
                    )}
                  />
                </div>
              );
            })}
        </Card>

        {sent && (
          <p className="text-sm font-bold">
            {t('personAvailability.counter', { count: chosen.length, hours: formatNumber(hours, language) })}
          </p>
        )}

        <Card className="p-4">
          <p className="text-sm text-muted">{t('personAvailability.wanted')}</p>
          <p className="text-2xl font-bold">
            {data.desiredWeeklyHours == null ? '–' : formatNumber(data.desiredWeeklyHours, language)}
          </p>
        </Card>

        {data.notes.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('personAvailability.notes')}>
            {data.notes.map((item) => (
              <li key={item.id} className="rounded-field bg-warning-soft px-4 py-3 text-sm text-warning">
                {/* Rendered as text, never as HTML (FR-103). */}
                <p className="font-bold whitespace-pre-wrap">{item.body}</p>
                <p className="text-xs">{formatDateTime(item.createdAt, language)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SubPage>
  );
}
