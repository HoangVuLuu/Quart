import { useQuery } from '@tanstack/react-query';
import { getUndocumented } from '../../lib/api/client';

// /diagnostics/error asks the API to fail on purpose (outside Production only), and lets the error
// reach the root error boundary. Used on staging to check an error shows a translated message and a
// trace ID that finds its log line.
export function ForcedErrorPage() {
  useQuery({
    queryKey: ['diagnostics', 'exception'],
    queryFn: ({ signal }) => getUndocumented('/api/diagnostics/exception', signal),
    retry: false,
    throwOnError: true,
  });

  return null;
}
