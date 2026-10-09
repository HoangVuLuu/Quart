import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format';

const now = '2026-10-08T12:00:00Z';

function ago(seconds: number): string {
  return new Date(new Date(now).getTime() - seconds * 1000).toISOString();
}

describe('formatRelativeTime', () => {
  it('picks the largest unit that fits', () => {
    expect(formatRelativeTime(ago(42), now, 'en')).toBe('42 seconds ago');
    expect(formatRelativeTime(ago(3 * 60), now, 'en')).toBe('3 minutes ago');
    expect(formatRelativeTime(ago(2 * 3600), now, 'en')).toBe('2 hours ago');
    expect(formatRelativeTime(ago(3 * 86400), now, 'en')).toBe('3 days ago');
  });

  it('rounds to the nearest whole unit', () => {
    expect(formatRelativeTime(ago(3 * 60 + 40), now, 'en')).toBe('4 minutes ago');
  });

  it('uses words where the language has them', () => {
    expect(formatRelativeTime(now, now, 'en')).toBe('now');
    expect(formatRelativeTime(ago(86400), now, 'en')).toBe('yesterday');
    expect(formatRelativeTime(ago(86400), now, 'fr')).toBe('hier');
  });

  it('speaks Quebec French', () => {
    expect(formatRelativeTime(ago(3 * 60), now, 'fr')).toBe('il y a 3 minutes');
    expect(formatRelativeTime(now, now, 'fr')).toBe('maintenant');
  });
});
