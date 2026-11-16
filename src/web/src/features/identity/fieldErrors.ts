import type { TFunction } from 'i18next';
import { errorKeyFor } from '../../i18n/errors';
import { ApiError } from '../../lib/api/client';

/**
 * Puts a failed request's messages where they belong: one per field the API named, and everything else
 * under `form`. The API sends codes; the sentences come from the translations (FR-263).
 */
export function fieldErrors(error: unknown, t: TFunction): Record<string, string> {
  if (!error) return {};
  if (error instanceof ApiError && error.errors.length > 0) {
    return Object.fromEntries(
      error.errors.map((item) => [item.path, t(errorKeyFor(new ApiError(error.status, item.code)))]),
    );
  }
  return { form: t(errorKeyFor(error)) };
}
