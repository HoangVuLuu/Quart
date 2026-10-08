import { Toast as RadixToast } from 'radix-ui';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ToastContext } from './toast-context';

type Message = { id: number; text: string };

let nextId = 1;

// Short confirmations ("Claim sent to Philippe") as a dark pill at the top (spec 19.6). Radix
// announces each one to screen readers, pauses the timer while it is hovered or focused, and lets
// it be swiped away. Mount this once, above the router's output.
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);

  const show = useCallback((text: string) => {
    setMessages((current) => [...current, { id: nextId++, text }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider swipeDirection="up" duration={5000} label={t('ui.notification')}>
        {children}
        {messages.map((message) => (
          <RadixToast.Root
            key={message.id}
            onOpenChange={(open) => {
              if (!open) setMessages((current) => current.filter((item) => item.id !== message.id));
            }}
            className="rounded-pill bg-ink px-5 py-3 text-sm font-bold text-bg shadow-float data-[state=closed]:animate-toast-out data-[state=open]:animate-toast-in"
          >
            <RadixToast.Description>{message.text}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
