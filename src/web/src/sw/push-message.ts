import { pushDestination } from '../features/alerts/destination';
import { formatShortDate } from '../i18n/format';
import { alerts as enAlerts } from '../i18n/locales/en.json';
import { alerts as frAlerts } from '../i18n/locales/fr.json';

// What a push shows on the lock screen (M8-06, FR-212): the same sentence as the alert in the app, in the
// person's language (Hoang, 2026-11-22). Pure, so the tests check it against the Alerts tab's text.

/** What the server sends, encrypted for this browser (PushMessageBody). */
export interface PushBody {
  id: string;
  workplaceId: string;
  type: string;
  parameters: Record<string, string>;
  language: string;
}

export interface PushNotice {
  title: string;
  /** Opens the app in the alert's workplace, marks it read, then goes where the alert leads. */
  url: string;
  tag: string;
}

// Only the alert sentences, so the service worker stays small.
const texts = { en: enAlerts, fr: frAlerts } as const;

export function pushNotice(data: unknown): PushNotice {
  const body = readBody(data);
  const language = body?.language === 'fr' ? 'fr' : 'en';
  if (!body) return { title: texts[language].unknown, url: '/alerts', tag: 'quart' };

  const [group, name] = body.type.split('.', 2) as [string, string];
  const template = (texts[language].types as Record<string, Record<string, string> | undefined>)[group]?.[
    name
  ];
  const values: Record<string, string> = { ...body.parameters };
  for (const key of ['date', 'periodStart']) {
    if (values[key]) values[key] = formatShortDate(values[key], language);
  }
  const title = template
    ? template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
    : texts[language].unknown;
  const to = pushDestination(body.type, body.parameters);
  const query = new URLSearchParams({ workplace: body.workplaceId, notification: body.id, to });
  return { title, url: `/open?${query.toString()}`, tag: body.id };
}

function readBody(data: unknown): PushBody | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = data as Partial<PushBody>;
  const strings = (record: unknown) =>
    typeof record === 'object' &&
    record !== null &&
    Object.values(record).every((item) => typeof item === 'string');
  return typeof value.id === 'string' &&
    typeof value.workplaceId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.language === 'string' &&
    strings(value.parameters)
    ? (value as PushBody)
    : null;
}
