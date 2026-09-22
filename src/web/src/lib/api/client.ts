// Minimal typed fetch wrapper. Issue M0-06 replaces the hand-written response types with a
// TypeScript client generated from the API's OpenAPI description, so the two can never drift.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ProblemDetails {
  code?: string;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  if ((response.headers.get('content-type') ?? '').includes('json')) {
    try {
      const problem = (await response.json()) as ProblemDetails;
      if (problem.code) return new ApiError(response.status, problem.code);
    } catch {
      // Not valid JSON: fall through to a generic code.
    }
  }
  return new ApiError(response.status, response.status === 404 ? 'common.not_found' : 'common.unexpected');
}
