import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDue } from '../../i18n/format';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { HeroCard } from '../../ui/HeroCard';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import {
  mondayOnOrAfter,
  suggestedDueDate,
  useChangeDeadline,
  useCreatePeriod,
  useTeamAvailability,
  type NextPeriod,
} from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { CancelPeriodButton } from './CancelPeriod';

/**
 * The manager's box at the top of Schedule (4.1, 2026-11-18), always there and styled like the period box
 * on Home: it opens the next period, then shows it is open, how many have sent, and the way into Building
 * Schedule ("Build", or "Continue building" once a draft was saved).
 */
export function NextPeriodBox({ next, after }: { next: NextPeriod | null; after?: string }) {
  const { t, i18n } = useTranslation();
  const team = useTeamAvailability(next?.period.id).data;

  if (!next) return <OpenPeriodBox after={after} />;

  const range = formatDateRange(next.period.startDate, next.period.endDate, i18n.language);
  const sent = team?.sentCount ?? next.sentCount ?? 0;
  const total = team?.total ?? 0;
  const complete = total > 0 && sent === total;
  return (
    <HeroCard
      eyebrow={range}
      title={t('schedule.box.open')}
      headingLevel={2}
      className={complete ? 'bg-opening' : undefined}
      corner={<CancelPeriodButton period={next.period} icon />}
      wide
    >
      {total > 0 && (
        <>
          <p className="font-bold">{t('home.period.sent', { sent, total })}</p>
          <div
            role="progressbar"
            aria-label={t('home.period.sent', { sent, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={sent}
            className="mt-2 h-2 overflow-hidden rounded-pill bg-glow"
          >
            <div className="h-full rounded-pill bg-ink" style={{ width: `${(sent / total) * 100}%` }} />
          </div>
        </>
      )}
      {/* When availability is due, with a pen to move it while the period is not published (FR-091). */}
      {next.period.dueAt && <Deadline periodId={next.period.id} dueAt={next.period.dueAt} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/schedule/build" className={buttonClassName('dark')}>
          {next.period.draftSaved ? t('schedule.box.continue') : t('schedule.box.build')}
        </Link>
        <Link to="/availability/team" className={buttonClassName('white')}>
          {t('schedule.ready.team')}
        </Link>
        <GeneratorRulesLink />
      </div>
    </HeroCard>
  );
}

/**
 * Opens the next period on a Monday, with when availability is due (FR-091). Its length is the one set in
 * Edit generator rules, shown here but only changed there (FR-090). Everyone who works shifts is asked, now
 * or on the day set in Edit generator rules.
 */
function OpenPeriodBox({ after }: { after?: string }) {
  const { t } = useTranslation();
  const create = useCreatePeriod();
  const { id } = useWorkplace();
  const rules = useQuery({
    queryKey: ['workplace', id, 'generator'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/generator', { params: { path: { workplaceId: id } }, signal }),
      ),
  }).data;
  const today = new Date().toISOString().slice(0, 10);
  const earliest = after
    ? new Date(Date.parse(`${after}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    : today;
  const [startDate, setStartDate] = useState(mondayOnOrAfter(earliest > today ? earliest : today));
  // FR-091: the deadline follows the start date until the manager picks one of their own.
  const [chosenDue, setChosenDue] = useState<string | null>(null);
  const dueDate = chosenDue ?? suggestedDueDate(startDate, today);
  const [dueTime, setDueTime] = useState('00:00');

  return (
    <HeroCard eyebrow={t('home.period.none')} title={t('schedule.open.title')} headingLevel={2} wide>
      <p className="text-sm">{t('schedule.open.text')}</p>
      <div className="mt-4 flex flex-col gap-3">
        <TextField
          label={t('schedule.open.start')}
          hint={t('schedule.open.startHint')}
          type="date"
          step={7}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        {rules && <p className="text-sm">{t('schedule.open.length', { count: rules.periodWeeks })}</p>}
        <div className="grid grid-cols-[3fr_2fr] gap-3">
          <TextField
            label={t('schedule.open.dueDate')}
            hint={t('schedule.open.dueDateHint')}
            type="date"
            required
            value={dueDate}
            onChange={(event) => setChosenDue(event.target.value)}
          />
          <TextField
            label={t('schedule.open.dueTime')}
            type="time"
            step={900}
            required
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
          />
        </div>
        <FormError message={create.error ? t(messageKeyFor(create.error)) : undefined} />
        <div className="flex items-end gap-2">
          <Button loading={create.isPending} onClick={() => create.mutate({ startDate, dueDate, dueTime })}>
            {t('schedule.open.submit')}
          </Button>
          <GeneratorRulesLink />
        </div>
      </div>
    </HeroCard>
  );
}

/** "Edit generator rules" as a pen icon in the bottom-right corner of the box (2026-11-18). */
function GeneratorRulesLink() {
  const { t } = useTranslation();
  const { can } = useWorkplace();
  if (!can('ManageTemplate')) return null;
  return (
    <Link
      to="/generator"
      aria-label={t('schedule.editGenerator')}
      className={`${iconButtonClassName} ml-auto self-end text-ink`}
    >
      <Icon name="pen" />
    </Link>
  );
}

/** "Due Saturday, Dec 5, 12:00 a.m." with a pen that opens the date and time to change it (2026-11-20). */
function Deadline({ periodId, dueAt }: { periodId: string; dueAt: string }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const change = useChangeDeadline(periodId);
  const [editing, setEditing] = useState(false);
  const due = new Date(dueAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const [dueDate, setDueDate] = useState(
    `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
  );
  const [dueTime, setDueTime] = useState(`${pad(due.getHours())}:${pad(due.getMinutes())}`);

  return (
    <div className="mt-2 flex items-center gap-2">
      <p className="min-w-0 flex-1">{t('schedule.ready.due', { when: formatDue(dueAt, i18n.language) })}</p>
      <button
        type="button"
        aria-label={t('deadline.change')}
        className={`${iconButtonClassName} size-9 text-ink`}
        onClick={() => setEditing(true)}
      >
        <Icon name="pen" className="size-4" />
      </button>
      <Sheet
        open={editing}
        onOpenChange={setEditing}
        title={t('deadline.title')}
        description={t('deadline.text')}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[3fr_2fr] gap-3">
            <TextField
              label={t('schedule.open.dueDate')}
              type="date"
              required
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <TextField
              label={t('schedule.open.dueTime')}
              type="time"
              step={900}
              required
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </div>
          <FormError message={change.error ? t(messageKeyFor(change.error)) : undefined} />
          <Button
            loading={change.isPending}
            onClick={() =>
              change.mutate(
                { dueDate, dueTime },
                {
                  onSuccess: () => {
                    setEditing(false);
                    toast(t('deadline.changed'));
                  },
                },
              )
            }
          >
            {t('deadline.save')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
