import { apiCacheName, endsTheSession, isOfflineAllowed, savedAtHeader } from './rules';

// The service worker's handling of API calls (AD-040, M8-05). Kept apart from the worker itself so the
// tests can run it with a fake cache and a fake network.

/** A record in the cache naming whose answers it holds. Not a real route. */
const ownerKey = '/__quart/owner';

export interface ApiCacheDeps {
  caches: CacheStorage;
  fetch: (request: Request) => Promise<Response>;
  now: () => Date;
  origin: string;
}

/**
 * Network first, always. A kept answer is used only when the network cannot be reached at all, and comes
 * back marked with when it was saved. Any sign-in, sign-out, account deletion or 401 empties the cache, and
 * so does seeing a different person on /api/me, so a shared phone never shows someone else's shifts.
 */
export async function handleApiRequest(request: Request, deps: ApiCacheDeps): Promise<Response> {
  const url = new URL(request.url);
  const allowed = isOfflineAllowed(request.method, url, deps.origin);
  let response: Response;
  try {
    response = await deps.fetch(request);
  } catch (error) {
    const copy = allowed ? await readCopy(url, deps) : undefined;
    if (copy) return copy;
    throw error;
  }

  if (response.status === 401 || (response.ok && endsTheSession(request.method, url, deps.origin))) {
    await deps.caches.delete(apiCacheName);
  } else if (allowed && response.status === 200) {
    await saveCopy(url, response.clone(), deps);
  }
  return response;
}

export function clearApiCache(caches: CacheStorage): Promise<boolean> {
  return caches.delete(apiCacheName);
}

async function saveCopy(url: URL, response: Response, deps: ApiCacheDeps) {
  const body = await response.arrayBuffer();
  const cache = await deps.caches.open(apiCacheName);
  const owner = await (await cache.match(ownerKey))?.text();
  if (url.pathname === '/api/me') {
    const person = idOf(body);
    if (!person) return;
    if (owner !== person) {
      await deps.caches.delete(apiCacheName);
      const fresh = await deps.caches.open(apiCacheName);
      await fresh.put(ownerKey, new Response(person));
      await fresh.put(url.pathname, copyOf(response, body, deps.now()));
      return;
    }
  } else if (!owner) {
    // Nobody known yet: nothing is kept until /api/me says who this is.
    return;
  }
  await cache.put(url.pathname, copyOf(response, body, deps.now()));
}

async function readCopy(url: URL, deps: ApiCacheDeps): Promise<Response | undefined> {
  const cache = await deps.caches.open(apiCacheName);
  if (!(await cache.match(ownerKey))) return undefined;
  return (await cache.match(url.pathname)) ?? undefined;
}

function copyOf(response: Response, body: ArrayBuffer, savedAt: Date): Response {
  const headers = new Headers(response.headers);
  headers.set(savedAtHeader, savedAt.toISOString());
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function idOf(body: ArrayBuffer): string | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body));
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
