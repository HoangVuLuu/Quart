import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { api, unwrap } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { Card } from '../../ui/Card';
import { PasswordField, TextField } from '../../ui/TextField';
import { AuthLayout } from './AuthLayout';
import { FormError } from './FormError';
import { fieldErrors } from './fieldErrors';
import { minPasswordLength } from './SignUpPage';

/** After signing up: "check your email", with a way to send the link again (M2-03). */
export function CheckEmailPage() {
  const { t } = useTranslation();
  const email = (useLocation().state as { email?: string } | null)?.email ?? '';
  const resend = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/resend-verification', { body: { email } })),
  });

  return (
    <AuthLayout title={t('auth.checkEmail.title')} backTo="/sign-in" mascot>
      <Card>
        <p className="text-[15px]">
          {email ? (
            <Trans i18nKey="auth.checkEmail.sentTo" values={{ email }} components={{ strong: <strong /> }} />
          ) : (
            t('auth.checkEmail.sent')
          )}
        </p>
        <p className="mt-2 text-sm text-muted">{t('auth.checkEmail.spam')}</p>
      </Card>
      {email && (
        <Button
          variant="white"
          className="mt-4 w-full"
          loading={resend.isPending}
          disabled={resend.isSuccess}
          onClick={() => resend.mutate()}
        >
          {resend.isSuccess ? t('auth.checkEmail.resent') : t('auth.checkEmail.resend')}
        </Button>
      )}
      <FormError message={fieldErrors(resend.error, t).form} />
    </AuthLayout>
  );
}

/** Where the emailed verification link lands: `/verify-email?token=…` (FR-004). */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/verify-email', { body: { token } })),
  });
  // The link works once, so it is sent once, even when React mounts the screen twice in development.
  const sent = useRef(false);
  const { mutate } = verify;
  useEffect(() => {
    if (!sent.current) {
      sent.current = true;
      mutate();
    }
  }, [mutate]);
  const errors = fieldErrors(verify.error, t);

  return (
    <AuthLayout
      title={
        verify.isError
          ? t('auth.verify.failed')
          : verify.isSuccess
            ? t('auth.verify.done')
            : t('auth.verify.working')
      }
      mascot
    >
      {verify.isSuccess && <p className="text-center text-[15px] text-muted">{t('auth.verify.doneText')}</p>}
      <FormError message={errors.token ?? errors.form} />
      {!verify.isPending && (
        <Link to="/sign-in" className={buttonClassName('dark', 'mt-4 w-full')}>
          {t('auth.signIn.submit')}
        </Link>
      )}
    </AuthLayout>
  );
}

/** Mockup 1t. The answer is the same whether or not the address has an account (M2-05). */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const forgot = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/forgot-password', { body: { email } })),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() !== '') forgot.mutate();
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} backTo="/sign-in" mascot>
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
        <Button type="submit" loading={forgot.isPending} className="w-full">
          {t('auth.forgot.submit')}
        </Button>
      </form>
      {forgot.isSuccess && (
        <Card role="status" className="mt-4">
          <p className="text-sm">
            <Trans i18nKey="auth.forgot.sent" values={{ email }} components={{ strong: <strong /> }} />
          </p>
        </Card>
      )}
      <FormError message={fieldErrors(forgot.error, t).form} />
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.forgot.remembered')}{' '}
        <Link to="/sign-in" className="font-bold text-link">
          {t('auth.forgot.back')}
        </Link>
      </p>
    </AuthLayout>
  );
}

/** Where the emailed reset link lands: `/reset-password?token=…` (FR-005). */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/auth/reset-password', { body: { token: params.get('token') ?? '', password } })),
    onSuccess: () => void navigate('/sign-in', { replace: true }),
  });
  const errors = fieldErrors(reset.error, t);
  const tooShort = password !== '' && password.length < minPasswordLength;
  const differ = confirm !== '' && confirm !== password;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length >= minPasswordLength && confirm === password) reset.mutate();
  }

  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} backTo="/sign-in">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <PasswordField
          label={t('auth.reset.password')}
          name="new-password"
          autoComplete="new-password"
          required
          hint={t('auth.passwordHint', { count: minPasswordLength })}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={tooShort ? t('errors.auth.password_too_short') : errors.password}
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
        <FormError message={errors.token ?? errors.form} />
        <Button type="submit" loading={reset.isPending} className="w-full">
          {t('auth.reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
