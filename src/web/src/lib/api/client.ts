import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

// The typed API client. Paths, parameters and response types come from src/lib/api/schema.d.ts,
// generated from the API's OpenAPI description (AD-022): run `npm run api:generate` after changing
// an endpoint. A renamed field then breaks the build here instead of breaking production.

export type Schemas = components['schemas'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The ID on the server's log line for this request. Shown to the person so a screenshot can be traced. */
  readonly traceId: string | undefined;

  constructor(status: number, code: string, traceId?: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin,
  credentials: 'same-origin',
  headers: { Accept: 'application/json' },
  // Looked up on every call rather than captured once, so tests can stub fetch.
  fetch: (request) => globalThis.fetch(request),
});

/**
 * Turns an openapi-fetch call into its data, or throws an ApiError carrying the problem's code and
 * trace ID. Usage: `unwrap(api.GET('/api/meta', { signal }))`.
 */
export async function unwrap<T>(
  pending: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof pending>;
  try {
    result = await pending;
  } catch (error) {
    // A cancelled request is not a failure; anything else means the server could not be reached.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'common.network');
  }
  if (result.response.ok) return result.data as T;
  throw toApiError(result.response.status, result.error);
}

function toApiError(status: number, body: unknown): ApiError {
  const problem = body as Partial<Schemas['ApiProblem']> | undefined;
  if (typeof problem?.code === 'string') return new ApiError(status, problem.code, problem.traceId);
  return new ApiError(status, status === 404 ? 'common.not_found' : 'common.unexpected');
}

/** For the rare endpoint deliberately left out of the OpenAPI description, such as diagnostics. */
export function getUndocumented(path: string, signal?: AbortSignal): Promise<unknown> {
  const pending = globalThis
    .fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
    .then(async (response) => {
      const body: unknown = await response.json().catch(() => undefined);
      return response.ok ? { data: body, response } : { error: body, response };
    });
  return unwrap(pending);
}
