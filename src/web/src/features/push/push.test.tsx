import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { base, me, renderApp, signedIn, status, workplaceId } from '../../test/app';
import { deviceLabel } from './push';

// "Push on this phone" in Profile (mockup 1g, M8-06), and where a tapped push lands.

const endpoint = 'https://push.example.test/send/abc';
const subscriptionId = '77777777-7777-4777-8777-777777777777';
const publicKey = btoa(String.fromCharCode(4, ...new Array<number>(64).fill(7)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

interface FakeBrowser {
  permission: NotificationPermission;
  subscription: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null;
  subscribe: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
}

function fakeSubscription(browser: FakeBrowser) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'BKey', auth: 'auth' } }),
    unsubscribe: vi.fn(async () => {
      browser.subscription = null;
      return true;
    }),
  };
}

/** A browser that can push: a service worker, a push manager and the permission prompt. */
function pushCapableBrowser(answer: NotificationPermission = 'granted'): FakeBrowser {
  const browser: FakeBrowser = {
    permission: 'default',
    subscription: null,
    subscribe: vi.fn(),
    requestPermission: vi.fn(),
  };
  browser.requestPermission.mockImplementation(async () => {
    browser.permission = answer;
    return answer;
  });
  browser.subscribe.mockImplementation(async () => {
    browser.subscription = fakeSubscription(browser);
    return browser.subscription;
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    get permission() {
      return browser.permission;
    },
    requestPermission: browser.requestPermission,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => browser.subscription,
          subscribe: browser.subscribe,
        },
      }),
    },
  });
  return browser;
}

function pushSwitch() {
  return screen.findByRole('switch', { name: new RegExp(en.push.label) });
}

describe('push on this phone (M8-06, mockup 1g)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'userAgent');
  });

  it('asks for permission only on the tap, then subscribes and tells the server', async () => {
    const browser = pushCapableBrowser();
    const calls = signedIn('employee', {
      'GET /api/push/key': { publicKey },
      'POST /api/push/subscriptions': { id: subscriptionId },
    });
    renderApp('/profile');
    const user = userEvent.setup();

    const toggle = await pushSwitch();
    expect(toggle).not.toBeChecked();
    expect(browser.requestPermission).not.toHaveBeenCalled();

    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    const options = browser.subscribe.mock.calls[0]?.[0] as PushSubscriptionOptionsInit;
    expect(options.userVisibleOnly).toBe(true);
    expect((options.applicationServerKey as Uint8Array).length).toBe(65);
    expect(calls.find((call) => call.path === '/api/push/subscriptions')?.body).toEqual({
      endpoint,
      keys: { p256dh: 'BKey', auth: 'auth' },
      label: deviceLabel(),
    });
    expect(await screen.findByText(en.push.onToast)).toBeInTheDocument();
  });

  it('turns off here and on the server', async () => {
    const browser = pushCapableBrowser();
    const calls = signedIn('employee', {
      'GET /api/push/key': { publicKey },
      'POST /api/push/subscriptions': { id: subscriptionId },
      [`DELETE /api/push/subscriptions/${subscriptionId}`]: status(204),
    });
    renderApp('/profile');
    const user = userEvent.setup();
    const toggle = await pushSwitch();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(browser.subscription).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith(subscriptionId))).toBe(true);
  });

  it('explains where to allow notifications when the person said no', async () => {
    pushCapableBrowser('denied');
    signedIn('employee');
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await pushSwitch());

    expect(await screen.findByText(en.push.denied)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: new RegExp(en.push.label) })).not.toBeInTheDocument();
  });

  it('says so when push is not set up on the server, and leaves the browser unsubscribed', async () => {
    const browser = pushCapableBrowser();
    signedIn('employee', { 'GET /api/push/key': status(404, { code: 'push.off' }) });
    renderApp('/profile');
    const user = userEvent.setup();
    const toggle = await pushSwitch();

    await user.click(toggle);

    expect(await screen.findByText(en.errors.push.off)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
    expect(browser.subscription).toBeNull();
  });

  it('on an iPhone in Safari, says to add the app to the Home Screen first', async () => {
    pushCapableBrowser();
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile Safari/604.1',
    });
    signedIn('employee');
    renderApp('/profile');

    expect(await screen.findByText(en.push.installFirst)).toBeInTheDocument();
    expect(screen.getByText(en.install.ios.add)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: new RegExp(en.push.label) })).not.toBeInTheDocument();
  });

  it('on start, drops a subscription someone else left on a shared phone', async () => {
    const browser = pushCapableBrowser();
    browser.permission = 'granted';
    browser.subscription = fakeSubscription(browser);
    localStorage.setItem('quart.push', JSON.stringify({ userId: 'someone-else', subscriptionId }));
    const calls = signedIn('employee');
    renderApp('/profile');

    await waitFor(() => expect(browser.subscription).toBeNull());
    expect(calls.some((call) => call.path === '/api/push/subscriptions')).toBe(false);
    expect(await pushSwitch()).not.toBeChecked();
  });

  it('on start, registers this browser again for the person who turned it on', async () => {
    const browser = pushCapableBrowser();
    browser.permission = 'granted';
    browser.subscription = fakeSubscription(browser);
    localStorage.setItem('quart.push', JSON.stringify({ userId: me.id, subscriptionId }));
    const calls = signedIn('employee', { 'POST /api/push/subscriptions': { id: subscriptionId } });
    renderApp('/profile');

    await waitFor(() => expect(calls.some((call) => call.path === '/api/push/subscriptions')).toBe(true));
    expect(await pushSwitch()).toBeChecked();
  });

  it('names the browser for the server', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
    expect(
      deviceLabel('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'),
    ).toBe('Android · Chrome');
  });
});

describe('opening the app from a push (M8-06)', () => {
  const notificationId = '44444444-4444-4444-8444-444444444444';

  it('marks the alert read and goes where it leads', async () => {
    const calls = signedIn('employee', {
      [`POST ${base}/notifications/${notificationId}/read`]: status(204),
    });
    localStorage.removeItem('quart.workplace');
    const router = renderApp(
      `/open?workplace=${workplaceId}&notification=${notificationId}&to=${encodeURIComponent('/alerts')}`,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/alerts'));
    expect(localStorage.getItem('quart.workplace')).toBe(workplaceId);
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith(`/${notificationId}/read`))).toBe(true),
    );
  });

  it('never leaves the app', async () => {
    signedIn('employee', { [`POST ${base}/notifications/${notificationId}/read`]: status(204) });
    const router = renderApp(
      `/open?workplace=${workplaceId}&notification=${notificationId}&to=${encodeURIComponent('//evil.example')}`,
    );

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/open'));
    expect(router.state.location.pathname.startsWith('//')).toBe(false);
  });
});
