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

// A calendar date ("2026-10-05") is a day in the workplace, not a moment: it is formatted in UTC so
// the phone's own time zone can never move it to the day before.
function calendarDate(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function capitalised(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

// "Monday · Oct 5", "Lundi · 5 oct.": the day heading of a schedule (mockup 1l).
export function formatDayHeading(date: string, language: string): string {
  const locale = localeFor(language);
  const value = calendarDate(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(value);
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    value,
  );
  return `${capitalised(weekday)} · ${day}`;
}

// "Mon 5", "Lun. 5": the narrow column heading of a week view.
export function formatDayShort(date: string, language: string): string {
  const locale = localeFor(language);
  const value = calendarDate(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(value);
  return `${capitalised(weekday)} ${value.getUTCDate()}`;
}

// "Oct 5 – 18", "5 – 18 oct.": a period, from its first to its last calendar date.
export function formatDateRange(start: string, end: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatRange(calendarDate(start), calendarDate(end));
}

// "Wed, Oct 7", "mer. 7 oct.": a day inside a sentence, such as an issue in the issues list.
export function formatShortDate(date: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(calendarDate(date));
}

// "13.5" from the API -> "13.5" or "13,5": numbers the server sends as text, in the reader's format.
export function formatNumber(value: number | string, language: string): string {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 2 }).format(Number(value));
}
