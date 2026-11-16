import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { InstallCard } from './InstallCard';
import { forgetInstallPrompt, watchInstallPrompt } from './install';

const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const desktop =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function browser(userAgent: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone') }));
}

describe('the install card (NFR-012)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    watchInstallPrompt();
  });

  afterEach(() => {
    forgetInstallPrompt();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('walks an iPhone through Share, Add to Home Screen, open from the icon', () => {
    browser(iphone);
    render(<InstallCard />);

    expect(screen.getByRole('heading', { name: en.install.title })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      en.install.ios.share,
      en.install.ios.add,
      en.install.ios.open,
    ]);
    // Safari has no install prompt an app can open, so there is no Install button to press.
    expect(screen.queryByRole('button', { name: en.install.install })).not.toBeInTheDocument();
  });

  it('shows nothing once the app is opened from the home screen', () => {
    browser(iphone, true);
    const { container } = render(<InstallCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays away after "Not now"', async () => {
    browser(iphone);
    const first = render(<InstallCard />);
    await userEvent.click(screen.getByRole('button', { name: en.install.notNow }));
    first.unmount();

    const { container } = render(<InstallCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('offers Install where the browser can install, and opens its prompt', async () => {
    browser(desktop);
    const { container } = render(<InstallCard />);
    // Nothing to offer until the browser says the app can be installed.
    expect(container).toBeEmptyDOMElement();

    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => {
      globalThis.dispatchEvent(event);
    });
    await userEvent.click(await screen.findByRole('button', { name: en.install.install }));

    expect(event.defaultPrevented).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
  });
});
