# 0014. A hand-written service worker, built by vite-plugin-pwa

- Status: Accepted
- Date: 2026-11-20
- Spec: AD-040, FR-239, NFR-012, 12.7 item 8

## Context

Staff open Quart from an icon on their phone. It should open at once, and "My shifts" should still show in
the back of the shop with no signal (M8-05). Push notifications (M8-06) need a service worker too, with our
own `push` and `notificationclick` handlers. The phone must never keep anything it should not: drafts,
availability, notes, other people's private data, files, or anything after signing out (AD-040).

## Decision

- **vite-plugin-pwa 2 with the `injectManifest` strategy** (MIT, maintained, supports Vite 8). We write
  `src/web/src/sw.ts` ourselves; the plugin compiles it and injects the build's file list. Workbox's
  precaching and routing (MIT) serve the app shell cache-first under revisioned names. A fully hand-made
  worker would have to compute that file list itself; a fully generated one could not hold the push code.
- **The app registers the worker itself** (`injectRegister: false`) and never lets a new one take over by
  itself: a "new version, Reload" prompt waits for a tap. The manifest stays `public/manifest.webmanifest`.
- **API answers: an allowlist, network first.** `src/web/src/sw/rules.ts` lists the only four routes kept:
  `/api/me`, the workplace, its current periods, and a published schedule (the whole schedule, coworkers
  included, as staff see it online; Hoang, 2026-11-20). A copy is used only when the network cannot be
  reached, and comes back with `X-Quart-Saved-At` so the app can say "as of 14:05". A test runs every GET
  route of the OpenAPI document through the rules.
- **One person per phone cache.** Nothing is kept until `/api/me` names the person; a different person, a
  401, or any sign-in, sign-out or account deletion empties the cache. The page empties it too on those
  actions, in case the worker does not control it yet.
- **`no-store` stays on every API answer.** It keeps answers out of the browser's ordinary cache, so Back
  after signing out shows nothing. The worker's cache is separate, explicit, limited to the allowlist and
  emptied with the session, so AD-040's "never a no-store response" now reads: never a file, never a route
  off the list.
- **Static files:** `/assets/*` (hashed names) are kept a year; everything else, `sw.js` and `index.html`
  first, is `no-cache`, so a new version reaches the phone on the next load. The worker lives at `/sw.js`
  with scope `/`, so no `Service-Worker-Allowed` header is needed.

## Consequences

The worker exists only in the built app (`npm run build`), never under `npm run dev` or the unit tests;
the browser tests run against the build, so they cover it. Service workers need https (or localhost):
testing on a phone means staging, not the Mac's address on the local Wi-Fi. Adding an offline route is a
one-line change in `rules.ts` and a test update, and should be weighed against AD-040 each time.
