import { useSyncExternalStore } from 'react';

// A new version of the app is waiting (M8-05). The service worker never takes over by itself: the person
// taps "Reload" when it suits them.

let apply: (() => void) | null = null;
const listeners = new Set<() => void>();

/** Called by the registration in main.tsx when a new worker is installed and waiting. */
export function offerUpdate(reload: () => void) {
  apply = reload;
  listeners.forEach((notify) => notify());
}

export function useUpdate(): (() => void) | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => apply,
    () => apply,
  );
}

/** For tests. */
export function resetUpdate() {
  apply = null;
  listeners.forEach((notify) => notify());
}
