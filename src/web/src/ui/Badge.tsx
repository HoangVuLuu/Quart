import { cx } from './cx';

type BadgeProps = {
  count: number;
  // The count in words, for screen readers: "2 waiting". The caller supplies it because only the
  // caller knows what is being counted.
  label: string;
  className?: string;
};

// A count in the accent colour, for things waiting on the person. The number is drawn for the eyes
// and the words are read out, so a screen reader never hears a bare number (NFR-008).
export function Badge({ count, label, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-block min-w-4 rounded-pill bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-primary',
        className,
      )}
    >
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
