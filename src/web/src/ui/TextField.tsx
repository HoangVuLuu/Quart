import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  // Helper text under the field.
  hint?: string;
  // When set the field is invalid: the text is shown in words and read out with the field (NFR-008).
  error?: string;
  // Content placed inside the field's right edge (the password field puts its show/hide button there).
  trailing?: ReactNode;
};

const fieldClassName =
  'min-h-12 w-full rounded-field bg-surface-3 px-4 text-[15px] text-ink placeholder:text-muted disabled:opacity-50 aria-[invalid=true]:bg-danger-soft aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-danger';

// A label above the input, and the hint and the error below it, tied together with aria-describedby.
export function TextField({ label, hint, error, trailing, className, ...rest }: TextFieldProps) {
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
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(fieldClassName, trailing ? 'pr-14' : undefined)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
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

// A text field whose content can be shown on request, because typing a password blind on a phone is
// how people end up locked out.
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      trailing={
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="min-h-11 rounded-pill px-3 text-sm font-bold text-link"
        >
          {visible ? t('ui.hidePassword') : t('ui.showPassword')}
        </button>
      }
    />
  );
}
