import type { ReactNode } from 'react';

// What a screen shows when it has nothing yet: a soft card with a short, human sentence.
// M0-13 adds the cup mascot here.
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card bg-surface p-6 text-center shadow-card">
      <p className="text-lg font-bold">{title}</p>
      {children && <p className="mt-2 text-sm text-muted">{children}</p>}
    </div>
  );
}
