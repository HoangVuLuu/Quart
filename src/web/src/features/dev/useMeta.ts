import { useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';

export type Meta = Schemas['MetaResponse'];

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/meta', { signal })),
  });
}
