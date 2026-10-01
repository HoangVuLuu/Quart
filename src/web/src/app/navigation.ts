import type { ParseKeys } from 'i18next';

export interface Tab {
  /** Where the tab goes. */
  to: string;
  /** Translation key of the tab's label. */
  label: ParseKeys;
  /** How many things wait there (pending requests, unread news); shown in an accent badge when above zero. */
  count?: number;
}

/** NFR-016: the tab bar holds five tabs at most, so it stays usable with a thumb at 390 px. */
export const maxTabs = 5;

// The order of the design prototype. Counts arrive with the features that produce them (M4, M7, M8).
export const tabs: Tab[] = [
  { to: '/', label: 'nav.home' },
  { to: '/schedule', label: 'nav.schedule' },
  { to: '/availability', label: 'nav.availability' },
  { to: '/requests', label: 'nav.requests' },
  { to: '/news', label: 'nav.news' },
];
