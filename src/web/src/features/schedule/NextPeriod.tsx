import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange } from '../../i18n/format';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { HeroCard } from '../../ui/HeroCard';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import { mondayOnOrAfter, useCreatePeriod, useTeamAvailability, type NextPeriod } from '../scheduling/data';
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
 * Opens the next period on a Monday. Its length is the one set in Edit generator rules, shown here but only
 * changed there (FR-090, 2026-11-18). Everyone who works shifts is asked.
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
        <FormError message={create.error ? t(messageKeyFor(create.error)) : undefined} />
        <div className="flex items-end gap-2">
          <Button loading={create.isPending} onClick={() => create.mutate({ startDate })}>
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
