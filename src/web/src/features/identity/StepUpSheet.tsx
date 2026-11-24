import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, unwrap } from '../../lib/api/client';
import { answerPasswordQuestion, usePasswordQuestion } from '../../lib/step-up';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { PasswordField } from '../../ui/TextField';
import { FormError } from './FormError';
import { fieldErrors } from './fieldErrors';

/**
 * Step-up (AD-044, M2-06): mounted once at the root. It opens whenever the API asks for the password
 * again before a sensitive action; once confirmed, the action is sent again by itself.
 */
export function StepUpSheet() {
  const { t } = useTranslation();
  const open = usePasswordQuestion();
  const [password, setPassword] = useState('');
  const confirm = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/confirm-password', { body: { password } })),
    onSuccess: () => finish(true),
  });
  const errors = fieldErrors(confirm.error, t);

  function finish(confirmed: boolean) {
    setPassword('');
    confirm.reset();
    answerPasswordQuestion(confirmed);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== '' && !confirm.isPending) confirm.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && finish(false)}
      title={t('auth.stepUp.title')}
      description={t('auth.stepUp.text')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <PasswordField
          label={t('auth.password')}
          name="password"
          autoComplete="current-password"
          enterKeyHint="done"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />
        <FormError message={errors.form} />
        <Button type="submit" loading={confirm.isPending} className="w-full">
          {t('auth.stepUp.confirm')}
        </Button>
      </form>
    </Sheet>
  );
}
