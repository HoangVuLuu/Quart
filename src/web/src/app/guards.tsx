import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../features/identity/session';
import { ToastProvider } from '../ui/Toast';

/** Signed-out people go to the log-in screen and come back to where they were heading (M2-04). */
export function RequireSession() {
  const me = useMe();
  const location = useLocation();
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

/** Full-screen pages still show toasts, like the tabs do. */
export function WithToasts() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
