import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/router';
import type { Schemas } from '../lib/api/client';

// What the tests of whole screens share: a pretend API and the real router around the screen.

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

type Answer = unknown | ((call: ApiCall) => unknown);

/** An answer with a status other than 200, such as a problem: `status(409, { code: 'schedule.shift_full' })`. */
export function status(code: number, body?: unknown) {
  return { __status: code, body };
}

/**
 * Replaces `fetch` with answers keyed by "METHOD /path". Anything not listed is a 404 problem, so a
 * screen that calls something unexpected fails loudly. Returns every call made, in order.
 */
export function fakeApi(answers: Record<string, Answer>): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(new URL(input, 'http://localhost'), init);
      const text = await request.text();
      const call: ApiCall = {
        method: request.method,
        path: new URL(request.url).pathname,
        body: text ? (JSON.parse(text) as unknown) : undefined,
        headers: request.headers,
      };
      calls.push(call);
      const answer = answers[`${call.method} ${call.path}`];
      if (answer === undefined) {
        return new Response(JSON.stringify({ code: 'common.not_found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const value = typeof answer === 'function' ? (answer as (call: ApiCall) => unknown)(call) : answer;
      const { __status: code, body } = (value as { __status?: number; body?: unknown } | null)?.__status
        ? (value as { __status: number; body?: unknown })
        : { __status: 200, body: value };
      return new Response(body === undefined || code === 204 ? null : JSON.stringify(body), {
        status: code,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

export const workplaceId = '11111111-1111-4111-8111-111111111111';
export const base = `/api/workplaces/${workplaceId}`;

export const me: Schemas['Me'] = {
  id: '22222222-2222-4222-8222-222222222222',
  fullName: 'Sophie Lapointe',
  displayName: 'Sophie L.',
  email: 'sophie@quart.test',
  language: 'en',
  isPlatformAdmin: false,
};

export function workplace(
  role: 'owner' | 'employee' = 'employee',
  overrides: Partial<Schemas['MyMembership']> = {},
): Schemas['WorkplaceView'] {
  return {
    id: workplaceId,
    name: 'Presotea Montmorency',
    address: 'Laval',
    timeZone: 'America/Toronto',
    memberCount: 7,
    joinCode: role === 'owner' ? 'PRESTEA24X' : null,
    claimsNeedApproval: false,
    tradesNeedApproval: false,
    me: {
      membershipId: '33333333-3333-4333-8333-333333333333',
      role,
      level: role === 'owner' ? 3 : 2,
      worksShifts: true,
      desiredWeeklyHours: 14,
      maxWeeklyHours: null,
      permissions:
        role === 'owner'
          ? [
              'ApproveRequests',
              'ManageLevels',
              'ManageMembers',
              'ManageSchedule',
              'ManageTemplate',
              'ManageWorkplace',
              'ViewAvailabilityComments',
            ]
          : [],
      ...overrides,
    },
  };
}

export const emptyBoard: Schemas['MarketplaceBoard'] = {
  claimsNeedApproval: false,
  tradesNeedApproval: false,
  openShifts: [],
  offers: [],
  claims: [],
  trades: [],
};

/**
 * Someone signed in with a workplace open: the answers every screen inside the shell asks for. Pass
 * more answers, or replace these, with `extra`.
 */
export function signedIn(
  role: 'owner' | 'employee' = 'employee',
  extra: Record<string, Answer> = {},
): ApiCall[] {
  globalThis.localStorage.setItem('quart.workplace', workplaceId);
  return fakeApi({
    'GET /api/me': me,
    [`GET ${base}`]: workplace(role),
    [`GET ${base}/periods/current`]: { live: null, next: null },
    [`GET ${base}/marketplace`]: emptyBoard,
    [`GET ${base}/notifications`]: { unread: 0, items: [] },
    ...extra,
  });
}

/** The real routes, guards included, at a path. */
export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
