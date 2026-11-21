import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { resetConnection } from '../../lib/connection';
import { base, me, renderApp, signedIn, status, workplace } from '../../test/app';
import { savedAt } from './saved-at';
import { UpdatePrompt } from './UpdatePrompt';
import { offerUpdate, resetUpdate } from './update';

// M8-05: the copy the service worker kept, and a new version that waits for the person.
const saved = '2026-11-20T19:05:00.000Z';
const copy = (body: unknown) => status(200, body, { 'X-Quart-Saved-At': saved });
const unreachable = () => {
  throw new TypeError('Failed to fetch');
};

describe('offline', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    resetConnection();
    resetUpdate();
  });

  it('says the shifts on Home and Schedule are a copy, and when it was saved', async () => {
    signedIn('employee', {
      'GET /api/me': copy(me),
      [`GET ${base}`]: copy(workplace('employee')),
      [`GET ${base}/periods/current`]: copy({ live: null, next: null, upcoming: [] }),
      // Not on the offline list: the worker lets them fail.
      [`GET ${base}/marketplace`]: unreachable,
      [`GET ${base}/notifications`]: unreachable,
    });
    const router = renderApp('/');
    const time = savedAt(saved, 'en');

    expect(await screen.findByText(en.offline.copy.replace('{{time}}', time))).toBeInTheDocument();
    await router.navigate('/schedule');
    await screen.findByRole('heading', { name: en.schedule.title });
    expect(screen.getByText(en.offline.title)).toBeInTheDocument();
  });

  it('shows nothing while answers come live', async () => {
    signedIn('employee');
    renderApp('/');
    await screen.findByRole('heading', { name: /Hi/ });
    expect(screen.queryByText(en.offline.title)).not.toBeInTheDocument();
  });

  it('gives the time alone for today and adds the day otherwise', () => {
    const now = new Date('2026-11-20T21:00:00Z');
    expect(savedAt('2026-11-20T19:05:00Z', 'en', now)).not.toMatch(/Nov/);
    expect(savedAt('2026-11-18T19:05:00Z', 'en', now)).toMatch(/Nov/);
  });

  it('offers a new version and reloads only when asked', async () => {
    const reload = vi.fn();
    render(<UpdatePrompt />);
    expect(screen.queryByText(en.offline.updateReady)).not.toBeInTheDocument();

    offerUpdate(reload);
    await userEvent.click(await screen.findByRole('button', { name: en.offline.reload }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
