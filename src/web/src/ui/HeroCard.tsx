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
  className?: string;
};

// The card in the brand colour with a large pale circle bleeding off one corner. It is where "next
// shift" or the current prompt lives. Text on it is always on-primary, in both themes.
export function HeroCard({
  eyebrow,
  title,
  headingLevel = 2,
  children,
  decoration,
  className,
}: HeroCardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div className={cx('relative overflow-hidden rounded-hero bg-primary p-6 text-on-primary', className)}>
      <div aria-hidden="true" className="absolute -top-12 -right-10 size-48 rounded-full bg-glow" />
      {decoration}
      {eyebrow && <p className="relative text-xs font-bold tracking-[0.06em] uppercase">{eyebrow}</p>}
      <Heading className="relative mt-1 text-3xl leading-tight">{title}</Heading>
      {children && <div className="relative mt-2 max-w-sm text-sm">{children}</div>}
    </div>
  );
}
