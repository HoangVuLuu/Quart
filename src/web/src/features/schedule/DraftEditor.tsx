import { useState, type ReactNode } from 'react';
import { useSwipe } from '../../lib/gestures';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDayHeading, formatNumber, formatShortDate } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Cup } from '../../ui/Cup';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { DaysSkeleton, Loading, Skeleton } from '../../ui/Skeleton';
import { StatusChip, type StatusTone } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { dayHasStarted } from '../day-editor/model';
import { FormError } from '../identity/FormError';
import { describer } from '../scheduling/components/describe-issue';
import {
  byDay,
  useDraft,
  useDraftActions,
  useReuseSources,
  useTeamAvailability,
  weekOf,
  type DraftIssue,
  type DraftPerson,
  type DraftShift,
  type DraftView,
} from '../scheduling/data';
import { flavourOf, useShiftName } from '../scheduling/ShiftName';
import { ManagerNoteEditor } from './manager-note';
import { Pill } from './Pill';

/** "Reuse a past schedule" (FR-124, M5-08): a sheet of past published periods; picking one fills the draft. */
function ReuseButton({ periodId }: { periodId: string }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const sources = useReuseSources(periodId, open);
  const { reuse } = useDraftActions(periodId);
  return (
    <>
      <Button variant="white" className="w-full" onClick={() => setOpen(true)}>
        {t('draft.reuse.button')}
      </Button>
      {open && (
        <Sheet open onOpenChange={setOpen} title={t('draft.reuse.title')} description={t('draft.reuse.text')}>
          <div className="flex flex-col gap-2">
            {sources.data?.length === 0 && <p className="text-sm text-muted">{t('draft.reuse.none')}</p>}
            {(sources.data ?? []).map((past) => (
              <Button
                key={past.id}
                variant="white"
                className="justify-between"
                loading={reuse.isPending && reuse.variables === past.id}
                onClick={() =>
                  reuse.mutate(past.id, {
                    onSuccess: () => {
                      setOpen(false);
                      toast(t('draft.reuse.done'));
                    },
                  })
                }
              >
                <span>{formatDateRange(past.startDate, past.endDate, i18n.language)}</span>
                <span className="text-sm text-muted">{t('draft.reuse.weeks', { count: past.weeks })}</span>
              </Button>
            ))}
            <FormError message={reuse.error ? t(messageKeyFor(reuse.error)) : undefined} />
          </div>
        </Sheet>
      )}
    </>
  );
}

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
      name: shift.name,
      people: [],
    })),
    new Map(draft.people.map((person) => [person.membershipId, person.name])),
  );
}

type DraftEditorProps = {
  periodId: string;
  /** Shares Generate's row, on its right quarter: Clear on Building Schedule (2026-11-22). */
  besideGenerate?: ReactNode;
  /** Called once the schedule is published or updated: Building and Editing Schedule then go back (4.3). */
  onPublished?: () => void;
  /** The pen next to a day's title: change this period's shifts (M4-01, 2026-11-23). */
  onEditDay?: (date: string) => void;
  /** Under Generate, on Building Schedule only: "Reuse a past schedule" (FR-124). */
  reuse?: boolean;
};

