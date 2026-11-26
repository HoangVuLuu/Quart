import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { useTimeOffRequests } from '../time-off/data';
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

/** 5: one notification read, when tapped. */
export function useMarkRead() {
  const { id } = useWorkplace();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      unwrap(
        api.POST('/api/workplaces/{workplaceId}/notifications/{notificationId}/read', {
          params: { path: { workplaceId: id, notificationId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['workplace', id, 'notifications'] }),
  });
}

/**
 * How many requests wait for a manager to decide: claims and trades to approve. A trade asked of the
 * person themselves counts on the Trade tab instead (2.4, 2.5).
 */
export function useDecisionCount(): number {
  const board = useMarketplace().data;
  // BL-01: time off waiting for this manager's answer.
  const timeOff = useTimeOffRequests().data?.length ?? 0;
  return (
    timeOff +
    (board?.claims.length ?? 0) +
    (board?.trades.filter((trade) => trade.role === 'approver' && trade.status === 'awaiting_approval')
      .length ?? 0)
  );
}

/** The number on the Alerts tab: unread notifications plus the requests waiting on this person. */
export function useWaitingCount(): number {
  return (useNotifications().data?.unread ?? 0) + useDecisionCount();
}
