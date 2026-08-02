import { QueryClient } from '@tanstack/react-query';

export function createWebQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 5 * 60 * 1_000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: (failureCount) => failureCount < 2,
        staleTime: 30_000,
      },
    },
  });
}
