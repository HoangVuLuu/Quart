import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../lib/api/client';
import { useWorkplace } from '../workplaces/workplace';

/** Everyone in the workplace. Coworkers get a name, a role, a level and an email, nothing else (FR-040). */
export function useMembers() {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'members'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/members', { params: { path: { workplaceId: id } }, signal }),
      ),
  });
}
