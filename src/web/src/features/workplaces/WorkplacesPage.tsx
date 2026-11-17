import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import { fieldErrors } from '../identity/fieldErrors';
import { useMe, useSignOut } from '../identity/session';
import { rememberWorkplace } from './workplace';

export const joinCodeLength = 10;

// Mockup 1v. The code is 10 characters (FR-033), so it is one field, not the mockup's row of six boxes
// (known conflict 3). `/join/:code` pre-fills it (M2-11).
export function WorkplacesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe().data;
  const signOut = useSignOut();
  const [code, setCode] = useState(useParams().code?.toUpperCase() ?? '');
  const workplaces = useQuery({
    queryKey: ['workplaces'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/workplaces', { signal })),
  });

  function open(workplaceId: string) {
    rememberWorkplace(workplaceId);
    void navigate('/');
  }

  const join = useMutation({
    mutationFn: () => unwrap(api.POST('/api/workplaces/join', { body: { code } })),
    onSuccess: async (joined) => {
      await client.invalidateQueries({ queryKey: ['workplaces'] });
      open(joined.workplaceId);
    },
  });
  const errors = fieldErrors(join.error, t);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.trim().length === joinCodeLength) join.mutate();
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-10">
      <header className="flex items-center justify-between">
        <div className="quart-blob flex h-14 w-16 items-center justify-center">
          <span className="font-display text-lg text-white">{t('app.name')}</span>
        </div>
        <button
          type="button"
          className="min-h-11 px-2 text-sm font-bold text-link"
          onClick={() => signOut.mutate(undefined, { onSuccess: () => void navigate('/sign-in') })}
        >
          {t('workplaces.signOut')}
        </button>
      </header>
      <main id="main">
        <h1 className="mt-6 text-[32px] leading-[1.1]">
          {t('workplaces.hello', { name: me?.displayName ?? '' })}
        </h1>
        <p className="mt-1 text-[15px] text-muted">{t('workplaces.pick')}</p>

        <h2 className="mt-6 mb-3 text-[17px]">{t('workplaces.yours')}</h2>
        {workplaces.isPending && <Skeleton className="h-20" />}
        {workplaces.data?.length === 0 && <p className="text-sm text-muted">{t('workplaces.none')}</p>}
        <ul className="flex flex-col gap-3">
          {workplaces.data?.map((workplace) => (
            <li key={workplace.workplaceId}>
              <Card className="flex items-center gap-3 p-4">
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-chip bg-opening text-lg font-bold text-on-primary"
                >
                  {workplace.name[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold">{workplace.name}</p>
                  <p className="text-sm text-muted">
                    {t(`roles.${workplace.role as 'owner' | 'admin' | 'employee'}`)}
                  </p>
                </div>
                <Button
                  onClick={() => open(workplace.workplaceId)}
                  aria-label={t('workplaces.openNamed', { name: workplace.name })}
                >
                  {t('workplaces.open')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-[17px]">{t('workplaces.joinTitle')}</h2>
        <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
          <TextField
            label={t('workplaces.code')}
            hint={t('workplaces.codeHint', { count: joinCodeLength })}
            name="join-code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={joinCodeLength}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
            error={errors.code}
            className="[&_input]:font-display [&_input]:tracking-[0.2em]"
          />
          <FormError message={errors.form} />
          <Button
            type="submit"
            loading={join.isPending}
            disabled={code.length !== joinCodeLength}
            className="w-full"
          >
            {t('workplaces.join')}
          </Button>
        </form>

        {me?.isPlatformAdmin && <CreateWorkplace />}
      </main>
    </div>
  );
}

/** Only the platform admin sees this (FR-032). The answer is the single-use owner invitation link (FR-042). */
function CreateWorkplace() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const create = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/workplaces', { body: { name, address, timeZone: 'America/Toronto' } })),
  });
  const errors = fieldErrors(create.error, t);
  const link = create.data
    ? `${globalThis.location.origin}/owner-invitation?token=${create.data.invitationToken}`
    : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() !== '') create.mutate();
  }

  return (
    <section className="mt-8">
      <h2 className="text-[17px]">{t('workplaces.create.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('workplaces.create.text')}</p>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
        <TextField
          label={t('workplaces.create.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <TextField
          label={t('workplaces.create.address')}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <FormError message={errors.form} />
        <Button type="submit" variant="white" loading={create.isPending} className="w-full">
          {t('workplaces.create.submit')}
        </Button>
      </form>
      {link && (
        <Card role="status" className="mt-4">
          <p className="text-sm font-bold">{t('workplaces.create.done')}</p>
          <p className="mt-2 text-sm break-all select-all">{link}</p>
        </Card>
      )}
    </section>
  );
}

/** Where the owner invitation link lands (FR-042): whoever accepts it, signed in, becomes the owner. */
export function OwnerInvitationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const token = new URLSearchParams(globalThis.location.search).get('token') ?? '';
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST('/api/workplaces/owner-invitations/accept', { body: { token } })),
    onSuccess: async (joined) => {
      await client.invalidateQueries({ queryKey: ['workplaces'] });
      rememberWorkplace(joined.workplaceId);
      void navigate('/');
    },
  });
  const errors = fieldErrors(accept.error, t);

  return (
    <div className="mx-auto min-h-dvh max-w-md px-6 pt-[calc(2rem+env(safe-area-inset-top))]">
      <main id="main">
        <h1 className="text-[28px] leading-tight">{t('workplaces.invitation.title')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('workplaces.invitation.text')}</p>
        <FormError message={errors.token ?? errors.form} />
        <Button className="mt-6 w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
          {t('workplaces.invitation.accept')}
        </Button>
      </main>
    </div>
  );
}
