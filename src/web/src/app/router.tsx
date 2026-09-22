import { createBrowserRouter } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
