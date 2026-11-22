import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../features/identity/session';
import { syncPush } from '../features/push/push';
import { ToastProvider } from '../ui/Toast';

/** Signed-out people go to the log-in screen and come back to where they were heading (M2-04). */
export function RequireSession() {
  const me = useMe();
  const location = useLocation();
  const userId = me.data?.id;
  // Once per signed-in start: this browser's push follows the person who turned it on (M8-06).
  useEffect(() => {
    if (userId) void syncPush(userId).catch(() => undefined);
  }, [userId]);
  if (me.isPending) return null;
  if (me.error) throw me.error;
  if (me.data === null) {
    return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

/** The signed-out screens make no sense to someone already signed in. */
export function SignedOutOnly() {
  const me = useMe();
  if (me.isPending) return null;
  return me.data ? <Navigate to="/workplaces" replace /> : <Outlet />;
}

/**
 * One toast area for the tabs and the full-screen pages alike, so a toast shown just before moving between
 * them ("Saved" in Edit Generator, then the Schedule tab) is not lost with the page that showed it.
 */
export function WithToasts() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
