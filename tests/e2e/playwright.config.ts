import { defineConfig, devices } from '@playwright/test';
import { apiCommand, apiEnvironment, appUrl, repository } from './support/environment';

// A phone first (NFR-002): both engines at the iPhone's 390 x 844, with touch. WebKit is Safari's engine,
// which is what staff on iPhones run (M6-09).
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: './specs',
  // One spec walks one shared story; the two engines run side by side, each with its own people.
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: appUrl,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'], ...phone } },
    { name: 'webkit', use: { ...devices['iPhone 14'], ...phone } },
  ],
  // The API in Development (it migrates the database on start) serves the built web app, on one origin
  // like production. Build both first: scripts/dev/e2e.sh does.
  webServer: {
    command: apiCommand.join(' '),
    cwd: repository,
    env: apiEnvironment,
    url: `${appUrl}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
