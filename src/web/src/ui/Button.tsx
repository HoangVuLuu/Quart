import type { ButtonHTMLAttributes } from 'react';
import { buttonClassName, type ButtonVariant } from './button-styles';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  // While true the button is disabled and shows a spinner. The words stay the caller's ("Saving…"):
  // the spinner is decoration, so the label must say what is happening.
  loading?: boolean;
};

// A pill on a hard 3 px edge, so it looks pressable (spec 19.2). Always at least 48 px tall.
export function Button({
  variant = 'dark',
  loading = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName(variant, className)}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
