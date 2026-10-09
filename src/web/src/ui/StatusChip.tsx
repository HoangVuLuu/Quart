import type { ReactNode } from 'react';
import { cx } from './cx';

export type StatusTone = 'success' | 'danger' | 'warning' | 'neutral';

const tones: Record<StatusTone, { classes: string; symbol: string }> = {
  success: { classes: 'bg-success-soft text-success', symbol: '✓' },
  danger: { classes: 'bg-danger-soft text-danger', symbol: '✕' },
  warning: { classes: 'bg-warning-soft text-warning', symbol: '!' },
  neutral: { classes: 'bg-neutral-soft text-neutral', symbol: '?' },
};

type StatusChipProps = {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
};

// A soft background with its strong colour, always carrying a word and a symbol: colour alone
// never says what the status is (NFR-008). The symbol is decoration; the word is the message.
export function StatusChip({ tone, children, className }: StatusChipProps) {
  const { classes, symbol } = tones[tone];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-pill px-3 py-1 text-sm font-bold',
        classes,
        className,
      )}
    >
      <span aria-hidden="true">{symbol}</span>
      {children}
    </span>
  );
}
