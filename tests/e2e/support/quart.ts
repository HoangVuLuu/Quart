// Test data goes in through the API, the way the web app sends it, so the browser only clicks through the
// part under test (M6-09). Emails are read from Mailpit's HTTP API.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { apiCommand, apiEnvironment, appUrl, mailpitUrl, password, repository } from './environment';

/**
 * Unique per test run, so the suite passes on a database that holds earlier runs, and the engines (which
 * run side by side against one app) never share an account. Random, not the time: workers start together.
 */
export function emailFor(name: string): string {
  return `${name.toLowerCase()}.${test.info().project.name}.${runId()}@e2e.quart`;
}

const runIds = new Map<string, string>();
function runId(): string {
  const key = `${test.info().testId}:${test.info().repeatEachIndex}:${test.info().retry}`;
  if (!runIds.has(key)) runIds.set(key, randomBytes(4).toString('hex'));
  return runIds.get(key)!;
}

/** One person with their own browser: the API calls share its cookies, so the page is signed in too. */
export class Person {
  readonly page: Page;

  private constructor(
    readonly context: BrowserContext,
    page: Page,
    readonly name: string,
    readonly email: string,
  ) {
    this.page = page;
  }

  static async create(browser: Browser, name: string, language: 'en' | 'fr' = 'en'): Promise<Person> {
    const context = await browser.newContext({
      baseURL: appUrl,
      locale: language === 'fr' ? 'fr-CA' : 'en-CA',
    });
    const person = new Person(context, await context.newPage(), name, emailFor(name.split(' ')[0]!));
    await person.send('POST', '/api/auth/sign-up', {
      fullName: name,
      email: person.email,
      password,
      language,
    });
    await person.send('POST', '/api/auth/verify-email', { token: await tokenFor(person.email) });
    return person;
  }

  async signInByApi(): Promise<void> {
    await this.send('POST', '/api/auth/sign-in', { email: this.email, password });
  }

  /** A request with the anti-forgery header the web app sends (AD-025); fails the test on an error. */
  async send<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let token = await this.antiforgery();
    if (!token) {
      await this.context.request.get('/api/meta');
      token = await this.antiforgery();
    }
    const response = await this.context.request.fetch(path, {
      method,
      headers: { 'X-XSRF-TOKEN': token ?? '' },
      data: body,
    });
    const text = await response.text();
    expect(response.ok(), `${method} ${path} answered ${response.status()}: ${text}`).toBe(true);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async antiforgery(): Promise<string | undefined> {
    return (await this.context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value;
  }
}

/** The token in the newest email to that address with a link. */
export async function tokenFor(email: string): Promise<string> {
  let token: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        for (const summary of ((await search.json()) as { messages?: { ID: string }[] }).messages ?? []) {
          const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`)).json()) as {
            Text?: string;
          };
          token = /token=([A-Za-z0-9_-]+)/.exec(message.Text ?? '')?.[1];
          if (token) return token;
        }
        return undefined;
      },
      { message: `an email with a link to ${email} in Mailpit`, timeout: 15_000 },
    )
    .toBeTruthy();
  return token!;
}

/** There is no screen for this on purpose (M2-09): the same command an operator runs. */
export function grantPlatformAdmin(email: string): void {
  const result = spawnSync(apiCommand[0]!, [...apiCommand.slice(1), '--', 'grant-platform-admin', email], {
    cwd: repository,
    env: { ...process.env, ...apiEnvironment },
    encoding: 'utf8',
  });
  expect(result.status, `grant-platform-admin failed:\n${result.stdout}\n${result.stderr}`).toBe(0);
}

/** The next Monday at least a week away, as "yyyy-mm-dd": periods start on a Monday (FR-090). */
export function nextMonday(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 7 + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}
