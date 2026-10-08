import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AvailabilityPage } from '../features/availability/AvailabilityPage';
import { ForcedErrorPage } from '../features/diagnostics/ForcedErrorPage';
import { HomePage } from '../features/home/HomePage';
import { NewsPage } from '../features/news/NewsPage';
import { RequestsPage } from '../features/requests/RequestsPage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { RootErrorPage } from './RootErrorPage';

// The component gallery (M0-11) is for developers and for the team's review on staging. The condition
// is known when the app is built, so a production build leaves the gallery's code out entirely.
const showDevPages = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_PAGES === 'true';
const UiGalleryPage = showDevPages
  ? lazy(() => import('../features/dev/UiGalleryPage').then((m) => ({ default: m.UiGalleryPage })))
  : null;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    // Catches a failure in the shell itself.
    errorElement: <RootErrorPage />,
    children: [
      {
        // Catches a failure in any screen, keeping the shell (and the language switcher) around it.
        errorElement: <RootErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'schedule', element: <SchedulePage /> },
          { path: 'availability', element: <AvailabilityPage /> },
          { path: 'requests', element: <RequestsPage /> },
          { path: 'news', element: <NewsPage /> },
          { path: 'diagnostics/error', element: <ForcedErrorPage /> },
          ...(UiGalleryPage
            ? [
                {
                  path: 'dev/ui',
                  element: (
                    <Suspense fallback={null}>
                      <UiGalleryPage />
                    </Suspense>
                  ),
                },
              ]
            : []),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
