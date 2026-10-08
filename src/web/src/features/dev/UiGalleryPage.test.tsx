import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/router';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import { accessibilityProblems } from '../../test/axe';

async function openGallery() {
  const router = createMemoryRouter(routes, { initialEntries: ['/dev/ui'] });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1, name: en.gallery.title });
}

describe('the component gallery', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
  });

  it('shows every kind of component', async () => {
    await openGallery();

    for (const heading of [
      en.gallery.buttons.title,
      en.gallery.fields.title,
      en.gallery.controls.title,
      en.gallery.cards.title,
      en.gallery.chips.title,
      en.gallery.overlays.title,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it('has no accessibility violations at rest', async () => {
    await openGallery();
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('has none with the sheet open', async () => {
    await openGallery();
    await userEvent.click(screen.getByRole('button', { name: en.gallery.overlays.openSheet }));
    await screen.findByRole('dialog', { name: en.gallery.overlays.sheetTitle });
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('has none with the dialog open', async () => {
    await openGallery();
    await userEvent.click(screen.getByRole('button', { name: en.gallery.overlays.openDialog }));
    await screen.findByRole('dialog', { name: en.gallery.overlays.dialogTitle });
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('has none while a message is showing', async () => {
    await openGallery();
    await userEvent.click(screen.getByRole('button', { name: en.gallery.overlays.showToast }));
    expect(await screen.findByText(en.gallery.overlays.toastText)).toBeInTheDocument();
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('has none in French', async () => {
    await i18n.changeLanguage('fr');
    const router = createMemoryRouter(routes, { initialEntries: ['/dev/ui'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: 'Galerie de composants' });
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('has none in the forced dark theme', async () => {
    await openGallery();
    await userEvent.click(screen.getByRole('button', { name: en.gallery.theme.dark }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await accessibilityProblems()).toEqual([]);
  });

  it('puts the theme back when the person leaves', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/dev/ui'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: en.gallery.title });
    await userEvent.click(screen.getByRole('button', { name: en.gallery.theme.light }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: en.nav.news }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
