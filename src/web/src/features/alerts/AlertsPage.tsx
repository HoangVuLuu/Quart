import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatRelativeTime } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { PageHeader } from '../../ui/PageHeader';
import { MarketplaceSections } from '../marketplace/MarketplaceSections';
import { useCurrentPeriods } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { useMarkAllRead, useNotifications, useWaitingCount } from './data';
import { notificationText } from './notification-text';

// Mockups 1f (staff) and 1n (admins): what waits on you first (reminders, open shifts, trades), then
// everything that happened. The News section arrives with M8.
export function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { view } = useWorkplace();
  const waiting = useWaitingCount();
  const notifications = useNotifications();
  const markRead = useMarkAllRead();
  const next = useCurrentPeriods().data?.next;
  const remind = next && view.me.worksShifts && next.canEditAvailability && next.myAvailability !== 'sent';
  if (notifications.error) throw notifications.error;
  const items = notifications.data?.items ?? [];
  const now = new Date();

  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader
        title={t('alerts.title')}
        context={waiting > 0 ? t('alerts.waiting', { count: waiting }) : t('alerts.context')}
      />

      {remind && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl">{t('alerts.reminders')}</h2>
          <Card className="flex items-center gap-3 p-4">
            <p className="min-w-0 flex-1 font-bold">{t('alerts.fillAvailability')}</p>
            <Link to="/availability" className={buttonClassName('dark', 'min-h-11 px-4 text-sm')}>
              {t('home.fillIn')}
            </Link>
          </Card>
        </section>
      )}

      <MarketplaceSections />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl">{t('alerts.recent')}</h2>
          {(notifications.data?.unread ?? 0) > 0 && (
            <Button
              variant="white"
              className="min-h-11 px-4 text-sm"
              loading={markRead.isPending}
              onClick={() => markRead.mutate()}
            >
              {t('alerts.markRead')}
            </Button>
          )}
        </div>
        {items.length === 0 && (
          <Card>
            <p className="text-sm text-muted">{t('alerts.empty')}</p>
          </Card>
        )}
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card className={cx('flex items-start gap-3 p-4', item.read && 'opacity-70')}>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{notificationText(item, t, i18n.language)}</p>
                  <p className="text-xs text-muted">
                    {formatRelativeTime(item.createdAt, now, i18n.language)}
                  </p>
                </div>
                {!item.read && (
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent">
                    <span className="sr-only">{t('alerts.unread')}</span>
                  </span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
