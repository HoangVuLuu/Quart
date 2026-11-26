import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { AvailabilityPage } from '../features/availability/AvailabilityPage';
import { PersonAvailabilityPage } from '../features/availability/PersonAvailabilityPage';
import { TeamAvailabilityPage } from '../features/availability/TeamAvailabilityPage';
import { ForcedErrorPage } from '../features/diagnostics/ForcedErrorPage';
import { EditGeneratorPage } from '../features/generator/EditGeneratorPage';
import { SpecificDayPage, SpecificDaysLayout, SpecificDaysPage } from '../features/generator/SpecificDays';
import { PeriodShiftDayPage, PeriodShiftsLayout, PeriodShiftsPage } from '../features/schedule/PeriodShifts';
import { HomePage } from '../features/home/HomePage';
import {
  CheckEmailPage,
  ConfirmEmailChangePage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../features/identity/EmailPages';
import { SignInPage } from '../features/identity/SignInPage';
import { SignUpPage } from '../features/identity/SignUpPage';
import { MyShiftsToTradePage } from '../features/marketplace/MyShiftsToTradePage';
import { TradePage } from '../features/marketplace/TradePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { BuildingPage } from '../features/schedule/BuildingPage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { TeamPage } from '../features/team/TeamPage';
import { OpenFromPush } from '../features/push/OpenFromPush';
import { WorkplaceGate } from '../features/workplaces/WorkplaceGate';
import { OwnerInvitationPage, WorkplacesPage } from '../features/workplaces/WorkplacesPage';
import { AppShell } from './AppShell';
import { RequireSession, SignedOutOnly, WithToasts } from './guards';
import { NotFoundPage } from './NotFoundPage';
import { TimeOffPage } from '../features/time-off/TimeOffPage';
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
      { path: 'confirm-email', element: <ConfirmEmailChangePage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireSession />,
        children: [
          { path: 'workplaces', element: <WorkplacesPage /> },
          // A tapped push: switch workplace, mark it read, go where it leads (M8-06).
          { path: 'open', element: <OpenFromPush /> },
          { path: 'join/:code', element: <WorkplacesPage /> },
          { path: 'owner-invitation', element: <OwnerInvitationPage /> },
          {
            element: <WorkplaceGate />,
            children: [
              {
                element: <WithToasts />,
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
                  // Opened from a tab, with a back arrow and no tab bar (mockups 1e, 1w, 1m, 1k3).
                  { path: 'team', element: <TeamPage /> },
                  { path: 'time-off', element: <TimeOffPage /> },
                  { path: 'availability', element: <AvailabilityPage /> },
                  { path: 'availability/team', element: <TeamAvailabilityPage /> },
                  {
                    path: 'availability/people/:periodId/:membershipId',
                    element: <PersonAvailabilityPage />,
                  },
                  { path: 'generator', element: <EditGeneratorPage /> },
                  // "Edit a specific day" (M4-01): the edits are kept above both pages until saved.
                  {
                    path: 'generator/days',
                    element: <SpecificDaysLayout />,
                    children: [
                      { index: true, element: <SpecificDaysPage /> },
                      { path: ':day', element: <SpecificDayPage /> },
                    ],
                  },
                  { path: 'trade/mine', element: <MyShiftsToTradePage /> },
                  { path: 'schedule/build', element: <BuildingPage mode="build" /> },
                  { path: 'schedule/edit', element: <BuildingPage mode="edit" /> },
                  // One period's own shifts, from the pen next to a day on Building and Editing Schedule (M4-01).
                  {
                    path: 'schedule/shifts',
                    element: <PeriodShiftsLayout />,
                    children: [
                      { index: true, element: <PeriodShiftsPage /> },
                      { path: ':day', element: <PeriodShiftDayPage /> },
                    ],
                  },
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
