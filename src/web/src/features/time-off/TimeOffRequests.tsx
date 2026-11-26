import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { StatusChip } from '../../ui/StatusChip';
import { timeOffDays, useTimeOffActions, useTimeOffRequests } from './data';

/**
 * Time off waiting for an answer, at the top of Alerts for managers who approve requests (BL-01, 2026-11-25),
 * like give-aways and trades: Accept or Refuse. Accepting opens the shifts the person holds on those days.
 */
export function TimeOffRequests() {
  const { t, i18n } = useTranslation();
  const requests = useTimeOffRequests().data ?? [];
  const { decide } = useTimeOffActions();
  if (requests.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl">{t('timeOff.alerts.title')}</h2>
      {requests.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3 p-4">
          <div>
            <p className="font-bold">{t('timeOff.alerts.asks', { name: item.name })}</p>
            <p className="text-sm text-muted">{timeOffDays(item.firstDay, item.lastDay, t, i18n.language)}</p>
          </div>
          {item.reason && (
            <p className="rounded-field bg-surface-3 px-3 py-2 text-sm break-words">“{item.reason}”</p>
          )}
          {item.shiftsInDays > 0 && (
            <StatusChip tone="warning" className="self-start">
              {t('timeOff.alerts.shifts', { count: item.shiftsInDays })}
            </StatusChip>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="min-h-11 px-4 text-sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ timeOffId: item.id, accept: true })}
            >
              {t('timeOff.alerts.accept')}
            </Button>
            <Button
              variant="white"
              className="min-h-11 px-4 text-sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ timeOffId: item.id, accept: false })}
            >
              {t('timeOff.alerts.refuse')}
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
