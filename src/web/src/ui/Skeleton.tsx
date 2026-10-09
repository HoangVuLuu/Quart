import { cx } from './cx';

// A placeholder shaped like the content that is coming, drawn as a well, so it belongs inside a
// card. It is decoration: whoever shows a
// skeleton also announces that something is loading (a role="status" line), because a screen reader
// cannot tell what a grey box is.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-field bg-surface-3', className)} />;
}
