import { useState } from 'react';
import { useSwipe } from '../../lib/gestures';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useGoBack } from '../../app/useGoBack';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDateTime, formatDayShort, formatDue, formatNumber } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { DaysSkeleton, Loading } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { Pill } from '../schedule/Pill';
import { shiftKindKey } from './shift-note-rules';
import { DayNotes, NoteStrip, ShiftNoteSheet } from './shift-notes';
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
        <Loading>
          <DaysSkeleton days={4} />
        </Loading>
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
  // FR-103a: a note per chosen shift, sent with the taps.
  const [shiftNotes, setShiftNotes] = useState(
    () =>
      new Map(
        mine.shifts.flatMap((shift) =>
          shift.selected && shift.note ? [[shift.id, shift.note] as const] : [],
        ),
      ),
  );
  const [noteFor, setNoteFor] = useState<{ shiftId: string; title: string } | null>(null);
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
  // FR-094: shifts that overlap one the person already works at another workplace cannot be picked.
  const busy = new Set(mine.shifts.filter((shift) => shift.busyElsewhere).map((shift) => shift.id));
  const pickable = (ids: Iterable<string>) => new Set([...ids].filter((id) => !busy.has(id)));

  /** The chosen shifts become these; a shift no longer chosen loses its note (FR-103a, Hoang: no question asked). */
  function choose(next: Set<string>) {
    setSelected(next);
    setShiftNotes((current) => new Map([...current].filter(([shiftId]) => next.has(shiftId))));
  }

  function toggle(shiftId: string) {
    if (busy.has(shiftId)) return;
    const nextSet = new Set(selected);
    if (nextSet.has(shiftId)) nextSet.delete(shiftId);
    else nextSet.add(shiftId);
    choose(nextSet);
  }

  function saveShiftNote(shiftId: string, value: string | undefined) {
    setShiftNotes((current) => {
      const next = new Map(current);
      if (value) next.set(shiftId, value);
      else next.delete(shiftId);
      return next;
    });
  }

  /** FR-096: repeats week 1's pattern, by weekday and shift block, over the other weeks. */
  function copyFirstWeek() {
    const pattern = new Set(
      mine.shifts
        .filter((shift) => weekOf(mine.period, shift.date) === 0 && selected.has(shift.id))
        .map((shift) => `${new Date(`${shift.date}T00:00:00Z`).getUTCDay()}-${shift.blockId}`),
    );
    // Shift choices only: a note is about one day, so it is not copied.
    choose(
      pickable(
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
    const notes = [...shiftNotes]
      .filter(([shiftId]) => selected.has(shiftId))
      .map(([shiftId, value]) => ({ shiftId, note: value }));
    actions.send.mutateAsync({ shiftIds: [...selected], desiredWeeklyHours, shiftNotes: notes }).then(
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
          <div className="min-w-0 flex-1 text-sm text-muted">
            {!locked && mine.period.dueAt && (
              <p className="font-bold text-ink">
                {t('availability.due', { when: formatDue(mine.period.dueAt, language) })}
              </p>
            )}
            <p>{locked ? t('availability.locked') : t('availability.hint')}</p>
          </div>
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

        {busy.size > 0 && <p className="text-sm text-muted">{t('availability.busyElsewhereHint')}</p>}

        <Card className="flex flex-col gap-3 p-4" {...swipeWeeks}>
          {days
            .filter((day) => weekOf(mine.period, day.date) === week)
            .map((day) => {
              const names = day.shifts.map(
                (shift, index) => shift.name || t(shiftKindKey(index, day.shifts.length)),
              );
              const dayLabel = formatDayShort(day.date, language);
              return (
                <div key={day.date} className="flex flex-col gap-1.5">
                  <div role="group" aria-label={dayLabel} className="flex items-center gap-2">
                    <p className="w-14 shrink-0 text-sm font-bold">{dayLabel}</p>
                    {day.shifts.map((shift, index) => {
                      const on = selected.has(shift.id);
                      const elsewhere = shift.busyElsewhere;
                      const name = names[index] ?? '';
                      const note = on ? shiftNotes.get(shift.id) : undefined;
                      // FR-103a: a chosen shift carries the note strip on its right; locked, only a note shows.
                      const strip = on && (!locked || note !== undefined);
                      const title = t('shiftNote.title', { day: dayLabel, shift: name });
                      return (
                        <div
                          key={shift.id}
                          className={cx(
                            'flex min-h-12 min-w-0 flex-1 overflow-hidden rounded-chip shadow-press',
                            (locked || elsewhere) && 'opacity-60',
                          )}
                        >
                          <button
                            type="button"
                            aria-pressed={on}
                            disabled={locked || elsewhere}
                            onClick={() => toggle(shift.id)}
                            className={cx(
                              'min-w-0 flex-1 py-1.5 text-center',
                              strip ? 'px-1' : 'px-2',
                              on ? 'bg-ink text-bg' : 'bg-surface-3 text-ink',
                            )}
                          >
                            {/* Colour is never the only sign (NFR-008): a plus or a dash, the note strip (or a tick
                                without one), and the pressed state. The strip leaves no room for a tick in French. */}
                            <span className="block text-sm font-bold">
                              <span aria-hidden="true">
                                {on ? (strip ? '' : '✓ ') : elsewhere ? '– ' : '+ '}
                              </span>
                              {name}
                            </span>
                            <span className="block text-[11px] whitespace-nowrap">
                              {shift.start}–{shift.end}
                            </span>
                            {elsewhere && (
                              <span className="block text-[11px] font-bold">
                                {t('availability.busyElsewhere')}
                              </span>
                            )}
                          </button>
                          {strip && (
                            <NoteStrip
                              note={note}
                              label={
                                note
                                  ? t('shiftNote.edit', { day: dayLabel, shift: name })
                                  : t('shiftNote.add', { day: dayLabel, shift: name })
                              }
                              onOpen={locked ? undefined : () => setNoteFor({ shiftId: shift.id, title })}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <DayNotes
                    notes={day.shifts.flatMap((shift, index) => {
                      const note = selected.has(shift.id) ? shiftNotes.get(shift.id) : undefined;
                      return note ? [{ name: names[index] ?? '', note }] : [];
                    })}
                  />
                </div>
              );
            })}
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
                    onSuccess: (suggested) => choose(pickable(suggested.shiftIds)),
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
      {noteFor && (
        <ShiftNoteSheet
          key={noteFor.shiftId}
          open
          onOpenChange={(open) => {
            if (!open) setNoteFor(null);
          }}
          title={noteFor.title}
          note={shiftNotes.get(noteFor.shiftId)}
          selected={selected.has(noteFor.shiftId)}
          onSave={(value) => saveShiftNote(noteFor.shiftId, value)}
        />
      )}
    </SubPage>
  );
}
