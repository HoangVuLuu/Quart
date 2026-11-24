import { useSyncExternalStore } from 'react';

// Step-up (AD-044, M2-06). When the API answers auth.step_up_required, the API client asks here and
// waits; the one password sheet mounted at the root (StepUpSheet) answers. Several requests at once
// share one question.

let pending: { promise: Promise<boolean>; resolve: (confirmed: boolean) => void } | null = null;
const listeners = new Set<() => void>();

function tell() {
  for (const listener of listeners) listener();
}

/** Opens the password sheet; true once the password was confirmed, false if the person closed it. */
export function askForPassword(): Promise<boolean> {
  if (!pending) {
    let resolve: (confirmed: boolean) => void = () => {};
    const promise = new Promise<boolean>((done) => (resolve = done));
    pending = { promise, resolve };
    tell();
  }
  return pending.promise;
}

/** Called by the sheet: the password was confirmed (true) or the sheet was closed (false). */
export function answerPasswordQuestion(confirmed: boolean) {
  const current = pending;
  pending = null;
  tell();
  current?.resolve(confirmed);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePasswordQuestion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending !== null,
    () => false,
  );
}
