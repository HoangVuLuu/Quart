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
