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
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
