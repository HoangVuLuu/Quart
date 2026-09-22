import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('switches between French and English and updates the page language', async () => {
    render(<LanguageSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Changer de langue' }));

    expect(i18n.resolvedLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'Change language' })).toHaveTextContent('Français');
  });
});
