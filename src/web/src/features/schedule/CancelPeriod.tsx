import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { useCancelPeriod, type PeriodSummary } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';

/**
 * "Cancel period" and its "Are you sure?" (2026-11-18): for a period not published yet, or a published one
 * that has not started. Not in the mockups; it reuses the Clear confirmation of Building Schedule.
 */
export function CancelPeriodButton({
  period,
  className,
  icon,
  onCancelling,
}: {
  period: PeriodSummary;
  className?: string;
  /** A red trash icon instead of the words, as in the corner of the next-period box (2026-11-18). */
  icon?: boolean;
  /** Called just before leaving the page, so a "Leave without saving?" prompt does not get in the way. */
  onCancelling?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { id } = useWorkplace();
  const cancel = useCancelPeriod();
  const [open, setOpen] = useState(false);
  const published = period.version > 0;
  const range = formatDateRange(period.startDate, period.endDate, i18n.language);

  const confirm = async () => {
    await cancel.mutateAsync(period.id);
    onCancelling?.();
    setOpen(false);
    toast(t('cancelPeriod.done'));
    await navigate('/schedule', { replace: true });
    // Everything about this period is gone; drop it rather than ask the server for it again.
    client.removeQueries({ predicate: (query) => query.queryKey.includes(period.id) });
    void client.invalidateQueries({ queryKey: ['workplace', id] });
  };

  return (
    <>
      {icon ? (
        <button
          type="button"
          aria-label={t('cancelPeriod.button')}
          className={`${iconButtonClassName} text-danger`}
          onClick={() => setOpen(true)}
        >
          <Icon name="trash" />
        </button>
      ) : (
        <Button
          variant="white"
          className={className ?? 'min-h-11 px-4 text-sm'}
          onClick={() => setOpen(true)}
        >
          {t('cancelPeriod.button')}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('cancelPeriod.title')}
        description={t(published ? 'cancelPeriod.textPublished' : 'cancelPeriod.text', { range })}
      >
        <div className="flex flex-col gap-2">
          <FormError message={cancel.error ? t(messageKeyFor(cancel.error)) : undefined} />
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => void confirm().catch(() => undefined)}
          >
            {t('cancelPeriod.confirm')}
          </Button>
          <Button variant="white" onClick={() => setOpen(false)}>
            {t('cancelPeriod.keep')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
