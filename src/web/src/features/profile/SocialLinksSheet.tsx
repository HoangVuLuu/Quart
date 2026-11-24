import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { fieldErrors } from '../identity/fieldErrors';
import { useUpdateMe, type Me } from '../identity/session';

/**
 * Instagram and Facebook for the team page (FR-040, M2-18). Not drawn in the mockups: it reuses the
 * Change password sheet's shape (1g). Nothing shows to teammates until the switch is on.
 */
export function SocialLinksSheet({ me, open, onClose }: { me: Me; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateMe();
  const [instagram, setInstagram] = useState(me.instagram ?? '');
  const [facebook, setFacebook] = useState(me.facebook ?? '');
  const [share, setShare] = useState(me.shareSocialLinks);
  const errors = fieldErrors(update.error, t);

  function close() {
    setInstagram(me.instagram ?? '');
    setFacebook(me.facebook ?? '');
    setShare(me.shareSocialLinks);
    update.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { instagram: instagram.trim(), facebook: facebook.trim(), shareSocialLinks: share },
      {
        onSuccess: (saved) => {
          // The server keeps only the handle, so a pasted link comes back shorter.
          setInstagram(saved.instagram ?? '');
          setFacebook(saved.facebook ?? '');
          toast(t('profile.saved'));
          onClose();
        },
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('profile.social.title')}
      description={t('profile.social.text')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('profile.social.instagram')}
          placeholder={t('profile.social.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={instagram}
          onChange={(event) => setInstagram(event.target.value)}
          error={errors.instagram}
        />
        <TextField
          label={t('profile.social.facebook')}
          placeholder={t('profile.social.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={facebook}
          onChange={(event) => setFacebook(event.target.value)}
          error={errors.facebook}
        />
        <Switch
          label={t('profile.social.share')}
          description={t('profile.social.shareText')}
          checked={share}
          onCheckedChange={setShare}
        />
        <FormError message={errors.form} />
        <Button type="submit" loading={update.isPending} className="w-full">
          {t('profile.save')}
        </Button>
      </form>
    </Sheet>
  );
}
