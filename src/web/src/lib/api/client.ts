// Minimal typed fetch wrapper. Issue M0-06 replaces the hand-written response types with a
// TypeScript client generated from the API's OpenAPI description, so the two can never drift.

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

interface ProblemDetails {
  code?: string;
  traceId?: string;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    // A cancelled request is not a failure; anything else means the server could not be reached.
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'common.network');
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  if ((response.headers.get('content-type') ?? '').includes('json')) {
    try {
      const problem = (await response.json()) as ProblemDetails;
      if (problem.code) return new ApiError(response.status, problem.code, problem.traceId);
    } catch {
      // Not valid JSON: fall through to a generic code.
    }
  }
  return new ApiError(response.status, response.status === 404 ? 'common.not_found' : 'common.unexpected');
}
