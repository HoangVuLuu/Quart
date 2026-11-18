import { useState } from 'react';
import { useSwipe } from '../../lib/gestures';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useGoBack } from '../../app/useGoBack';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDayShort, formatDateTime, formatNumber } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { Pill } from '../schedule/Pill';
import {
  byDay,
  useAvailabilityActions,
  useCurrentPeriods,
  useMyAvailability,
  weekOf,
  type MyAvailability,
} from '../scheduling/data';

export const maxNoteLength = 500;

// Mockups 1e and 1e2 (and 1m2 for an owner who works shifts): tap the shifts you can work, then send.
// "Fill from Google Calendar" arrives with M9-02.
export function AvailabilityPage() {
  const { t } = useTranslation();
  const periods = useCurrentPeriods();
  const next = periods.data?.next;
  const mine = useMyAvailability(next?.period.id);

  if (periods.data && !next) return <Navigate to="/" replace />;
  if (periods.error ?? mine.error) throw periods.error ?? mine.error;
  if (!mine.data) {
    return (
      <SubPage backTo="/" title={t('availability.title')}>
        <Skeleton className="h-64" />
      </SubPage>
    );
  }
  // Keyed by what the server holds, so the taps start over from it whenever it changes.
  return <AvailabilityForm key={`${mine.data.status}-${mine.data.canEdit}`} mine={mine.data} />;
}

