// Where an alert leads. Pure, so the app and the service worker share it (M8-06): tapping a push opens
// the same place as tapping the alert in the Alerts tab.

/**
 * Where an alert leads, when it leads anywhere (2026-11-18/20): the form for "availability is open" and its
 * reminders; someone's answer for "sent their availability" and "added a note"; the Schedule tab for a
 * published or changed schedule (2026-11-21); and the shift on the Schedule tab for "the shift is yours" and
 * "the trade is done". Alerts from before these carried no ids, so they stay where they are.
 */
export function destinationOf(type: string, parameters: Readonly<Record<string, string>>): string | null {
  const { periodId, membershipId, shiftId } = parameters;
  switch (type) {
    case 'availability.requested':
    case 'availability.reminder':
      return '/availability';
    case 'schedule.published':
    case 'schedule.changed':
      return '/schedule';
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

/** Give-aways and trade requests live in the Trade tab (2.5); the rest of what leads nowhere opens Alerts. */
const tradeTab = new Set(['shift.offered', 'trade.requested']);

/** Where tapping a push opens the app: where the alert leads, else its tab. */
export function pushDestination(type: string, parameters: Readonly<Record<string, string>>): string {
  return destinationOf(type, parameters) ?? (tradeTab.has(type) ? '/trade' : '/alerts');
}
