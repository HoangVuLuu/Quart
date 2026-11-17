// Where the browser tests find the app, its database and the email catcher. One place, so the Playwright
// config (which starts the API) and the tests (which grant the platform admin) agree.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Not 5080, so a development server already running on this computer is left alone. */
export const appUrl = process.env.QUART_E2E_URL ?? 'http://localhost:5090';

export const mailpitUrl = process.env.QUART_E2E_MAILPIT ?? 'http://localhost:8025';

/** Its own database, never the development one: `scripts/dev/e2e.sh` empties it before each run. */
export const connectionString =
  process.env.QUART_E2E_DATABASE ??
  'Host=localhost;Port=5432;Database=quart_e2e;Username=quart;Password=quart_dev';

/** Everyone in the test uses it. Local only, like the demo accounts. */
export const password = 'tapioca-pearls-4-everyone';

/** How the API runs: Development (migrates on start, generous rate limits), serving the built web app. */
export const apiEnvironment: Record<string, string> = {
  ASPNETCORE_ENVIRONMENT: 'Development',
  ASPNETCORE_URLS: appUrl,
  ASPNETCORE_WEBROOT: path.join(repository, 'src/web/dist'),
  ConnectionStrings__Quart: connectionString,
  Email__PublicUrl: appUrl,
  // Never call the real breached-password service from a test run (Development only).
  Auth__OfflineBreachedPasswordCheck: 'true',
  // Every run joins with the code from one address; 10 a minute is too few for repeated runs.
  Workplaces__JoinsPerMinute: '1000',
};

/** `dotnet run` on the API built in Release, without the launch profile (it would force port 5080). */
export const apiCommand = [
  'dotnet',
  'run',
  '--no-build',
  '--configuration',
  'Release',
  '--no-launch-profile',
  '--project',
  path.join(repository, 'src/backend/Quart.Api'),
];
