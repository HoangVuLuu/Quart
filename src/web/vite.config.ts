import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// The API runs on 5080 during development (src/backend/Quart.Api/Properties/launchSettings.json).
// Proxying keeps the browser on a single origin, exactly like production, so cookies behave the same.
const api = 'http://localhost:5080';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // The service worker (AD-040, M8-05, decision 0014): written by hand in src/sw.ts, with the build's file
    // list injected. The manifest stays public/manifest.webmanifest, and the app registers the worker itself
    // so it can offer "Reload" instead of reloading under the person's hands. Off in development and tests.
    ...(mode === 'test'
      ? []
      : [
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectRegister: false,
            registerType: 'prompt',
            manifest: false,
            injectManifest: {
              globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
              rollupFormat: 'iife',
            },
            devOptions: { enabled: false },
          }),
        ]),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': api,
      '/health': api,
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
}));
