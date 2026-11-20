import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { me, renderApp, signedIn, status } from '../../test/app';

describe('deleting the account (M2-16, mockup 1g-del)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('asks to type the email, then deletes and goes to sign-in', async () => {
    const calls = signedIn('employee', { 'POST /api/me/delete': status(204) });
    const router = renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: en.profile.deleteAccount.row }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.deleteAccount.title }));
    const confirm = sheet.getByRole('button', { name: en.profile.deleteAccount.confirm });
    expect(confirm).toBeDisabled();
    await user.type(sheet.getByLabelText(en.profile.deleteAccount.typeEmail), 'someone@else.test');
    expect(confirm).toBeDisabled();
    await user.clear(sheet.getByLabelText(en.profile.deleteAccount.typeEmail));
    await user.type(sheet.getByLabelText(en.profile.deleteAccount.typeEmail), me.email.toUpperCase());
    await user.click(confirm);

    expect(calls.find((call) => call.path === '/api/me/delete')?.body).toEqual({
      email: me.email.toUpperCase(),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
  });

  it('tells an owner the workplace must be handed over first', async () => {
    signedIn('owner', {
      'POST /api/me/delete': status(409, { code: 'auth.owns_workplace' }),
    });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: en.profile.deleteAccount.row }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.deleteAccount.title }));
    await user.type(sheet.getByLabelText(en.profile.deleteAccount.typeEmail), me.email);
    await user.click(sheet.getByRole('button', { name: en.profile.deleteAccount.confirm }));

    expect(await sheet.findByText(en.errors.auth.owns_workplace)).toBeInTheDocument();
  });
});
