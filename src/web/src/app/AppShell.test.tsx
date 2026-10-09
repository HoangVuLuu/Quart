import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { MainNav } from './MainNav';
import { routes } from './router';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const mainNav = () => screen.getByRole('navigation', { name: en.nav.label });

describe('app shell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    // The home page asks the API for its status; these tests are about the frame around it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })),
    );
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

    await userEvent.click(within(mainNav()).getByRole('link', { name: en.nav.news }));

    expect(await screen.findByRole('heading', { name: en.news.title })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent(en.nav.news);
  });

  it('keeps Home current only on the home page', async () => {
    renderAt('/');
    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent(en.nav.home);
  });

  it('never shows more than five tabs', async () => {
    renderAt('/');
    expect(within(mainNav()).getAllByRole('link').length).toBeLessThanOrEqual(5);
  });

  it('refuses a sixth tab', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const six = ['/', '/a', '/b', '/c', '/d', '/e'].map((to) => ({ to, label: 'nav.home' as const }));

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
        <MainNav tabs={[{ to: '/requests', label: 'nav.requests', count: 2 }]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: `${en.nav.requests} 2 waiting` })).toBeInTheDocument();
  });

  it('offers a skip link to the content first', async () => {
    renderAt('/news');

    await userEvent.tab();

    expect(screen.getByRole('link', { name: en.shell.skipToContent })).toHaveFocus();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    renderAt('/availability');

    expect(await screen.findByRole('heading', { name: 'Disponibilités' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Dispos');
  });
});
