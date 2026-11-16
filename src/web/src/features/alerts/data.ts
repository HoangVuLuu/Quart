import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { useMarketplace } from '../marketplace/data';
import { useWorkplace } from '../workplaces/workplace';

export type NotificationItem = Schemas['NotificationItem'];

export function useNotifications() {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'notifications'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/notifications', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
    // No live connection in v1 (AD-031): the inbox refetches on focus and on a modest interval.
    refetchInterval: 60_000,
  });
}

export function useMarkAllRead() {
  const { id } = useWorkplace();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/workplaces/{workplaceId}/notifications/read-all', {
          params: { path: { workplaceId: id } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['workplace', id, 'notifications'] }),
  });
}

/** How many requests wait for this person to decide: claims to approve, trades to answer or approve. */
export function useDecisionCount(): number {
  const board = useMarketplace().data;
  return (
    (board?.claims.length ?? 0) +
    (board?.trades.filter(
      (trade) =>
        (trade.role === 'coworker' && trade.status === 'requested') ||
        (trade.role === 'approver' && trade.status === 'awaiting_approval'),
    ).length ?? 0)
  );
}

/** The number on the Alerts tab: unread notifications plus the requests waiting on this person. */
export function useWaitingCount(): number {
  return (useNotifications().data?.unread ?? 0) + useDecisionCount();
}
