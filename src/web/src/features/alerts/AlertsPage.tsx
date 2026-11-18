import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { PageHeader } from '../../ui/PageHeader';
import { MarketplaceSections } from '../marketplace/MarketplaceSections';
import { useDecisionCount, useMarkAllRead, useMarkRead, useNotifications } from './data';
import { notificationText } from './notification-text';

// Mockups 1f (staff) and 1n (admins): what managers must decide first, then everything that happened.
// Availability is filled in from Home only (2026-11-18). Give-aways and trade requests live in the Trade tab
// (2.5). The News section arrives with M8.
export function AlertsPage() {
  const { t, i18n } = useTranslation();
  const waiting = useDecisionCount();
  const notifications = useNotifications();
  const markRead = useMarkAllRead();
  const markOne = useMarkRead();
  if (notifications.error) throw notifications.error;
  const items = notifications.data?.items ?? [];
  const now = new Date();

  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader
        title={t('alerts.title')}
        subtitle={waiting > 0 ? t('alerts.waiting', { count: waiting }) : t('alerts.context')}
      />

      <MarketplaceSections scope="decisions" />

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
              {/* 5: tapping marks it read, and goes nowhere. */}
              <Card
                role={item.read ? undefined : 'button'}
                tabIndex={item.read ? undefined : 0}
                aria-label={
                  item.read
                    ? undefined
                    : t('alerts.markOneRead', { text: notificationText(item, t, i18n.language) })
                }
                onClick={() => !item.read && markOne.mutate(item.id)}
                onKeyDown={(event) => {
                  if (!item.read && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    markOne.mutate(item.id);
                  }
                }}
                className={cx('flex items-start gap-3 p-4', item.read ? 'opacity-70' : 'cursor-pointer')}
              >
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
