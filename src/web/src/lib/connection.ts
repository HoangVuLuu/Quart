import { useSyncExternalStore } from 'react';
import { apiCacheName, savedAtHeader } from '../sw/rules';

// Whether the app is showing live answers or the copy the service worker kept (M8-05). The worker marks a
// copy with when it was saved; the API client reports every answer here.

export interface Connection {
  /** False when the browser says so, or when the server could not be reached. */
  online: boolean;
  /** When the oldest copy on screen was saved, while copies are being shown. */
  copyFrom: string | null;
}

let state: Connection = { online: globalThis.navigator?.onLine ?? true, copyFrom: null };
const listeners = new Set<() => void>();

function update(next: Partial<Connection>) {
  const merged = { ...state, ...next };
  if (merged.online === state.online && merged.copyFrom === state.copyFrom) return;
  state = merged;
  listeners.forEach((notify) => notify());
}

/** Call once at startup. */
export function watchConnection() {
  globalThis.addEventListener?.('online', () => update({ online: true }));
  globalThis.addEventListener?.('offline', () => update({ online: false }));
}

/** Every answer from the API goes through here: a kept copy means offline, a live one means back. */
export function noteResponse(response: Response) {
  const saved = response.headers.get(savedAtHeader);
  if (saved) {
    update({ online: false, copyFrom: state.copyFrom && state.copyFrom < saved ? state.copyFrom : saved });
  } else {
    update({ online: true, copyFrom: null });
  }
}

/** A request that never reached the server. */
export function noteUnreachable() {
  update({ online: false });
}

export function useConnection(): Connection {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => state,
    () => state,
  );
}

/** True when changes cannot be sent: actions are turned off with a word why. */
export function useOffline(): boolean {
  const { online, copyFrom } = useConnection();
  return !online || copyFrom !== null;
}

/**
 * Drops every API answer kept on this phone: on sign-in, sign-out and account deletion. The worker does the
 * same when it sees those answers go by; this covers a page it does not control yet.
 */
export function forgetOfflineCopies() {
  globalThis.caches?.delete(apiCacheName).catch(() => undefined);
}

/** For tests. */
export function resetConnection(next: Connection = { online: true, copyFrom: null }) {
  state = next;
  listeners.forEach((notify) => notify());
}
