import { describe, expect, it } from 'vitest';
import openapi from '../../openapi/quart.json';
import { endsTheSession, isOfflineAllowed, notTheApp } from './rules';

// M8-05, AD-040: the service worker keeps only the allowlist. Every GET route the API has is checked here,
// so a new route is never kept on the phone by accident.
const origin = 'https://quart.example';
const allowed = [
  '/api/me',
  '/api/workplaces/{workplaceId}',
  '/api/workplaces/{workplaceId}/periods/current',
  '/api/workplaces/{workplaceId}/periods/{periodId}/schedule',
];
const sample = (template: string) =>
  new URL(template.replace(/\{[^}]+\}/g, '0b5e5c1a-3f2d-4c6b-9a8e-7d6c5b4a3f2e'), origin);

describe('the offline allowlist', () => {
  const getRoutes = Object.entries(openapi.paths as Record<string, Record<string, unknown>>)
    .filter(([, operations]) => 'get' in operations)
    .map(([path]) => path);

  it('knows every GET route of the API', () => {
    expect(getRoutes.length).toBeGreaterThan(10);
    for (const route of allowed) expect(getRoutes).toContain(route);
  });

  it.each(getRoutes)('keeps %s only if it is on the list', (route) => {
    expect(isOfflineAllowed('GET', sample(route), origin)).toBe(allowed.includes(route));
  });

  it('never keeps a change, a query, another site or a stored file', () => {
    const schedule = sample(allowed[3]!);
    expect(isOfflineAllowed('POST', schedule, origin)).toBe(false);
    expect(isOfflineAllowed('GET', new URL(`${schedule.href}?view=all`), origin)).toBe(false);
    expect(isOfflineAllowed('GET', new URL(schedule.pathname, 'https://evil.example'), origin)).toBe(false);
    expect(
      isOfflineAllowed('GET', new URL('https://files.example.supabase.co/storage/v1/photo.jpg'), origin),
    ).toBe(false);
    expect(
      isOfflineAllowed('GET', new URL('/api/files/0b5e5c1a-3f2d-4c6b-9a8e-7d6c5b4a3f2e', origin), origin),
    ).toBe(false);
  });

  it('empties the cache after signing in or out, or deleting the account', () => {
    for (const path of [
      '/api/auth/sign-in',
      '/api/auth/sign-out',
      '/api/auth/sign-out-everywhere',
      '/api/me/delete',
    ]) {
      expect(endsTheSession('POST', new URL(path, origin), origin)).toBe(true);
    }
    expect(endsTheSession('GET', new URL('/api/me', origin), origin)).toBe(false);
    expect(endsTheSession('POST', new URL('/api/auth/confirm-password', origin), origin)).toBe(false);
    expect(endsTheSession('PATCH', new URL('/api/me', origin), origin)).toBe(false);
  });

  it('answers navigations with the app, never the API or the health check', () => {
    expect(notTheApp.test('/api/me')).toBe(true);
    expect(notTheApp.test('/health')).toBe(true);
    expect(notTheApp.test('/schedule')).toBe(false);
    expect(notTheApp.test('/apiary')).toBe(false);
  });
});
