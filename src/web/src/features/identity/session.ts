import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, unwrap, type Schemas } from '../../lib/api/client';
import { forgetOfflineCopies } from '../../lib/connection';
import { forgetPushHere } from '../push/push';

export type Me = Schemas['Me'];

export const meKey = ['me'] as const;

/** The signed-in account, or null when nobody is signed in. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async ({ signal }): Promise<Me | null> => {
      try {
        return await unwrap(api.GET('/api/me', { signal }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['SignInRequest']) => unwrap(api.POST('/api/auth/sign-in', { body })),
    onSuccess: (me) => {
      // Nothing cached for a previous account may leak into this one.
      client.clear();
      forgetOfflineCopies();
      client.setQueryData(meKey, me);
    },
  });
}

export function useSignOut(everywhere = false) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Before the session ends: this browser stops showing the person's alerts (M8-06).
      await forgetPushHere();
      return unwrap(everywhere ? api.POST('/api/auth/sign-out-everywhere') : api.POST('/api/auth/sign-out'));
    },
    onSuccess: () => {
      client.clear();
      forgetOfflineCopies();
      client.setQueryData(meKey, null);
    },
  });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Schemas['UpdateMeRequest']>) =>
      unwrap(api.PATCH('/api/me', { body: { displayName: null, language: null, ...body } })),
    onSuccess: (me, body) => {
      client.setQueryData(meKey, me);
      // Teammates' views show the name and the links: the team page and schedules would keep the old ones
      // until they went stale (2026-11-23).
      if (body.displayName != null || body.instagram != null || body.facebook != null) {
        void client.invalidateQueries({ queryKey: ['workplace'] });
      }
    },
  });
}

/** The two-letter initials shown in avatars: "Sophie Lapointe" gives "SL". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((part) => part?.[0] ?? '')
    .join('')
    .toUpperCase();
}
