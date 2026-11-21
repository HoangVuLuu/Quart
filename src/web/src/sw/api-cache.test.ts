import { beforeEach, describe, expect, it } from 'vitest';
import { handleApiRequest, type ApiCacheDeps } from './api-cache';
import { apiCacheName, savedAtHeader } from './rules';

// The service worker's API handling (M8-05), with an in-memory cache and a network that can be cut.
class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(key: string) {
    return this.entries.get(new URL(key, origin).pathname)?.clone();
  }
  async put(key: string, response: Response) {
    this.entries.set(new URL(key, origin).pathname, response);
  }
}

class FakeCaches {
  readonly stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

const origin = 'https://quart.example';
const workplace = '/api/workplaces/0b5e5c1a-3f2d-4c6b-9a8e-7d6c5b4a3f2e';
const schedule = `${workplace}/periods/1c6f6d2b-4e3a-4d7c-8b9f-8e7d6c5b4a3f/schedule`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let caches: FakeCaches;
let network: ((request: Request) => Promise<Response>) | null;
let deps: ApiCacheDeps;

const call = (path: string, method = 'GET') =>
  handleApiRequest(new Request(`${origin}${path}`, { method }), deps);
const kept = () =>
  [...(caches.stores.get(apiCacheName)?.entries.keys() ?? [])].filter((key) => !key.startsWith('/__'));

beforeEach(() => {
  caches = new FakeCaches();
  network = null;
  deps = {
    caches: caches as unknown as CacheStorage,
    fetch: (request) => (network ? network(request) : Promise.reject(new TypeError('Failed to fetch'))),
    now: () => new Date('2026-11-20T19:05:00Z'),
    origin,
  };
});

function answer(responses: Record<string, Response>) {
  network = async (request) =>
    responses[new URL(request.url).pathname]?.clone() ?? json({ code: 'common.not_found' }, 404);
}

describe('API calls through the service worker', () => {
  it('keeps the allowlist once it knows who is signed in, and serves it marked without a network', async () => {
    answer({
      '/api/me': json({ id: 'sophie' }),
      [schedule]: json({ shifts: [1, 2] }),
      [`${workplace}/marketplace`]: json({ offers: [] }),
    });
    await call('/api/me');
    await call(schedule);
    await call(`${workplace}/marketplace`);
    expect(kept().sort()).toEqual(['/api/me', schedule].sort());

    network = null;
    const copy = await call(schedule);

    expect(await copy.json()).toEqual({ shifts: [1, 2] });
    expect(copy.headers.get(savedAtHeader)).toBe('2026-11-20T19:05:00.000Z');
    await expect(call(`${workplace}/marketplace`)).rejects.toThrow('Failed to fetch');
  });

  it('keeps nothing before /api/me says who this is', async () => {
    answer({ [schedule]: json({ shifts: [] }) });
    await call(schedule);
    expect(kept()).toEqual([]);
  });

  it('always asks the network first and hands back its answer untouched', async () => {
    answer({ '/api/me': json({ id: 'sophie' }) });
    const live = await call('/api/me');
    expect(live.headers.get(savedAtHeader)).toBeNull();
  });

  it('empties everything on a 401, on signing out, and when another person signs in', async () => {
    answer({ '/api/me': json({ id: 'sophie' }), [schedule]: json({ shifts: [1] }) });
    await call('/api/me');
    await call(schedule);

    answer({ [schedule]: json({ code: 'auth.unauthenticated' }, 401) });
    await call(schedule);
    expect(caches.stores.has(apiCacheName)).toBe(false);

    answer({
      '/api/me': json({ id: 'sophie' }),
      [schedule]: json({ shifts: [1] }),
      '/api/auth/sign-out': new Response(null, { status: 204 }),
    });
    await call('/api/me');
    await call(schedule);
    await call('/api/auth/sign-out', 'POST');
    expect(caches.stores.has(apiCacheName)).toBe(false);

    answer({ '/api/me': json({ id: 'sophie' }), [schedule]: json({ shifts: [1] }) });
    await call('/api/me');
    await call(schedule);
    answer({ '/api/me': json({ id: 'kevin' }) });
    await call('/api/me');
    expect(kept()).toEqual(['/api/me']);
    network = null;
    await expect(call(schedule)).rejects.toThrow();
  });

  it('never keeps an error answer', async () => {
    answer({ '/api/me': json({ id: 'sophie' }), [schedule]: json({ code: 'common.not_found' }, 404) });
    await call('/api/me');
    await call(schedule);
    expect(kept()).toEqual(['/api/me']);
  });
});
