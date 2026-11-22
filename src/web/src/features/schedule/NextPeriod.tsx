import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatDue } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { HeroCard } from '../../ui/HeroCard';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import {
  addDays,
  mondayOnOrAfter,
  suggestedDueDate,
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
      tone={complete ? 'done' : 'primary'}
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
      {/* The deadline is set when opening the period and cannot be moved after (FR-091, 2026-11-21). */}
      {next.period.dueAt && (
        <p className="mt-2">
          {t('schedule.ready.due', { when: formatDue(next.period.dueAt, i18n.language) })}
        </p>
      )}
      {/* The generator rules are changed only before a period is opened (2026-11-21). */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/schedule/build" className={buttonClassName('dark')}>
          {next.period.draftSaved ? t('schedule.box.continue') : t('schedule.box.build')}
        </Link>
        <Link to="/availability/team" className={buttonClassName('white')}>
          {t('schedule.ready.team')}
        </Link>
      </div>
    </HeroCard>
  );
}

/** How many Mondays "Starts on" offers: about three months ahead. */
const mondaysOffered = 12;

/**
 * Opens the next period on a Monday, with when availability is due (FR-091). Its length is the one set in
 * Edit generator rules, changed only there (FR-090). Everyone who works shifts is asked, now
 * or on the day set in Edit generator rules. "Starts on" lists only Mondays, since a period cannot start
 * on another day and the iPhone's date picker ignores that rule (2026-11-21).
 */
function OpenPeriodBox({ after }: { after?: string }) {
  const { t, i18n } = useTranslation();
  const create = useCreatePeriod();
  const today = new Date().toISOString().slice(0, 10);
  const earliest = after
    ? new Date(Date.parse(`${after}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    : today;
  const mondays = Array.from({ length: mondaysOffered }, (_, week) =>
    addDays(mondayOnOrAfter(earliest > today ? earliest : today), week * 7),
  );
  const [startDate, setStartDate] = useState(mondays[0]!);
  const mondayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // FR-091: the deadline follows the start date until the manager picks one of their own.
  const [chosenDue, setChosenDue] = useState<string | null>(null);
  const dueDate = chosenDue ?? suggestedDueDate(startDate, today);
  const [dueTime, setDueTime] = useState('00:00');
  const remindersId = useId();

  return (
    // Only the title, the fields and one line about reminders (2026-11-22).
    <HeroCard title={t('schedule.open.title')} headingLevel={2} wide>
      <div className="mt-4 flex flex-col gap-3">
        <Select
          label={t('schedule.open.start')}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        >
          {mondays.map((monday) => (
            <option key={monday} value={monday}>
              {mondayLabel.format(new Date(`${monday}T00:00:00Z`))}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
          <TextField
            label={t('schedule.open.dueDate')}
            aria-describedby={remindersId}
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
        {/* On one line under both fields, rather than wrapped under the date (2026-11-22). */}
        <p id={remindersId} className="-mt-1 text-xs text-muted">
          {t('schedule.open.reminders')}
        </p>
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
