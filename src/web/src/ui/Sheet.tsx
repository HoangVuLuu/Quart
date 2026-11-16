import { Dialog as RadixDialog } from 'radix-ui';
import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';

/** How far down a sheet must be dragged, in CSS pixels, before letting go closes it. */
export const sheetCloseDistance = 90;

type SheetProps = {
  // The button that opens it. Pass it here, rather than opening from a separate button, so the focus
  // goes back to it on close in every browser: Safari does not focus a button when it is tapped, so
  // "remember what had focus" alone would drop the person at the top of the page.
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
};

// The bottom sheet: how detail opens in this app (spec 19.6). 36 px top corners, up to 86% of the
// screen, a dimmed backdrop, and a 0.28 s slide up. The shift panel, the publish confirmation and the
// settings all reuse it. Radix gives it the focus trap, Escape to close and the return of focus.
// On a phone it can also be swiped down to close, as sheets are everywhere else on the phone; the
// round close button stays, so the swipe is never needed (NFR-002).
export function Sheet({ trigger, open, onOpenChange, title, description, children }: SheetProps) {
  const { t } = useTranslation();
  // The sheet keeps its own open state when the caller does not, so a swipe can close either kind.
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };

  const [drag, setDrag] = useState(0);
  // After a swipe the sheet is already off the screen: playing the closing slide again would flash.
  const [swipedAway, setSwipedAway] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    // Only when the sheet's own content is at its top: further down, a downward drag is a scroll.
    startY.current =
      touch && event.touches.length === 1 && event.currentTarget.scrollTop <= 0 ? touch.clientY : null;
  };
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (startY.current === null || !touch) return;
    if (event.currentTarget.scrollTop > 0) {
      startY.current = null;
      setDrag(0);
      return;
    }
    setDrag(Math.max(0, touch.clientY - startY.current));
  };
  const onTouchEnd = () => {
    const far = startY.current !== null && drag >= sheetCloseDistance;
    startY.current = null;
    setDrag(0);
    if (far) {
      setSwipedAway(true);
      setOpen(false);
    }
  };

  return (
    <RadixDialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setSwipedAway(false);
        setOpen(next);
      }}
    >
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-30 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          // The sheet follows the finger. `translate` is separate from the `transform` the slide-in
          // animation uses, so the two never fight.
          style={drag > 0 ? { translate: `0 ${drag}px` } : undefined}
          className={cx(
            'fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[86%] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-sheet bg-surface-2 px-6 pt-3.5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-float data-[state=open]:animate-sheet-in',
            !swipedAway && 'data-[state=closed]:animate-sheet-out',
            drag === 0 && 'motion-safe:transition-[translate] motion-safe:duration-200',
          )}
        >
          <div aria-hidden="true" className="mx-auto mb-3 h-1.25 w-11 rounded-pill bg-line" />
          <RadixDialog.Title className="pr-14 text-2xl">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-[15px] text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <RadixDialog.Close
            aria-label={t('ui.close')}
            className="absolute top-4.5 right-4.5 flex size-11 items-center justify-center rounded-full bg-bg text-lg font-bold"
          >
            <span aria-hidden="true">×</span>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