// Mockup 1l, with the shift editor (1p) and the issues list (1q). Only admins come here (AD-012).
export function DraftEditor({ periodId, besideGenerate, onPublished, onEditDay, reuse }: DraftEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const draft = useDraft(periodId);
  const actions = useDraftActions(periodId);
  const [week, setWeek] = useState(0);
  const [dashboard, setDashboard] = useState(false);
  const lastWeek = (draft.data?.period.weeks ?? 1) - 1;
  const swipeWeeks = useSwipe({
    onNext: () => setWeek((current) => Math.min(lastWeek, current + 1)),
    onPrevious: () => setWeek((current) => Math.max(0, current - 1)),
  });
  const [openShift, setOpenShift] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (draft.error) throw draft.error;
  if (!draft.data) {
    return (
      <Loading>
        <Skeleton className="h-12 rounded-pill" />
        <DaysSkeleton />
      </Loading>
    );
  }
  const data = draft.data;
  const published = data.period.version > 0;
  const blocking = data.issues.filter((issue) => issue.severity === 'block');
  const asking = data.issues.filter((issue) => issue.severity === 'confirm');
  const selected = data.shifts.find((shift) => shift.id === openShift);
  const error = actions.generate.error ?? actions.publish.error;

  function publish() {
    setConfirming(false);
    // Not mutate's onSuccess: publishing refreshes the period, which can unmount this editor first, and
    // React Query then skips that callback, so the toast never showed. The error shows from the mutation.
    actions.publish.mutateAsync(true).then(
      () => {
        toast(published ? t('draft.updated') : t('draft.publishedToast'));
        onPublished?.();
      },
      () => undefined,
    );
  }

  function askToPublish() {
    // The same rules the server applies (FR-144): blocking issues stop it, the others ask first.
    if (blocking.length > 0) setShowIssues(true);
    else if (asking.length > 0) setConfirming(true);
    else publish();
  }

  return (
    <>
      {/* Generate, green, on three quarters of a row with Clear; the issues on their own row (2026-11-22). */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="green"
          className={besideGenerate ? 'col-span-3' : 'col-span-4'}
          loading={actions.generate.isPending}
          onClick={() => actions.generate.mutate(null)}
        >
          {/* It can take a few seconds: say what is happening (2026-11-25). */}
          {actions.generate.isPending
            ? t('draft.generating')
            : data.seed === null
              ? t('draft.generate')
              : t('draft.generateAgain')}
        </Button>
        {besideGenerate}
      </div>
      {reuse && <ReuseButton periodId={periodId} />}
      <Button
        variant={blocking.length > 0 ? 'danger' : asking.length > 0 ? 'warning' : 'white'}
        className="w-full"
        onClick={() => setShowIssues(true)}
      >
        {data.issues.length === 0 ? t('issues.none') : t('issues.count', { count: data.issues.length })}
      </Button>
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
      {/* Under the weeks, across the row (Hoang, 2026-11-25): who has how many shifts in the week shown. */}
      <Button variant="white" className="w-full" onClick={() => setDashboard(true)}>
        {t('draft.dashboard.open')}
      </Button>
      {dashboard && <Dashboard draft={data} week={week} onClose={() => setDashboard(false)} />}

      {/* Phones list the days one under the other; wider screens show two days side by side (NFR-003).
          A sideways swipe changes the week, like the pills above. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-6" {...swipeWeeks}>
        {byDay(data.shifts.filter((shift) => weekOf(data.period, shift.date) === week)).map((day) => (
          <DayRow
            key={day.date}
            draft={data}
            date={day.date}
            shifts={day.shifts}
            onOpen={setOpenShift}
            onEdit={
              onEditDay &&
              !dayHasStarted(
                day.date,
                day.shifts.map((shift) => shift.start),
              )
                ? () => onEditDay(day.date)
                : undefined
            }
          />
        ))}
      </div>

      {/* At the bottom, across the whole width (2026-11-21). */}
      <Button
        className="w-full"
        loading={actions.publish.isPending}
        disabled={!data.hasUnpublishedChanges}
        onClick={askToPublish}
      >
        {published ? t('draft.update') : t('draft.publish')}
      </Button>

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
  onEdit,
}: {
  draft: DraftView;
  date: string;
  shifts: DraftShift[];
  onOpen: (shiftId: string) => void;
  onEdit?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const people = new Map(draft.people.map((person) => [person.membershipId, person]));

  return (
    <section aria-label={formatDayHeading(date, i18n.language)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px]">{formatDayHeading(date, i18n.language)}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('dayEditor.editDay', { day: formatDayHeading(date, i18n.language) })}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg"
          >
            <Icon name="pen" className="size-4.5" />
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {shifts.map((shift) => {
          const issues = draft.issues.filter(
            (issue) => issue.shiftIds.includes(shift.id) && issue.severity !== 'show',
          );
          const blocked = issues.some((issue) => issue.severity === 'block');
          const missing = draft.issues.filter(
            (issue) => issue.code === 'issue.missing_level' && issue.shiftIds.includes(shift.id),
          );
          // Extra people are the manager's choice (FR-142): full or more is fine, short is not.
          const full = shift.people.length >= shift.headcount;
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
                    <span className="block text-sm font-bold">{shiftName(shift)}</span>
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
                      {/* Marked as starting earlier (2026-11-25): red here too, so the manager sees it. */}
                      <span
                        className={cx('min-w-0 flex-1 truncate', assignment.startsEarly && 'text-danger')}
                      >
                        {person?.name ?? t('team.former')}
                        {assignment.startsEarly && (
                          <span className="sr-only"> ({t('schedule.startsEarly')})</span>
                        )}
                      </span>
                      {assignment.locked && (
                        <span className="text-[10px] tracking-[0.06em] text-muted uppercase">
                          {t('scheduling.grid.kept')}
                        </span>
                      )}
                    </span>
                  );
                })}
                {/* M4-01: nobody gave availability for it, so the generator leaves it to the manager. */}
                {shift.addedByHand && (
                  <StatusChip tone="neutral" className="self-start text-[11px]">
                    {t('dayEditor.addedByHand')}
                  </StatusChip>
                )}
                {/* FR-145: the manager's own note, as drafted. */}
                {shift.managerNote && (
                  <span className="flex items-start gap-1 text-xs font-bold text-warning">
                    <Icon name="note" className="size-3.5 shrink-0" />
                    <span className="line-clamp-2 min-w-0 break-words">{shift.managerNote}</span>
                  </span>
                )}
                {/* The missing levels sit at the bottom left and the note mark at the bottom right, on one row,
                    so cards with and without a note line up (Hoang, 2026-11-25). */}
                {(missing.length > 0 || shift.notes.length > 0) && (
                  <span className="mt-auto flex items-end gap-1 pt-1">
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      {missing.map((issue) => (
                        <StatusChip key={issue.parameters.level} tone="danger">
                          {t('scheduling.grid.missingLevel', { level: issue.parameters.level })}
                        </StatusChip>
                      ))}
                    </span>
                    {/* FR-103a: someone who can work it left a note on this shift (Hoang: a dot on the card). */}
                    {shift.notes.length > 0 && (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-note text-on-note">
                        <Icon name="note" className="size-3.5" />
                        <span className="sr-only">{t('draft.editor.hasNotes')}</span>
                      </span>
                    )}
                  </span>
                )}
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
  // FR-103a: only this shift's notes, from people who can work it (Hoang, 2026-11-23).
  const shiftNotes = new Map(shift.notes.map((item) => [item.membershipId, item.note]));
  // Their week notes (FR-103) are in a closed section at the bottom, for the people in this sheet.
  const withWeekNotes = [
    ...shift.people.flatMap((assignment) => people.get(assignment.membershipId) ?? []),
    ...candidates,
  ].filter((person) => person.noteCount > 0);
  const error = actions.add.error ?? actions.remove.error ?? actions.keep.error;
  const hours = (person: DraftPerson) =>
    // No target until the person sends availability with their hours (BR-032).
    `${formatNumber(person.weeklyHours[week] ?? 0, i18n.language)}/${person.desiredWeeklyHours == null ? '–' : formatNumber(person.desiredWeeklyHours, i18n.language)} h`;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${formatShortDate(shift.date, i18n.language)} · ${shiftName(shift)}`}
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

      {/* FR-145: the manager's note for the whole team, live once published. */}
      <ManagerNoteEditor
        key={shift.managerNote ?? ''}
        periodId={periodId}
        shiftId={shift.id}
        note={shift.managerNote}
        onSaved={onClose}
      />

      <h3 className="mt-3 mb-2 text-[17px]">{t('draft.editor.onShift')}</h3>
      {shift.people.length === 0 && <p className="text-sm text-muted">{t('draft.editor.nobody')}</p>}
      <ul className="flex flex-col gap-2">
        {shift.people.map((assignment) => {
          const person = people.get(assignment.membershipId);
          const name = person?.name ?? t('team.former');
          return (
            <li
              key={assignment.membershipId}
              className={cx(
                'rounded-field px-4 py-2',
                assignment.startsEarly ? 'bg-danger-soft' : 'bg-surface-3',
              )}
            >
              <div className="flex items-center gap-2">
                {/* Tapping the person's box marks them as starting earlier: the box turns light red, and their
                    name shows in red on the team's shift cards (Hoang, 2026-11-25). Tapping again takes it off. */}
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 text-left"
                  aria-pressed={assignment.startsEarly === true}
                  aria-label={t('draft.editor.startsEarly', { name })}
                  disabled={actions.early.isPending}
                  onClick={() =>
                    actions.early.mutate({
                      shiftId: shift.id,
                      membershipId: assignment.membershipId,
                      startsEarly: !assignment.startsEarly,
                    })
                  }
                >
                  <span className="block font-bold">
                    {name}{' '}
                    <span className="text-xs text-muted">
                      {person && t('scheduling.levelShort', { level: person.level })}
                    </span>
                  </span>
                  {person && (
                    <span className="block text-xs text-muted">
                      {t('draft.editor.thisWeek', { hours: hours(person) })}
                    </span>
                  )}
                </button>
                <Button
                  variant={assignment.locked ? 'dark' : 'white'}
                  className="min-h-11 px-4 text-sm"
                  aria-pressed={assignment.locked}
                  aria-label={t('scheduling.grid.keep', { name })}
                  disabled={actions.keep.isPending || actions.remove.isPending}
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
                  disabled={actions.keep.isPending || actions.remove.isPending}
                  onClick={() =>
                    actions.remove.mutate({ shiftId: shift.id, membershipId: assignment.membershipId })
                  }
                >
                  {t('draft.editor.remove')}
                </Button>
              </div>
              <ShiftNoteLine note={shiftNotes.get(assignment.membershipId)} />
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 mb-2 text-[17px]">{t('draft.editor.add')}</h3>
      {full && <p className="mb-2 text-sm text-muted">{t('draft.editor.full')}</p>}
      <ul className="flex flex-col">
        {candidates.map((person) => {
          const chip = availabilityChip[status(person)];
          const summary = (
            <>
              <span className="block font-bold">
                {person.name}{' '}
                <span className="text-xs text-muted">
                  {t('scheduling.levelShort', { level: person.level })}
                </span>{' '}
                <span className="text-xs text-muted">{hours(person)}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <StatusChip tone={chip.tone}>{t(`draft.editor.${chip.key}`)}</StatusChip>
              </span>
            </>
          );
          return (
            <li key={person.membershipId} className="border-b border-line py-2 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">{summary}</div>
                <Button
                  className="min-h-11 px-4 text-sm"
                  disabled={actions.add.isPending}
                  aria-label={t('draft.editor.addNamed', { name: person.name })}
                  onClick={() => actions.add.mutate({ shiftId: shift.id, membershipId: person.membershipId })}
                >
                  {t('draft.editor.addButton')}
                </Button>
              </div>
              <ShiftNoteLine note={shiftNotes.get(person.membershipId)} />
            </li>
          );
        })}
      </ul>
      {withWeekNotes.length > 0 && <WeekNotes periodId={periodId} people={withWeekNotes} />}
    </Sheet>
  );
}

/** A person's note on this shift (FR-103a), under their name. Text only. */
function ShiftNoteLine({ note }: { note: string | undefined }) {
  if (!note) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-field bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning">
      <Icon name="note" className="size-4" />
      <span className="min-w-0 break-words">{note}</span>
    </p>
  );
}

/**
 * "Week notes": the notes about the whole period (FR-103) of the people in the shift sheet, closed until
 * tapped (Hoang, 2026-11-23). Loaded only when opened.
 */
function WeekNotes({ periodId, people }: { periodId: string; people: DraftPerson[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const team = useTeamAvailability(open ? periodId : undefined);
  const notesOf = new Map(team.data?.people.map((row) => [row.membershipId, row.notes]));
  return (
    <section className="mt-5 border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[17px] font-bold">{t('draft.editor.weekNotes')}</span>
        <StatusChip tone="warning">
          {people.length}
          <span aria-hidden="true">{open ? ' ▴' : ' ▾'}</span>
        </StatusChip>
      </button>
      {open && team.isPending && <Skeleton className="mt-2 h-16 w-full" />}
      {open && team.error && <FormError message={t(messageKeyFor(team.error))} />}
      {open && team.data && (
        <ul className="mt-2 flex flex-col gap-3">
          {people.map((person) => (
            <li key={person.membershipId}>
              <p className="mb-1 text-sm font-bold">{person.name}</p>
              <div className="flex flex-col gap-1.5">
                {(notesOf.get(person.membershipId) ?? []).map((note) => (
                  <p
                    key={note.id}
                    className="rounded-field bg-warning-soft px-3 py-2 text-sm whitespace-pre-wrap text-warning"
                  >
                    {note.body}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The dashboard (Hoang, 2026-11-25): for the week shown, each person's shifts and hours against the hours they
 * asked for, most shifts first. Not in the mockups: it reuses the bottom sheet and the shift sheet's rows (1m).
 */
function Dashboard({ draft, week, onClose }: { draft: DraftView; week: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const shifts = draft.shifts.filter((shift) => weekOf(draft.period, shift.date) === week);
  const rows = draft.people
    .map((person) => ({
      person,
      count: shifts.filter((shift) => shift.people.some((x) => x.membershipId === person.membershipId))
        .length,
      hours: person.weeklyHours[week] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name, language));
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('draft.dashboard.title')}
      description={draft.period.weeks > 1 ? t('scheduling.grid.week', { number: week + 1 }) : undefined}
    >
      <ul className="flex flex-col gap-2">
        {rows.map(({ person, count, hours }) => (
          <li
            key={person.membershipId}
            className="flex items-center justify-between gap-3 rounded-field bg-surface-3 px-4 py-3"
          >
            <span className="min-w-0 font-bold">{person.name}</span>
            <span className="shrink-0 text-right text-sm">
              <span className="block font-bold">{t('draft.dashboard.shifts', { count })}</span>
              <span className="block text-xs text-muted">
                {person.desiredWeeklyHours == null
                  ? t('draft.dashboard.hours', { hours: formatNumber(hours, language) })
                  : t('draft.dashboard.hoursOf', {
                      hours: formatNumber(hours, language),
                      wanted: formatNumber(person.desiredWeeklyHours, language),
                    })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
