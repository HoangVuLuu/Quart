import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { notificationText } from '../features/alerts/notification-text';
import { pushNotice } from './push-message';

// A push says exactly what the alert says in the app (M8-06, Hoang 2026-11-22), and opens where it leads.

const id = '44444444-4444-4444-8444-444444444444';
const workplaceId = '11111111-1111-4111-8111-111111111111';
const periodId = '55555555-5555-4555-8555-555555555555';
const shiftId = '66666666-6666-4666-8666-666666666666';

function body(type: string, parameters: Record<string, string>, language = 'en') {
  return { id, workplaceId, type, parameters, language };
}

describe('the push text and where it opens (M8-06)', () => {
  it.each([
    ['schedule.published', { periodStart: '2026-12-07' }],
    ['claim.approved', { date: '2026-12-09', start: '09:00', end: '15:00', periodId, shiftId }],
    ['shift.offered', { name: 'Marc T.', date: '2026-12-10', start: '16:00', end: '22:00' }],
    ['availability.reminder', { periodStart: '2026-12-14', deadline: '2026-12-01' }],
  ])('%s reads like the alert, in English and French', async (type, parameters) => {
    for (const language of ['en', 'fr']) {
      await i18n.changeLanguage(language);
      const inApp = notificationText(
        { id, type, parameters, createdAt: '2026-11-22T12:00:00Z', read: false },
        i18n.t,
        language,
      );
      expect(pushNotice(body(type, parameters, language)).title).toBe(inApp);
    }
  });

  it('opens the alert in its workplace, marks it read, then goes where it leads', () => {
    const notice = pushNotice(body('claim.approved', { date: '2026-12-09', periodId, shiftId }));
    const url = new URL(notice.url, 'https://quart.test');
    expect(url.pathname).toBe('/open');
    expect(url.searchParams.get('workplace')).toBe(workplaceId);
    expect(url.searchParams.get('notification')).toBe(id);
    expect(url.searchParams.get('to')).toBe(`/schedule?period=${periodId}&shift=${shiftId}`);
    expect(notice.tag).toBe(id);
  });

  it.each([
    ['schedule.published', '/schedule'],
    ['availability.requested', '/availability'],
    ['shift.offered', '/trade'],
    ['trade.requested', '/trade'],
    ['claim.declined', '/alerts'],
  ])('%s opens %s', (type, to) => {
    const url = new URL(pushNotice(body(type, {})).url, 'https://quart.test');
    expect(url.searchParams.get('to')).toBe(to);
  });

  it('still shows something for a type it does not know, or a message it cannot read', () => {
    expect(pushNotice(body('something.new', {}, 'fr')).title).toBe(i18n.getFixedT('fr')('alerts.unknown'));
    expect(pushNotice(null)).toEqual({
      title: i18n.getFixedT('en')('alerts.unknown'),
      url: '/alerts',
      tag: 'quart',
    });
    expect(pushNotice({ id: 1 }).url).toBe('/alerts');
  });
});
