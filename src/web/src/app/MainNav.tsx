import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Badge } from '../ui/Badge';
import { maxTabs, type Tab, type TabIcon } from './navigation';

// One path per icon, drawn on a 24 px grid with round strokes to match the mockups' tab bar.
const icons: Record<TabIcon, string> = {
  home: 'M4 11.5 12 4l8 7.5V20h-5.5v-5h-5v5H4z',
  schedule: 'M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4',
  trade: 'M5 8.5h13m-3.5-3.5 3.5 3.5-3.5 3.5M19 15.5H6m3.5-3.5L6 15.5 9.5 19',
  alerts: 'M6.5 17v-6a5.5 5.5 0 0 1 11 0v6l1.5 1.5H5zM10 20.5h4',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-3.6 3.6-5.5 7.5-5.5s6.9 1.9 7.5 5.5',
};

// The main navigation, one element for every screen size: a floating white pill above the bottom edge
// on phones (spec 19.6), a column of the same pills in a sidebar from the md breakpoint (NFR-003).
// The selected tab is filled with the primary colour; NavLink sets aria-current="page".
export function MainNav({ tabs }: { tabs: Tab[] }) {
  const { t } = useTranslation();
  if (tabs.length > maxTabs) {
    throw new Error(`The tab bar holds ${maxTabs} tabs at most (NFR-016); got ${tabs.length}.`);
  }

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-3 bottom-[calc(22px+env(safe-area-inset-bottom))] z-10 rounded-pill bg-surface p-1.5 shadow-float md:sticky md:inset-x-auto md:top-4 md:bottom-auto md:self-start md:rounded-card md:p-2"
    >
      <ul className="flex gap-0.5 md:flex-col md:gap-1">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `relative flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-pill px-0.5 text-[11px] font-bold md:flex-row md:justify-start md:gap-3 md:px-5 md:text-sm ${
                  isActive ? 'bg-primary text-on-primary' : 'text-ink'
                }`
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
              >
                <path d={icons[tab.icon]} />
              </svg>
              {t(tab.label)}
              {/* The space keeps the label and the count apart for screen readers: "Alerts 2 waiting". */}
              {tab.count ? ' ' : null}
              {tab.count ? (
                <Badge
                  count={tab.count}
                  label={t('nav.count', { count: tab.count })}
                  className="absolute top-1 right-2 md:static md:ml-auto md:min-w-5 md:text-xs md:leading-5"
                />
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
