import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
export function Sheet({ trigger, open, onOpenChange, title, description, children }: SheetProps) {
  const { t } = useTranslation();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-30 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[86%] w-full max-w-xl overflow-y-auto rounded-t-sheet bg-surface-2 px-6 pt-3.5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-float data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
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
