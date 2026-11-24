// What the service worker may keep on the phone (AD-040, M8-05). Imported by the worker and by the tests,
// so the list that runs is the list that is checked.

const id = '[0-9a-fA-F-]{36}';

/**
 * The only API answers kept for offline use: who is signed in, the workplace, its periods and a published
 * schedule. Enough for Home and Schedule to show the person's shifts without a connection. Never drafts,
 * availability, notes, alerts, trades or anything under /api/auth, and never a file.
 */
export const offlineApiRoutes: readonly RegExp[] = [
  /^\/api\/me$/,
  new RegExp(`^/api/workplaces/${id}$`),
  new RegExp(`^/api/workplaces/${id}/periods/current$`),
  new RegExp(`^/api/workplaces/${id}/periods/${id}/schedule$`),
];

/** The one cache for API answers. It always belongs to one person: it is emptied whenever that changes. */
export const apiCacheName = 'quart-api-v1';

/** On a copy served without a connection: when it was saved, so the app can say "as of 14:05". */
export const savedAtHeader = 'X-Quart-Saved-At';

/** Whether a request's answer may be kept for offline use. Same origin, GET, no query, on the list. */
export function isOfflineAllowed(method: string, url: URL, origin: string): boolean {
  return (
    method === 'GET' &&
    url.origin === origin &&
    url.search === '' &&
    offlineApiRoutes.some((route) => route.test(url.pathname))
  );
}

/**
 * Answers after which nothing kept may stay: someone signed in, out, or deleted their account. A 401 on
 * any API call counts too (the session ended elsewhere).
 */
export function endsTheSession(method: string, url: URL, origin: string): boolean {
  return (
    method !== 'GET' &&
    url.origin === origin &&
    // Typing the password again (step-up) keeps the same session.
    url.pathname !== '/api/auth/confirm-password' &&
    (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/me/delete')
  );
}

/** Paths the app shell never answers for a navigation: the API, the health check, internal routes. */
export const notTheApp = /^\/(api|health|internal)(\/|$)/;
