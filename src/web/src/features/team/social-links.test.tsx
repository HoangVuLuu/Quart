import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { base, me, renderApp, signedIn, status, type ApiCall } from '../../test/app';

const person = (displayName: string, links: { instagram?: string; facebook?: string } = {}) => ({
  membershipId: `m-${displayName}`,
  displayName,
  email: `${displayName}@quart.test`,
  role: 'employee',
  level: null,
  isMe: false,
  worksShifts: null,
  maxWeeklyHours: null,
  instagram: links.instagram ?? null,
  facebook: links.facebook ?? null,
});

describe('Instagram and Facebook on the team page (FR-040, M2-18, mockup 1w)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a link only for what each person added, to that site only', async () => {
    signedIn('employee', {
      [`GET ${base}/members`]: [
        person('Jasmine K.', { instagram: 'jasmine.k', facebook: '100012345678' }),
        person('Marc D.'),
      ],
    });
    renderApp('/team');

    const instagram = await screen.findByRole('link', { name: 'Jasmine K. on Instagram' });
    expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/jasmine.k/');
    expect(instagram).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Jasmine K. on Facebook' })).toHaveAttribute(
      'href',
      'https://www.facebook.com/100012345678',
    );
    expect(screen.queryByRole('link', { name: /Marc D\./ })).not.toBeInTheDocument();
  });

  it('adds the links from Profile, shown to the team once saved', async () => {
    const calls = signedIn('employee', {
      'PATCH /api/me': (call: ApiCall) => ({ ...me, ...(call.body as object), instagram: 'sophie.l' }),
    });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: new RegExp(en.profile.social.row) }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.social.title }));
    await user.type(sheet.getByLabelText(en.profile.social.instagram), 'https://instagram.com/sophie.l');
    await user.click(sheet.getByRole('button', { name: en.profile.save }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH' && call.path === '/api/me')?.body).toEqual({
        displayName: null,
        language: null,
        instagram: 'https://instagram.com/sophie.l',
        facebook: '',
      }),
    );
  });

  it('says what is wrong with a link that is not a username', async () => {
    signedIn('employee', {
      'PATCH /api/me': status(400, {
        code: 'common.validation',
        errors: [{ code: 'auth.instagram_invalid', path: 'instagram' }],
      }),
    });
    renderApp('/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: new RegExp(en.profile.social.row) }));
    const sheet = within(await screen.findByRole('dialog', { name: en.profile.social.title }));
    await user.type(sheet.getByLabelText(en.profile.social.instagram), 'not a name');
    await user.click(sheet.getByRole('button', { name: en.profile.save }));

    expect(await sheet.findByText(en.errors.auth.instagram_invalid)).toBeInTheDocument();
  });
});
