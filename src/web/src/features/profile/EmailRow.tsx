import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { api, unwrap } from '../../lib/api/client';
import { Skeleton } from '../../ui/Skeleton';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/toast-context';
import { useWorkplace } from '../workplaces/workplace';

/**
 * "Email" in Profile (mockup 1g, M8-07): on until the person turns it off, with or without push (Hoang,
 * 2026-11-22). The choice is for this workplace. Alerts in the app are always on.
 */
export function EmailRow() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { id } = useWorkplace();
  const key = ['workplace', id, 'notification-settings'];
  const settings = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/notifications/settings', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
  });
  const change = useMutation({
    mutationFn: (email: boolean) =>
      unwrap(
        api.PUT('/api/workplaces/{workplaceId}/notifications/settings', {
          params: { path: { workplaceId: id } },
          body: { email },
        }),
      ),
    onSuccess: (saved) => {
      client.setQueryData(key, saved);
      toast(saved.email ? t('notificationSettings.emailOn') : t('notificationSettings.emailOff'));
    },
  });

  // Without a connection the row waits for the next visit rather than showing a switch that cannot save.
  if (settings.error) return null;
  if (!settings.data) return <Skeleton className="h-14" />;
  return (
    <div>
      <Switch
        label={t('notificationSettings.email')}
        description={t('notificationSettings.emailDescription')}
        checked={change.isPending ? (change.variables ?? settings.data.email) : settings.data.email}
        disabled={change.isPending}
        onCheckedChange={(next) => change.mutate(next)}
      />
      {change.error && (
        <p role="alert" className="mt-1 px-1 text-sm font-bold text-danger">
          {t(messageKeyFor(change.error))}
        </p>
      )}
    </div>
  );
}
