import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { PasswordField, TextField } from '../../ui/TextField';
import { AuthLayout } from './AuthLayout';
import { FormError } from './FormError';
import { fieldErrors } from './fieldErrors';

export const minPasswordLength = 8;

// Mockup 1u: one full-name field, email, password twice (FR-001). "Continue with Google" arrives with M2-17.
export function SignUpPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const signUp = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/auth/sign-up', {
          body: { fullName, email, password, language: i18n.resolvedLanguage === 'en' ? 'en' : 'fr' },
        }),
      ),
    onSuccess: () => void navigate('/check-email', { state: { email } }),
  });
  const server = fieldErrors(signUp.error, t);
  // The same rules as the server, checked as the person types so most mistakes never leave the phone.
  const local = {
    fullName: touched && fullName.trim() === '' ? t('auth.errors.nameRequired') : undefined,
    email: touched && !/^\S+@\S+\.\S+$/.test(email.trim()) ? t('errors.auth.email_invalid') : undefined,
    password:
      password !== '' && password.length < minPasswordLength
        ? t('errors.auth.password_too_short')
        : touched && password === ''
          ? t('errors.auth.password_too_short')
          : undefined,
    confirm: confirm !== '' && confirm !== password ? t('auth.errors.passwordsDiffer') : undefined,
  };
  const valid =
    fullName.trim() !== '' &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    password.length >= minPasswordLength &&
    confirm === password;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (valid) signUp.mutate();
  }

  return (
    <AuthLayout title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} backTo="/sign-in">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth.fullName')}
          name="name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={local.fullName ?? server.fullName}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={local.email ?? server.email}
        />
        <PasswordField
          label={t('auth.password')}
          name="new-password"
          autoComplete="new-password"
          required
          hint={t('auth.passwordHint', { count: minPasswordLength })}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={local.password ?? server.password}
        />
        <PasswordField
          label={t('auth.confirmPassword')}
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={local.confirm}
        />
        <FormError message={server.form} />
        <Button type="submit" loading={signUp.isPending} className="w-full">
          {t('auth.signUp.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.signUp.have')}{' '}
        <Link to="/sign-in" className="font-bold text-link">
          {t('auth.signUp.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
