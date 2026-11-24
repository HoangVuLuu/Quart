import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { StepUpSheet } from '../features/identity/StepUpSheet';
import { UpdatePrompt } from '../features/offline/UpdatePrompt';
import { PullToRefresh } from './PullToRefresh';
import { router } from './router';

// There is no live connection in v1 (AD-031): data stays fresh by refetching when the app
// comes back to the foreground, plus push notifications for anything urgent.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
      // Asked even when the phone says it is offline: the service worker may answer with the last copy
      // (M8-05). The default would wait for a connection and show nothing.
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Fails at once with "no connection" instead of waiting with a spinner.
      networkMode: 'always',
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PullToRefresh>
        <RouterProvider router={router} />
      </PullToRefresh>
      <UpdatePrompt />
      <StepUpSheet />
    </QueryClientProvider>
  );
}
