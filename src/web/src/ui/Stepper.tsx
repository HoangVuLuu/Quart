import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';

type StepperProps = {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
};

const stepButton =
  'flex size-11 items-center justify-center rounded-full bg-surface text-lg font-bold shadow-press disabled:cursor-not-allowed disabled:opacity-50';

// A row with a label and circular − / + buttons around the current value ("Most days in a row").
// The value sits in a live region so a screen reader announces each change.
export function Stepper({ label, description, value, min, max, onChange, className }: StepperProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cx('flex min-h-14 items-center gap-3 rounded-field bg-surface-3 px-4 py-2', className)}
    >
      <div className="min-w-0 flex-1">
        <p id={id} className="text-[15px] font-bold">
          {label}
        </p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('ui.decrease')}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className={stepButton}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output aria-live="polite" className="min-w-6 text-center text-lg font-bold">
          {value}
        </output>
        <button
          type="button"
          aria-label={t('ui.increase')}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className={stepButton}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
