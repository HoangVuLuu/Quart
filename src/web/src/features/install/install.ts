// NFR-012: most staff use Quart from an icon on their phone. Android (and desktop Chrome) offer an
// install prompt the app can trigger; iPhone has no such thing, so the person is walked through
// Share -> Add to Home Screen instead.

/** Chrome's install event. Not in TypeScript's DOM types because only Chromium browsers have it. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pending: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Call once at startup: Chrome fires the event early, before any screen is there to hear it. */
export function watchInstallPrompt() {
  globalThis.addEventListener?.('beforeinstallprompt', (event) => {
    // Keeps Chrome's own banner away so the app can offer installing where it makes sense.
    event.preventDefault();
    pending = event as InstallPromptEvent;
    listeners.forEach((notify) => notify());
  });
  globalThis.addEventListener?.('appinstalled', () => {
    pending = null;
    listeners.forEach((notify) => notify());
  });
}

export function subscribeToInstallPrompt(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export const pendingInstallPrompt = () => pending;

export function forgetInstallPrompt() {
  pending = null;
  listeners.forEach((notify) => notify());
}

/** Opened from the home screen icon rather than in a browser tab. */
export function isInstalled(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
    (globalThis.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone and iPad. A recent iPad says it is a Mac, but a Mac has no touch screen. */
export function isIos(): boolean {
  const { userAgent, maxTouchPoints } = globalThis.navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

const dismissedKey = 'quart.install.dismissed';

export function installHintDismissed(): boolean {
  try {
    return globalThis.localStorage.getItem(dismissedKey) === 'yes';
  } catch {
    return false;
  }
}

export function dismissInstallHint() {
  try {
    globalThis.localStorage.setItem(dismissedKey, 'yes');
  } catch {
    // Storage refused: the hint comes back next time, which is harmless.
  }
}
