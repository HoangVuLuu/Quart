import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { fakeApi, me, renderApp, signedIn, status, type ApiCall } from '../../test/app';

const signedOut = { 'GET /api/me': status(401, { code: 'common.unauthorized' }) };

describe('signing in', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('logs in, sends the anti-forgery header, and lands on the workplaces', async () => {
    document.cookie = 'XSRF-TOKEN=token-from-the-api';
    // As the real API: nobody is signed in until the sign-in request has been answered.
    const calls: ApiCall[] = fakeApi({
      'GET /api/me': () =>
        calls.some((call) => call.path === '/api/auth/sign-in') ? me : signedOut['GET /api/me'],
      'POST /api/auth/sign-in': me,
      'GET /api/workplaces': [],
    });
    renderApp('/sign-in');

    await userEvent.type(await screen.findByLabelText(en.auth.email), 'sophie@quart.test');
    await userEvent.type(screen.getByLabelText(en.auth.password), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signIn.submit }));

    expect(await screen.findByRole('heading', { name: 'Hi Sophie L.' })).toBeInTheDocument();
    const signIn = calls.find((call) => call.path === '/api/auth/sign-in');
    expect(signIn?.body).toEqual({ email: 'sophie@quart.test', password: 'correct horse battery' });
    // AD-025: every unsafe request sends the cookie's value back in a header.
    expect(signIn?.headers.get('X-XSRF-TOKEN')).toBe('token-from-the-api');
  });

  it('says so, in words, when the password is wrong', async () => {
    fakeApi({ ...signedOut, 'POST /api/auth/sign-in': status(401, { code: 'auth.invalid_credentials' }) });
    renderApp('/sign-in');

    await userEvent.type(await screen.findByLabelText(en.auth.email), 'sophie@quart.test');
    await userEvent.type(screen.getByLabelText(en.auth.password), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signIn.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.auth.invalid_credentials);
  });

  it('offers to resend the verification email to an unverified account', async () => {
    fakeApi({ ...signedOut, 'POST /api/auth/sign-in': status(403, { code: 'auth.email_not_verified' }) });
    renderApp('/sign-in');

    await userEvent.type(await screen.findByLabelText(en.auth.email), 'sophie@quart.test');
    await userEvent.type(screen.getByLabelText(en.auth.password), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signIn.submit }));

    expect(await screen.findByRole('link', { name: en.auth.signIn.resend })).toBeInTheDocument();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    fakeApi(signedOut);
    renderApp('/sign-in');

    expect(await screen.findByRole('heading', { name: 'Content de te revoir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});

describe('creating an account', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  async function fill(name: string, email: string, password: string, confirm: string) {
    await userEvent.type(await screen.findByLabelText(en.auth.fullName), name);
    await userEvent.type(screen.getByLabelText(en.auth.email), email);
    await userEvent.type(screen.getByLabelText(en.auth.password), password);
    await userEvent.type(screen.getByLabelText(en.auth.confirmPassword), confirm);
  }

  it('checks the form before anything is sent', async () => {
    const calls = fakeApi(signedOut);
    renderApp('/sign-up');

    await fill('Marc-Olivier Côté', 'marc@quart.test', 'short', 'different');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signUp.submit }));

    expect(screen.getByText(en.errors.auth.password_too_short)).toBeInTheDocument();
    expect(screen.getByText(en.auth.errors.passwordsDiffer)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('signs up in the language on screen and asks the person to check their email', async () => {
    const calls = fakeApi({ ...signedOut, 'POST /api/auth/sign-up': status(202) });
    renderApp('/sign-up');

    await fill("Siobhán O'Connor", 'siobhan@quart.test', 'correct horse battery', 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signUp.submit }));

    expect(await screen.findByRole('heading', { name: en.auth.checkEmail.title })).toBeInTheDocument();
    expect(screen.getByText('siobhan@quart.test')).toBeInTheDocument();
    expect(calls.find((call) => call.path === '/api/auth/sign-up')?.body).toEqual({
      fullName: "Siobhán O'Connor",
      email: 'siobhan@quart.test',
      password: 'correct horse battery',
      language: 'en',
    });
  });

  it('puts a refusal from the server under the field it is about', async () => {
    fakeApi({
      ...signedOut,
      'POST /api/auth/sign-up': status(400, {
        code: 'common.validation',
        errors: [{ code: 'auth.password_breached', path: 'password' }],
      }),
    });
    renderApp('/sign-up');

    await fill('Ana Lima', 'ana@quart.test', 'password123', 'password123');
    await userEvent.click(screen.getByRole('button', { name: en.auth.signUp.submit }));

    await waitFor(() =>
      expect(screen.getByLabelText(en.auth.password)).toHaveAccessibleDescription(
        new RegExp(en.errors.auth.password_breached),
      ),
    );
  });
});

