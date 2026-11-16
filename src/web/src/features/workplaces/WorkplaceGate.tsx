import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { ApiError, api, unwrap } from '../../lib/api/client';
import { Skeleton } from '../../ui/Skeleton';
import {
  rememberedWorkplace,
  rememberWorkplace,
  WorkplaceContext,
  workplaceKey,
  type WorkplaceView,
} from './workplace';

export function WorkplaceProvider({ view, children }: { view: WorkplaceView; children: ReactNode }) {
  const permissions = new Set(view.me.permissions);
  return (
    <WorkplaceContext.Provider
      value={{ id: view.id, view, can: (permission) => permissions.has(permission) }}
    >
      {children}
    </WorkplaceContext.Provider>
  );
}

/** Lets its screens render once a workplace is chosen and still open to the person; otherwise sends them to pick one. */
export function WorkplaceGate() {
  const id = rememberedWorkplace();
  const query = useQuery({
    queryKey: workplaceKey(id ?? 'none'),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}', { params: { path: { workplaceId: id ?? '' } }, signal }),
      ),
    enabled: id !== null,
    retry: false,
  });

  if (id === null) return <Navigate to="/workplaces" replace />;
  if (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) {
    // Removed from the workplace, or it never existed: access ends on the next request (M2-15).
    rememberWorkplace(null);
    return <Navigate to="/workplaces" replace />;
  }
  if (query.error) throw query.error;
  if (!query.data) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <WorkplaceProvider view={query.data}>
      <Outlet />
    </WorkplaceProvider>
  );
}
