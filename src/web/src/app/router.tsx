import { createBrowserRouter, type RouteObject } from 'react-router';
import { ForcedErrorPage } from '../features/diagnostics/ForcedErrorPage';
import { HomePage } from '../features/home/HomePage';
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
          { path: 'diagnostics/error', element: <ForcedErrorPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
