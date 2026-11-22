import { cx } from './cx';
import { pressClassName } from './button-styles';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

// Classes, not inline styles (tokens test): two or three choices.
const columns = { 2: 'grid-cols-2', 3: 'grid-cols-3' } as const;
const thumbWidth = { 2: 'w-[calc(50%_-_0.25rem)]', 3: 'w-[calc((100%_-_0.5rem)/3)]' } as const;
const thumbPlace = ['translate-x-0', 'translate-x-full', 'translate-x-[200%]'] as const;

/**
 * Two or more choices in one pill across the row, the chosen one on a white thumb that slides over
 * (My shifts / Whole team, 2026-11-22). Each choice is a button that says whether it is pressed.
 */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
}: {
  /** What the choice is about, for screen readers. */
  label: string;
  segments: readonly [Segment<T>, Segment<T>] | readonly [Segment<T>, Segment<T>, Segment<T>];
  value: T;
  onChange: (value: T) => void;
}) {
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('relative grid rounded-pill bg-primary p-1', columns[segments.length])}
    >
      <span
        aria-hidden="true"
        className={cx(
          'absolute inset-y-1 left-1 rounded-pill bg-surface shadow-press',
          'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
          thumbWidth[segments.length],
          thumbPlace[index],
        )}
      />
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(segment.value)}
            className={cx(
              'relative min-h-11 rounded-pill px-3 text-[15px] font-bold select-none',
              pressClassName,
              selected ? 'text-link' : 'text-on-primary',
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
