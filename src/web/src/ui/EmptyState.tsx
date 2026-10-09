import type { ReactNode } from 'react';
import { Cup, type CupFlavour, type CupMood } from './Cup';

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  // One action, where there is something useful to do about it.
  action?: ReactNode;
  flavour?: CupFlavour;
  mood?: CupMood;
};

// What a screen shows when it has nothing yet: the cup, one short human sentence and, where useful,
// one action. The cup is decoration; the sentence says everything (NFR-008).
//
// The cup sits in a pale well: its walls are white, so straight on a white card in the light theme
// only the drink would show.
export function EmptyState({ title, children, action, flavour, mood }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface p-6 text-center shadow-card">
      <div className="mb-4 flex size-32 items-center justify-center rounded-full bg-surface-3">
        <Cup flavour={flavour} mood={mood} className="w-16" />
      </div>
      <p className="text-lg font-bold">{title}</p>
      {children && <p className="mt-2 text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
