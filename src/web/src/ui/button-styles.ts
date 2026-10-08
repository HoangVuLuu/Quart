import { cx } from './cx';

export type ButtonVariant = 'dark' | 'white' | 'danger';

const variants: Record<ButtonVariant, string> = {
  dark: 'bg-ink text-bg',
  white: 'bg-surface text-ink',
  danger: 'bg-danger-soft text-danger',
};

// The classes of a button, for the rare link that has to look like one (a link is not a <button>).
export function buttonClassName(variant: ButtonVariant = 'dark', className?: string) {
  return cx(
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-6 text-[15px] font-bold shadow-press',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    className,
  );
}
