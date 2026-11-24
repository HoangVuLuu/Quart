import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { me, renderApp, signedIn, status, type ApiCall } from '../../test/app';

// Step-up (AD-044, M2-06): one password sheet for every sensitive action, then the action again.
describe('confirming the password before a sensitive action', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  async function startDeleting() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: en.profile.deleteAccount.row }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.deleteAccount.title }));
    await user.type(sheet.getByLabelText(en.profile.deleteAccount.typeEmail), me.email);
    await user.click(sheet.getByRole('button', { name: en.profile.deleteAccount.confirm }));
    return user;
  }

  it('asks for the password, then sends the action again by itself', async () => {
    let deletes = 0;
    const calls = signedIn('employee', {
      'POST /api/me/delete': () =>
        ++deletes === 1 ? status(403, { code: 'auth.step_up_required' }) : status(204),
      'POST /api/auth/confirm-password': (call: ApiCall) =>
        (call.body as { password: string }).password === 'right one'
          ? status(204)
          : status(400, {
              code: 'common.validation',
              errors: [{ code: 'auth.current_password_wrong', path: 'password' }],
            }),
    });
    const router = renderApp('/profile');
    const user = await startDeleting();

    const ask = within(await screen.findByRole('dialog', { name: en.auth.stepUp.title }));
    await user.type(ask.getByLabelText(en.auth.password), 'wrong one{Enter}');
    expect(await ask.findByText(en.errors.auth.current_password_wrong)).toBeInTheDocument();
    await user.clear(ask.getByLabelText(en.auth.password));
    await user.type(ask.getByLabelText(en.auth.password), 'right one');
    await user.click(ask.getByRole('button', { name: en.auth.stepUp.confirm }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    const sent = calls.filter((call) => call.path === '/api/me/delete');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body).toEqual({ email: me.email });
  });

  it('closing the password sheet leaves the action undone and says why', async () => {
    const calls = signedIn('employee', {
      'POST /api/me/delete': status(403, { code: 'auth.step_up_required' }),
    });
    renderApp('/profile');
    const user = await startDeleting();

    const ask = await screen.findByRole('dialog', { name: en.auth.stepUp.title });
    await user.click(within(ask).getByRole('button', { name: en.ui.close }));

    expect(await screen.findByText(en.errors.auth.step_up_required)).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/me/delete')).toHaveLength(1);
  });
});
