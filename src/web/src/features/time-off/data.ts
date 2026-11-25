import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { api, unwrap } from '../../lib/api/client';
import type { components } from '../../lib/api/schema';
import { formatShortDate } from '../../i18n/format';
import { useWorkplace } from '../workplaces/workplace';

export type TimeOffRequestView = components['schemas']['TimeOffRequestView'];

const mineKey = (id: string) => ['workplace', id, 'time-off', 'mine'] as const;
const pendingKey = (id: string) => ['workplace', id, 'time-off', 'pending'] as const;

/** The person's waiting request or their time off that has not ended, and whether they may ask (BL-01). */
export function useMyTimeOff() {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: mineKey(id),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/time-off/mine', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
  });
}

/** Requests waiting for a manager who approves requests; nothing is asked for anyone else. */
export function useTimeOffRequests() {
  const { id, can } = useWorkplace();
  return useQuery({
    queryKey: pendingKey(id),
    enabled: can('ApproveRequests'),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/time-off', { params: { path: { workplaceId: id } }, signal }),
      ),
  });
}

export function useTimeOffActions() {
  const { id } = useWorkplace();
  const client = useQueryClient();
  // The team page, the schedules and the counts all change with a decision.
  const refresh = () => client.invalidateQueries({ queryKey: ['workplace', id] });
  const path = { workplaceId: id };
  return {
    request: useMutation({
      mutationFn: (body: { firstDay: string; lastDay: string | null; reason: string | null }) =>
        unwrap(api.POST('/api/workplaces/{workplaceId}/time-off', { params: { path }, body })),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (timeOffId: string) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/time-off/{timeOffId}/cancel', {
            params: { path: { ...path, timeOffId } },
          }),
        ),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: ({ timeOffId, accept }: { timeOffId: string; accept: boolean }) =>
        unwrap(
          accept
            ? api.POST('/api/workplaces/{workplaceId}/time-off/{timeOffId}/accept', {
                params: { path: { ...path, timeOffId } },
              })
            : api.POST('/api/workplaces/{workplaceId}/time-off/{timeOffId}/refuse', {
                params: { path: { ...path, timeOffId } },
              }),
        ),
      onSuccess: refresh,
    }),
  };
}

/** "Mon, Dec 14 to Sun, Dec 20", or "From Mon, Dec 14, no end date" (BL-01). */
export function timeOffDays(
  firstDay: string,
  lastDay: string | null | undefined,
  t: TFunction,
  language: string,
) {
  const first = formatShortDate(firstDay, language);
  return lastDay
    ? t('timeOff.days', { first, last: formatShortDate(lastDay, language) })
    : t('timeOff.daysOpen', { first });
}

/** Whole days from the first to the last, both included. */
export function dayCount(firstDay: string, lastDay: string): number {
  return (
    Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1
  );
}
