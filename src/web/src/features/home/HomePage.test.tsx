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
    });

    renderPage();

    expect(await screen.findByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText(en.home.status.ok)).toBeInTheDocument();
  });

  it('translates the error code the API sends back', async () => {
    answerWith(404, { status: 404, code: 'common.not_found' }, 'application/problem+json');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.common.not_found);
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
    });

    renderPage();

    expect(await screen.findByText('API joignable')).toBeInTheDocument();
  });
});
