import type { ReactNode } from 'react';
import { pressClassName } from '../../ui/button-styles';
import { cx } from '../../ui/cx';

/** One choice in a row of pills (week 1 / week 2, my shifts / whole team): the selected one is filled. */
export function Pill({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'min-h-11 rounded-pill px-4 text-sm font-bold shadow-press select-none',
        pressClassName,
        selected ? 'bg-ink text-bg' : 'bg-surface text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}
