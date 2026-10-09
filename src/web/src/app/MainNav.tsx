import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Badge } from '../ui/Badge';
import { maxTabs, type Tab } from './navigation';

// The main navigation, one element for every screen size: a floating white pill above the bottom edge
// on phones (spec 19.6), a column of the same pills in a sidebar from the md breakpoint (NFR-003).
// The selected tab is filled like the prototype's other selected pills; NavLink sets aria-current="page".
export function MainNav({ tabs }: { tabs: Tab[] }) {
  const { t } = useTranslation();
  if (tabs.length > maxTabs) {
    throw new Error(`The tab bar holds ${maxTabs} tabs at most (NFR-016); got ${tabs.length}.`);
  }

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-3 bottom-[calc(22px+env(safe-area-inset-bottom))] z-10 rounded-pill bg-surface p-1.5 shadow-float md:sticky md:top-4 md:inset-x-auto md:bottom-auto md:self-start md:rounded-card md:p-2"
    >
      <ul className="flex gap-0.5 md:flex-col md:gap-1">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `relative flex min-h-[50px] items-center justify-center rounded-pill px-0.5 text-xs font-bold md:justify-start md:px-5 md:text-sm ${
                  isActive ? 'bg-ink text-bg' : 'text-ink'
                }`
              }
            >
              {t(tab.label)}
              {/* The space keeps the label and the count apart for screen readers: "Requests 2 waiting". */}
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
