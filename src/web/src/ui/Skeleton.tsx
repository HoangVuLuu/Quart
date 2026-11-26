import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { cx } from './cx';

// A placeholder shaped like the content that is coming, drawn as a well with a soft light passing over it
// from left to right (2026-11-25: that reads as shorter than a blink). It is decoration: it sits inside
// <Loading>, which tells a screen reader once that the page is loading.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-shimmer rounded-field skeleton-wave', className)} />;
}

/**
 * A page's placeholders while its first data loads (2026-11-25). They fade in only after a quarter of a
 * second, so a page that is ready at once shows no flash. Coming back to a page shows what was there.
 */
export function Loading({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={cx('flex animate-appear flex-col gap-4', className)}>
      <span className="sr-only">{t('ui.loading')}</span>
      {children}
    </div>
  );
}

/** A card with a title line and a few lines under it, the most common shape in the app. */
export function CardSkeleton({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <Card className={cx('flex flex-col gap-3', className)}>
      <Skeleton className="h-5 w-1/2" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cx('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </Card>
  );
}

/** Rows of people or items: a round picture, a name and a line. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <Card key={index} className="flex items-center gap-3 p-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </>
  );
}

/** The big coloured card at the top of Home and Schedule. */
export function HeroSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-hero bg-surface p-6 shadow-card">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-2 h-12 w-full rounded-pill" />
    </div>
  );
}

/** Week pills, then days with two shift boxes each: Building and Editing Schedule, Availability. */
export function DaysSkeleton({ days = 3 }: { days?: number }) {
  return (
    <>
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 flex-1 rounded-pill" />
        ))}
      </div>
      {Array.from({ length: days }, (_, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-1/3" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-chip" />
            <Skeleton className="h-24 rounded-chip" />
          </div>
        </div>
      ))}
    </>
  );
}
