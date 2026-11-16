import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { renderApp, signedIn, status } from '../test/app';

const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

const failing = {
  'GET /api/diagnostics/exception': status(500, { status: 500, code: 'common.unexpected', traceId }),
};

describe('root error boundary', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    // React logs every error a boundary catches; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a translated message and the trace ID when the API fails', async () => {
    signedIn('employee', failing);

    renderApp('/diagnostics/error');

    expect(await screen.findByRole('heading', { name: en.errors.page.title })).toBeInTheDocument();
    expect(screen.getByText(en.errors.common.unexpected)).toBeInTheDocument();
    expect(screen.getByText(`Reference: ${traceId}`)).toBeInTheDocument();
    // The shell stays, so the person can still go somewhere else.
    expect(screen.getByRole('navigation', { name: en.nav.label })).toBeInTheDocument();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    signedIn('employee', failing);

    renderApp('/diagnostics/error');

    expect(await screen.findByRole('heading', { name: 'Un problème est survenu' })).toBeInTheDocument();
    expect(screen.getByText(`Référence : ${traceId}`)).toBeInTheDocument();
  });
});