function AvailabilityForm({ mine }: { mine: MyAvailability }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const toast = useToast();
  const actions = useAvailabilityActions(mine.period.id);
  const [selected, setSelected] = useState(
    () => new Set(mine.shifts.filter((shift) => shift.selected).map((shift) => shift.id)),
  );
  const [week, setWeek] = useState(0);
  // A sideways swipe on the week's card changes the week, like the pills above it.
  const swipeWeeks = useSwipe({
    onNext: () => setWeek((current) => Math.min(mine.period.weeks - 1, current + 1)),
    onPrevious: () => setWeek((current) => Math.max(0, current - 1)),
  });
  const [note, setNote] = useState('');
  // BR-032: one number per period, needed to send; offered from last period, empty the first time.
  const [wanted, setWanted] = useState(
    mine.desiredWeeklyHours === null || mine.desiredWeeklyHours === undefined
      ? ''
      : String(mine.desiredWeeklyHours),
  );
  const [wantedMissing, setWantedMissing] = useState(false);
  // Availability is opened from Home only, so Send and the back arrow both return there (2026-11-18).
  const goBack = useGoBack('/');
  const locked = !mine.canEdit;
  const sent = mine.status === 'sent';
  const hours = mine.shifts
    .filter((shift) => selected.has(shift.id))
    .reduce((sum, shift) => sum + shift.hours, 0);
  const error = actions.send.error ?? actions.addNote.error ?? actions.previous.error;
  // The first shift of a day is its opening and the last its closing (BR-034).
  const days = byDay(mine.shifts);

  function toggle(shiftId: string) {
    setSelected((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(shiftId)) nextSet.delete(shiftId);
      else nextSet.add(shiftId);
      return nextSet;
    });
  }

  /** FR-096: repeats week 1's pattern, by weekday and shift block, over the other weeks. */
  function copyFirstWeek() {
    const pattern = new Set(
      mine.shifts
        .filter((shift) => weekOf(mine.period, shift.date) === 0 && selected.has(shift.id))
        .map((shift) => `${new Date(`${shift.date}T00:00:00Z`).getUTCDay()}-${shift.blockId}`),
    );
    setSelected(
      new Set(
        mine.shifts
          .filter((shift) =>
            pattern.has(`${new Date(`${shift.date}T00:00:00Z`).getUTCDay()}-${shift.blockId}`),
          )
          .map((shift) => shift.id),
      ),
    );
  }

  function send() {
    const desiredWeeklyHours = Number(wanted.replace(',', '.'));
    if (wanted.trim() === '' || !Number.isFinite(desiredWeeklyHours) || desiredWeeklyHours < 0) {
      setWantedMissing(true);
      return;
    }
    setWantedMissing(false);
    const text = note.trim();
    // Not mutate's onSuccess: once the server says "sent", this form is rebuilt (see its key), and React
    // Query skips the callback of a form that is gone. The toast was lost, and so was a note typed
    // before the first Send (found by tests/e2e). Errors show from the mutations themselves.
    actions.send.mutateAsync({ shiftIds: [...selected], desiredWeeklyHours }).then(
      () => {
        toast(t('availability.sentToast'));
        if (text !== '')
          actions.addNote.mutateAsync(text).then(
            () => setNote(''),
            () => undefined,
          );
        goBack();
      },
      () => undefined,
    );
  }

  return (
    <SubPage
      backTo="/"
      title={t('availability.title')}
      context={formatDateRange(mine.period.startDate, mine.period.endDate, language)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            {locked ? t('availability.locked') : t('availability.hint')}
          </p>
          <StatusChip tone={sent ? 'success' : 'danger'}>
            {sent ? t('availability.sent') : t('availability.notSent')}
          </StatusChip>
        </div>

        {mine.period.weeks > 1 && (
          <div role="group" aria-label={t('scheduling.grid.weeks')} className="flex flex-wrap gap-2">
            {Array.from({ length: mine.period.weeks }, (_, index) => (
              <Pill key={index} selected={week === index} onClick={() => setWeek(index)}>
                {t('scheduling.grid.week', { number: index + 1 })}
              </Pill>
            ))}
          </div>
        )}

        <Card className="flex flex-col gap-3 p-4" {...swipeWeeks}>
          {days
            .filter((day) => weekOf(mine.period, day.date) === week)
            .map((day) => (
              <div
                key={day.date}
                role="group"
                aria-label={formatDayShort(day.date, language)}
                className="flex items-center gap-2"
              >
                <p className="w-14 shrink-0 text-sm font-bold">{formatDayShort(day.date, language)}</p>
                {day.shifts.map((shift, index) => {
                  const on = selected.has(shift.id);
                  const name =
                    day.shifts.length > 1 && index === day.shifts.length - 1
                      ? t('scheduling.kind.closing')
                      : index === 0
                        ? t('scheduling.kind.opening')
                        : t('scheduling.kind.mid');
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      aria-pressed={on}
                      disabled={locked}
                      onClick={() => toggle(shift.id)}
                      className={cx(
                        'min-h-12 flex-1 rounded-chip px-2 py-1.5 text-center shadow-press disabled:opacity-60',
                        on ? 'bg-ink text-bg' : 'bg-surface-3 text-ink',
                      )}
                    >
                      {/* Colour is never the only sign (NFR-008): a tick or a plus, and the pressed state. */}
                      <span className="block text-sm font-bold">
                        <span aria-hidden="true">{on ? '✓ ' : '+ '}</span>
                        {name}
                      </span>
                      <span className="block text-[11px]">
                        {shift.start}–{shift.end}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </Card>

        <p role="status" className="text-sm font-bold">
          {t('availability.counter', { count: selected.size, hours: formatNumber(hours, language) })}
        </p>

        <TextField
          label={t('availability.wanted')}
          hint={t('availability.wantedHint')}
          type="number"
          inputMode="decimal"
          min={0}
          max={168}
          step="0.5"
          required
          disabled={locked}
          value={wanted}
          onChange={(event) => setWanted(event.target.value)}
          error={wantedMissing ? t('errors.availability.hours_required') : undefined}
        />

        {!locked && (
          <div className="flex flex-wrap gap-2">
            {mine.hasPrevious && (
              <Button
                variant="white"
                className="min-h-11 px-4 text-sm"
                loading={actions.previous.isPending}
                onClick={() =>
                  actions.previous.mutate(undefined, {
                    onSuccess: (suggested) => setSelected(new Set(suggested.shiftIds)),
                  })
                }
              >
                {t('availability.sameAsLast')}
              </Button>
            )}
            {mine.period.weeks > 1 && (
              <Button variant="white" className="min-h-11 px-4 text-sm" onClick={copyFirstWeek}>
                {t('availability.copyWeek')}
              </Button>
            )}
          </div>
        )}

        {mine.notes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {mine.notes.map((item) => (
              <li key={item.id} className="rounded-field bg-warning-soft px-4 py-3 text-sm text-warning">
                {/* Rendered as text, never as HTML (FR-103). */}
                <p className="font-bold whitespace-pre-wrap">{item.body}</p>
                <p className="text-xs">{formatDateTime(item.createdAt, language)}</p>
              </li>
            ))}
          </ul>
        )}
        <TextArea
          label={t('availability.note')}
          hint={t('availability.noteHint', { count: maxNoteLength - note.length })}
          placeholder={t('availability.notePlaceholder')}
          maxLength={maxNoteLength}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <FormError message={error ? t(messageKeyFor(error)) : undefined} />
        {locked ? (
          <Button
            loading={actions.addNote.isPending}
            disabled={note.trim() === ''}
            onClick={() =>
              actions.addNote.mutate(note.trim(), {
                onSuccess: () => {
                  setNote('');
                  toast(t('availability.noteSent'));
                },
              })
            }
          >
            {t('availability.sendNote')}
          </Button>
        ) : (
          <Button loading={actions.send.isPending} onClick={send}>
            {sent ? t('availability.sendAgain') : t('availability.send')}
          </Button>
        )}
      </div>
    </SubPage>
  );
}
