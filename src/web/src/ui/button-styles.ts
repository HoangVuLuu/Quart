import { cx } from './cx';

export type ButtonVariant = 'dark' | 'white' | 'primary' | 'green' | 'warning' | 'danger';

const variants: Record<ButtonVariant, string> = {
  dark: 'bg-ink text-bg',
  white: 'bg-surface text-ink',
  // The periwinkle of the hero cards, with its own text colour, so it reads in dark mode too (2026-11-22).
  primary: 'bg-primary text-on-primary',
  // The soft green of a finished step: Generate on Building Schedule (2026-11-22).
  green: 'bg-done text-on-primary',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/**
 * Pressing a button shrinks it a little and lets go with a small spring, so a tap feels answered at once
 * (2026-11-22). Not for people who asked their phone for less motion, and not while disabled.
 */
export const pressClassName = cx(
  'transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
  'active:scale-[0.96] active:duration-75 disabled:active:scale-100',
  'motion-reduce:transition-none motion-reduce:active:scale-100',
);

// The classes of a button, for the rare link that has to look like one (a link is not a <button>).
// At least 48 px tall: the main actions are easy to hit with a thumb (2026-11-22).
export function buttonClassName(variant: ButtonVariant = 'dark', className?: string) {
  return cx(
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-6 text-[15px] font-bold shadow-press',
    'select-none disabled:cursor-not-allowed disabled:opacity-50',
    pressClassName,
    variants[variant],
    className,
  );
}
