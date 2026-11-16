/** A failure that belongs to the whole form rather than to one field, announced to screen readers. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 rounded-field bg-danger-soft px-4 py-3 text-sm font-bold text-danger"
    >
      <span aria-hidden="true">✕</span>
      {message}
    </p>
  );
}
