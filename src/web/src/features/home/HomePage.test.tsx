import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { HomePage } from './HomePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

function answerWith(status: number, body: unknown, contentType = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } }),
    ),
  );
}

describe('HomePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the API version once the API answers', async () => {
    answerWith(200, {
      name: 'Quart',
      version: '1.2.3',
      environment: 'Development',
      serverTimeUtc: '2026-09-21T12:00:00Z',
      database: 'ok',
      lastTickAt: '2026-09-21T11:57:00Z',
    });

    renderPage();

    expect(await screen.findByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText(en.home.status.ok)).toBeInTheDocument();
    expect(screen.getByText(en.home.database.ok)).toBeInTheDocument();
  });

  it('says when background jobs last ran, measured from the server time', async () => {
    answerWith(200, {
      name: 'Quart',
      version: '1.2.3',
      environment: 'Development',
      serverTimeUtc: '2026-09-21T12:00:00Z',
      database: 'ok',
      lastTickAt: '2026-09-21T11:57:00Z',
    });

    renderPage();

    const lastRun = await screen.findByText('3 minutes ago');
    expect(lastRun).toHaveAttribute('dateTime', '2026-09-21T11:57:00Z');
    expect(screen.getByText(en.home.lastTick)).toBeInTheDocument();
  });

  it('says background jobs have not run yet', async () => {
    answerWith(200, {
      name: 'Quart',
      version: '1.2.3',
      environment: 'Development',
      serverTimeUtc: '2026-09-21T12:00:00Z',
      database: 'ok',
      lastTickAt: null,
    });

    renderPage();

    expect(await screen.findByText(en.home.lastTickNever)).toBeInTheDocument();
  });

  it('still renders when the database is unavailable, with an icon and text', async () => {
    answerWith(200, {
      name: 'Quart',
      version: '1.2.3',
      environment: 'Development',
      serverTimeUtc: '2026-09-21T12:00:00Z',
      database: 'unavailable',
      lastTickAt: null,
    });

    renderPage();

    expect(await screen.findByText(en.home.database.unavailable)).toBeInTheDocument();
    expect(screen.getByText(en.home.status.ok)).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
  });

  it('translates the error code the API sends back, with its trace ID', async () => {
    answerWith(
      404,
      { status: 404, code: 'common.not_found', traceId: '4bf92f3577b34da6a3ce929d0e0e4736' },
      'application/problem+json',
    );

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.errors.common.not_found);
    expect(alert).toHaveTextContent('Reference: 4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('explains a missing connection instead of showing a raw error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.common.network);
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    answerWith(200, {
      name: 'Quart',
      version: '1.2.3',
      environment: 'Production',
      serverTimeUtc: '2026-09-21T12:00:00Z',
      database: 'ok',
      lastTickAt: '2026-09-21T11:57:00Z',
    });

    renderPage();

    expect(await screen.findByText('API joignable')).toBeInTheDocument();
    expect(screen.getByText('Base de données : connectée')).toBeInTheDocument();
  });
});
