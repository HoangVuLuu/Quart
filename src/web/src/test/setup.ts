import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../i18n';

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver. Radix measures some controls with it, for example a switch inside a
// form; nothing here depends on sizes, so an observer that never fires is enough.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
