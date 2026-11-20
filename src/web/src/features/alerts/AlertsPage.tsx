import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatRelativeTime } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { MarketplaceSections } from '../marketplace/MarketplaceSections';
import {
  useDecisionCount,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  type NotificationItem,
} from './data';
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
          {items.map((item) => {
            const text = notificationText(item, t, i18n.language);
            const to = destinationOf(item);
            const content = (
              <>
                <p className="text-[15px] font-bold">{text}</p>
                <p className="text-xs text-muted">{formatRelativeTime(item.createdAt, now, i18n.language)}</p>
              </>
            );
            return (
              <li key={item.id}>
                <Card className={cx('flex items-center gap-3 p-4', item.read && 'opacity-70')}>
                  {/* 10, 6 (2026-11-18): some open their page, and opening marks them read. Others go nowhere. */}
                  {to ? (
                    <Link
                      to={to}
                      className="min-w-0 flex-1"
                      onClick={() => {
                        if (!item.read) markOne.mutate(item.id);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1">{content}</div>
                  )}
                  {/* 7: the eye marks it read without opening it, and goes once it is read. */}
                  {!item.read && (
                    <button
                      type="button"
                      aria-label={t('alerts.markOneRead', { text })}
                      className={`${iconButtonClassName} text-ink`}
                      onClick={() => markOne.mutate(item.id)}
                    >
                      <Icon name="eye" />
                      <span className="sr-only">{t('alerts.unread')}</span>
                    </button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

/**
 * Where an alert leads, when it leads anywhere (2026-11-18): someone's answer for "sent their availability"
 * and "added a note", and the shift on the Schedule tab for "the shift is yours" and "the trade is done".
 * Alerts from before these carried no ids, so they stay where they are.
 */
function destinationOf(item: NotificationItem): string | null {
  const { periodId, membershipId, shiftId } = item.parameters;
  switch (item.type) {
    case 'availability.sent':
    case 'availability.note_added':
      return periodId && membershipId ? `/availability/people/${periodId}/${membershipId}` : null;
    case 'claim.approved':
    case 'trade.applied':
      return periodId && shiftId ? `/schedule?period=${periodId}&shift=${shiftId}` : null;
    default:
      return null;
  }
}
