import type { TFunction } from 'i18next';
import { formatShortDate } from '../../i18n/format';
import type { NotificationItem } from './data';

export const notificationTypes = [
  'member.joined',
  'member.left',
  'availability.requested',
  'availability.reminder',
  'availability.reopened',
  'availability.sent',
  'availability.note_added',
  'schedule.published',
  'schedule.changed',
  'shift.offered',
  'shift.claimed',
  'shift.missing_level',
  'claim.requested',
  'claim.approved',
  'claim.declined',
  'trade.requested',
  'trade.accepted',
  'trade.declined',
  'trade.awaiting_approval',
  'trade.applied',
  'trade.rejected',
  'trade.expired',
] as const;

type NotificationType = (typeof notificationTypes)[number];

/**
 * The server stores a type and a few values, never a sentence (FR-263): the sentence is built here, in
 * the reader's language, with dates in their format (FR-262).
 */
export function notificationText(item: NotificationItem, t: TFunction, language: string): string {
  if (!(notificationTypes as readonly string[]).includes(item.type)) return t('alerts.unknown');
  const values: Record<string, string> = { ...item.parameters };
  for (const name of ['date', 'periodStart']) {
    if (values[name]) values[name] = formatShortDate(values[name], language);
  }
  // The key is built from the type, so it is looked up without the compile-time key check.
  return (t as unknown as (key: string, values: Record<string, string>) => string)(
    `alerts.types.${item.type as NotificationType}`,
    values,
  );
}
