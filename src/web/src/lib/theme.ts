// NFR-011: the theme follows the device. The Dark mode switch on the Profile screen is an override on
// top of that (mockups 1g and 1o, known conflict 5), remembered on this device only.

export type Theme = 'light' | 'dark';

const storageKey = 'quart.theme';

export function storedTheme(): Theme | null {
  try {
    const value = globalThis.localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** What the screen shows right now: the override when there is one, otherwise the device setting. */
export function currentTheme(): Theme {
  return (
    storedTheme() ?? (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

/** The token file reads `data-theme` on the root element; without it, the device setting decides. */
export function applyTheme(theme: Theme | null = storedTheme()) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function chooseTheme(theme: Theme) {
  try {
    globalThis.localStorage.setItem(storageKey, theme);
  } catch {
    // Storage can be refused (private browsing); the choice then lasts until the page closes.
  }
  applyTheme(theme);
}
