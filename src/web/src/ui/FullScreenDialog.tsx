import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type FullScreenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Top right, such as Save. */
  action: ReactNode;
  children: ReactNode;
};

// A pop-up that covers the whole screen, like adding an event in a phone calendar (2026-11-23): X at the top
// left cancels, the action at the top right keeps. Radix gives it the focus trap, Escape and the return of
// focus. For a short question use Dialog; for detail about one thing, Sheet.
export function FullScreenDialog({ open, onOpenChange, title, action, children }: FullScreenDialogProps) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-30 bg-scrim data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-40 mx-auto flex max-w-xl flex-col bg-surface-2 data-[state=open]:animate-sheet-in"
        >
          <div className="flex items-center gap-3 px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
            <RadixDialog.Close
              aria-label={t('ui.cancel')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-lg font-bold"
            >
              <span aria-hidden="true">✕</span>
            </RadixDialog.Close>
            <RadixDialog.Title className="min-w-0 flex-1 truncate text-center text-xl">
              {title}
            </RadixDialog.Title>
            {action}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
