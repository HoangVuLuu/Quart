import { useId, type SelectHTMLAttributes } from 'react';
import { cx } from './cx';

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
};

// A native <select>, styled like the text fields. On a phone the browser opens its own picker, which
// is the most comfortable and the most accessible list a thumb can get, so this is deliberately not
// a custom Radix listbox.
export function Select({ label, hint, error, className, children, ...rest }: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold tracking-[0.06em] text-muted uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'min-h-12 w-full appearance-none rounded-field bg-surface-3 pr-12 pl-4 text-[15px] text-ink disabled:opacity-50',
            'aria-[invalid=true]:bg-danger-soft aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-danger',
          )}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 fill-none stroke-current stroke-[2.5] text-muted"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-bold text-danger">
          <span aria-hidden="true">✕</span>
          {error}
        </p>
      )}
    </div>
  );
}
