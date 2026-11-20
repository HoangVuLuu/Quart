import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { PasswordField, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { meKey } from '../identity/session';
import { fieldErrors } from '../identity/fieldErrors';
import { minPasswordLength } from '../identity/SignUpPage';

/**
 * "Change password" from the account rows of mockup 1g (M2-07). The current password is asked every
 * time; the server signs out every other device and emails the address on file.
 */
export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/me/password', { body: { currentPassword: current, newPassword: password } })),
    onSuccess: () => {
      toast(t('profile.changePassword.done'));
      close();
    },
  });
  const errors = fieldErrors(change.error, t);
  const tooShort = password !== '' && password.length < minPasswordLength;
  const differ = confirm !== '' && confirm !== password;

  function close() {
    setCurrent('');
    setPassword('');
    setConfirm('');
    change.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (current !== '' && password.length >= minPasswordLength && confirm === password) change.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('profile.changePassword.title')}
      description={t('profile.changePassword.text')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <PasswordField
          label={t('profile.changePassword.current')}
          name="current-password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={errors.currentPassword}
        />
        <PasswordField
          label={t('profile.changePassword.new')}
          name="new-password"
          autoComplete="new-password"
          required
          hint={t('auth.passwordHint', { count: minPasswordLength })}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={tooShort ? t('errors.auth.password_too_short') : errors.newPassword}
        />
        <PasswordField
          label={t('auth.confirmPassword')}
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={differ ? t('auth.errors.passwordsDiffer') : undefined}
        />
        <FormError message={errors.form} />
        <Button type="submit" loading={change.isPending} className="w-full">
          {t('profile.changePassword.save')}
        </Button>
      </form>
    </Sheet>
  );
}

/**
 * The Email row of mockup 1g opens this (M2-07). A link goes to the new address; nothing changes until it
 * is opened. The answer is the same whether or not the address is free, so it never says which.
 */
export function ChangeEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const change = useMutation({
    mutationFn: () => unwrap(api.POST('/api/me/email', { body: { email, currentPassword: current } })),
  });
  const errors = fieldErrors(change.error, t);

  function close() {
    setEmail('');
    setCurrent('');
    change.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() !== '' && current !== '') change.mutate();
  }

  if (change.isSuccess) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => !next && close()}
        title={t('profile.changeEmail.sentTitle')}
        description={t('profile.changeEmail.sentText', { email: email.trim() })}
      >
        <Button variant="white" className="w-full" onClick={close}>
          {t('profile.changeEmail.close')}
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('profile.changeEmail.title')}
      description={t('profile.changeEmail.text')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('profile.changeEmail.new')}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <PasswordField
          label={t('profile.changeEmail.current')}
          name="current-password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={errors.currentPassword}
        />
        <FormError message={errors.form} />
        <Button type="submit" loading={change.isPending} className="w-full">
          {t('profile.changeEmail.send')}
        </Button>
      </form>
    </Sheet>
  );
}

/**
 * Mockup 1g-del (M2-16, FR-009): the person types their own email to confirm. An owner is refused by the
 * server until ownership can be handed over; the message says so. On success every cached answer is
 * dropped, since they belonged to an account that no longer exists.
 */
export function DeleteAccountSheet({
  open,
  email,
  onClose,
  onDeleted,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => unwrap(api.POST('/api/me/delete', { body: { email: typed } })),
    onSuccess: () => {
      client.clear();
      client.setQueryData(meKey, null);
      onDeleted();
    },
  });
  const errors = fieldErrors(remove.error, t);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  function close() {
    setTyped('');
    remove.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches) remove.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('profile.deleteAccount.title')}
      description={t('profile.deleteAccount.text')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('profile.deleteAccount.typeEmail')}
          name="confirm-email"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={email}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          error={errors.email}
        />
        <FormError message={errors.form} />
        <Button
          type="submit"
          variant="danger"
          disabled={!matches}
          loading={remove.isPending}
          className="w-full"
        >
          {t('profile.deleteAccount.confirm')}
        </Button>
        <Button type="button" variant="white" className="w-full" onClick={close}>
          {t('team.remove.cancel')}
        </Button>
      </form>
    </Sheet>
  );
}
