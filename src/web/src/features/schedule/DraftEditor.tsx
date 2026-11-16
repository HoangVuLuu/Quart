import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { formatDayHeading, formatNumber, formatShortDate } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Cup } from '../../ui/Cup';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip, type StatusTone } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { describer } from '../scheduling/components/describe-issue';
import {
  byDay,
  useDraft,
  useDraftActions,
  weekOf,
  type DraftIssue,
  type DraftPerson,
  type DraftShift,
  type DraftView,
} from '../scheduling/data';
import { flavourOf, useShiftName } from '../scheduling/ShiftName';
import { Pill } from './Pill';

const severityTone: Record<string, StatusTone> = { block: 'danger', confirm: 'warning', show: 'neutral' };

/** Sentences for the draft's issues, in the reader's language, from the one evaluator's codes (AD-002). */
function useIssueText(draft: DraftView) {
  const { t, i18n } = useTranslation();
  return describer(
    t,
    i18n.language,
    draft.shifts.map((shift) => ({
      id: shift.id,
      date: shift.date,
      start: shift.start,
      end: shift.end,
      headcount: shift.headcount,
      people: [],
    })),
    new Map(draft.people.map((person) => [person.membershipId, person.name])),
  );
}

type DraftEditorProps = {
  periodId: string;
  /** Given when the draft of an already published period is open: the way back to what staff see. */
  onDone?: () => void;
};

