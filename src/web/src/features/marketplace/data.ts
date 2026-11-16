import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { useRefreshWorkplace } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';

export type MarketplaceBoard = Schemas['MarketplaceBoard'];
export type ShiftRef = Schemas['ShiftRef'];
export type TradeView = Schemas['TradeView'];

/** Open shifts, offers, and the requests that concern the caller (M7-01). */
export function useMarketplace() {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'marketplace'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/marketplace', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
    refetchInterval: 60_000,
  });
}

type TradeAction = 'accept' | 'decline' | 'cancel' | 'approve' | 'reject';

export function useMarketplaceActions() {
  const { id } = useWorkplace();
  const refresh = useRefreshWorkplace();
  const path = { workplaceId: id };
  // Whatever the answer, the board is stale afterwards: a refusal usually means someone else got there first.
  const done = { onSettled: refresh };
  return {
    giveAway: useMutation({
      mutationFn: (shiftId: string) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/marketplace/give-aways', {
            params: { path },
            body: { shiftId },
          }),
        ),
      ...done,
    }),
    cancelOffer: useMutation({
      mutationFn: (giveAwayId: string) =>
        unwrap(
          api.DELETE('/api/workplaces/{workplaceId}/marketplace/give-aways/{giveAwayId}', {
            params: { path: { ...path, giveAwayId } },
          }),
        ),
      ...done,
    }),
    claim: useMutation({
      mutationFn: (body: Schemas['ClaimRequest']) =>
        unwrap(api.POST('/api/workplaces/{workplaceId}/marketplace/claims', { params: { path }, body })),
      ...done,
    }),
    decideClaim: useMutation({
      mutationFn: ({ claimId, approve }: { claimId: string; approve: boolean }) =>
        unwrap(
          approve
            ? api.POST('/api/workplaces/{workplaceId}/marketplace/claims/{claimId}/approve', {
                params: { path: { ...path, claimId } },
              })
            : api.POST('/api/workplaces/{workplaceId}/marketplace/claims/{claimId}/decline', {
                params: { path: { ...path, claimId } },
              }),
        ),
      ...done,
    }),
    requestTrade: useMutation({
      mutationFn: (body: Schemas['TradeRequest']) =>
        unwrap(api.POST('/api/workplaces/{workplaceId}/marketplace/trades', { params: { path }, body })),
      ...done,
    }),
    trade: useMutation({
      mutationFn: ({ tradeId, action }: { tradeId: string; action: TradeAction }) =>
        unwrap(
          api.POST(`/api/workplaces/{workplaceId}/marketplace/trades/{tradeId}/${action}`, {
            params: { path: { ...path, tradeId } },
          }),
        ),
      ...done,
    }),
  };
}
