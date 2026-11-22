import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api/client';
import { rememberWorkplace } from '../workplaces/workplace';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path inside the app, never another site: "/schedule", not "//evil.example" or "https://…". */
function insideTheApp(to: string | null): string {
  return to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : '/';
}

/**
 * Where a tapped push lands (M8-06): /open?workplace=…&notification=…&to=/schedule. It switches to the
 * alert's workplace, marks the alert read, as tapping it in Alerts would, and goes where the alert leads.
 */
export function OpenFromPush() {
  const [params] = useSearchParams();
  const workplace = params.get('workplace');
  const notification = params.get('notification');
  const valid = workplace !== null && uuid.test(workplace);
  if (valid) rememberWorkplace(workplace);

  useEffect(() => {
    if (!valid || !notification || !uuid.test(notification)) return;
    void api.POST('/api/workplaces/{workplaceId}/notifications/{notificationId}/read', {
      params: { path: { workplaceId: workplace, notificationId: notification } },
    });
  }, [valid, workplace, notification]);

  return <Navigate to={insideTheApp(params.get('to'))} replace />;
}
