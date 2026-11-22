import { api, unwrap } from '../../lib/api/client';
import { isInstalled, isIos } from '../install/install';

// Push on this browser (M8-06, mockup 1g "Push on this phone"). The browser asks for permission only when the
// person taps the switch. This browser's subscription is remembered with whose it is, so a shared phone never
// keeps pushing one person's alerts after another signs in.

const storageKey = 'quart.push';

interface Saved {
  userId: string;
  subscriptionId: string;
}

/**
 * What this browser can do: `unsupported` (no push here, or the app is not built with its service worker),
 * `install-first` (iPhone Safari: push works only in the app added to the Home Screen), `denied` (the person
 * blocked notifications), or `ready`.
 */
export type PushSupport = 'unsupported' | 'install-first' | 'denied' | 'ready';

export function pushSupport(): PushSupport {
  if (isIos() && !isInstalled()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) {
    return 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ready';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // Only the built app has a worker (decision 0014): the development server has none, and a page not on
  // https has no navigator.serviceWorker at all.
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

function saved(): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Saved | null;
    return value?.userId && value.subscriptionId ? value : null;
  } catch {
    return null;
  }
}

function save(value: Saved | null) {
  try {
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  } catch {
    // Private mode: push still works, it is just not remembered across visits.
  }
}

/** "iPhone · Safari", "Android · Chrome", "Mac · Firefox": how Profile and the server name this browser. */
export function deviceLabel(userAgent = navigator.userAgent): string {
  const device = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : 'Computer';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  return `${device} · ${browser}`;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function register(subscription: PushSubscription, userId: string) {
  const json = subscription.toJSON();
  const answer = await unwrap(
    api.POST('/api/push/subscriptions', {
      body: {
        endpoint: json.endpoint ?? null,
        keys: { p256dh: json.keys?.p256dh ?? null, auth: json.keys?.auth ?? null },
        label: deviceLabel(),
      },
    }),
  );
  save({ userId, subscriptionId: answer.id });
}

/**
 * Turns push on, from the switch's tap: the permission prompt, then the browser's subscription, then the
 * server. Returns false when the person said no.
 */
export async function turnOnPush(userId: string): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const worker = await registration();
  if (!worker) throw new Error('No service worker');
  const { publicKey } = await unwrap(api.GET('/api/push/key'));
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  try {
    await register(subscription, userId);
  } catch (error) {
    // The server said no: the browser must not keep a subscription nobody will push to.
    await subscription.unsubscribe();
    throw error;
  }
  return true;
}

/** Whether this browser shows this person's alerts: subscribed, allowed, and turned on by them. */
export async function isPushOnHere(userId: string): Promise<boolean> {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return false;
  return (await currentSubscription()) !== null && saved()?.userId === userId;
}

/** Turns push off on this browser: here first, so it stops even if the server cannot be reached. */
export async function turnOffPush() {
  const known = saved();
  save(null);
  await (await currentSubscription())?.unsubscribe();
  if (known) {
    await api.DELETE('/api/push/subscriptions/{subscriptionId}', {
      params: { path: { subscriptionId: known.subscriptionId } },
    });
  }
}

/**
 * On every start, signed in: this browser's subscription is registered again for the person who turned it on
 * (the server forgets browsers when someone signs out everywhere or changes their password), and a
 * subscription left by someone else is dropped without asking.
 */
export async function syncPush(userId: string) {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (!subscription) {
    save(null);
    return;
  }
  if (saved()?.userId !== userId) {
    save(null);
    await subscription.unsubscribe();
    return;
  }
  await register(subscription, userId);
}

/** Before signing out or after deleting the account: this browser stops showing the person's alerts. */
export async function forgetPushHere() {
  try {
    await turnOffPush();
  } catch {
    // Signing out never waits on push.
  }
}