// Mockup 1l, with the shift editor (1p) and the issues list (1q). Only admins come here (AD-012).
export function DraftEditor({ periodId, onDone }: DraftEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const draft = useDraft(periodId);
  const actions = useDraftActions(periodId);
  const [week, setWeek] = useState(0);
  const [openShift, setOpenShift] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (draft.error) throw draft.error;
  if (!draft.data) return <Skeleton className="h-48" />;
  const data = draft.data;
  const published = data.period.version > 0;
  const blocking = data.issues.filter((issue) => issue.severity === 'block');
  const asking = data.issues.filter((issue) => issue.severity === 'confirm');
  const selected = data.shifts.find((shift) => shift.id === openShift);
  const error = actions.generate.error ?? actions.publish.error;

  function publish() {
    setConfirming(false);
    actions.publish.mutate(true, {
      onSuccess: () => {
        toast(published ? t('draft.updated') : t('draft.publishedToast'));
        onDone?.();
      },
    });
  }

  function askToPublish() {
    // The same rules the server applies (FR-144): blocking issues stop it, the others ask first.
    if (blocking.length > 0) setShowIssues(true);
    else if (asking.length > 0) setConfirming(true);
    else publish();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="white"
          className="min-h-11 px-4 text-sm"
          loading={actions.generate.isPending}
          onClick={() => actions.generate.mutate(null)}
        >
          {data.seed === null ? t('draft.generate') : t('draft.generateAgain')}
        </Button>
        <button
          type="button"
          onClick={() => setShowIssues(true)}
          className={cx(
            'min-h-11 rounded-pill px-4 text-sm font-bold shadow-press',
            blocking.length > 0
              ? 'bg-danger-soft text-danger'
              : asking.length > 0
                ? 'bg-warning-soft text-warning'
                : 'bg-surface text-ink',
          )}
        >
          {data.issues.length === 0 ? t('issues.none') : t('issues.count', { count: data.issues.length })}
        </button>
        <Button
          className="min-h-11 px-4 text-sm"
          loading={actions.publish.isPending}
          disabled={!data.hasUnpublishedChanges}
          onClick={askToPublish}
        >
          {published ? t('draft.update') : t('draft.publish')}
        </Button>
        {onDone && (
          <Button variant="white" className="min-h-11 px-4 text-sm" onClick={onDone}>
            {t('draft.back')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">
        {t('draft.hint')} {data.seed !== null && t('draft.seed', { seed: data.seed })}{' '}
        {data.openSlots > 0 && t('draft.openSlots', { count: data.openSlots })}
        {published && !data.hasUnpublishedChanges && ` ${t('draft.same')}`}
      </p>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />

      {data.period.weeks > 1 && (
        <div role="group" aria-label={t('scheduling.grid.weeks')} className="flex gap-2">
          {Array.from({ length: data.period.weeks }, (_, index) => (
            <Pill key={index} selected={week === index} onClick={() => setWeek(index)}>
              {t('scheduling.grid.week', { number: index + 1 })}
            </Pill>
          ))}
        </div>
      )}

      {/* Phones list the days one under the other; wider screens show two days side by side (NFR-003). */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-6">
        {byDay(data.shifts.filter((shift) => weekOf(data.period, shift.date) === week)).map((day) => (
          <DayRow key={day.date} draft={data} date={day.date} shifts={day.shifts} onOpen={setOpenShift} />
        ))}
      </div>

      {selected && (
        <ShiftEditor draft={data} shift={selected} periodId={periodId} onClose={() => setOpenShift(null)} />
      )}
      {showIssues && (
        <IssuesSheet
          draft={data}
          onClose={() => setShowIssues(false)}
          onOpenShift={(shiftId) => {
            setShowIssues(false);
            setWeek(
              weekOf(
                data.period,
                data.shifts.find((shift) => shift.id === shiftId)?.date ?? data.period.startDate,
              ),
            );
            setOpenShift(shiftId);
          }}
        />
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('draft.confirm.title')}
        description={t('draft.confirm.text')}
      >
        <IssueList draft={data} issues={asking} />
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={publish}>
            {published ? t('draft.confirm.update') : t('draft.confirm.publish')}
          </Button>
          <Button variant="white" onClick={() => setConfirming(false)}>
            {t('draft.confirm.back')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function DayRow({
  draft,
  date,
  shifts,
  onOpen,
}: {
  draft: DraftView;
  date: string;
  shifts: DraftShift[];
  onOpen: (shiftId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const people = new Map(draft.people.map((person) => [person.membershipId, person]));

  return (
    <section aria-label={formatDayHeading(date, i18n.language)}>
      <h2 className="mb-2 text-[15px]">{formatDayHeading(date, i18n.language)}</h2>
      <ul className="grid grid-cols-2 gap-3">
        {shifts.map((shift) => {
          const issues = draft.issues.filter(
            (issue) => issue.shiftIds.includes(shift.id) && issue.severity !== 'show',
          );
          const blocked = issues.some((issue) => issue.severity === 'block');
          const missing = draft.issues.filter(
            (issue) => issue.code === 'issue.missing_level' && issue.shiftIds.includes(shift.id),
          );
          const full = shift.people.length === shift.headcount;
          return (
            <li key={shift.id}>
              <button
                type="button"
                onClick={() => onOpen(shift.id)}
                className={cx(
                  'flex h-full w-full flex-col gap-1 rounded-chip bg-surface p-2.5 text-left shadow-card',
                  blocked && 'outline-2 outline-danger',
                )}
              >
                <span className="flex items-start gap-1.5">
                  <Cup flavour={flavourOf(shift.part)} className="w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{shiftName(shift.part)}</span>
                    <span className="block text-xs text-muted">
                      {shift.start}–{shift.end}
                    </span>
                  </span>
                  <StatusChip tone={full ? 'success' : 'danger'} className="shrink-0 px-1.5 text-[11px]">
                    <span
                      aria-label={t('scheduling.grid.fill', {
                        filled: shift.people.length,
                        headcount: shift.headcount,
                      })}
                    >
                      {shift.people.length}/{shift.headcount}
                    </span>
                  </StatusChip>
                </span>
                {shift.people.map((assignment) => {
                  const person = people.get(assignment.membershipId);
                  return (
                    <span
                      key={assignment.membershipId}
                      className="flex items-center gap-1.5 text-sm font-bold"
                    >
                      <span className="rounded-pill bg-surface-3 px-1.5 text-[11px]">
                        {t('scheduling.levelShort', { level: person?.level ?? '?' })}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{person?.name ?? t('team.former')}</span>
                      {assignment.locked && (
                        <span className="text-[10px] tracking-[0.06em] text-muted uppercase">
                          {t('scheduling.grid.kept')}
                        </span>
                      )}
                    </span>
                  );
                })}
                {missing.map((issue) => (
                  <StatusChip key={issue.parameters.level} tone="danger" className="self-start">
                    {t('scheduling.grid.missingLevel', { level: issue.parameters.level })}
                  </StatusChip>
                ))}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IssueList({
  draft,
  issues,
  onOpenShift,
}: {
  draft: DraftView;
  issues: DraftIssue[];
  onOpenShift?: (shiftId: string) => void;
}) {
  const { t } = useTranslation();
  const describe = useIssueText(draft);
  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue, index) => {
        const text = describe({ ...issue, parameters: issue.parameters });
        const row = (
          <>
            <StatusChip tone={severityTone[issue.severity] ?? 'neutral'}>
              {t(`draft.severity.${issue.severity as 'block' | 'confirm' | 'show'}`)}
            </StatusChip>
            <span className="min-w-0 flex-1 text-left text-sm font-bold">{text}</span>
          </>
        );
        return (
          <li key={`${issue.code}-${index}`}>
            {onOpenShift && issue.shiftIds[0] ? (
              <button
                type="button"
                onClick={() => onOpenShift(issue.shiftIds[0] ?? '')}
                className="flex w-full items-center gap-3 rounded-field bg-surface-3 px-4 py-3"
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-field bg-surface-3 px-4 py-3">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Mockup 1q: everything the evaluator found, most serious first, each with what publishing does about it (FR-143, FR-144). */
function IssuesSheet({
  draft,
  onClose,
  onOpenShift,
}: {
  draft: DraftView;
  onClose: () => void;
  onOpenShift: (shiftId: string) => void;
}) {
  const { t } = useTranslation();
  const order = ['block', 'confirm', 'show'];
  const issues = [...draft.issues].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('issues.title')}
      description={issues.some((issue) => issue.severity === 'block') ? t('draft.blocked') : undefined}
    >
      {issues.length === 0 ? (
        <p className="text-sm text-muted">{t('issues.none')}</p>
      ) : (
        <IssueList draft={draft} issues={issues} onOpenShift={onOpenShift} />
      )}
    </Sheet>
  );
}

const availabilityChip: Record<
  'available' | 'unavailable' | 'noAnswer',
  { tone: StatusTone; key: 'available' | 'unavailable' | 'noAnswer' }
> = {
  available: { tone: 'success', key: 'available' },
  unavailable: { tone: 'danger', key: 'unavailable' },
  noAnswer: { tone: 'neutral', key: 'noAnswer' },
};

/**
 * Mockup 1p: who is on the shift, and everyone who could be added, each with their availability (colour,
 * symbol and words, NFR-008), their level and their hours for that week against what they want (FR-141).
 */
function ShiftEditor({
  draft,
  shift,
  periodId,
  onClose,
}: {
  draft: DraftView;
  shift: DraftShift;
  periodId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const actions = useDraftActions(periodId);
  const describe = useIssueText(draft);
  const week = weekOf(draft.period, shift.date);
  const people = new Map(draft.people.map((person) => [person.membershipId, person]));
  const onShift = new Set(shift.people.map((assignment) => assignment.membershipId));
  const available = new Set(shift.availableIds);
  const status = (person: DraftPerson): 'available' | 'unavailable' | 'noAnswer' =>
    available.has(person.membershipId)
      ? 'available'
      : person.availability === 'sent'
        ? 'unavailable'
        : 'noAnswer';
  const rank = { available: 0, noAnswer: 1, unavailable: 2 };
  const candidates = draft.people
    .filter((person) => !onShift.has(person.membershipId))
    .sort((a, b) => rank[status(a)] - rank[status(b)] || b.level - a.level);
  const issues = draft.issues.filter(
    (issue) => issue.shiftIds.includes(shift.id) && issue.severity !== 'show',
  );
  const full = shift.people.length >= shift.headcount;
  const error = actions.add.error ?? actions.remove.error ?? actions.keep.error;
  const hours = (person: DraftPerson) =>
    `${formatNumber(person.weeklyHours[week] ?? 0, i18n.language)}/${formatNumber(person.desiredWeeklyHours, i18n.language)} h`;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${formatShortDate(shift.date, i18n.language)} · ${shiftName(shift.part)}`}
      description={`${shift.start}–${shift.end} · ${t('scheduling.grid.fill', { filled: shift.people.length, headcount: shift.headcount })}`}
    >
      {issues.map((issue, index) => (
        <p
          key={index}
          className={cx(
            'mb-2 rounded-field px-4 py-2 text-sm font-bold',
            issue.severity === 'block' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
          )}
        >
          <span aria-hidden="true">{issue.severity === 'block' ? '✕ ' : '! '}</span>
          {describe(issue)} ({t(`draft.severity.${issue.severity as 'block' | 'confirm'}`)})
        </p>
      ))}
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />

      <h3 className="mt-3 mb-2 text-[17px]">{t('draft.editor.onShift')}</h3>
      {shift.people.length === 0 && <p className="text-sm text-muted">{t('draft.editor.nobody')}</p>}
      <ul className="flex flex-col gap-2">
        {shift.people.map((assignment) => {
          const person = people.get(assignment.membershipId);
          const name = person?.name ?? t('team.former');
          return (
            <li
              key={assignment.membershipId}
              className="flex items-center gap-2 rounded-field bg-surface-3 px-4 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {name}{' '}
                  <span className="text-xs text-muted">
                    {person && t('scheduling.levelShort', { level: person.level })}
                  </span>
                </p>
                {person && (
                  <p className="text-xs text-muted">{t('draft.editor.thisWeek', { hours: hours(person) })}</p>
                )}
              </div>
              <Button
                variant={assignment.locked ? 'dark' : 'white'}
                className="min-h-11 px-4 text-sm"
                aria-pressed={assignment.locked}
                aria-label={t('scheduling.grid.keep', { name })}
                onClick={() =>
                  actions.keep.mutate({
                    shiftId: shift.id,
                    membershipId: assignment.membershipId,
                    locked: !assignment.locked,
                  })
                }
              >
                {assignment.locked ? t('scheduling.grid.kept') : t('draft.editor.keep')}
              </Button>
              <Button
                variant="white"
                className="min-h-11 px-4 text-sm"
                aria-label={t('draft.editor.removeNamed', { name })}
                onClick={() =>
                  actions.remove.mutate({ shiftId: shift.id, membershipId: assignment.membershipId })
                }
              >
                {t('draft.editor.remove')}
              </Button>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 mb-2 text-[17px]">{t('draft.editor.add')}</h3>
      {full && <p className="mb-2 text-sm text-muted">{t('draft.editor.full')}</p>}
      <ul className="flex flex-col">
        {candidates.map((person) => {
          const chip = availabilityChip[status(person)];
          return (
            <li
              key={person.membershipId}
              className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {person.name}{' '}
                  <span className="text-xs text-muted">
                    {t('scheduling.levelShort', { level: person.level })}
                  </span>{' '}
                  <span className="text-xs text-muted">{hours(person)}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip tone={chip.tone}>{t(`draft.editor.${chip.key}`)}</StatusChip>
                  {person.noteCount > 0 && (
                    <StatusChip tone="warning">
                      {t('draft.editor.notes', { count: person.noteCount })}
                    </StatusChip>
                  )}
                </div>
              </div>
              <Button
                className="min-h-11 px-4 text-sm"
                disabled={full || actions.add.isPending}
                aria-label={t('draft.editor.addNamed', { name: person.name })}
                onClick={() => actions.add.mutate({ shiftId: shift.id, membershipId: person.membershipId })}
              >
                {t('draft.editor.addButton')}
              </Button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