describe('emailed links', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('verifies the email with the token in the link, once', async () => {
    const calls = fakeApi({ ...signedOut, 'POST /api/auth/verify-email': status(204) });
    renderApp('/verify-email?token=abc123');

    expect(await screen.findByRole('heading', { name: en.auth.verify.done })).toBeInTheDocument();
    const verifications = calls.filter((call) => call.path === '/api/auth/verify-email');
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.body).toEqual({ token: 'abc123' });
  });

  it('explains a link that was already used', async () => {
    fakeApi({
      ...signedOut,
      'POST /api/auth/verify-email': status(400, {
        code: 'common.validation',
        errors: [{ code: 'auth.link_used', path: 'token' }],
      }),
    });
    renderApp('/verify-email?token=abc123');

    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.auth.link_used);
  });
});

describe('changing the password and the email (M2-07)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('asks for the current password and shows a wrong one under its field', async () => {
    const calls = signedIn('employee', {
      'POST /api/me/password': status(400, {
        code: 'common.validation',
        errors: [{ code: 'auth.current_password_wrong', path: 'currentPassword' }],
      }),
    });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: en.profile.changePassword.row }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.changePassword.title }));
    await user.type(sheet.getByLabelText(en.profile.changePassword.current), 'old one');
    await user.type(sheet.getByLabelText(en.profile.changePassword.new), 'a brand new passphrase');
    await user.type(sheet.getByLabelText(en.auth.confirmPassword), 'a brand new passphrase');
    await user.click(sheet.getByRole('button', { name: en.profile.changePassword.save }));

    expect(await sheet.findByText(en.errors.auth.current_password_wrong)).toBeInTheDocument();
    expect(calls.find((call) => call.path === '/api/me/password')?.body).toEqual({
      currentPassword: 'old one',
      newPassword: 'a brand new passphrase',
    });
  });

  it('sends a link to the new address and says nothing has changed yet', async () => {
    const calls = signedIn('employee', { 'POST /api/me/email': status(202) });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: new RegExp(me.email) }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.changeEmail.title }));
    await user.type(sheet.getByLabelText(en.profile.changeEmail.new), 'sophie.new@quart.test');
    await user.type(sheet.getByLabelText(en.profile.changeEmail.current), 'my password');
    await user.click(sheet.getByRole('button', { name: en.profile.changeEmail.send }));

    expect(await screen.findByRole('dialog', { name: en.profile.changeEmail.sentTitle })).toBeInTheDocument();
    expect(calls.find((call) => call.path === '/api/me/email')?.body).toEqual({
      email: 'sophie.new@quart.test',
      currentPassword: 'my password',
    });
  });

  it('confirms a new email from its link, once', async () => {
    const calls = fakeApi({ ...signedOut, 'POST /api/me/email/confirm': status(204) });
    renderApp('/confirm-email?token=xyz789');

    expect(await screen.findByRole('heading', { name: en.auth.confirmEmail.done })).toBeInTheDocument();
    const confirmations = calls.filter((call) => call.path === '/api/me/email/confirm');
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]?.body).toEqual({ token: 'xyz789' });
    expect(screen.getByRole('link', { name: en.auth.signIn.submit })).toHaveAttribute('href', '/sign-in');
  });
});
