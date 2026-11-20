import { useRef, type TouchEvent } from 'react';

// Finger shortcuts for phones. Every one of them has a tap path as well: no task ever needs a swipe
// (NFR-002). They only listen to touch, so a mouse never triggers them.

/** How far a finger must travel sideways before it counts as a swipe, in CSS pixels. */
export const swipeDistance = 56;
/** iOS uses the left edge of the screen to go back. A swipe that starts there is the phone's, not ours. */
const backGestureEdge = 28;

type SwipeHandlers = {
  /** The finger moved left: go to what comes after. */
  onNext?: (() => void) | undefined;
  /** The finger moved right: go to what came before. */
  onPrevious?: (() => void) | undefined;
};

/** True when the touch belongs to something that handles its own movement. */
function ownsItsTouches(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // A sheet or a dialog is drawn elsewhere on the page, but React still bubbles its events through
  // the component that opened it. A text field moves its caret; a sideways list scrolls.
  return (
    target.closest('[role="dialog"], [role="alertdialog"], input, textarea, select, [data-swipe="off"]') !==
    null
  );
}

/**
 * Sideways swipes on a region: left for the next week or tab, right for the previous one. Spread the
 * result on the element. Vertical scrolling is untouched, because nothing is prevented.
 */
export function useSwipe({ onNext, onPrevious }: SwipeHandlers) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      start.current =
        event.touches.length === 1 &&
        touch &&
        touch.clientX > backGestureEdge &&
        !ownsItsTouches(event.target)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchEnd(event: TouchEvent) {
      const from = start.current;
      const touch = event.changedTouches[0];
      start.current = null;
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      // Clearly sideways: a diagonal drag while scrolling must not change the week.
      if (Math.abs(dx) < swipeDistance || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) onNext?.();
      else onPrevious?.();
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}

/**
 * Swipe right from the left edge to go back, like the back arrow (2026-11-18). Browsers already do this
 * themselves, and so does Android, so it only listens in the app installed on an iPhone's home screen,
 * where nothing else would. Pass `enabled` to force it, as tests do.
 */
export function useEdgeSwipeBack(onBack: () => void, enabled = isInstalledOnIphone()) {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!enabled) return {};
  return {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      start.current =
        event.touches.length === 1 &&
        touch &&
        touch.clientX <= backGestureEdge + 12 &&
        !ownsItsTouches(event.target)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchEnd(event: TouchEvent) {
      const from = start.current;
      const touch = event.changedTouches[0];
      start.current = null;
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (dx >= swipeDistance * 1.5 && dx >= Math.abs(dy) * 2) onBack();
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}

function isInstalledOnIphone(): boolean {
  return typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true;
}
