import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { languages, type Language } from '../../i18n';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { chooseTheme, currentTheme } from '../../lib/theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { Icon } from '../../ui/Icon';
import { FormError } from '../identity/FormError';
import { initialsOf, useMe, useSignOut, useUpdateMe } from '../identity/session';
import { useRefreshWorkplace } from '../scheduling/data';
import { ChangeEmailSheet, ChangePasswordSheet, DeleteAccountSheet } from './AccountSheets';
import { rememberWorkplace, useWorkplace } from '../workplaces/workplace';

function GroupLabel({ children }: { children: string }) {
  return <h2 className="mt-2 px-1 text-xs font-bold tracking-[0.06em] text-muted uppercase">{children}</h2>;
}

const rowLink =
  'flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 font-bold last:border-b-0';

// Mockups 1g (staff) and 1o (admins). Staff change their own wanted hours from the "Edit" link, as on
// 1g (FR-037). The Email row and "Change password" open sheets (M2-07). Email and push switches, Google
// Calendar and deleting the account arrive with M2-16, M8 and M9.
export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { id, view, can } = useWorkplace();
  const me = useMe().data;
  const updateMe = useUpdateMe();
  const signOut = useSignOut();
  const signOutEverywhere = useSignOut(true);
  const refresh = useRefreshWorkplace();
  const [dark, setDark] = useState(currentTheme() === 'dark');
  const [accountSheet, setAccountSheet] = useState<'email' | 'password' | 'delete' | null>(null);
  const [name, setName] = useState(me?.displayName ?? '');
  const [leaving, setLeaving] = useState(false);
  const path = { workplaceId: id };

  const updateMember = useMutation({
    mutationFn: (worksShifts: boolean) =>
      unwrap(
        api.PATCH('/api/workplaces/{workplaceId}/members/{membershipId}', {
          params: { path: { ...path, membershipId: view.me.membershipId } },
          body: {
            level: null,
            worksShifts,
            maxWeeklyHours: null,
            clearMaxWeeklyHours: null,
          },
        }),
      ),
    onSuccess: refresh,
  });
  const updateSettings = useMutation({
    mutationFn: (body: Partial<Schemas['UpdateSettingsRequest']>) =>
      unwrap(
        api.PATCH('/api/workplaces/{workplaceId}/settings', {
          params: { path },
          body: { claimsNeedApproval: null, tradesNeedApproval: null, ...body },
        }),
      ),
    onSuccess: refresh,
  });
  const regenerate = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/workplaces/{workplaceId}/join-code/regenerate', { params: { path } })),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => unwrap(api.POST('/api/workplaces/{workplaceId}/leave', { params: { path } })),
    onSuccess: () => {
      rememberWorkplace(null);
      void navigate('/workplaces');
    },
  });
  // The "works shifts" refusal is shown beside its switch, where the tap happened.
  const error = updateMe.error ?? updateSettings.error ?? regenerate.error ?? leave.error;
  if (!me) return null;

  function changeLanguage(language: Language) {
    void i18n.changeLanguage(language);
    // Remembered on the account, so emails and every other device follow (FR-261).
    updateMe.mutate({ language });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(view.joinCode ?? '');
      toast(t('profile.codeCopied'));
    } catch {
      // Clipboard access can be refused; the code is on screen to type by hand.
    }
  }

  return (
    <section className="flex flex-col gap-3 px-5">
      <PageHeader title={t('profile.title')} />

      <div className="flex items-center gap-4 rounded-hero bg-primary p-5 text-on-primary">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink"
        >
          {initialsOf(me.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{me.fullName}</p>
          <p className="text-sm font-bold">
            {view.me.role === 'employee'
              ? t('team.barista', { level: view.me.level })
              : `${t(`roles.${view.me.role as 'owner' | 'admin'}`)} · ${t('scheduling.level', { level: view.me.level })}`}
          </p>
          <p className="text-sm">{view.name}</p>
        </div>
      </div>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />

      {/* Levels are for managers only (3.1); the hours a person wants come with their availability (1.1). */}
      {view.me.worksShifts && view.me.level != null && (
        <Card>
          <h2 className="text-sm font-bold text-muted">{t('profile.level')}</h2>
          <p className="mt-1 text-2xl font-bold">{view.me.level}</p>
          <p className="text-xs text-muted">{t('profile.levelHint')}</p>
        </Card>
      )}

      {can('ManageLevels') && (
        <Card className="p-3">
          <Switch
            label={t('profile.worksShifts')}
            description={t('profile.worksShiftsText')}
            checked={view.me.worksShifts}
            disabled={updateMember.isPending}
            onCheckedChange={(worksShifts) => updateMember.mutate(worksShifts)}
          />
          <FormError message={updateMember.error ? t(messageKeyFor(updateMember.error)) : undefined} />
        </Card>
      )}

      {can('ManageWorkplace') && (
        <>
          <GroupLabel>{t('profile.workplace')}</GroupLabel>
          <Card className="py-2">
            <div className={rowLink}>
              <div>
                <p>{t('profile.joinCode')}</p>
                <p className="text-xs font-bold text-muted">{t('profile.joinCodeText')}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyCode()}
                aria-label={t('profile.copyCode', { code: view.joinCode })}
                className="min-h-11 font-display tracking-[0.1em]"
              >
                {view.joinCode} <span aria-hidden="true">⧉</span>
              </button>
            </div>
            <Link to="/team" className={rowLink}>
              <span>
                {t('profile.members')}
                <span className="block text-xs text-muted">
                  {t('team.count', { count: view.memberCount })}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
            {can('ManageTemplate') && (
              <Link to="/generator" className={rowLink}>
                <span>
                  {t('schedule.editGenerator')}
                  <span className="block text-xs text-muted">{t('profile.generatorText')}</span>
                </span>
                <Icon name="pen" />
              </Link>
            )}
            <Button
              variant="white"
              className="my-2 min-h-11 px-4 text-sm"
              loading={regenerate.isPending}
              onClick={() =>
                regenerate.mutate(undefined, { onSuccess: () => toast(t('profile.codeChanged')) })
              }
            >
              {t('profile.newCode')}
            </Button>
          </Card>
          <Card className="flex flex-col gap-2 p-3">
            <Switch
              label={t('profile.claimsApproval')}
              description={t('profile.claimsApprovalText')}
              checked={view.claimsNeedApproval}
              disabled={updateSettings.isPending}
              onCheckedChange={(claimsNeedApproval) => updateSettings.mutate({ claimsNeedApproval })}
            />
            <Switch
              label={t('profile.tradesApproval')}
              description={t('profile.tradesApprovalText')}
              checked={view.tradesNeedApproval}
              disabled={updateSettings.isPending}
              onCheckedChange={(tradesNeedApproval) => updateSettings.mutate({ tradesNeedApproval })}
            />
          </Card>
        </>
      )}

      <GroupLabel>{t('profile.preferences')}</GroupLabel>
      <Card className="flex flex-col gap-3">
        <Select
          label={t('profile.language')}
          value={i18n.resolvedLanguage}
          onChange={(event) => changeLanguage(event.target.value as Language)}
        >
          {languages.map((language) => (
            <option key={language} value={language} lang={language}>
              {t(`profile.languages.${language}`)}
            </option>
          ))}
        </Select>
        <Switch
          label={t('profile.dark')}
          description={t('profile.darkText')}
          checked={dark}
          onCheckedChange={(on) => {
            setDark(on);
            chooseTheme(on ? 'dark' : 'light');
          }}
        />
        <div className="flex items-end gap-2">
          <TextField
            label={t('profile.shortName')}
            hint={t('profile.shortNameHint')}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            variant="white"
            className="mb-6"
            disabled={name.trim() === '' || name === me.displayName}
            loading={updateMe.isPending}
            onClick={() =>
              updateMe.mutate({ displayName: name }, { onSuccess: () => toast(t('profile.saved')) })
            }
          >
            {t('profile.save')}
          </Button>
        </div>
      </Card>

      <GroupLabel>{t('profile.account')}</GroupLabel>
      <Card className="py-2">
        <button type="button" className={`${rowLink} w-full`} onClick={() => setAccountSheet('email')}>
          <span>{t('auth.email')}</span>
          <span className="min-w-0 truncate text-sm text-muted">{me.email}</span>
        </button>
        <button type="button" className={`${rowLink} w-full`} onClick={() => setAccountSheet('password')}>
          <span>{t('profile.changePassword.row')}</span>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className={`${rowLink} w-full`}
          onClick={() => {
            rememberWorkplace(null);
            void navigate('/workplaces');
          }}
        >
          <span>{t('profile.switch')}</span>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className={`${rowLink} w-full`}
          onClick={() => signOutEverywhere.mutate(undefined, { onSuccess: () => void navigate('/sign-in') })}
        >
          <span>{t('profile.signOutEverywhere')}</span>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className={`${rowLink} w-full text-danger`}
          onClick={() => signOut.mutate(undefined, { onSuccess: () => void navigate('/sign-in') })}
        >
          {t('profile.signOut')}
        </button>
      </Card>
      <ChangeEmailSheet open={accountSheet === 'email'} onClose={() => setAccountSheet(null)} />
      <ChangePasswordSheet open={accountSheet === 'password'} onClose={() => setAccountSheet(null)} />
      {view.me.role !== 'owner' && (
        <Button variant="danger" onClick={() => setLeaving(true)}>
          {t('profile.leave')}
        </Button>
      )}
      <Button variant="danger" onClick={() => setAccountSheet('delete')}>
        {t('profile.deleteAccount.row')}
      </Button>
      <DeleteAccountSheet
        open={accountSheet === 'delete'}
        email={me.email}
        onClose={() => setAccountSheet(null)}
        onDeleted={() => {
          rememberWorkplace(null);
          toast(t('profile.deleteAccount.done'));
          void navigate('/sign-in');
        }}
      />
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('profile.leaveTitle', { workplace: view.name })}
        description={t('profile.leaveText')}
      >
        <div className="flex flex-col gap-2">
          <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>
            {t('profile.leave')}
          </Button>
          <Button variant="white" onClick={() => setLeaving(false)}>
            {t('team.remove.cancel')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
