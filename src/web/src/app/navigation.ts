import type { ParseKeys } from 'i18next';

export type TabIcon = 'home' | 'schedule' | 'trade' | 'alerts' | 'profile';

export interface Tab {
  /** Where the tab goes. */
  to: string;
  /** Translation key of the tab's label. */
  label: ParseKeys;
  icon: TabIcon;
  /** How many things wait there (open shifts, requests, unread notifications); shown in an accent badge when above zero. */
  count?: number;
}

/** NFR-016: the tab bar holds five tabs at most, so it stays usable with a thumb at 390 px. */
export const maxTabs = 5;

// NFR-016 and the mockups' tab bars: Home, Schedule, Trade, Alerts, Profile, for staff and admins alike.
// Availability opens from Schedule and from the Home card; the team page from the icon at the top right.
export const tabs: Tab[] = [
  { to: '/', label: 'nav.home', icon: 'home' },
  { to: '/schedule', label: 'nav.schedule', icon: 'schedule' },
  { to: '/trade', label: 'nav.trade', icon: 'trade' },
  { to: '/alerts', label: 'nav.alerts', icon: 'alerts' },
  { to: '/profile', label: 'nav.profile', icon: 'profile' },
];
