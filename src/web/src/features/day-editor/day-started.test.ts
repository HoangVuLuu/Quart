import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayHasStarted } from './model';

// The pen next to a day is offered only while the day can still change (M4-01, 2026-11-23).
describe('dayHasStarted', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is false before the first shift of today, true once it began, and follows the calendar otherwise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 30, 9, 59));
    expect(dayHasStarted('2026-11-30', ['16:00', '10:00'])).toBe(false);
    expect(dayHasStarted('2026-11-29', ['10:00'])).toBe(true);
    expect(dayHasStarted('2026-12-01', ['10:00'])).toBe(false);

    vi.setSystemTime(new Date(2026, 10, 30, 10, 0));
    expect(dayHasStarted('2026-11-30', ['16:00', '10:00'])).toBe(true);
  });
});
