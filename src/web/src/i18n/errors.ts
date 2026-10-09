import { ApiError } from '../lib/api/client';

// The API sends codes, never sentences (AD-023). This maps each code to its translation.
// When the backend adds a code in Quart.SharedKernel.ErrorCodes, add it here and in both locale files.
const errorKeys = {
  'common.not_found': 'errors.common.not_found',
  'common.validation': 'errors.common.validation',
  'common.unauthorized': 'errors.common.unauthorized',
  'common.forbidden': 'errors.common.forbidden',
  'common.conflict': 'errors.common.conflict',
  'common.too_many_requests': 'errors.common.too_many_requests',
  'common.unexpected': 'errors.common.unexpected',
  'common.network': 'errors.common.network',
} as const;

type ErrorKey = (typeof errorKeys)[keyof typeof errorKeys];

export function errorKeyFor(error: unknown): ErrorKey {
  // Anything that is not an API error is a bug in the web app itself: "something went wrong".
  const code = error instanceof ApiError ? error.code : 'common.unexpected';
  return (errorKeys as Record<string, ErrorKey>)[code] ?? errorKeys['common.unexpected'];
}

/** The server trace ID behind an error, when there is one (a lost connection has none). */
export function traceIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.traceId : undefined;
}
