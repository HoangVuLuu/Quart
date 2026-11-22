/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clearApiCache, handleApiRequest } from './sw/api-cache';
import { pushNotice } from './sw/push-message';
import { notTheApp } from './sw/rules';

// Quart's service worker (AD-040, M8-05, decision 0014). It makes the installed app open at once and lets
// Home and Schedule show the last copy of the person's shifts without a connection; and it shows push
// notifications (M8-06).

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

// A push: the same sentence as the alert in the app (M8-06). A browser must show something for every push.
self.addEventListener('push', (event) => {
  const notice = pushNotice(readPush(event.data));
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      tag: notice.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: notice.url },
    }),
  );
});

// Tapping it: back to an open Quart if there is one, otherwise a new one, at the alert's place.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/alerts';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        await open.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

function readPush(data: PushMessageData | null): unknown {
  try {
    return data?.json() ?? null;
  } catch {
    return null;
  }
}
