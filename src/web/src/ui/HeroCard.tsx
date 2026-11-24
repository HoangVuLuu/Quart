import type { ReactNode } from 'react';
import { cx } from './cx';

type HeroCardProps = {
  eyebrow?: string;
  title: string;
  // Which heading this is: the page's only h1 on Home, an h2 anywhere else.
  headingLevel?: 1 | 2;
  children?: ReactNode;
  // Something placed on the right edge, such as the cup.
  decoration?: ReactNode;
  // A small button in the top-right corner, such as the trash icon; the title leaves room for it.
  corner?: ReactNode;
  // Let the content use the whole width, for a row of buttons with an icon at its far end.
  wide?: boolean;
  // 'done' turns the card green once its step is complete (2026-11-21).
  tone?: 'primary' | 'done';
  className?: string;
  // Tapping anywhere on the card does this, the same as its own button (2026-11-23). The card's button stays
  // the way keyboards and screen readers reach it, so the tap area is hidden from them.
  onPress?: () => void;
};

// The card in the brand colour with a large pale circle bleeding off one corner. It is where "next
// shift" or the current prompt lives. Text on it is always on-primary, in both themes.
export function HeroCard({
  eyebrow,
  title,
  headingLevel = 2,
  children,
  decoration,
  corner,
  wide,
  tone = 'primary',
  className,
  onPress,
}: HeroCardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-hero p-6 text-on-primary',
        tone === 'done' ? 'bg-done' : 'bg-primary',
        className,
      )}
    >
      <div aria-hidden="true" className="absolute -top-12 -right-10 size-48 rounded-full bg-glow" />
      {decoration}
      {corner && <div className="absolute top-4 right-4">{corner}</div>}
      {eyebrow && (
        <p
          className={cx('relative text-xs font-bold tracking-[0.06em] uppercase', corner != null && 'pr-12')}
        >
          {eyebrow}
        </p>
      )}
      <Heading className={cx('relative mt-1 text-3xl leading-tight', corner != null && 'pr-12')}>
        {title}
      </Heading>
      {children && <div className={cx('relative mt-2 text-sm', !wide && 'max-w-sm')}>{children}</div>}
      {onPress && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onPress}
          className="absolute inset-0 z-10"
        />
      )}
    </div>
  );
}
