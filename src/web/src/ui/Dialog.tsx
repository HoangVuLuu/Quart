import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type DialogProps = {
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

// A small centred card for a short question ("Delete this post?"). Radix traps the focus inside while
// it is open, closes it on Escape, and puts the focus back on whatever opened it. For anything with
// detail, use the Sheet instead.
export function Dialog({ trigger, open, onOpenChange, title, description, children }: DialogProps) {
  const { t } = useTranslation();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-30 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          className="fixed top-1/2 left-1/2 z-40 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface-2 p-6 shadow-float data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
          // Radix warns when there is nothing to describe the dialog; say that on purpose.
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RadixDialog.Title className="pr-12 text-2xl">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-[15px] text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="mt-5">{children}</div>
          <RadixDialog.Close
            aria-label={t('ui.close')}
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-bg text-lg font-bold"
          >
            <span aria-hidden="true">×</span>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
