import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { routes } from './router';

const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('root error boundary', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    // React logs every error a boundary catches; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a translated message and the trace ID when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 500, code: 'common.unexpected', traceId }), {
            status: 500,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      ),
    );

    renderAt('/diagnostics/error');

    expect(await screen.findByRole('heading', { name: en.errors.page.title })).toBeInTheDocument();
    expect(screen.getByText(en.errors.common.unexpected)).toBeInTheDocument();
    expect(screen.getByText(`Reference: ${traceId}`)).toBeInTheDocument();
    // The shell stays, so the person can still switch language.
    expect(screen.getByRole('button', { name: en.language.label })).toBeInTheDocument();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 500, code: 'common.unexpected', traceId }), {
            status: 500,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      ),
    );

    renderAt('/diagnostics/error');

    expect(await screen.findByRole('heading', { name: 'Un problème est survenu' })).toBeInTheDocument();
    expect(screen.getByText(`Référence : ${traceId}`)).toBeInTheDocument();
  });
});
