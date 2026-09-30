import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/client';

export interface Meta {
  name: string;
  version: string;
  environment: string;
  serverTimeUtc: string;
  database: 'ok' | 'unavailable';
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => apiGet<Meta>('/api/meta', signal),
  });
}
