/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clearApiCache, handleApiRequest } from './sw/api-cache';
import { notTheApp } from './sw/rules';

// Quart's service worker (AD-040, M8-05, decision 0014). It makes the installed app open at once and lets
// Home and Schedule show the last copy of the person's shifts without a connection. The push handlers
// arrive with M8-06.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

// The app shell: HTML, scripts, styles, fonts and icons from the build, with their revisions. Cache first;
// a new build brings new names and the old ones are deleted.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every page of the web app is the same index.html; the router picks the screen.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [notTheApp],
  }),
);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only the API: other origins (and, later, storage files) are never touched or kept.
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/api/')) return;
  event.respondWith(
    handleApiRequest(event.request, {
      caches: self.caches,
      fetch: (request) => fetch(request),
      now: () => new Date(),
      origin: self.location.origin,
    }),
  );
});

self.addEventListener('message', (event) => {
  const type = (event.data as { type?: unknown } | null)?.type;
  // Sent by the "Reload" button: never taken over under the person's hands.
  if (type === 'SKIP_WAITING') void self.skipWaiting();
  if (type === 'quart:clear-api-cache') event.waitUntil(clearApiCache(self.caches));
});

// The first install takes the open page over, so it works offline without a second visit.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
