import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import {
  dismissInstallHint,
  forgetInstallPrompt,
  installHintDismissed,
  isInstalled,
  isIos,
  pendingInstallPrompt,
  subscribeToInstallPrompt,
} from './install';

// Shown on Home until the app is on the home screen or the person says "not now" (NFR-012).
// Android and desktop Chrome get an Install button; iPhone gets the three steps, because Safari has no
// install prompt an app can open.
export function InstallCard() {
  const { t } = useTranslation();
  const prompt = useSyncExternalStore(subscribeToInstallPrompt, pendingInstallPrompt, () => null);
  const [hidden, setHidden] = useState(() => isInstalled() || installHintDismissed());
  const ios = isIos();
  if (hidden || (!prompt && !ios)) return null;

  function dismiss() {
    dismissInstallHint();
    setHidden(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // The event can be used once, whatever the answer.
    forgetInstallPrompt();
  }

  return (
    <Card aria-labelledby="install-title">
      <h2 id="install-title" className="text-[17px]">
        {t('install.title')}
      </h2>
      {ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-bold">
          <li>{t('install.ios.share')}</li>
          <li>{t('install.ios.add')}</li>
          <li>{t('install.ios.open')}</li>
        </ol>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('install.text')}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!ios && (
          <Button className="min-h-11 px-4 text-sm" onClick={() => void install()}>
            {t('install.install')}
          </Button>
        )}
        <Button variant="white" className="min-h-11 px-4 text-sm" onClick={dismiss}>
          {t('install.notNow')}
        </Button>
      </div>
    </Card>
  );
}
