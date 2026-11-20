import { cx } from './cx';

// Small line icons on a 24 px grid with round strokes, like the tab bar (mockup 1a).
const paths = {
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  pen: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cx(
        'size-5 shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]',
        className,
      )}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** The round white button holding one icon; the label is what screen readers say. */
export const iconButtonClassName =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-press';
