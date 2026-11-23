import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { base, renderApp, signedIn } from '../../test/app';

// The Email switch of Profile (mockup 1g, M8-07): on until the person turns it off, for this workplace.

describe('the Email switch (M8-07)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('starts on, and turning it off saves it for this workplace', async () => {
    const calls = signedIn('employee', {
      [`GET ${base}/notifications/settings`]: { email: true },
      [`PUT ${base}/notifications/settings`]: { email: false },
    });
    renderApp('/profile');
    const user = userEvent.setup();

    const email = await screen.findByRole('switch', {
      name: new RegExp(`^${en.notificationSettings.email}`),
    });
    expect(email).toBeChecked();
    expect(screen.getByText(en.notificationSettings.emailDescription)).toBeInTheDocument();

    await user.click(email);

    await waitFor(() => expect(email).not.toBeChecked());
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ email: false });
    expect(await screen.findByText(en.notificationSettings.emailOff)).toBeInTheDocument();
  });
});
