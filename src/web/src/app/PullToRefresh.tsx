import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** How far the finger must pull, in CSS pixels, before letting go refreshes. */
export const pullDistance = 72;
const maxPull = 110;

// Pull down from the top of a screen to fetch everything again. An app on the iPhone home screen has
// no browser bar and no reload gesture of its own, so this is the only way to ask for fresh data
// without leaving the screen. It is a shortcut: the app also refetches on its own when it comes back
// to the foreground (AD-031), so nobody has to pull (NFR-002).
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulled = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target;
      const inSheet = target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]');
      // Only from the very top of the page, with one finger, and never from inside a sheet.
      startY.current =
        !busy.current && touch && event.touches.length === 1 && window.scrollY <= 0 && !inSheet
          ? touch.clientY
          : null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (startY.current === null || !touch) return;
      // The page scrolled after all (the finger went up first): this is a scroll, not a pull.
      if (window.scrollY > 0) {
        startY.current = null;
        pulled.current = 0;
        setPull(0);
        return;
      }
      // Half speed, so it feels like stretching something, and never past the limit.
      pulled.current = Math.max(0, Math.min(maxPull, (touch.clientY - startY.current) / 2));
      setPull(pulled.current);
    };
    const onEnd = () => {
      const far = pulled.current >= pullDistance;
      const started = startY.current !== null;
      startY.current = null;
      pulled.current = 0;
      setPull(0);
      if (!started || !far) return;
      busy.current = true;
      setRefreshing(true);
      // Refetches every query on screen. Whatever the outcome, each screen shows its own error.
      void queryClient
        .invalidateQueries()
        .catch(() => undefined)
        .then(() => {
          busy.current = false;
          setRefreshing(false);
        });
    };

    // Passive: scrolling is never blocked or delayed by these.
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [queryClient]);

  const shown = refreshing ? pullDistance : pull;
  const ready = pull >= pullDistance;

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="pull-indicator"
        data-ready={ready || refreshing}
        className="pointer-events-none fixed top-[env(safe-area-inset-top)] left-1/2 z-20 -ml-5 flex size-10 items-center justify-center rounded-full bg-surface shadow-float transition-[opacity] duration-150 motion-safe:transition-[opacity,translate]"
        style={{
          translate: `0 ${shown - 44}px`,
          opacity: shown > 8 ? 1 : 0,
          // While the finger is down the circle follows it exactly; it only eases when let go.
          transitionDuration: pull > 0 ? '0s' : undefined,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`size-5 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] ${refreshing ? 'motion-safe:animate-spin' : ''} ${ready || refreshing ? 'text-ink' : 'text-muted'}`}
          style={refreshing ? undefined : { rotate: `${pull * 3}deg` }}
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
        </svg>
      </div>
      {/* Always on the page so a screen reader notices the text appear; not role="status", which each
          screen keeps for its own loading line. */}
      <p aria-live="polite" className="sr-only">
        {refreshing ? t('ui.refreshing') : ''}
      </p>
      {children}
    </>
  );
}
