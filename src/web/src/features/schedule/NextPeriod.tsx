import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { formatDue } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { Card } from '../../ui/Card';
import { Cup } from '../../ui/Cup';
import { HeroCard } from '../../ui/HeroCard';
import { Stepper } from '../../ui/Stepper';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import {
  mondayOnOrAfter,
  suggestedDueDate,
  useCreatePeriod,
  useDraftActions,
  useTeamAvailability,
} from '../scheduling/data';

/** Mockups 1k and 1k2: who has sent, and the two ways to start building. Either one locks availability (FR-100). */
export function ReadyToBuild({ periodId }: { periodId: string }) {
  const { t, i18n } = useTranslation();
  const team = useTeamAvailability(periodId).data;
  const actions = useDraftActions(periodId);
  const missing = team?.people.filter((person) => person.status !== 'sent') ?? [];
  const complete = team !== undefined && missing.length === 0;
  const error = actions.generate.error ?? actions.start.error;

  return (
    <>
      <HeroCard
        title={t('schedule.ready.title')}
        headingLevel={2}
        className={complete ? 'bg-opening' : undefined}
        decoration={
          <Cup
            flavour={complete ? 'milk-tea' : 'opening'}
            mood={complete ? 'happy' : 'wow'}
            className="w-14"
          />
        }
      >
        <p>
          {team ? t('schedule.ready.sent', { sent: team.sentCount, total: team.total }) : null}{' '}
          {t('schedule.ready.locks')}
        </p>
        {team?.period.dueAt && (
          <p className="mt-1">
            {t('schedule.ready.due', { when: formatDue(team.period.dueAt, i18n.language) })}
          </p>
        )}
        {team?.period.requestAt && !team.period.requestSent && (
          <p className="mt-1">
            {t('schedule.ready.requestLater', { when: formatDue(team.period.requestAt, i18n.language) })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={actions.generate.isPending} onClick={() => actions.generate.mutate(null)}>
            {t('schedule.ready.generate')}
          </Button>
          <Button variant="white" loading={actions.start.isPending} onClick={() => actions.start.mutate()}>
            {t('schedule.ready.byHand')}
          </Button>
        </div>
      </HeroCard>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />
      <Card>
        <h2 className="text-sm font-bold text-muted">
          {complete ? t('schedule.ready.allSentLabel') : t('schedule.ready.notSent')}
        </h2>
        <p className="mt-1 font-bold">
          {complete ? t('schedule.ready.allSent') : missing.map((person) => person.name).join(' · ')}
        </p>
        <Link to="/availability/team" className="mt-2 block text-sm font-bold text-link">
          {t('schedule.ready.team')} →
        </Link>
      </Card>
      <Link to="/generator" className={buttonClassName('white', 'self-start')}>
        {t('schedule.editGenerator')}
      </Link>
    </>
  );
}

/**
 * Opens the next period: a Monday, 1 to 4 weeks (FR-090) and when availability is due (FR-091). Everyone who
 * works shifts is asked for their availability, now or on the day set in Edit Generator.
 */
export function OpenPeriodCard({ after }: { after?: string }) {
  const { t } = useTranslation();
  const create = useCreatePeriod();
  const today = new Date().toISOString().slice(0, 10);
  const earliest = after
    ? new Date(Date.parse(`${after}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    : today;
  const [startDate, setStartDate] = useState(mondayOnOrAfter(earliest > today ? earliest : today));
  const [weeks, setWeeks] = useState(2);
  // Follows the start date until the manager picks a deadline of their own.
  const [chosenDue, setChosenDue] = useState<string | null>(null);
  const dueDate = chosenDue ?? suggestedDueDate(startDate, today);
  const [dueTime, setDueTime] = useState('18:00');

  return (
    <Card>
      <h2 className="text-[17px]">{t('schedule.open.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('schedule.open.text')}</p>
      <div className="mt-4 flex flex-col gap-3">
        <TextField
          label={t('schedule.open.start')}
          hint={t('schedule.open.startHint')}
          type="date"
          step={7}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <Stepper label={t('schedule.open.weeks')} value={weeks} min={1} max={4} onChange={setWeeks} />
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
        <div className="flex flex-wrap gap-2">
          <Button
            loading={create.isPending}
            onClick={() => create.mutate({ startDate, weeks, dueDate, dueTime })}
          >
            {t('schedule.open.submit')}
          </Button>
          <Link to="/generator" className={buttonClassName('white')}>
            {t('schedule.editGenerator')}
          </Link>
        </div>
      </div>
    </Card>
  );
}
