import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { useWorkplace } from '../workplaces/workplace';

export type PeriodSummary = Schemas['PeriodSummary'];
export type MyAvailability = Schemas['MyAvailability'];
export type DraftView = Schemas['DraftView'];
export type DraftShift = Schemas['DraftShift'];
export type DraftPerson = Schemas['DraftPerson'];
export type DraftIssue = Schemas['DraftIssue'];
export type ScheduleView = Schemas['ScheduleView'];
export type ScheduleShift = Schemas['ScheduleShift'];
export type ShiftPart = 'opening' | 'closing' | 'mid' | 'only';

/** The published period that is running or coming up, and the next one still being prepared. */
export function useCurrentPeriods() {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'periods', 'current'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/current', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
  });
}

/** Everything about the workplace's periods is refetched after a change: cheap at 15 people, and never stale. */
export function useRefreshWorkplace() {
  const { id } = useWorkplace();
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['workplace', id] });
}

export function useCreatePeriod() {
  const { id } = useWorkplace();
  const refresh = useRefreshWorkplace();
  return useMutation({
    mutationFn: (body: Schemas['CreatePeriodRequest']) =>
      unwrap(
        api.POST('/api/workplaces/{workplaceId}/periods', { params: { path: { workplaceId: id } }, body }),
      ),
    onSuccess: refresh,
  });
}

export function usePublishedSchedule(periodId: string | undefined) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'schedule', periodId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/schedule', {
          params: { path: { workplaceId: id, periodId: periodId ?? '' } },
          signal,
        }),
      ),
    enabled: periodId !== undefined,
  });
}

export function useMyAvailability(periodId: string | undefined) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'availability', periodId, 'me'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/availability/me', {
          params: { path: { workplaceId: id, periodId: periodId ?? '' } },
          signal,
        }),
      ),
    enabled: periodId !== undefined,
  });
}

export function useAvailabilityActions(periodId: string) {
  const { id } = useWorkplace();
  const refresh = useRefreshWorkplace();
  const path = { workplaceId: id, periodId };
  return {
    send: useMutation({
      mutationFn: (shiftIds: string[]) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/availability/me/send', {
            params: { path },
            body: { shiftIds },
          }),
        ),
      onSuccess: refresh,
    }),
    addNote: useMutation({
      mutationFn: (body: string) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/availability/me/notes', {
            params: { path },
            body: { body },
          }),
        ),
      onSuccess: refresh,
    }),
    previous: useMutation({
      mutationFn: () =>
        unwrap(
          api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/availability/me/previous', {
            params: { path },
          }),
        ),
    }),
  };
}

export function useTeamAvailability(periodId: string | undefined) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'availability', periodId, 'team'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/availability', {
          params: { path: { workplaceId: id, periodId: periodId ?? '' } },
          signal,
        }),
      ),
    enabled: periodId !== undefined,
  });
}

export function useTeamAvailabilityActions(periodId: string) {
  const { id } = useWorkplace();
  const refresh = useRefreshWorkplace();
  const path = { workplaceId: id, periodId };
  return {
    remind: useMutation({
      mutationFn: (membershipId: string | null) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/availability/remind', {
            params: { path },
            body: { membershipId },
          }),
        ),
    }),
    reopen: useMutation({
      mutationFn: (membershipId: string) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/availability/{membershipId}/reopen', {
            params: { path: { ...path, membershipId } },
          }),
        ),
      onSuccess: refresh,
    }),
  };
}

export const draftKey = (workplaceId: string, periodId: string | undefined) =>
  ['workplace', workplaceId, 'draft', periodId] as const;

export function useDraft(periodId: string | undefined, enabled = true) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: draftKey(id, periodId),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/draft', {
          params: { path: { workplaceId: id, periodId: periodId ?? '' } },
          signal,
        }),
      ),
    enabled: enabled && periodId !== undefined,
  });
}

/** Every change to the draft answers with the whole draft, issues included, so the screen updates at once (M5-02). */
export function useDraftActions(periodId: string) {
  const { id } = useWorkplace();
  const client = useQueryClient();
  const refresh = useRefreshWorkplace();
  const path = { workplaceId: id, periodId };
  const show = (draft: DraftView) => client.setQueryData(draftKey(id, periodId), draft);
  const base = '/api/workplaces/{workplaceId}/periods/{periodId}/draft';
  return {
    start: useMutation({
      mutationFn: () => unwrap(api.POST(`${base}/start`, { params: { path } })),
      onSuccess: async (draft) => {
        await refresh();
        show(draft);
      },
    }),
    generate: useMutation({
      mutationFn: (seed: number | null) =>
        unwrap(api.POST(`${base}/generate`, { params: { path }, body: { seed } })),
      onSuccess: async (draft) => {
        await refresh();
        show(draft);
      },
    }),
    add: useMutation({
      mutationFn: (body: Schemas['AssignRequest']) =>
        unwrap(api.POST(`${base}/assignments`, { params: { path }, body })),
      onSuccess: show,
    }),
    remove: useMutation({
      mutationFn: (target: { shiftId: string; membershipId: string }) =>
        unwrap(
          api.DELETE(`${base}/assignments/{shiftId}/{membershipId}`, {
            params: { path: { ...path, ...target } },
          }),
        ),
      onSuccess: show,
    }),
    keep: useMutation({
      mutationFn: (target: { shiftId: string; membershipId: string; locked: boolean }) =>
        unwrap(
          api.PUT(`${base}/assignments/{shiftId}/{membershipId}/lock`, {
            params: { path: { ...path, shiftId: target.shiftId, membershipId: target.membershipId } },
            body: { locked: target.locked },
          }),
        ),
      onSuccess: show,
    }),
    publish: useMutation({
      mutationFn: (confirmed: boolean) =>
        unwrap(api.POST(`${base}/publish`, { params: { path }, body: { confirmed } })),
      onSuccess: refresh,
    }),
  };
}

/** Which week of the period a date falls in, counting from 0. */
export function weekOf(period: PeriodSummary, date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${period.startDate}T00:00:00Z`)) / 86_400_000;
  return Math.floor(days / 7);
}

/** Shifts grouped by day, in order: what every schedule screen lists. */
export function byDay<T extends { date: string }>(shifts: T[]): { date: string; shifts: T[] }[] {
  const days = new Map<string, T[]>();
  for (const shift of shifts) days.set(shift.date, [...(days.get(shift.date) ?? []), shift]);
  return [...days.entries()].map(([date, items]) => ({ date, shifts: items }));
}

/** The Monday on or after a date, as "yyyy-mm-dd": periods start on a Monday (FR-090). */
/** A calendar date moved by whole days, as "yyyy-mm-dd". */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * The deadline offered when a period is opened (FR-091): three days before it starts, the day before when
 * that is too soon, or tomorrow for a period that has already started. The manager can change it.
 */
export function suggestedDueDate(startDate: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return '';
  const three = addDays(startDate, -3);
  if (three > today) return three;
  const one = addDays(startDate, -1);
  return one > today ? one : addDays(today, 1);
}

export function mondayOnOrAfter(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}
