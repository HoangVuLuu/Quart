import { createContext, useContext } from 'react';

type ShowToast = (message: string) => void;

export const ToastContext = createContext<ShowToast | null>(null);

// const toast = useToast(); toast('Saved');
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast needs a <ToastProvider> above it.');
  return show;
}
