import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { useGoBack } from '../../app/useGoBack';
import { localToday } from '../day-editor/model';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { CardSkeleton, Loading } from '../../ui/Skeleton';
import { Switch } from '../../ui/Switch';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { fieldErrors } from '../identity/fieldErrors';
import { dayCount, timeOffDays, useMyTimeOff, useTimeOffActions } from './data';

const reasonMax = 300;

/**
 * Request time off (BL-01, Hoang 2026-11-25): a full page with a back arrow and no tab bar. The first day, the last
 * day or "Undetermined" (off until a manager turns shifts back on), and an optional reason only managers see.
 * Not in the mockups: it follows the shape of the other full pages (1e, 1k3).
 */
export function TimeOffPage() {
  const { t, i18n } = useTranslation();
  const mine = useMyTimeOff();
  const { request } = useTimeOffActions();
  const navigate = useNavigate();
  const goBack = useGoBack('/');
  const toast = useToast();
  const today = localToday();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const errors = fieldErrors(request.error, t);
  const started = first !== '' || last !== '' || open || reason.trim() !== '';

  if (mine.error) throw mine.error;
  // Someone who cannot ask (a manager, or a request already open) has nothing to do here.
  if (mine.data && !mine.data.canRequest && !request.isSuccess) return <Navigate to="/" replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (first === '' || (!open && last === '')) {
      setMissing(true);
      return;
    }
    request.mutate(
      { firstDay: first, lastDay: open ? null : last, reason: reason.trim() === '' ? null : reason.trim() },
      {
        onSuccess: () => {
          toast(t('timeOff.sent'));
          void navigate('/', { replace: true });
        },
      },
    );
  }

  const summary =
    first !== '' && (open || (last !== '' && last >= first))
      ? open
        ? t('timeOff.summaryOpen', { days: timeOffDays(first, null, t, i18n.language) })
        : t('timeOff.summary', {
            days: timeOffDays(first, last, t, i18n.language),
            count: dayCount(first, last),
          })
      : null;

  return (
    <SubPage
      backTo="/"
      title={t('timeOff.title')}
      context={t('timeOff.context')}
      onBack={() => (started ? setLeaving(true) : goBack())}
    >
      {!mine.data ? (
        <Loading>
          <CardSkeleton lines={4} />
        </Loading>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <TextField
              label={t('timeOff.firstDay')}
              type="date"
              min={today}
              required
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              error={errors.firstDay ?? (missing && first === '' ? t('timeOff.pickDay') : undefined)}
            />
            {!open && (
              <TextField
                label={t('timeOff.lastDay')}
                type="date"
                min={first || today}
                required
                value={last}
                onChange={(event) => setLast(event.target.value)}
                error={errors.lastDay ?? (missing && last === '' ? t('timeOff.pickDay') : undefined)}
              />
            )}
            <Switch
              label={t('timeOff.undetermined')}
              description={t('timeOff.undeterminedText')}
              checked={open}
              onCheckedChange={setOpen}
            />
            <TextArea
              label={t('timeOff.reason')}
              hint={t('timeOff.reasonHint')}
              rows={3}
              maxLength={reasonMax}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={errors.reason}
            />
          </Card>
          {summary && <p className="px-1 text-sm text-muted">{summary}</p>}
          <FormError message={errors.form} />
          <Button type="submit" loading={request.isPending} className="w-full">
            {t('timeOff.send')}
          </Button>
        </form>
      )}
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('timeOff.leave.title')}
        description={t('timeOff.leave.text')}
      >
        <div className="flex flex-col gap-2">
          <Button onClick={() => setLeaving(false)}>{t('timeOff.leave.stay')}</Button>
          <Button variant="danger" onClick={goBack}>
            {t('timeOff.leave.leave')}
          </Button>
        </div>
      </Dialog>
    </SubPage>
  );
}
