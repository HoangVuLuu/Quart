import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base, fakeApi, me, renderApp, signedIn, status } from '../test/app';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { MainNav } from './MainNav';

const renderAt = renderApp;

const mainNav = () => screen.getByRole('navigation', { name: en.nav.label });

describe('app shell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    signedIn();
  });

  it('marks the tab of the current route, and only that one', async () => {
    renderAt('/schedule');

    expect(await screen.findByRole('heading', { name: en.schedule.title })).toBeInTheDocument();
    const current = within(mainNav()).getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(en.nav.schedule);
  });

  it('moves the current tab when the person taps another', async () => {
    renderAt('/');

    await userEvent.click(
      within(await screen.findByRole('navigation', { name: en.nav.label })).getByRole('link', {
        name: en.nav.profile,
      }),
    );

    expect(await screen.findByRole('heading', { name: en.profile.title })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent(en.nav.profile);
  });

  it('keeps Home current only on the home page', async () => {
    renderAt('/');
    expect(
      within(await screen.findByRole('navigation', { name: en.nav.label })).getByRole('link', {
        current: 'page',
      }),
    ).toHaveTextContent(en.nav.home);
  });

  it('never shows more than five tabs', async () => {
    renderAt('/');
    expect(
      within(await screen.findByRole('navigation', { name: en.nav.label })).getAllByRole('link'),
    ).toHaveLength(5);
  });

  it('refuses a sixth tab', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const six = ['/', '/a', '/b', '/c', '/d', '/e'].map((to) => ({
      to,
      label: 'nav.home' as const,
      icon: 'home' as const,
    }));

    expect(() =>
      render(
        <MemoryRouter>
          <MainNav tabs={six} />
        </MemoryRouter>,
      ),
    ).toThrow(/five|5/);
  });

  it('shows a count in a badge, with words for screen readers', () => {
    render(
      <MemoryRouter>
        <MainNav tabs={[{ to: '/alerts', label: 'nav.alerts', icon: 'alerts', count: 2 }]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: `${en.nav.alerts} 2 waiting` })).toBeInTheDocument();
  });

  it('offers a skip link to the content first', async () => {
    renderAt('/trade');
    await screen.findByRole('heading', { name: en.trade.title });

    await userEvent.tab();

    expect(screen.getByRole('link', { name: en.shell.skipToContent })).toHaveFocus();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    renderAt('/trade');

    expect(await screen.findByRole('heading', { name: 'Échanges' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Échanges');
  });

  it('sends someone who is not signed in to the log-in screen', async () => {
    fakeApi({ 'GET /api/me': status(401, { code: 'common.unauthorized' }) });
    renderAt('/schedule');

    expect(await screen.findByRole('heading', { name: en.auth.signIn.title })).toBeInTheDocument();
  });

  it('asks for a workplace when none is open', async () => {
    fakeApi({ 'GET /api/me': me, 'GET /api/workplaces': [] });
    renderAt('/');

    expect(await screen.findByText(en.workplaces.none)).toBeInTheDocument();
  });

  it('shows what waits on the person in a badge on Alerts', async () => {
    signedIn('employee', { [`GET ${base}/notifications`]: { unread: 3, items: [] } });
    renderAt('/trade');

    expect(await screen.findByRole('link', { name: `${en.nav.alerts} 3 waiting` })).toBeInTheDocument();
  });
});
