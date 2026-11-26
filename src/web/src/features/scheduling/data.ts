import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { useWorkplace } from '../workplaces/workplace';

export type PeriodSummary = Schemas['PeriodSummary'];
export type NextPeriod = Schemas['NextPeriod'];
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

/**
 * "Clear them and open period" (M4-01, 2026-11-23): drops the day changes saved before <since>, the ones the last
 * period used, and keeps any saved since.
 */
export function useClearOldDayChanges() {
  const { id } = useWorkplace();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (since: string) => {
      const path = { params: { path: { workplaceId: id } } };
      const saved = await unwrap(api.GET('/api/workplaces/{workplaceId}/generator/days', path));
      const kept = (saved.changes ?? []).filter(
        (change) => !change.savedAt || Date.parse(change.savedAt) >= Date.parse(since),
      );
      await unwrap(
        api.PUT('/api/workplaces/{workplaceId}/generator/days', { ...path, body: { changes: kept } }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['workplace', id, 'generator', 'days'] }),
  });
}

/** "Reuse a past schedule" (FR-124): the published periods before this one, newest first. */
export function useReuseSources(periodId: string, enabled: boolean) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'reuse', periodId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/draft/reuse', {
          params: { path: { workplaceId: id, periodId } },
          signal,
        }),
      ),
    enabled,
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
      mutationFn: ({
        shiftIds,
        desiredWeeklyHours,
        shiftNotes,
      }: {
        shiftIds: string[];
        desiredWeeklyHours: number;
        /** FR-103a: the notes of chosen shifts. */
        shiftNotes: { shiftId: string; note: string }[];
      }) =>
        unwrap(
          api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/availability/me/send', {
            params: { path },
            body: { shiftIds, desiredWeeklyHours, shiftNotes },
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
    // FR-124: a past period's people as the starting point, like Generate.
    reuse: useMutation({
      mutationFn: (sourcePeriodId: string) =>
        unwrap(api.POST(`${base}/reuse`, { params: { path }, body: { sourcePeriodId } })),
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
    // FR-145: the manager's note on a shift; the team sees it once published or updated.
    note: useMutation({
      mutationFn: ({ shiftId, note }: { shiftId: string; note: string }) =>
        unwrap(
          api.PUT(`${base}/shifts/{shiftId}/note`, {
            params: { path: { ...path, shiftId } },
            body: { note },
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
    // Tapping a person on the shift: they start earlier, and their name shows in red (Hoang, 2026-11-25).
    early: useMutation({
      mutationFn: (target: { shiftId: string; membershipId: string; startsEarly: boolean }) =>
        unwrap(
          api.PUT(`${base}/assignments/{shiftId}/{membershipId}/early`, {
            params: { path: { ...path, shiftId: target.shiftId, membershipId: target.membershipId } },
            body: { startsEarly: target.startsEarly },
          }),
        ),
      onSuccess: show,
    }),
    publish: useMutation({
      mutationFn: (confirmed: boolean) =>
        unwrap(api.POST(`${base}/publish`, { params: { path }, body: { confirmed } })),
      onSuccess: refresh,
    }),
    // 4.3: Save draft, Clear, and leaving the page. Leaving drops unsaved changes on the server.
    save: useMutation({
      mutationFn: () => unwrap(api.POST(`${base}/save`, { params: { path } })),
      onSuccess: async (draft) => {
        await refresh();
        show(draft);
      },
    }),
    clear: useMutation({
      mutationFn: () => unwrap(api.POST(`${base}/clear`, { params: { path } })),
      onSuccess: show,
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
 * The deadline offered when a period is opened (FR-091): 48 hours before it starts, so the Saturday at
 * 00:00 (2026-11-20); the day before when that is too soon, or tomorrow for a period that has already
 * started. The manager can change it.
 */
export function suggestedDueDate(startDate: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return '';
  const two = addDays(startDate, -2);
  if (two > today) return two;
  const one = addDays(startDate, -1);
  return one > today ? one : addDays(today, 1);
}

export function mondayOnOrAfter(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}

/**
 * The open Building or Editing Schedule page's sign of life (4.3). A 409 means the visit already ended
 * (the page went quiet for over two minutes and someone needed availability), so its unsaved work is gone.
 */
export function sendHeartbeat(workplaceId: string, periodId: string) {
  return api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/draft/heartbeat', {
    params: { path: { workplaceId, periodId } },
  });
}

/**
 * Leaving Building or Editing Schedule. Sent with keepalive so it still reaches the server when the page
 * is being closed; if it never arrives, the missing signs of life end the visit the same way.
 */
export function leaveBuilding(workplaceId: string, periodId: string) {
  return api.POST('/api/workplaces/{workplaceId}/periods/{periodId}/draft/leave', {
    params: { path: { workplaceId, periodId } },
    keepalive: true,
  });
}

/** Cancels a period for good: everything in it is deleted and the people in it are told (2026-11-18). */
export function useCancelPeriod() {
  const { id } = useWorkplace();
  return useMutation({
    mutationFn: (periodId: string) =>
      unwrap(
        api.DELETE('/api/workplaces/{workplaceId}/periods/{periodId}', {
          params: { path: { workplaceId: id, periodId } },
        }),
      ),
  });
}

/** A published period can be cancelled only before its first day, in the browser's own calendar. */
export function hasStarted(period: PeriodSummary): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return period.startDate <= today;
}

/** One person's sent availability, read-only, for a manager (2026-11-18). */
export function usePersonAvailability(periodId: string, membershipId: string) {
  const { id } = useWorkplace();
  return useQuery({
    queryKey: ['workplace', id, 'availability', periodId, 'person', membershipId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/availability/{membershipId}', {
          params: { path: { workplaceId: id, periodId, membershipId } },
          signal,
        }),
      ),
    retry: false,
  });
}
