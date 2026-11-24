import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { me, renderApp, signedIn, status } from '../../test/app';

// "Reset password" in Account (Hoang, 2026-11-23): a link by email, then a page to type the new one twice.
describe('resetting the password from Profile', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('sends the link to the address typed', async () => {
    const calls = signedIn('employee', { 'POST /api/auth/forgot-password': status(202) });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: en.profile.resetPassword.row }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.resetPassword.title }));
    await user.type(sheet.getByLabelText(en.auth.email), ` ${me.email}{Enter}`);

    expect(await sheet.findByRole('status')).toHaveTextContent(me.email);
    expect(calls.find((call) => call.path === '/api/auth/forgot-password')?.body).toEqual({
      email: me.email,
    });
  });

  it('the reset page signs this browser out too, then shows sign-in', async () => {
    let reset = false;
    const calls = signedIn('employee', {
      // Once reset, the server has ended this browser's session too.
      'GET /api/me': () => (reset ? status(401, { code: 'common.unauthorized' }) : me),
      'POST /api/auth/reset-password': () => {
        reset = true;
        return status(204);
      },
    });
    const router = renderApp('/reset-password?token=abc');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(en.auth.reset.password), 'a brand new one');
    await user.type(screen.getByLabelText(en.auth.confirmPassword), 'a brand new one');
    await user.click(screen.getByRole('button', { name: en.auth.reset.submit }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(calls.find((call) => call.path === '/api/auth/reset-password')?.body).toEqual({
      token: 'abc',
      password: 'a brand new one',
    });
    // Not sent back into the app with a session that no longer works.
    expect(await screen.findByLabelText(en.auth.password)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });
});
