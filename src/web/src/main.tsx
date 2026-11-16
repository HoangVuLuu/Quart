import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './i18n';
import { watchInstallPrompt } from './features/install/install';
import { applyTheme } from './lib/theme';
import './styles/index.css';

applyTheme();
watchInstallPrompt();

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing its #root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
