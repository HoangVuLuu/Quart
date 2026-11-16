import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { AvailabilityPage } from '../features/availability/AvailabilityPage';
import { TeamAvailabilityPage } from '../features/availability/TeamAvailabilityPage';
import { ForcedErrorPage } from '../features/diagnostics/ForcedErrorPage';
import { EditGeneratorPage } from '../features/generator/EditGeneratorPage';
import { HomePage } from '../features/home/HomePage';
import {
  CheckEmailPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../features/identity/EmailPages';
import { SignInPage } from '../features/identity/SignInPage';
import { SignUpPage } from '../features/identity/SignUpPage';
import { TradePage } from '../features/marketplace/TradePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { TeamPage } from '../features/team/TeamPage';
import { WorkplaceGate } from '../features/workplaces/WorkplaceGate';
import { OwnerInvitationPage, WorkplacesPage } from '../features/workplaces/WorkplacesPage';
import { AppShell } from './AppShell';
import { RequireSession, SignedOutOnly, WithToasts } from './guards';
import { NotFoundPage } from './NotFoundPage';
import { RootErrorPage } from './RootErrorPage';

// The component gallery (M0-11) is for developers and for the team's review on staging. The condition
// is known when the app is built, so a production build leaves the gallery's code out entirely.
const showDevPages = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_PAGES === 'true';
const UiGalleryPage = showDevPages
  ? lazy(() => import('../features/dev/UiGalleryPage').then((m) => ({ default: m.UiGalleryPage })))
  : null;
// The generator lab (M1-01) follows the same rule; the API also serves it only where Features:Lab is on.
const LabPage = showDevPages
  ? lazy(() => import('../features/lab/LabPage').then((m) => ({ default: m.LabPage })))
  : null;
// The M0 status page: the deployed version, the database and the last background run.
const StatusPage = showDevPages
  ? lazy(() => import('../features/dev/StatusPage').then((m) => ({ default: m.StatusPage })))
  : null;

const devPages = [
  { path: 'dev/ui', Page: UiGalleryPage },
  { path: 'dev/status', Page: StatusPage },
  { path: 'lab', Page: LabPage },
].flatMap(({ path, Page }) =>
  Page
    ? [
        {
          path,
          element: (
            <Suspense fallback={null}>
              <Page />
            </Suspense>
          ),
        },
      ]
    : [],
);

export const routes: RouteObject[] = [
  {
    // Catches a failure anywhere, including in the guards.
    errorElement: <RootErrorPage />,
    children: [
      {
        element: <SignedOutOnly />,
        children: [
          { path: 'sign-in', element: <SignInPage /> },
          { path: 'sign-up', element: <SignUpPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Emailed links work whether or not this browser is signed in.
      { path: 'check-email', element: <CheckEmailPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireSession />,
        children: [
          { path: 'workplaces', element: <WorkplacesPage /> },
          { path: 'join/:code', element: <WorkplacesPage /> },
          { path: 'owner-invitation', element: <OwnerInvitationPage /> },
          {
            element: <WorkplaceGate />,
            children: [
              {
                element: <AppShell />,
                children: [
                  {
                    // Catches a failure in any screen, keeping the shell around it.
                    errorElement: <RootErrorPage />,
                    children: [
                      { index: true, element: <HomePage /> },
                      { path: 'schedule', element: <SchedulePage /> },
                      { path: 'trade', element: <TradePage /> },
                      { path: 'alerts', element: <AlertsPage /> },
                      { path: 'profile', element: <ProfilePage /> },
                      { path: 'diagnostics/error', element: <ForcedErrorPage /> },
                      ...devPages,
                      { path: '*', element: <NotFoundPage /> },
                    ],
                  },
                ],
              },
              {
                // Opened from a tab, with a back arrow and no tab bar (mockups 1e, 1w, 1m, 1k3).
                element: <WithToasts />,
                children: [
                  { path: 'team', element: <TeamPage /> },
                  { path: 'availability', element: <AvailabilityPage /> },
                  { path: 'availability/team', element: <TeamAvailabilityPage /> },
                  { path: 'generator', element: <EditGeneratorPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
