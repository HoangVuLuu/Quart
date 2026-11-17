import type { ReactNode } from 'react';
import { cx } from '../../ui/cx';

/** One choice in a row of pills (week 1 / week 2, my shifts / whole team): the selected one is filled. */
export function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'min-h-11 rounded-pill px-4 text-sm font-bold shadow-press',
        selected ? 'bg-ink text-bg' : 'bg-surface text-ink',
      )}
    >
      {children}
    </button>
  );
}
