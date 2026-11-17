import { createContext, useContext } from 'react';
import type { Schemas } from '../../lib/api/client';

export type WorkplaceView = Schemas['WorkplaceView'];

/** The named rights of spec 5.5. The server decides; the web app only hides what would be refused. */
export type Permission =
  | 'ManageWorkplace'
  | 'ManageMembers'
  | 'ManageLevels'
  | 'ManageTemplate'
  | 'ManageSchedule'
  | 'ApproveRequests'
  | 'ViewAvailabilityComments';

const storageKey = 'quart.workplace';

/** Which workplace this browser last opened. Only a convenience, so a failure to read it is not an error. */
export function rememberedWorkplace(): string | null {
  try {
    return globalThis.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function rememberWorkplace(id: string | null) {
  try {
    if (id) globalThis.localStorage.setItem(storageKey, id);
    else globalThis.localStorage.removeItem(storageKey);
  } catch {
    // Private browsing can refuse storage; the person just picks the workplace again next time.
  }
}

export interface Workplace {
  id: string;
  view: WorkplaceView;
  /** Does the caller's membership hold this permission (AD-042)? */
  can: (permission: Permission) => boolean;
}

export const WorkplaceContext = createContext<Workplace | null>(null);

/** The workplace every screen inside the app shell works in, with the caller's membership (M2-10). */
export function useWorkplace(): Workplace {
  const workplace = useContext(WorkplaceContext);
  if (!workplace) throw new Error('useWorkplace needs a WorkplaceGate above it.');
  return workplace;
}

export const workplaceKey = (id: string) => ['workplace', id] as const;
