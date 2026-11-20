import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './i18n';
import { watchInstallPrompt } from './features/install/install';
import { offerUpdate } from './features/offline/update';
import { watchConnection } from './lib/connection';
import { applyTheme } from './lib/theme';
import './styles/index.css';

applyTheme();
watchInstallPrompt();
watchConnection();

// The service worker (M8-05) runs only in the built app; the development server and tests never have one.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh: () => offerUpdate(() => void update(true)),
      // An installed app can stay open for days: look for a new version each time it comes back to the
      // screen. Never on a timer: that would wake the sleeping server when nobody is using the app (NFR-006).
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      },
    });
  });
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing its #root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
