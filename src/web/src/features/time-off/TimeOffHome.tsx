import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClassName } from '../../ui/button-styles';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { StatusChip } from '../../ui/StatusChip';
import { timeOffDays, useMyTimeOff, useTimeOffActions } from './data';

/**
 * The bottom of Home for staff (BL-01, Hoang 2026-11-25): "Request time off" across the row, or what became of the
 * request: waiting for a manager (with Cancel), or the accepted days.
 */
export function TimeOffHome() {
  const { t, i18n } = useTranslation();
  const mine = useMyTimeOff().data;
  const { cancel } = useTimeOffActions();
  if (!mine) return null;
  const current = mine.current;

  return (
    <>
      {current && (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <p className="font-bold">
              {current.status === 'pending'
                ? t('timeOff.home.pending')
                : current.now
                  ? t('timeOff.home.now')
                  : t('timeOff.home.accepted')}
            </p>
            <p className="text-sm text-muted">
              {timeOffDays(current.firstDay, current.lastDay, t, i18n.language)}
            </p>
          </div>
          {current.status === 'pending' ? (
            <>
              <StatusChip tone="warning" className="self-start">
                {t('timeOff.home.waiting')}
              </StatusChip>
              <Button
                variant="white"
                className="min-h-11 text-sm"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(current.id)}
              >
                {t('timeOff.home.cancel')}
              </Button>
            </>
          ) : (
            <StatusChip tone="success" className="self-start">
              {t('timeOff.home.acceptedChip')}
            </StatusChip>
          )}
        </Card>
      )}
      {mine.canRequest && (
        // A full row, just tall enough to tap (Hoang, 2026-11-25).
        <Link to="/time-off" className={buttonClassName('white', 'min-h-12 w-full')}>
          {t('timeOff.home.request')}
        </Link>
      )}
    </>
  );
}
