import type { HTMLAttributes } from 'react';
import { cx } from './cx';

// A white card floating softly on the background (spec 19.3).
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-card bg-surface p-5 shadow-card', className)} {...rest} />;
}
