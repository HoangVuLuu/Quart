// Dates and times use fr-CA or en-CA formats (FR-262).
const locales: Record<string, string> = { fr: 'fr-CA', en: 'en-CA' };

export function localeFor(language: string): string {
  return locales[language.slice(0, 2)] ?? 'fr-CA';
}

export function formatDateTime(value: Date | string, language: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

// "3 minutes ago", "il y a 3 minutes", "now", measured from `reference`. Pass the server's own time
// as the reference when comparing with a server timestamp, so a wrong clock on the phone cannot skew it.
export function formatRelativeTime(value: Date | string, reference: Date | string, language: string): string {
  const seconds = (new Date(value).getTime() - new Date(reference).getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' });
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(Math.round(seconds), 'second');
}
