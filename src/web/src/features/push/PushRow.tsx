import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/toast-context';
import { messageKeyFor } from '../../i18n/errors';
import { ApiError } from '../../lib/api/client';
import { isPushOnHere, pushSupport, turnOffPush, turnOnPush, type PushSupport } from './push';

/**
 * "Push on this phone" (mockup 1g, M8-06). The permission prompt comes only from tapping the switch. On an
 * iPhone in Safari the row explains to add the app to the Home Screen first; when notifications are blocked
 * it says where to allow them, instead of a switch that would do nothing.
 */
export function PushRow({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'ready') return;
    let live = true;
    void isPushOnHere(userId).then((value) => {
      if (live) setOn(value);
    });
    return () => {
      live = false;
    };
  }, [support, userId]);

  async function change(next: boolean) {
    setBusy(true);
    setFailed(null);
    try {
      if (next) {
        const granted = await turnOnPush(userId);
        setOn(granted);
        if (granted) toast(t('push.onToast'));
        else setSupport(pushSupport());
      } else {
        await turnOffPush();
        setOn(false);
        toast(t('push.offToast'));
      }
    } catch (error) {
      // "Push isn't set up on this server yet" says more than "try again".
      setFailed(error instanceof ApiError ? t(messageKeyFor(error)) : t('push.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (support === 'install-first') {
    return (
      <div className="rounded-field bg-surface-3 px-4 py-3">
        <p className="text-[15px] font-bold">{t('push.label')}</p>
        <p className="text-xs text-muted">{t('push.installFirst')}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-bold">
          <li>{t('install.ios.share')}</li>
          <li>{t('install.ios.add')}</li>
          <li>{t('install.ios.open')}</li>
        </ol>
      </div>
    );
  }
  if (support === 'denied') {
    return (
      <div className="rounded-field bg-surface-3 px-4 py-3">
        <p className="text-[15px] font-bold">{t('push.label')}</p>
        <p className="text-xs text-muted">{t('push.denied')}</p>
      </div>
    );
  }
  return (
    <div>
      <Switch
        label={t('push.label')}
        description={support === 'unsupported' ? t('push.unsupported') : t('push.description')}
        checked={on}
        disabled={support === 'unsupported' || busy}
        onCheckedChange={(next) => void change(next)}
      />
      {failed && (
        <p role="alert" className="mt-1 px-1 text-sm font-bold text-danger">
          {failed}
        </p>
      )}
    </div>
  );
}
