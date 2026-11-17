import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { PasswordField, TextField } from '../../ui/TextField';
import { AuthLayout } from './AuthLayout';
import { FormError } from './FormError';
import { fieldErrors } from './fieldErrors';
import { useSignIn } from './session';

// Mockup 1s. "Continue with Google" arrives with M2-17.
export function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const errors = fieldErrors(signIn.error, t);
  const notVerified = signIn.error instanceof ApiError && signIn.error.code === 'auth.email_not_verified';

  function submit(event: FormEvent) {
    event.preventDefault();
    signIn.mutate(
      { email, password },
      {
        // Back to where the person was heading before being asked to log in (M2-04).
        onSuccess: () =>
          void navigate((location.state as { from?: string } | null)?.from ?? '/workplaces', {
            replace: true,
          }),
      },
    );
  }

  return (
    <AuthLayout title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')} mascot>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label={t('auth.password')}
          name="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Link to="/forgot-password" className="self-end text-sm font-bold text-link">
          {t('auth.signIn.forgot')}
        </Link>
        <FormError message={errors.form} />
        {notVerified && (
          <Link to="/check-email" state={{ email }} className="text-sm font-bold text-link">
            {t('auth.signIn.resend')}
          </Link>
        )}
        <Button type="submit" loading={signIn.isPending} className="w-full">
          {t('auth.signIn.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.signIn.new')}{' '}
        <Link to="/sign-up" className="font-bold text-link">
          {t('auth.signIn.create')}
        </Link>
      </p>
    </AuthLayout>
  );
}
